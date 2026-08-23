import { useRegisterSW } from "virtual:pwa-register/react";

export function useAppUpdate() {
  const registration = useRegisterSW({ immediate: true });
  return {
    updateAvailable: registration.needRefresh[0],
    offlineReady: registration.offlineReady[0],
    applyUpdate: () => registration.updateServiceWorker(true),
    dismissUpdate: () => registration.needRefresh[1](false),
    dismissOffline: () => registration.offlineReady[1](false),
  };
}
