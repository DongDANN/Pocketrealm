/**
 * "Delete all data" (SPEC 7/9). One transaction over every table, so a refusal in the middle leaves
 * the book exactly as it was. The confirmation word lives in the screen; this function only deletes.
 */

import { DB_TABLES, type PocketDb } from './db';

export async function wipeBook(db: PocketDb): Promise<void> {
  const tables = DB_TABLES.map((name) => db.table(name));
  await db.transaction('rw', tables, async () => {
    for (const table of tables) await table.clear();
  });
}
