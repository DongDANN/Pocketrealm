/**
 * Persistence is a request, not a permission dialog: the browser decides from its own engagement
 * rules. Asking once the book exists is the appropriate moment; a "no" changes nothing and Settings
 * keeps the manual button for a later try.
 */
let asked = false;

export async function ensurePersistentStorage(): Promise<boolean | null> {
  if (asked) return null;
  asked = true;
  try {
    if (!navigator.storage?.persisted || !navigator.storage.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
