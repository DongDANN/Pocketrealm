/**
 * Shared plumbing for the Gate 2 data tests: a real Dexie database over fake-indexeddb, one
 * isolated IDBFactory per database so suites never see each other's rows.
 */

import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDatabase, type PocketDb } from '../src/data/db';

let counter = 0;

/** A freshly created, fully isolated database. */
export function testDb(label = 'db'): PocketDb {
  counter += 1;
  return openDatabase({
    name: `pocketrealm-test-${label}-${counter}`,
    indexedDB: new IDBFactory(),
  });
}

/** A database on a factory the caller keeps, so a test can close and reopen the same store. */
export function dbOn(factory: IDBFactory, name: string): PocketDb {
  return openDatabase({ name: `pocketrealm-test-${name}`, indexedDB: factory });
}
