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

/** The auth session (one per signed-in browser) a request comes from, unless a test picks another. */
const BROWSER = "11111111-1111-4111-8111-111111111111";

/**
 * Runs `fn` as an authenticated user (or as anon when `user` is null), with RLS enforced.
 * `session` picks the signed-in browser; `signedInAt` (Unix seconds) is when it signed in with a password.
 */
async function as<T>(
  user: string | null,
  fn: () => Promise<T>,
  { session = BROWSER, signedInAt }: { session?: string; signedInAt?: number } = {},
): Promise<T> {
  await db.exec(`set role ${user ? "authenticated" : "anon"}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ""]);
  const claims = user
    ? { sub: user, session_id: session, ...(signedInAt ? { amr: [{ method: "password", timestamp: signedInAt }] } : {}) }
    : {};
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)]);
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
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
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

describe("trash", () => {
  const shared = (id: string) =>
    as(null, async () => (await rows<{ c: any }>(`select public.get_shared_collection($1) as c`, [id]))[0]!.c);
  const stats = async () =>
    (await rows<{ stats: Record<string, unknown> }>(`select public.get_library_stats() as stats`))[0]!.stats;

  it("leaves trashed links out of the sidebar counts and shared collections", async () => {
    const shareId = await as(A, async () => {
      const [created] = await rows<{ id: string; share_id: string }>(
        `insert into public.collections (name, is_public) values ('Shared', true) returning id, share_id`,
      );
      await db.query(`update public.links set collection_id = $1 where url_normalized = 'react.dev'`, [created!.id]);
      expect(await stats()).toMatchObject({ favorites: 1, trash: 0, collections: { [created!.id]: 1 } });

      await db.exec(`update public.links set deleted_at = now() where url_normalized = 'react.dev'`);
      expect(await stats()).toMatchObject({ favorites: 0, trash: 1, collections: {}, tags: [] });
      return created!.share_id;
    });
    expect((await shared(shareId)).links).toEqual([]);
  });

  it("keeps everything on a trashed link, so restoring brings it all back", async () => {
    await as(A, async () => {
      await db.exec(`update public.links set deleted_at = null where url_normalized = 'react.dev'`);
      const [link] = await rows<{ note: string; tags: string[]; is_favorite: boolean }>(
        `select note, tags, is_favorite from public.links where url_normalized = 'react.dev'`,
      );
      expect(link).toEqual({ note: "Great reference", tags: ["frontend", "docs"], is_favorite: true });
      expect(await stats()).toMatchObject({ favorites: 1, trash: 0 });
    });
  });

  it("purges links trashed over 7 days ago, and only the caller's own", async () => {
    await as(B, () => db.exec(`update public.links set deleted_at = now() - interval '8 days'`));
    await as(A, async () => {
      await db.exec(`update public.links set deleted_at = now() - interval '6 days' where url_normalized = 'react.dev'`);
      await db.exec(`update public.links set deleted_at = now() - interval '8 days' where url_normalized = 'vitejs.dev'`);
      const [{ purged }] = await rows<{ purged: number }>(`select public.purge_expired_trash() as purged`);
      expect(purged).toBe(1);
      expect(await rows(`select url_normalized from public.links where deleted_at is not null`)).toEqual([
        { url_normalized: "react.dev" },
      ]);
    });
    // B's expired link waits for B (or the scheduled job, which runs as the owner).
    expect(await rows(`select url from public.links where user_id = $1`, [B])).toHaveLength(1);
    await rows(`select public.purge_expired_trash()`);
    expect(await rows(`select url from public.links where user_id = $1`, [B])).toEqual([]);
  });
});

describe("locked folders", () => {
  const OTHER_BROWSER = "22222222-2222-4222-8222-222222222222";
  const THIRD_BROWSER = "33333333-3333-4333-8333-333333333333";
  let folder: string;

  const call = async <T = any>(sql: string, params: unknown[] = []) => (await rows<{ r: T }>(sql, params))[0]!.r;
  const secretTitles = () => rows<{ title: string }>(`select title from public.links where collection_id = $1`, [folder]);
  const stats = () => call<any>(`select public.get_library_stats() as r`);

  it("needs a 4-digit PIN, and locks a folder only through set_folder_locked", async () => {
    await as(A, async () => {
      const [created] = await rows<{ id: string }>(`insert into public.collections (name) values ('Private') returning id`);
      folder = created!.id;
      await db.query(
        `insert into public.links (url, url_normalized, title, tags, collection_id)
         values ('https://secret.example/', 'secret.example', 'Secret page', '{hidden}', $1)`,
        [folder],
      );
      await expect(db.query(`select public.set_folder_locked($1, true)`, [folder])).rejects.toThrow(/Set a PIN first/);
      await expect(db.query(`select public.set_vault_pin('12a4')`)).rejects.toThrow(/4 digits/);
      expect(await call(`select public.set_vault_pin('1234') as r`)).toMatchObject({ ok: true });

      await expect(db.query(`update public.collections set is_locked = true where id = $1`, [folder])).rejects.toThrow(
        /with your PIN/,
      );
      await db.query(`select public.set_folder_locked($1, true)`, [folder]);
      // Locked straight away, like a password-protected folder: even here it needs the PIN.
      expect(await secretTitles()).toEqual([]);
    });
  });

  it("hides the folder's links in another browser, and keeps them read-only there", async () => {
    await as(
      A,
      async () => {
        expect(await secretTitles()).toEqual([]);
        const totals = await stats();
        expect(totals.collections[folder]).toBeUndefined();
        expect(totals.tags.map((t: { tag: string }) => t.tag)).not.toContain("hidden");

        await expect(
          db.query(`insert into public.links (url, url_normalized, collection_id) values ('https://x2.example/', 'x2.example', $1)`, [
            folder,
          ]),
        ).rejects.toThrow(/row-level security/);
        expect(await rows(`update public.links set title = 'changed' where url_normalized = 'secret.example' returning id`)).toEqual([]);
        expect(await rows(`update public.collections set name = 'Renamed' where id = $1 returning id`, [folder])).toEqual([]);
        expect(await rows(`delete from public.collections where id = $1 returning id`, [folder])).toEqual([]);
        // Not even the owner can read the PIN's hash.
        expect(await rows(`select * from public.vaults`)).toEqual([]);
      },
      { session: OTHER_BROWSER },
    );
  });

  it("counts wrong PINs down, then pauses", async () => {
    await as(
      A,
      async () => {
        expect(await call(`select public.unlock_vault('0000') as r`)).toMatchObject({ ok: false, error: "wrong-pin", attemptsLeft: 4 });
        for (let i = 0; i < 3; i++) await db.query(`select public.unlock_vault('0000')`);
        expect(await call(`select public.unlock_vault('0000') as r`)).toMatchObject({ ok: false, error: "blocked", attemptsLeft: 0 });
        // Even the right PIN waits out the pause.
        expect(await call(`select public.unlock_vault('1234') as r`)).toMatchObject({ ok: false, error: "blocked" });
        expect(await secretTitles()).toEqual([]);
      },
      { session: OTHER_BROWSER },
    );
  });

  it("opens with the right PIN in that browser only, and still stays out of the totals", async () => {
    await db.exec(`update public.vaults set blocked_until = null, failed_attempts = 0`); // the pause is over
    await as(
      A,
      async () => {
        // Checking the PIN without naming a folder opens nothing.
        expect(await call(`select public.unlock_vault('1234') as r`)).toMatchObject({ ok: true });
        expect(await secretTitles()).toEqual([]);
        expect(await call(`select public.unlock_vault('1234', '${folder}') as r`)).toMatchObject({ ok: true });
        expect(await secretTitles()).toEqual([{ title: "Secret page" }]);
        const totals = await stats();
        expect(totals.collections[folder]).toBe(1);
        expect(totals.tags.map((t: { tag: string }) => t.tag)).not.toContain("hidden");

        await db.query(`select public.lock_vault()`);
        expect(await secretTitles()).toEqual([]);
      },
      { session: OTHER_BROWSER },
    );
    await as(A, async () => expect(await secretTitles()).toEqual([]), { session: THIRD_BROWSER });
  });

  it("can't be shared, and removing a forgotten PIN needs a fresh sign-in", async () => {
    await as(A, async () => {
      // Closed, it can't even be changed; opened, it still can't be shared.
      expect(await rows(`update public.collections set is_public = true where id = $1 returning id`, [folder])).toEqual([]);
      await db.query(`select public.unlock_vault('1234', $1)`, [folder]);
      await expect(db.query(`update public.collections set is_public = true where id = $1`, [folder])).rejects.toThrow(
        /can't be shared/,
      );
    });

    const now = Math.floor(Date.now() / 1000);
    await as(
      A,
      async () => expect(await call(`select public.reset_vault() as r`)).toMatchObject({ ok: false, error: "sign-in-again" }),
      { session: THIRD_BROWSER, signedInAt: now - 3600 },
    );
    await as(
      A,
      async () => {
        expect(await call(`select public.reset_vault() as r`)).toMatchObject({ ok: true });
        expect(await secretTitles()).toEqual([{ title: "Secret page" }]);
        expect(await rows(`select is_locked from public.collections where id = $1`, [folder])).toEqual([{ is_locked: false }]);
        expect(await call(`select public.vault_status() as r`)).toMatchObject({ hasPin: false });
      },
      { session: THIRD_BROWSER, signedInAt: now },
    );
  });
});

describe("removing a PIN you still know", () => {
  const ELSEWHERE = "44444444-4444-4444-8444-444444444444";
  const call = async <T = any>(sql: string) => (await rows<{ r: T }>(sql))[0]!.r;

  it("needs the PIN entered in this browser, then unlocks every folder", async () => {
    await as(A, async () => {
      expect(await call(`select public.set_vault_pin('4321') as r`)).toMatchObject({ ok: true });
      const [folder] = await rows<{ id: string }>(`insert into public.collections (name) values ('Vault test') returning id`);
      await db.query(`select public.set_folder_locked($1, true)`, [folder!.id]);
    });
    await as(A, async () => expect(db.query(`select public.remove_vault_pin()`)).rejects.toThrow(/Enter your PIN first/), {
      session: ELSEWHERE,
    });
    await as(A, async () => {
      await db.query(`select public.remove_vault_pin()`);
      expect(await call(`select public.vault_status() as r`)).toMatchObject({ hasPin: false });
      expect(await rows(`select name from public.collections where is_locked`)).toEqual([]);
    });
  });
});

describe("locked folders open one at a time, for one visit", () => {
  const VISIT = "55555555-5555-4555-8555-555555555555";
  const call = async <T = any>(sql: string, params: unknown[] = []) => (await rows<{ r: T }>(sql, params))[0]!.r;
  const titlesIn = (folder: string) => rows<{ title: string }>(`select title from public.links where collection_id = $1`, [folder]);

  it("opens only the folder the PIN was entered for, keeps it open while used, and locks it on leaving", async () => {
    const [first, second] = await as(
      A,
      async () => {
        expect(await call(`select public.set_vault_pin('2468') as r`)).toMatchObject({ ok: true });
        const made = await rows<{ id: string }>(
          `insert into public.collections (name) values ('Diary'), ('Bank') returning id`,
        );
        for (const [index, folder] of made.entries()) {
          await db.query(
            `insert into public.links (url, url_normalized, title, collection_id) values ($1, $2, $3, $4)`,
            [`https://p${index}.example/`, `p${index}.example`, `Private ${index}`, folder.id],
          );
          await db.query(`select public.set_folder_locked($1, true)`, [folder.id]);
        }
        return made.map((folder) => folder.id) as [string, string];
      },
      { session: VISIT },
    );

    await as(
      A,
      async () => {
        expect(await titlesIn(first)).toEqual([]);
        await db.query(`select public.unlock_vault('2468', $1)`, [first]);
        expect(await titlesIn(first)).toEqual([{ title: "Private 0" }]);
        expect(await titlesIn(second)).toEqual([]); // the other locked folder asks again
        expect((await call(`select public.vault_status() as r`)).openFolders).toEqual([first]);

        expect(await call(`select public.keep_folder_open($1) as r`, [first])).toBe(true);
        expect(await call(`select public.keep_folder_open($1) as r`, [second])).toBe(false); // never opened

        await db.query(`select public.lock_vault($1)`, [first]); // leaving the folder
        expect(await titlesIn(first)).toEqual([]);
        expect(await rows(`update public.collections set name = 'Renamed' where id = $1 returning id`, [first])).toEqual([]);
      },
      { session: VISIT },
    );
  });
});
