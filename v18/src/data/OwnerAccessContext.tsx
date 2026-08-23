import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { checkOwnerAccess, ownerSessionStorageKey, type OwnerAccessResult } from "./ownerSession";

type OwnerAccessState = { state: "checking"; message: string } | OwnerAccessResult;

type OwnerAccessContextValue = {
  access: OwnerAccessState;
  refresh: () => Promise<void>;
};

const OwnerAccessContext = createContext<OwnerAccessContextValue | null>(null);

export function OwnerAccessProvider({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<OwnerAccessState>({ state: "checking", message: "Checking owner access…" });

  const refresh = useCallback(async () => {
    setAccess({ state: "checking", message: "Checking owner access…" });
    const result = await checkOwnerAccess();
    setAccess(result);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    checkOwnerAccess(controller.signal).then(setAccess).catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setAccess({ state: "error", message: "Owner access could not be verified. No owner road data was loaded." });
      }
    });
    const storageChanged = (event: StorageEvent) => {
      if (event.key === ownerSessionStorageKey) refresh();
    };
    window.addEventListener("storage", storageChanged);
    return () => {
      controller.abort();
      window.removeEventListener("storage", storageChanged);
    };
  }, [refresh]);

  const value = useMemo(() => ({ access, refresh }), [access, refresh]);
  return <OwnerAccessContext.Provider value={value}>{children}</OwnerAccessContext.Provider>;
}

export function useOwnerAccess() {
  const value = useContext(OwnerAccessContext);
  if (!value) throw new Error("useOwnerAccess must be used inside OwnerAccessProvider");
  return value;
}
