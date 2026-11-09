import type { HubApiContract } from './contract';

/**
 * Removed People (swavely-lol ADR-0003). The Hub keeps a list of everyone it has
 * removed; on a schedule each Tool reads what is new on it and deletes what it holds of
 * each. This is the asking half, the same for every Tool: it keeps how far the Tool has
 * read in `hub_cursor` (migrations/hub_cursor.sql) and hands each id to the Tool's own
 * `purgePerson`, which must be safe to run twice, since the boundary comes back.
 *
 * Explicit, never inferred: only the ids the Hub names are purged.
 */
const CURSOR = 'removed';

export async function runRemovals(
  env: { DB: D1Database; HUB: HubApiContract },
  purgePerson: (db: D1Database, personId: string) => Promise<unknown>,
): Promise<{ removed: number }> {
  const db = env.DB;
  const since = (await db.prepare('SELECT value FROM hub_cursor WHERE name = ?1').bind(CURSOR).first<{ value: number }>())?.value ?? 0;
  const removed = await env.HUB.removedSince(since);
  for (const r of removed) await purgePerson(db, r.id);
  if (removed.length) {
    await db
      .prepare('INSERT INTO hub_cursor (name, value) VALUES (?1, ?2) ON CONFLICT (name) DO UPDATE SET value = excluded.value')
      .bind(CURSOR, removed[removed.length - 1].removedAt)
      .run();
  }
  return { removed: removed.length };
}
