import { buildOfflineRouteRecord, restoreOfflinePadStatus, type OfflinePadRow } from "./offlineRouteModel";
import type { DriverPadStatus, PadSummary } from "./types";

type WorkerResponse = { requestId: number; ok: boolean; result?: unknown; error?: string };
type PendingRequest = { resolve: (value: unknown) => void; reject: (reason: Error) => void; timeout: number };

const workerDeadlineMs = 10_000;
const pending = new Map<number, PendingRequest>();
let worker: Worker | null = null;
let requestSequence = 0;

function failPending(reason: Error) {
  for (const request of pending.values()) {
    window.clearTimeout(request.timeout);
    request.reject(reason);
  }
  pending.clear();
}

function routeWorker() {
  if (typeof Worker === "undefined" || typeof window === "undefined") return null;
  if (worker) return worker;
  worker = new Worker(new URL("./offlineRouteWorker.ts", import.meta.url), { type: "module", name: "brinesearch-offline-routes" });
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const request = pending.get(event.data.requestId);
    if (!request) return;
    pending.delete(event.data.requestId);
    window.clearTimeout(request.timeout);
    if (event.data.ok) request.resolve(event.data.result);
    else request.reject(new Error(event.data.error || "SQLite operation failed"));
  };
  worker.onerror = () => {
    failPending(new Error("Offline SQLite worker failed"));
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function requestWorker(message: Record<string, unknown>) {
  const target = routeWorker();
  if (!target) return Promise.reject(new Error("Offline SQLite is unavailable"));
  const requestId = ++requestSequence;
  return new Promise<unknown>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pending.delete(requestId);
      reject(new Error("Offline SQLite operation timed out"));
    }, workerDeadlineMs);
    pending.set(requestId, { resolve, reject, timeout });
    target.postMessage({ ...message, requestId });
  });
}

export function deviceIsOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export async function savePadDirectionsOffline(pad: PadSummary, status: DriverPadStatus) {
  const record = buildOfflineRouteRecord(pad, status);
  if (!record) return false;
  try {
    return await requestWorker({ type: "upsert", record }) === true;
  } catch {
    return false;
  }
}

export async function readPadDirectionsOffline(pad: PadSummary): Promise<DriverPadStatus | null> {
  if (!pad.canonicalId) return null;
  try {
    const record = await requestWorker({ type: "read", padId: pad.padId, recordRevision: pad.recordRevision });
    return restoreOfflinePadStatus(pad, record);
  } catch {
    return null;
  }
}

export async function searchOfflinePadsByName(query: string, limit = 12): Promise<OfflinePadRow[]> {
  const normalized = query.trim().slice(0, 128);
  if (!normalized) return [];
  try {
    const result = await requestWorker({ type: "search", query: normalized, limit });
    return Array.isArray(result) ? result as OfflinePadRow[] : [];
  } catch {
    return [];
  }
}
