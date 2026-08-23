import { isSafePublicList, isSafePublicText } from "./publicFields";
import type { CompanyRoadGeometry, CompanyRoadOverlay, CompanyRoadOverlayRow } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://wvxzqtoiwhrgovzddtvz.supabase.co";
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_5_sw9B-bcSdWgDzp4Z3pnQ_b-tutvtd";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pageSize = 500;
const maxRowsOnDevice = 10_000;
const maxPointsOnDevice = 250_000;
const overlayDeadlineMs = 45_000;

type JsonObject = Record<string, unknown>;

export type CompanyRoadAvailability = {
  state: "ready" | "unavailable";
  snapshotId: string | null;
  companies: string[];
  reason: string | null;
};

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function exactKeys(value: JsonObject, keys: string[]) {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}

function safeUniqueArray(value: unknown, max: number, validator: (entry: string) => boolean, min = 0): value is string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max || !value.every((entry) => typeof entry === "string" && validator(entry))) return false;
  return new Set(value).size === value.length;
}

function safeCompanies(value: unknown, min = 1): value is string[] {
  return safeUniqueArray(value, 200, (entry) => isSafePublicText(entry, "company"), min);
}

function safeRoadLabels(value: unknown, min: number): value is string[] {
  return safeUniqueArray(value, 64, (entry) => isSafePublicList([entry], "safeRoadTerms"), min);
}

function safeCounties(value: unknown): value is string[] {
  return safeUniqueArray(value, 64, (entry) => isSafePublicText(entry, "county"), 1);
}

function line(value: unknown): value is [number, number][] {
  return Array.isArray(value) && value.length >= 2 && value.every((point) => Array.isArray(point)
    && point.length === 2
    && point.every(Number.isFinite)
    && Number(point[0]) >= -84 && Number(point[0]) <= -74
    && Number(point[1]) >= 37 && Number(point[1]) <= 43);
}

function safeGeometry(value: unknown): { geometry: CompanyRoadGeometry; pointCount: number } | null {
  const geometry = object(value);
  if (!exactKeys(geometry, ["type", "coordinates"])) return null;
  if (geometry.type === "LineString" && line(geometry.coordinates)) {
    if (geometry.coordinates.length > 20_000) return null;
    return { geometry: geometry as unknown as CompanyRoadGeometry, pointCount: geometry.coordinates.length };
  }
  if (geometry.type === "MultiLineString" && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0 && geometry.coordinates.every(line)) {
    const pointCount = geometry.coordinates.reduce((count, part) => count + part.length, 0);
    if (pointCount > 20_000) return null;
    return { geometry: geometry as unknown as CompanyRoadGeometry, pointCount };
  }
  return null;
}

function validateRow(value: unknown, expectedOrdinal: number, selection: "all" | string) {
  const row = object(value);
  if (!exactKeys(row, ["ordinal", "companyLabel", "companies", "displayNames", "verifiedDesignations", "states", "counties", "geometry", "lengthMiles"])) return null;
  if (row.ordinal !== expectedOrdinal || !Number.isInteger(row.ordinal)) return null;
  if (!safeCompanies(row.companies) || !safeRoadLabels(row.displayNames, 1) || !safeRoadLabels(row.verifiedDesignations, 0) || !safeCounties(row.counties)) return null;
  if (!safeUniqueArray(row.states, 3, (entry) => new Set(["OH", "PA", "WV"]).has(entry), 1)) return null;
  if (selection === "all") {
    if (row.companyLabel !== null) return null;
  } else if (row.companyLabel !== selection || row.companies.length !== 1 || row.companies[0] !== selection) return null;
  if (typeof row.lengthMiles !== "number" || !Number.isFinite(row.lengthMiles) || row.lengthMiles <= 0 || row.lengthMiles > 2_000) return null;
  const parsedGeometry = safeGeometry(row.geometry);
  if (!parsedGeometry) return null;
  return { row: { ...row, geometry: parsedGeometry.geometry } as unknown as CompanyRoadOverlayRow, pointCount: parsedGeometry.pointCount };
}

