import dns from "node:dns";
import net from "node:net";
import { Agent, fetch, type Response } from "undici";
import { MetadataError } from "./types.js";

/**
 * The server fetches URLs that users type in, so it must never be tricked into
 * calling internal services (localhost, the cloud metadata endpoint at
 * 169.254.169.254, private networks, ...). Every address is checked twice:
 *  - literal IPs in the URL (and in every redirect) before the request, and
 *  - every DNS answer at connect time, via a custom `lookup`, which also
 *    defeats DNS-rebinding tricks.
 */
const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

const BLOCKED_V6: Array<[string, number]> = [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  // No ::ffff:0:0/96 rule: BlockList checks IPv4-mapped addresses against the IPv4
  // rules above (and IPv4 addresses against this rule, which would block them all).
  ["64:ff9b::", 96], // NAT64
  ["100::", 64], // discard
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 (can embed private IPv4)
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
];

const blockList = new net.BlockList();
for (const [address, prefix] of BLOCKED_V4) blockList.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of BLOCKED_V6) blockList.addSubnet(address, prefix, "ipv6");

/** True if `address` is not a public unicast IP (anything that isn't an IP counts as blocked). */
export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 0) return true;
  return blockList.check(address, family === 4 ? "ipv4" : "ipv6");
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

/** Drop-in for `dns.lookup` that refuses to hand out private addresses. */
export function safeLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: LookupCallback,
): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) {
      callback(err, "");
      return;
    }
    const blocked = addresses.find((entry) => isBlockedAddress(entry.address));
    if (blocked || addresses.length === 0) {
      callback(
        new MetadataError(
          "BLOCKED_ADDRESS",
          `${hostname} resolves to a private or reserved address.`,
        ),
        "",
      );
      return;
    }
    if (options.all) {
      callback(null, addresses);
    } else {
      const first = addresses[0]!;
      callback(null, first.address, first.family);
    }
  });
}

const agent = new Agent({
  connect: { lookup: safeLookup, timeout: 10_000 },
  headersTimeout: 10_000,
  bodyTimeout: 10_000,
});

function assertPublicUrl(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new MetadataError("INVALID_URL", `Unsupported protocol ${url.protocol}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && isBlockedAddress(host)) {
    throw new MetadataError("BLOCKED_ADDRESS", `${host} is a private or reserved address.`);
  }
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new MetadataError("BLOCKED_ADDRESS", "localhost is not allowed.");
  }
}

export interface SafeFetchResult {
  response: Response;
  finalUrl: string;
}

/** `fetch` that follows redirects by hand so every hop is re-checked. */
export async function safeFetch(
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal; maxRedirects: number },
): Promise<SafeFetchResult> {
  let current = new URL(url);

  for (let hop = 0; hop <= init.maxRedirects; hop++) {
    assertPublicUrl(current);

    let response: Response;
    try {
      response = await fetch(current, {
        dispatcher: agent,
        redirect: "manual",
        headers: init.headers,
        signal: init.signal,
      });
    } catch (error) {
      throw toMetadataError(error);
    }

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel().catch(() => {});
      current = new URL(location, current);
      continue;
    }

    return { response, finalUrl: current.toString() };
  }

  throw new MetadataError("TOO_MANY_REDIRECTS", "The URL redirected too many times.");
}

/** Reads at most `maxBytes`, stopping early once `</head>` has been seen. */
export async function readLimited(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  let total = 0;
  let tail = "";
  const reader = response.body.getReader();
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      chunks.push(chunk);
      total += chunk.length;
      // Everything we need lives in <head>; most pages are far bigger than their head.
      // Keep a few bytes of the previous chunk so a tag split across chunks is still found.
      const text = tail + chunk.toString("latin1").toLowerCase();
      if (text.includes("</head>")) break;
      tail = text.slice(-6);
    }
  } catch (error) {
    throw toMetadataError(error);
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).subarray(0, maxBytes);
}

export function toMetadataError(error: unknown): MetadataError {
  if (error instanceof MetadataError) return error;

  // The lookup error is wrapped by undici/fetch as `cause` (sometimes nested twice).
  let cause: unknown = error;
  for (let depth = 0; depth < 4 && cause instanceof Error; depth++) {
    if (cause instanceof MetadataError) return cause;
    if (cause.name === "TimeoutError" || cause.name === "AbortError") {
      return new MetadataError("TIMEOUT", "The site took too long to respond.", { cause: error });
    }
    cause = cause.cause;
  }

  const message = error instanceof Error ? error.message : String(error);
  return new MetadataError("NETWORK_ERROR", `Could not fetch the URL: ${message}`, {
    cause: error,
  });
}
