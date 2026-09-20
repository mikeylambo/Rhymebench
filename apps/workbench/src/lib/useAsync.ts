import { useEffect, useState, type DependencyList } from 'react';

/**
 * Run an async producer whenever deps change, keeping the latest result in
 * state. Stale resolutions are dropped (the `alive` guard), so out-of-order
 * worker replies never clobber a newer query.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList, initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let alive = true;
    fn().then(
      (r) => { if (alive) setValue(r); },
      () => { if (alive) setValue(initial); },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
