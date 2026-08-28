import { buildReleasedGoogleHandoffPlan, type ReleasedGoogleHandoffPlan } from "./googleRoute";
import type { PadSummary } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://wvxzqtoiwhrgovzddtvz.supabase.co";
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_5_sw9B-bcSdWgDzp4Z3pnQ_b-tutvtd";
const requestTimeoutMs = 3_000;

export interface ReleasedGoogleHandoffLoad {
  requestedPadId: string;
  requestedCanonicalId: string | null;
  requestedRecordRevision: string;
  checked: boolean;
  plan: ReleasedGoogleHandoffPlan | null;
}

export type HigherPriorityNavigationCheckState = "checking" | "checked" | "unavailable";

const releasedHandoffRequests = new Map<string, Promise<ReleasedGoogleHandoffLoad>>();
const releasedHandoffCache = new Map<string, ReleasedGoogleHandoffPlan>();
let releasedHandoffCacheGeneration = 0;

function releasedHandoffKey(pad: Pick<PadSummary, "canonicalId" | "recordRevision">) {
  return `${pad.canonicalId}:${pad.recordRevision}`;
}

export function clearReleasedGoogleHandoffCache() {
  releasedHandoffCacheGeneration += 1;
  releasedHandoffCache.clear();
  releasedHandoffRequests.clear();
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

type ReleasedHandoffFetch =
  | { checked: true; plan: ReleasedGoogleHandoffPlan | null }
  | { checked: false; plan: null };

function releasedHandoffLoad(
  pad: Pick<PadSummary, "padId" | "canonicalId" | "recordRevision">,
  result: ReleasedHandoffFetch,
): ReleasedGoogleHandoffLoad {
  return {
    requestedPadId: pad.padId,
    requestedCanonicalId: pad.canonicalId,
    requestedRecordRevision: pad.recordRevision,
    checked: result.checked,
    plan: result.plan,
  };
}

async function fetchReleasedGoogleHandoff(pad: PadSummary): Promise<ReleasedHandoffFetch> {
  if (!pad.canonicalId || typeof navigator !== "undefined" && navigator.onLine === false) return { checked: false, plan: null };
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/brinesearch_v18_driver_google_handoff_release`, {
      method: "POST",
      headers: { apikey: publishableKey, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ p_pad_id: pad.canonicalId }),
      cache: "no-store",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) return { checked: false, plan: null };
    const payload = await response.json() as unknown;
    // This scalar JSON RPC returns literal null when there is definitively no
    // release. Empty objects, arrays, and scalars are contract failures and
    // must be retried instead of becoming a session-long negative cache.
    if (payload === null) return { checked: true, plan: null };
    const row = object(payload);
    if (!Object.keys(row).length) return { checked: false, plan: null };
    const plan = buildReleasedGoogleHandoffPlan(row);
    return plan.padId === pad.canonicalId
      ? { checked: true, plan }
      : { checked: false, plan: null };
  } catch {
    return { checked: false, plan: null };
  }
}

export function loadReleasedGoogleHandoff(pad: PadSummary) {
  if (!pad.canonicalId) return Promise.resolve(releasedHandoffLoad(pad, { checked: true, plan: null }));
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return Promise.resolve(releasedHandoffLoad(pad, { checked: false, plan: null }));
  }
  const key = releasedHandoffKey(pad);
  if (releasedHandoffCache.has(key)) {
    return Promise.resolve(releasedHandoffLoad(pad, { checked: true, plan: releasedHandoffCache.get(key) || null }));
  }
  const existing = releasedHandoffRequests.get(key);
  if (existing) return existing;
  const cacheGeneration = releasedHandoffCacheGeneration;
  const request = fetchReleasedGoogleHandoff(pad)
    .then((result) => {
      // Cache only a positive immutable release. An explicit null is a valid
      // completed check for this open, but publication can change without the
      // directory record revision changing, so a negative answer must be
      // checked again on the next open.
      if (result.checked && result.plan && cacheGeneration === releasedHandoffCacheGeneration) {
        releasedHandoffCache.set(key, result.plan);
      }
      return releasedHandoffLoad(pad, result);
    })
    .finally(() => {
      if (releasedHandoffRequests.get(key) === request) releasedHandoffRequests.delete(key);
    });
  releasedHandoffRequests.set(key, request);
  return request;
}

export function currentReleasedGoogleHandoff(
  load: ReleasedGoogleHandoffLoad | null | undefined,
  pad: Pick<PadSummary, "padId" | "canonicalId" | "recordRevision"> | null,
) {
  return load?.checked === true
    && pad !== null
    && load.requestedPadId === pad.padId
    && load.requestedCanonicalId === pad.canonicalId
    && load.requestedRecordRevision === pad.recordRevision
    && load.plan?.padId === pad.canonicalId
    ? load.plan
    : null;
}

export function currentReleasedGoogleHandoffLoad(
  load: ReleasedGoogleHandoffLoad | null | undefined,
  pad: Pick<PadSummary, "padId" | "canonicalId" | "recordRevision"> | null,
) {
  return load
    && pad !== null
    && load.requestedPadId === pad.padId
    && load.requestedCanonicalId === pad.canonicalId
    && load.requestedRecordRevision === pad.recordRevision
    ? load
    : null;
}

export function higherPriorityNavigationCheckState({
  online,
  approvedRouteAvailable,
  statusRequestSettled,
  statusChecked,
  releaseRequestSettled,
  releaseChecked,
}: {
  online: boolean;
  approvedRouteAvailable: boolean;
  statusRequestSettled: boolean;
  statusChecked: boolean;
  releaseRequestSettled: boolean;
  releaseChecked: boolean;
}): HigherPriorityNavigationCheckState {
  if (!online || approvedRouteAvailable) return "checked";
  if (!statusRequestSettled || !releaseRequestSettled) return "checking";
  return statusChecked && releaseChecked ? "checked" : "unavailable";
}

export function releasedGoogleNavigationUrl(
  plan: ReleasedGoogleHandoffPlan | null,
  selectedRouteGroup: "primary" | "alternate" = "primary",
) {
  return selectedRouteGroup === "primary" ? plan?.singleUrl || null : null;
}
