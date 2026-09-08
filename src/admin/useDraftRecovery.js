import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createRecoveryStore } from "./draft-recovery.cjs";
import { recoveryTabContext } from "./recovery-tabs";

function localStore(owner, previousOwner) {
  try {
    return createRecoveryStore(window.localStorage, Date.now, {
      owner,
      previousOwner,
    });
  } catch {
    return createRecoveryStore(null, Date.now, { owner, previousOwner });
  }
}

export function useDraftRecovery({
  key,
  value,
  version,
  base,
  dirty,
  ready = true,
}) {
  const store = useRef(null);
  const current = useRef(null);
  const initialized = useRef(null);
  const held = useRef(null);
  const [recovery, setRecovery] = useState(null);
  const [available, setAvailable] = useState(true);
  const [generation, setGeneration] = useState(0);

  const persistData = useCallback((data) => {
    if (
      !data?.ready ||
      initialized.current !== data.key ||
      held.current?.key === data.key ||
      !data.dirty
    )
      return;
    setAvailable(
      store.current.write(data.key, data.value, data.version, data.base),
    );
  }, []);

  useLayoutEffect(() => {
    const previous = current.current;
    // A route/load transition can happen before the debounce finishes. Flush
    // the last committed editor snapshot under its original key first.
    if (previous && (previous.key !== key || (previous.ready && !ready)))
      persistData(previous);
    current.current = { key, value, version, base, dirty, ready };
  });

  useEffect(() => {
    if (!ready || !key) return;
    let cancelled = false;
    initialized.current = null;
    held.current = null;
    setRecovery(null);
    (async () => {
      const tab = await recoveryTabContext();
      const activeOwners = await tab.activeOwners();
      if (cancelled) return;
      if (!store.current)
        store.current = localStore(tab.owner, tab.previousOwner);
      const saved = store.current.read(key, { activeOwners });
      initialized.current = key;
      const pending =
        saved &&
        JSON.stringify(saved.value) !== JSON.stringify(current.current.value)
          ? saved
          : null;
      held.current = pending ? { key, saved: pending } : null;
      setRecovery(held.current);
      if (!pending) store.current.remove(key);
      setGeneration((value) => value + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [key, ready]);

  const persist = useCallback(() => {
    persistData(current.current);
  }, [persistData]);

  useEffect(() => {
    if (!ready || initialized.current !== key || held.current) return;
    if (!dirty) {
      store.current.remove(key);
      return;
    }
    const timer = setTimeout(persist, 300);
    return () => clearTimeout(timer);
  }, [key, ready, value, version, base, dirty, recovery, persist, generation]);

  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === "hidden") persist();
    };
    window.addEventListener("beforeunload", persist);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      persist();
      window.removeEventListener("beforeunload", persist);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [persist]);

  const restore = useCallback(() => {
    if (!current.current.ready || held.current?.key !== current.current.key)
      return null;
    const saved = held.current.saved;
    held.current = null;
    setRecovery(null);
    return saved;
  }, []);
  const discard = useCallback(() => {
    store.current?.remove(current.current.key);
    if (held.current?.key === current.current.key) {
      held.current = null;
      setRecovery(null);
    }
  }, []);
  return {
    recovery: ready && recovery && recovery.key === key ? recovery.saved : null,
    restore,
    discard,
    clear: discard,
    persist,
    available,
  };
}
export default useDraftRecovery;