function validateSnapshot(value: unknown, directorySnapshotId: string) {
  const snapshot = object(value);
  if (!exactKeys(snapshot, ["snapshotId", "directorySnapshotId", "sourceRevision", "generatedAt", "publishedAt", "publicationState", "retainedUntil", "rowCount", "companyCount"])) return null;
  if (typeof snapshot.snapshotId !== "string" || !uuidPattern.test(snapshot.snapshotId) || snapshot.directorySnapshotId !== directorySnapshotId) return null;
  if (typeof snapshot.sourceRevision !== "string" || !/^[1-9][0-9]*$/.test(snapshot.sourceRevision)) return null;
  if (typeof snapshot.generatedAt !== "string" || Number.isNaN(Date.parse(snapshot.generatedAt)) || typeof snapshot.publishedAt !== "string" || Number.isNaN(Date.parse(snapshot.publishedAt))) return null;
  if (snapshot.publicationState === "current") {
    if (snapshot.retainedUntil !== null) return null;
  } else if (snapshot.publicationState === "retained") {
    if (typeof snapshot.retainedUntil !== "string" || Number.isNaN(Date.parse(snapshot.retainedUntil)) || Date.parse(snapshot.retainedUntil) <= Date.now()) return null;
  } else return null;
  if (!Number.isInteger(snapshot.rowCount) || Number(snapshot.rowCount) < 1 || Number(snapshot.rowCount) > maxRowsOnDevice) return null;
  if (!Number.isInteger(snapshot.companyCount) || Number(snapshot.companyCount) < 1 || Number(snapshot.companyCount) > 200) return null;
  return snapshot as {
    snapshotId: string; directorySnapshotId: string; sourceRevision: string; generatedAt: string;
    publishedAt: string; publicationState: "current" | "retained"; retainedUntil: string | null;
    rowCount: number; companyCount: number;
  };
}

function metadataSignature(snapshot: ReturnType<typeof validateSnapshot>, companies: string[], selection: "all" | string) {
  return snapshot ? JSON.stringify({ ...snapshot, companies, selection }) : "";
}

export function validateCompanyRoadPage(payloadValue: unknown, directorySnapshotId: string, selection: "all" | string, expectedAfter: number) {
  const payload = object(payloadValue);
  if (!exactKeys(payload, ["schemaVersion", "selection", "availableCompanies", "snapshot", "page", "rows"]) || payload.schemaVersion !== 1) return null;
  const selectionEnvelope = object(payload.selection);
  const expectedCompany = selection === "all" ? null : selection;
  if (!exactKeys(selectionEnvelope, ["kind", "company"]) || selectionEnvelope.kind !== (selection === "all" ? "all" : "company") || selectionEnvelope.company !== expectedCompany) return null;
  if (!safeCompanies(payload.availableCompanies) || (selection !== "all" && !(payload.availableCompanies as string[]).includes(selection))) return null;
  const snapshot = validateSnapshot(payload.snapshot, directorySnapshotId);
  const page = object(payload.page);
  if (!snapshot || !exactKeys(page, ["afterOrdinal", "nextAfterOrdinal", "rowCount", "complete"])) return null;
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (page.afterOrdinal !== expectedAfter || page.rowCount !== rows.length || rows.length > pageSize || !Number.isInteger(page.nextAfterOrdinal) || Number(page.nextAfterOrdinal) !== expectedAfter + rows.length || typeof page.complete !== "boolean") return null;
  const parsedRows = rows.map((row, index) => validateRow(row, expectedAfter + index + 1, selection));
  if (parsedRows.some((row) => row === null)) return null;
  return {
    snapshot,
    availableCompanies: payload.availableCompanies as string[],
    rows: parsedRows.map((entry) => entry!.row),
    pointCount: parsedRows.reduce((count, entry) => count + entry!.pointCount, 0),
    nextAfter: Number(page.nextAfterOrdinal),
    complete: page.complete as boolean,
    signature: metadataSignature(snapshot, payload.availableCompanies as string[], selection),
  };
}

