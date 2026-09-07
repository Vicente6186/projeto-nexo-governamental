import { useCallback, useEffect, useRef, useState } from "react";
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
  current.current = { key, value, version, base, dirty, ready };
  const initialized = useRef(null);
  const held = useRef(null);
  const [recovery, setRecovery] = useState(null);
  const [available, setAvailable] = useState(true);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!ready || !key) return;
    let cancelled = false;
    initialized.current = null;
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
      held.current = pending;
      setRecovery(pending);
      if (!pending) store.current.remove(key);
      setGeneration((value) => value + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [key, ready]);

  const persist = useCallback(() => {
    const data = current.current;
    if (
      !data.ready ||
      initialized.current !== data.key ||
      held.current ||
      !data.dirty
    )
      return;
    setAvailable(
      store.current.write(data.key, data.value, data.version, data.base),
    );
  }, []);

  useEffect(() => {
    if (!ready || initialized.current !== key || held.current) return;
    if (!dirty) {
      store.current.remove(key);
      return;
    }
    const timer = setTimeout(persist, 300);
    return () => clearTimeout(timer);
  }, [key, ready, value, version, dirty, recovery, persist, generation]);

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
    const saved = held.current;
    held.current = null;
    setRecovery(null);
    return saved;
  }, []);
  const discard = useCallback(() => {
    store.current?.remove(current.current.key);
    held.current = null;
    setRecovery(null);
  }, []);
  return { recovery, restore, discard, clear: discard, persist, available };
}
export default useDraftRecovery;
