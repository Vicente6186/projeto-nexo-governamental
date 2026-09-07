const PREFIX = "nexo-recovery:v1:";
const SCOPED_PREFIX = "nexo-recovery:v2:";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function createRecoveryStore(
  storage,
  now = Date.now,
  { owner, previousOwner } = {},
) {
  const prefixFor = (key) => `${SCOPED_PREFIX}${encodeURIComponent(key)}:`;
  const storageKey = (key) =>
    owner
      ? prefixFor(key) + encodeURIComponent(owner)
      : PREFIX + encodeURIComponent(key);
  function parsed(key) {
    try {
      const raw = storage?.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function valid(saved) {
    const time = Date.parse(saved?.savedAt);
    return Boolean(
      saved?.value &&
      typeof saved.value === "object" &&
      !Array.isArray(saved.value) &&
      Number.isSafeInteger(saved.version) &&
      saved.version >= 1 &&
      Number.isFinite(time) &&
      time <= now() + 60000 &&
      now() - time <= MAX_AGE,
    );
  }
  function pruneExpired() {
    if (!owner) return;
    try {
      for (let index = (storage?.length || 0) - 1; index >= 0; index--) {
        const candidateKey = storage.key(index);
        if (!candidateKey?.startsWith(SCOPED_PREFIX)) continue;
        const candidate = parsed(candidateKey);
        const timestamp = candidate?.savedAt
          ? Date.parse(candidate.savedAt)
          : candidate?.dismissedAt;
        if (Number.isFinite(timestamp) && now() - timestamp > MAX_AGE)
          storage.removeItem(candidateKey);
      }
    } catch {
      /* Storage availability must not prevent editing. */
    }
  }
  function remove(key) {
    try {
      if (owner && storage) {
        // This tab may dismiss an offered orphan, but must never erase another
        // tab's copy. The marker also prevents offering that old copy on reload.
        storage.setItem(
          storageKey(key),
          JSON.stringify({ owner, dismissedAt: now() }),
        );
      } else storage?.removeItem(storageKey(key));
      return true;
    } catch {
      return false;
    }
  }
  return {
    remove,
    read(key, { activeOwners = [] } = {}) {
      try {
        pruneExpired();
        const own = parsed(storageKey(key));
        if (valid(own)) return own;
        if (!owner) {
          remove(key);
          return null;
        }
        const active = new Set(activeOwners);
        const previous = previousOwner
          ? parsed(prefixFor(key) + encodeURIComponent(previousOwner))
          : null;
        const dismissedAt = Math.max(
          Number.isFinite(own?.dismissedAt) ? own.dismissedAt : -Infinity,
          Number.isFinite(previous?.dismissedAt)
            ? previous.dismissedAt
            : -Infinity,
        );
        const candidates = [];
        const legacy = parsed(PREFIX + encodeURIComponent(key));
        if (valid(legacy) && Date.parse(legacy.savedAt) > dismissedAt)
          candidates.push(legacy);
        for (let index = 0; index < (storage?.length || 0); index++) {
          const candidateKey = storage.key(index);
          if (
            !candidateKey?.startsWith(prefixFor(key)) ||
            candidateKey === storageKey(key)
          )
            continue;
          const candidate = parsed(candidateKey);
          if (
            valid(candidate) &&
            !active.has(candidate.owner) &&
            Date.parse(candidate.savedAt) > dismissedAt
          )
            candidates.push(candidate);
        }
        return (
          candidates.sort(
            (a, b) =>
              Number(b.owner === previousOwner) -
                Number(a.owner === previousOwner) ||
              Date.parse(b.savedAt) - Date.parse(a.savedAt),
          )[0] || null
        );
      } catch {
        return null;
      }
    },
    write(key, value, version, base) {
      try {
        pruneExpired();
        if (!storage || !key || !Number.isSafeInteger(version) || version < 1)
          return false;
        const serialized = JSON.stringify({
          value,
          version,
          ...(base ? { base } : {}),
          ...(owner ? { owner } : {}),
          savedAt: new Date(now()).toISOString(),
        });
        if (serialized.length > 1024 * 1024) return false;
        storage.setItem(storageKey(key), serialized);
        return true;
      } catch {
        return false;
      }
    },
  };
}
module.exports = { createRecoveryStore };
