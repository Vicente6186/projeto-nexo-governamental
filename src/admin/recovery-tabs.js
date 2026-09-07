const TAB_KEY = "nexo-recovery-tab:v2";
let sharedContext;
function identifier() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}
export function recoveryTabContext() {
  if (sharedContext) return sharedContext;
  sharedContext = (async () => {
    let previousOwner;
    try {
      previousOwner = window.sessionStorage.getItem(TAB_KEY);
    } catch {}
    // Every document owns a unique slot. Even duplicated sessionStorage or a
    // delayed background-tab response cannot make two editors share a slot.
    const owner = identifier();
    const instance = identifier();
    let channel;
    const pending = new Map();
    const connect = () => {
      try {
        channel = new BroadcastChannel("nexo-recovery-tabs:v2");
        channel.onmessage = ({ data }) => {
          if (!data || data.instance === instance) return;
          if (data.type === "probe")
            channel.postMessage({
              type: "alive",
              request: data.request,
              owner,
              instance,
            });
          if (data.type === "alive") pending.get(data.request)?.add(data.owner);
        };
      } catch {
        channel = null;
      }
    };
    connect();
    const activeOwners = async () => {
      if (!channel) return [];
      const request = identifier();
      const active = new Set();
      pending.set(request, active);
      try {
        channel.postMessage({ type: "probe", request, instance });
      } catch {
        pending.delete(request);
        return [];
      }
      await new Promise((resolve) => setTimeout(resolve, 180));
      pending.delete(request);
      return [...active];
    };
    try {
      window.sessionStorage.setItem(TAB_KEY, owner);
    } catch {}
    window.addEventListener("pagehide", () => {
      channel?.close();
      channel = null;
    });
    window.addEventListener("pageshow", () => {
      if (!channel) connect();
    });
    return { owner, previousOwner, activeOwners };
  })();
  return sharedContext;
}
