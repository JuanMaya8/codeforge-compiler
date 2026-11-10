/**
 * Small wrapper around localStorage. Storage can be unavailable (private
 * mode, blocked cookies), so every access is guarded and optional.
 */
export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Persisting the draft is a convenience; ignore failures.
  }
}
