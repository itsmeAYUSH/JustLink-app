/**
 * Runs the real migrations in PGlite (Postgres compiled to WebAssembly) with a
 * minimal stand-in for Supabase's `auth` schema and roles, then checks the
 * security-critical behaviour: Row Level Security, sharing, search and dedupe.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";

const db = new PGlite();
let collection: { id: string; share_id: string };

/** Runs `fn` as an authenticated user (or as anon when `user` is null), with RLS enforced. */
async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${user ? "authenticated" : "anon"}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ""]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

async function search(q: string): Promise<string[]> {
  const result = await rows<{ title: string }>(
    `select coalesce(custom_title, title) as title from public.links
     where search @@ websearch_to_tsquery('english', $1) order by title`,
    [q],
  );
  return result.map((row) => row.title);
}

beforeAll(async () => {
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values ('${A}'), ('${B}');
  `);

  // Like Supabase: API roles get table privileges; RLS decides which rows they see.
  const grant = "grant all on all tables in schema public to anon, authenticated;";
  const [first, ...rest] = readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql")).sort();

  await db.exec(readFileSync(join(MIGRATIONS, first!), "utf8"));
  await db.exec(grant);
  // Rows saved before the second migration, including an http/https pair of one page.
  await db.exec(`
    insert into public.links (user_id, url, title, keywords) values
      ('${A}', 'https://nextjs.org/', 'Next.js by Vercel - The React Framework', '{react,framework}'),
      ('${A}', 'http://nextjs.org/', 'Next.js (http copy)', '{}'),
      ('${B}', 'https://supabase.com/', 'Supabase', '{}');
  `);
  for (const file of rest) await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  await db.exec(grant);

  await as(A, async () => {
    [collection] = await rows(`insert into public.collections (name, icon) values ('Dev', '💻') returning id, share_id`);
    await db.query(
      `insert into public.links (url, url_normalized, title, description, tags, note, collection_id)
       values ('https://react.dev/', 'react.dev', 'React', 'The library for web and native user interfaces',
               '{frontend,docs}', 'Great reference', $1)`,
      [collection.id],
    );
  });
});

describe("existing data", () => {
  it("backfills url_normalized; the https copy keeps the real key", async () => {
    const keys = await rows<{ url: string; url_normalized: string }>(
      `select url, url_normalized from public.links where user_id = $1 and url like '%nextjs%'`,
      [A],
    );
    expect(keys.find((row) => row.url === "https://nextjs.org/")?.url_normalized).toBe("nextjs.org");
    expect(keys.find((row) => row.url === "http://nextjs.org/")?.url_normalized).toMatch(/^nextjs\.org#/);
  });
});

describe("as the owner", () => {
  it("rejects a second link with the same normalized URL", async () => {
    await expect(
      as(A, () => db.query(`insert into public.links (url, url_normalized) values ('https://www.react.dev', 'react.dev')`)),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("lets imports skip existing links with ON CONFLICT DO NOTHING", async () => {
    const inserted = await as(A, () =>
      rows(
        `insert into public.links (user_id, url, url_normalized, fetch_status) values
           ($1, 'https://react.dev/', 'react.dev', 'pending'),
           ($1, 'https://vitejs.dev/', 'vitejs.dev', 'pending')
         on conflict (user_id, url_normalized) do nothing returning id`,
        [A],
      ),
    );
    expect(inserted).toHaveLength(1);
  });

  it("searches titles (with stemming), tags, notes and URLs", async () => {
    await as(A, async () => {
      expect(await search("frameworks")).toContain("Next.js by Vercel - The React Framework");
      expect(await search("docs")).toEqual(["React"]);
      expect(await search("reference")).toEqual(["React"]);
      expect(await search("react -vercel")).toEqual(["React"]);
      expect(await search("vitejs")).toHaveLength(1);
    });
  });

  it("re-indexes a link when the user edits it", async () => {
    await as(A, async () => {
      await db.exec(`update public.links set custom_title = 'My React notes' where url_normalized = 'react.dev'`);
      expect(await search("notes")).toEqual(["My React notes"]);
    });
  });

  it("counts the sidebar with get_library_stats", async () => {
    await as(A, async () => {
      await db.exec(`update public.links set is_favorite = true where url_normalized = 'react.dev'`);
      await db.exec(`update public.links set is_archived = true where url_normalized = 'nextjs.org'`);
      const [{ stats }] = await rows<{ stats: Record<string, unknown> }>(`select public.get_library_stats() as stats`);
      expect(stats).toMatchObject({ total: 3, favorites: 1, archived: 1, pending: 1, unsorted: 2 });
      expect(stats.collections).toEqual({ [collection.id]: 1 });
      expect(stats.tags).toEqual([
        { tag: "docs", count: 1 },
        { tag: "frontend", count: 1 },
      ]);
    });
  });
});

describe("Row Level Security, as another user", () => {
  it("only shows the user's own links and collections", async () => {
    await as(B, async () => {
      expect(await rows(`select url from public.links`)).toEqual([{ url: "https://supabase.com/" }]);
      expect(await rows(`select id from public.collections`)).toEqual([]);
    });
  });

  it("can't edit someone else's links", async () => {
    const updated = await as(B, () => rows(`update public.links set title = 'hacked' returning id`));
    expect(updated).toHaveLength(1); // only B's own link
  });

  it("can't insert rows on someone else's behalf", async () => {
    await expect(
      as(B, () => db.query(`insert into public.links (user_id, url, url_normalized) values ($1, 'https://y.com/', 'y.com')`, [A])),
    ).rejects.toThrow(/row-level security/);
  });

  it("can't file a link into someone else's collection", async () => {
    await expect(
      as(B, () =>
        db.query(`insert into public.links (url, url_normalized, collection_id) values ('https://x.com/', 'x.com', $1)`, [
          collection.id,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("public sharing", () => {
  const shared = (id: string) =>
    as(null, async () => (await rows<{ c: any }>(`select public.get_shared_collection($1) as c`, [id]))[0]!.c);

  it("hides private collections", async () => {
    expect(await shared(collection.share_id)).toBeNull();
  });

  it("shows public collections to anyone, without notes", async () => {
    await as(A, () => db.query(`update public.collections set is_public = true where id = $1`, [collection.id]));
    const result = await shared(collection.share_id);
    expect(result.name).toBe("Dev");
    expect(result.links).toHaveLength(1);
    expect(result.links[0].title).toBe("My React notes");
    expect(result.links[0]).not.toHaveProperty("note");
  });

  it("returns null for unknown share ids, and anon can't read tables directly", async () => {
    expect(await shared("11111111-1111-1111-1111-111111111111")).toBeNull();
    expect(await as(null, () => rows(`select id from public.links`))).toEqual([]);
  });
});

describe("deleting a collection", () => {
  it("keeps its links (they become unsorted)", async () => {
    await as(A, async () => {
      await db.query(`delete from public.collections where id = $1`, [collection.id]);
      expect(await rows(`select collection_id from public.links where url_normalized = 'react.dev'`)).toEqual([
        { collection_id: null },
      ]);
    });
  });
});