async function fetchPage(snapshotId: string | null, selection: "all" | string, afterOrdinal: number, limit: number, signal = AbortSignal.timeout(15_000)) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/brinesearch_v18_company_road_overlay_page`, {
    method: "POST",
    headers: { apikey: publishableKey, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ p_snapshot_id: snapshotId, p_company: selection === "all" ? null : selection, p_after_ordinal: afterOrdinal, p_limit: limit }),
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(`Approved-road request failed (${response.status})`);
  return response.json() as Promise<unknown>;
}

export async function loadCompanyRoadAvailability(directorySnapshotId: string, signal?: AbortSignal): Promise<CompanyRoadAvailability> {
  if (!uuidPattern.test(directorySnapshotId)) return { state: "unavailable", snapshotId: null, companies: [], reason: "Directory identity is not live." };
  try {
    const payload = await fetchPage(null, "all", 0, 1, signal || AbortSignal.timeout(15_000));
    const error = object(payload).error;
    if (typeof error === "string") return { state: "unavailable", snapshotId: null, companies: [], reason: "Exact route roads have not been published for this directory." };
    const page = validateCompanyRoadPage(payload, directorySnapshotId, "all", 0);
    if (!page) throw new Error("Approved-road metadata failed validation");
    return { state: "ready", snapshotId: page.snapshot.snapshotId, companies: page.availableCompanies, reason: null };
  } catch {
    return { state: "unavailable", snapshotId: null, companies: [], reason: "Approved route roads are unavailable; no roads were inferred." };
  }
}

export async function loadCompanyRoadOverlay(
  directorySnapshotId: string,
  selection: "all" | string,
  requestedSnapshotId: string | null = null,
  externalSignal?: AbortSignal,
): Promise<CompanyRoadOverlay> {
  if (!uuidPattern.test(directorySnapshotId) || (requestedSnapshotId !== null && !uuidPattern.test(requestedSnapshotId)) || (selection !== "all" && !isSafePublicText(selection, "company"))) throw new Error("Approved-road selection is invalid");
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromCaller();
  else externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const deadline = window.setTimeout(() => controller.abort(new DOMException("Approved-road request timed out", "TimeoutError")), overlayDeadlineMs);
  const rows: CompanyRoadOverlayRow[] = [];
  let snapshotId = requestedSnapshotId;
  let signature = "";
  let availableCompanies: string[] = [];
  let sourceRevision = "";
  let generatedAt = "";
  let afterOrdinal = 0;
  let totalPoints = 0;

  try {
    for (;;) {
      const payload = await fetchPage(snapshotId, selection, afterOrdinal, pageSize, controller.signal);
      const error = object(payload).error;
      if (typeof error === "string") throw new Error(`Approved route roads unavailable (${error})`);
      const page = validateCompanyRoadPage(payload, directorySnapshotId, selection, afterOrdinal);
      if (!page) throw new Error("Approved-road page failed validation");
      if (signature && page.signature !== signature) throw new Error("Approved-road snapshot changed during paging");
      signature = page.signature;
      snapshotId = page.snapshot.snapshotId;
      availableCompanies = page.availableCompanies;
      sourceRevision = page.snapshot.sourceRevision;
      generatedAt = page.snapshot.generatedAt;
      rows.push(...page.rows);
      totalPoints += page.pointCount;
      if (rows.length > maxRowsOnDevice || totalPoints > maxPointsOnDevice) throw new Error("Approved-road overlay is too large for this device");
      if (page.complete) {
        if (rows.length !== page.snapshot.rowCount || page.nextAfter !== page.snapshot.rowCount) throw new Error("Approved-road row count failed");
        break;
      }
      if (!page.rows.length || page.nextAfter <= afterOrdinal) throw new Error("Approved-road paging did not advance");
      afterOrdinal = page.nextAfter;
    }
  } catch (reason) {
    if (controller.signal.aborted) {
      if (externalSignal?.aborted) throw new DOMException("Approved-road request cancelled", "AbortError");
      throw new Error("Approved route roads took too long to load and were stopped.");
    }
    throw reason;
  } finally {
    window.clearTimeout(deadline);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }

  return { snapshotId: snapshotId!, directorySnapshotId, sourceRevision, generatedAt, selection, availableCompanies, rows };
}
