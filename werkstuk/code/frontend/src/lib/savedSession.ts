/**
 * Resumable question flows saved in the browser, so a refresh continues
 * where the student left off. Each page supplies its own storage key and a
 * validator for its screen shape; this module only does the safe
 * read/write/clear around localStorage.
 */

export type SavedSession<T> = { index: number; screens: T[] };

export function readSavedSession<T>(
  key: string,
  isScreen: (value: unknown) => value is T,
): SavedSession<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("index" in parsed) ||
      !("screens" in parsed)
    ) {
      return null;
    }
    const index = parsed.index;
    const screens = parsed.screens;
    if (typeof index !== "number" || !Array.isArray(screens) || screens.length === 0) {
      return null;
    }
    if (!screens.every(isScreen)) {
      return null;
    }
    return { index, screens };
  } catch {
    return null;
  }
}

export function writeSavedSession<T>(key: string, session: SavedSession<T>) {
  try {
    localStorage.setItem(key, JSON.stringify(session));
  } catch {
    // private mode / full disk: the page still works for this visit
  }
}

export function clearSavedSession(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
