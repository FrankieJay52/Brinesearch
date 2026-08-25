import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function currentState() {
  return navigator.onLine;
}

export function useNetworkState() {
  return useSyncExternalStore(subscribe, currentState, () => true);
}
