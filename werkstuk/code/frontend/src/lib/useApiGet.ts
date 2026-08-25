import { useCallback, useEffect, useState } from "react";
import { apiGet } from "./api";

/**
 * GET `path` once on mount and again whenever `path` changes.
 *
 * - Pass `null` to fetch nothing yet (for example while auth is loading).
 * - Responses are stored together with the path they answer, and `data`
 *   only returns a body whose path matches the current one. A response
 *   that arrives late, for a page we already left, is simply never shown.
 * - `reload()` fetches the same path again but keeps the current data on
 *   screen while the request runs (no flash back to "Loading").
 * - `setData` is for instant local updates, like removing a deleted row
 *   without waiting for a refetch.
 */
export function useApiGet<T>(path: string | null) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ path: string; body: T } | null>(null);
  const [failure, setFailure] = useState<{
    path: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (path === null) {
      return;
    }
    let stale = false;
    apiGet<T>(path)
      .then((body) => {
        if (!stale) {
          setResult({ path, body });
          setFailure(null);
        }
      })
      .catch((requestError: Error) => {
        if (!stale) {
          setFailure({ path, message: requestError.message });
        }
      });
    return () => {
      stale = true;
    };
  }, [path, version]);

  const data = result !== null && result.path === path ? result.body : null;
  const error = failure !== null && failure.path === path ? failure.message : null;
  const loading = path !== null && data === null && error === null;

  const reload = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  const setData = useCallback(
    (update: (current: T | null) => T | null) => {
      if (path === null) {
        return;
      }
      setResult((current) => {
        const currentBody =
          current !== null && current.path === path ? current.body : null;
        const nextBody = update(currentBody);
        return nextBody === null ? null : { path, body: nextBody };
      });
    },
    [path],
  );

  return { data, setData, error, loading, reload };
}
