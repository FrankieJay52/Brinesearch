import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { checkOwnerAccess, signInOwner, signOutOwner, type OwnerAccessResult } from "./ownerSession";
import { supabase } from "./supabaseClient";

type OwnerAccessState = { state: "checking"; message: string } | OwnerAccessResult;

type OwnerAccessContextValue = {
  access: OwnerAccessState;
  refresh: () => Promise<OwnerAccessResult>;
  signIn: (email: string, password: string) => Promise<OwnerAccessResult>;
  signOut: () => Promise<void>;
};

const OwnerAccessContext = createContext<OwnerAccessContextValue | null>(null);

export function OwnerAccessProvider({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<OwnerAccessState>({ state: "checking", message: "Checking owner access…" });

  const refresh = useCallback(async () => {
    setAccess({ state: "checking", message: "Checking owner access…" });
    const result = await checkOwnerAccess();
    setAccess(result);
    return result;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setAccess({ state: "checking", message: "Signing in securely…" });
    const result = await signInOwner(email, password);
    setAccess(result);
    return result;
  }, []);

  const signOut = useCallback(async () => {
    await signOutOwner();
    setAccess({ state: "signed_out", message: "You are signed out of V18 on this device." });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    checkOwnerAccess(controller.signal).then(setAccess).catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setAccess({ state: "error", message: "Owner access could not be verified. No owner road data was loaded." });
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => { void refresh(); }, 0);
    });
    return () => {
      controller.abort();
      listener.subscription.unsubscribe();
    };
  }, [refresh]);

  const value = useMemo(() => ({ access, refresh, signIn, signOut }), [access, refresh, signIn, signOut]);
  return <OwnerAccessContext.Provider value={value}>{children}</OwnerAccessContext.Provider>;
}

export function useOwnerAccess() {
  const value = useContext(OwnerAccessContext);
  if (!value) throw new Error("useOwnerAccess must be used inside OwnerAccessProvider");
  return value;
}
