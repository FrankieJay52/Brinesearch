import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import { loadCompanyRoadAvailability, loadCompanyRoadOverlay, type CompanyRoadAvailability } from "./companyRoads";
import { useDirectory } from "./DirectoryContext";
import type { CompanyRoadOverlay } from "./types";

type CompanyRoadsContextValue = {
  availability: CompanyRoadAvailability;
  selection: "all" | string | null;
  overlay: CompanyRoadOverlay | null;
  loading: boolean;
  error: string | null;
  selectRoads: (selection: "all" | string | null) => void;
};

const unavailable: CompanyRoadAvailability = { state: "unavailable", snapshotId: null, companies: [], reason: "Approved route roads require a current live directory." };
const CompanyRoadsContext = createContext<CompanyRoadsContextValue | null>(null);
const authorityRecheckMs = 5 * 60 * 1_000;

export function CompanyRoadsProvider({ children }: PropsWithChildren) {
  const { snapshot } = useDirectory();
  const [availability, setAvailability] = useState<CompanyRoadAvailability>(unavailable);
  const [selection, setSelection] = useState<"all" | string | null>(null);
  const [overlay, setOverlay] = useState<CompanyRoadOverlay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authorityCheckRevision, setAuthorityCheckRevision] = useState(0);

  useEffect(() => {
    const recheck = () => {
      if (snapshot?.sourceState === "live_current") setAuthorityCheckRevision((revision) => revision + 1);
    };
    const visibilityRecheck = () => {
      if (document.visibilityState === "visible") recheck();
    };
    const interval = window.setInterval(recheck, authorityRecheckMs);
    document.addEventListener("visibilitychange", visibilityRecheck);
    window.addEventListener("online", recheck);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visibilityRecheck);
      window.removeEventListener("online", recheck);
    };
  }, [snapshot?.sourceState]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setOverlay(null);
    setError(null);
    if (!snapshot || snapshot.sourceState !== "live_current") {
      setAvailability(unavailable);
      setLoading(false);
      return () => { active = false; };
    }
    setAvailability({ state: "unavailable", snapshotId: null, companies: [], reason: "Checking current approved-road authority…" });
    setLoading(true);
    loadCompanyRoadAvailability(snapshot.snapshotId, controller.signal).then((next) => {
      if (active) setAvailability(next);
    }).catch(() => {
      if (active) setAvailability(unavailable);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [authorityCheckRevision, snapshot?.snapshotId, snapshot?.sourceState]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setOverlay(null);
    setError(null);
    if (!selection) {
      setLoading(false);
      return () => { active = false; };
    }
    if (!snapshot || snapshot.sourceState !== "live_current" || availability.state !== "ready" || !availability.snapshotId || (selection !== "all" && !availability.companies.includes(selection))) {
      setError("Approved route roads are unavailable; no roads were inferred.");
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    loadCompanyRoadOverlay(snapshot.snapshotId, selection, availability.snapshotId, controller.signal).then((next) => {
      if (active) setOverlay(next);
    }).catch((reason) => {
      if (active && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Approved route roads are unavailable.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [availability.companies, availability.snapshotId, availability.state, selection, snapshot?.snapshotId, snapshot?.sourceState]);

  const value = useMemo<CompanyRoadsContextValue>(() => ({ availability, selection, overlay, loading, error, selectRoads: setSelection }), [availability, error, loading, overlay, selection]);
  return <CompanyRoadsContext.Provider value={value}>{children}</CompanyRoadsContext.Provider>;
}

export function useCompanyRoads() {
  const context = useContext(CompanyRoadsContext);
  if (!context) throw new Error("useCompanyRoads must be used inside CompanyRoadsProvider");
  return context;
}
