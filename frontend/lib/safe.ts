// Resolve a promise to its value, or null if it rejects.
// Used in Server Components so one failed backend call (e.g. broker offline)
// degrades gracefully into an empty state instead of crashing the page.
export async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}
