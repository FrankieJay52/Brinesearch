import fallbackData from "./pad-fallback-data.json";
import { parseCoordinatePair } from "./coordinates";
import { readActiveSnapshot } from "./offline";
import { isSafePublicList, isSafePublicText } from "./publicFields";
import type { DirectorySnapshot, DirectorySourceState, PadSummary } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://wvxzqtoiwhrgovzddtvz.supabase.co";
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_5_sw9B-bcSdWgDzp4Z3pnQ_b-tutvtd";
const pageSize = 1000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const liveRowKeys = new Set([
  "ordinal", "padId", "recordRevision", "legacyId", "recordType", "company", "padName",
  "state", "county", "township", "address", "structuredRoadSequence", "driverEntrance",
  "coordinateState", "aliases", "wellNames", "apis", "propertyNumbers", "safeRoadTerms",
  "verificationState", "operatingState", "updatedAt",
]);

type RawRecord = Record<string, unknown>;
type RawFallback = { metadata?: Record<string, unknown>; pads?: RawRecord[] };

class V18DirectoryRpcUnavailable extends Error {}

function object(value: unknown): RawRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RawRecord) : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

function list(value: unknown) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value)
    .split(/\s*\|\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function validateLiveRow(row: RawRecord, expectedOrdinal: number) {
  if (Object.keys(row).some((key) => !liveRowKeys.has(key))) return false;
  if (Number(row.ordinal) !== expectedOrdinal || !Number.isInteger(Number(row.ordinal))) return false;
  if (typeof row.padId !== "string" || !uuidPattern.test(row.padId)) return false;
  if (typeof row.recordRevision !== "string" || !/^[1-9][0-9]*$/.test(row.recordRevision)) return false;
  if (!new Set(["pad", "disposal", "other"]).has(String(row.recordType))) return false;
  if (!isSafePublicText(row.padName, "padName")) return false;
  if (!isSafePublicText(row.legacyId, "legacyId", true)) return false;
  if (!isSafePublicText(row.company, "company", true)) return false;
  if (!isSafePublicText(row.state, "state", true)) return false;
  if (!isSafePublicText(row.county, "county", true)) return false;
  if (!isSafePublicText(row.township, "township", true)) return false;
  if (!isSafePublicText(row.address, "address", true)) return false;
  if (!isSafePublicText(row.structuredRoadSequence, "structuredRoadSequence", true)) return false;
  if (!isSafePublicText(row.verificationState, "verificationState", true)) return false;
  if (!isSafePublicText(row.operatingState, "operatingState", true)) return false;
  if (!isSafePublicList(row.aliases, "aliases")) return false;
  if (!isSafePublicList(row.wellNames, "wellNames")) return false;
  if (!isSafePublicList(row.apis, "apis")) return false;
  if (!isSafePublicList(row.propertyNumbers, "propertyNumbers")) return false;
  if (!isSafePublicList(row.safeRoadTerms, "safeRoadTerms")) return false;
  if (row.updatedAt !== null && (typeof row.updatedAt !== "string" || Number.isNaN(Date.parse(row.updatedAt)))) return false;
  const coordinateState = String(row.coordinateState);
  if (!new Set(["verified", "missing", "held"]).has(coordinateState)) return false;
  if (coordinateState === "verified") {
    const entrance = object(row.driverEntrance);
    if (Object.keys(entrance).some((key) => !new Set(["role", "latitude", "longitude", "qualityState"]).has(key))) return false;
    if (entrance.role !== "driver_entrance" || entrance.qualityState !== "validated") return false;
    if (!parseCoordinatePair(entrance.latitude, entrance.longitude, "driver_entrance").ok) return false;
  } else if (row.driverEntrance !== null) return false;
  return true;
}

function validateSnapshotMetadata(metadata: RawRecord, rowCount?: number, allowRetained = false) {
  const allowed = new Set([
    "snapshotId", "sourceRevision", "generatedAt", "publishedAt", "publicationState",
    "rowCount", "searchableCount", "typeCounts", "coordinateCounts", "identityEventCount",
    "contentSha256", "retainedUntil",
  ]);
  if (Object.keys(metadata).some((key) => !allowed.has(key))) return false;
  if (typeof metadata.snapshotId !== "string" || !uuidPattern.test(metadata.snapshotId)) return false;
  if (typeof metadata.sourceRevision !== "string" || !/^[1-9][0-9]*$/.test(metadata.sourceRevision)) return false;
  if (metadata.publicationState === "current") {
    if (metadata.retainedUntil !== null) return false;
  } else if (allowRetained && metadata.publicationState === "retained") {
    if (typeof metadata.retainedUntil !== "string" || Number.isNaN(Date.parse(metadata.retainedUntil)) || Date.parse(metadata.retainedUntil) <= Date.now()) return false;
  } else return false;
  if (typeof metadata.generatedAt !== "string" || Number.isNaN(Date.parse(metadata.generatedAt))) return false;
  if (typeof metadata.publishedAt !== "string" || Number.isNaN(Date.parse(metadata.publishedAt))) return false;
  if (typeof metadata.contentSha256 !== "string" || !/^[0-9a-f]{64}$/.test(metadata.contentSha256)) return false;
  if (!Number.isInteger(Number(metadata.rowCount)) || Number(metadata.rowCount) < 1 || Number(metadata.searchableCount) !== Number(metadata.rowCount)) return false;
  if (rowCount !== undefined && Number(metadata.rowCount) !== rowCount) return false;
  const typeCounts = object(metadata.typeCounts);
  const coordinateCounts = object(metadata.coordinateCounts);
  const typeTotal = Number(typeCounts.pad) + Number(typeCounts.disposal) + Number(typeCounts.other);
  const coordinateTotal = Number(coordinateCounts.verifiedDriverEntrance) + Number(coordinateCounts.missingDriverEntrance) + Number(coordinateCounts.heldDriverEntrance);
  if (![typeCounts.pad, typeCounts.disposal, typeCounts.other, coordinateCounts.verifiedDriverEntrance, coordinateCounts.missingDriverEntrance, coordinateCounts.heldDriverEntrance]
    .every((value) => Number.isInteger(Number(value)) && Number(value) >= 0)) return false;
  return typeTotal === Number(metadata.rowCount) && coordinateTotal === Number(metadata.rowCount) && Number(metadata.identityEventCount) === 0;
}

function immutableMetadataSignature(metadata: RawRecord) {
  return JSON.stringify({
    snapshotId: metadata.snapshotId,
    sourceRevision: metadata.sourceRevision,
    generatedAt: metadata.generatedAt,
    publishedAt: metadata.publishedAt,
    rowCount: metadata.rowCount,
    searchableCount: metadata.searchableCount,
    typeCounts: metadata.typeCounts,
    coordinateCounts: metadata.coordinateCounts,
    identityEventCount: metadata.identityEventCount,
    contentSha256: metadata.contentSha256,
  });
}

function mapRecord(row: RawRecord, source: DirectorySourceState): PadSummary {
  const canonicalId = text(row.padId ?? row.id) || null;
  const legacyId = text(row.legacyId ?? row.legacy_id ?? row._id) || null;
  const padName = text(row.pad_name ?? row.padName) || "Unnamed location";
  const company = text(row.company) || "Company not listed";
  const driverEntrance = object(row.driverEntrance);
  const hasDriverEntrance = Object.keys(driverEntrance).length > 0;
  const coordinateRole = hasDriverEntrance || text(row.coordinate_role) === "driver_entrance" ? "driver_entrance" : "legacy_saved";
  const coordinateResult = parseCoordinatePair(
    hasDriverEntrance ? driverEntrance.latitude : row.latitude,
    hasDriverEntrance ? driverEntrance.longitude : row.longitude,
    coordinateRole,
  );
  const type = text(row.record_type ?? row.recordType).toLowerCase();
  const recordType = type === "disposal" ? "disposal" : type && type !== "pad" ? "other" : "pad";
  const fallbackId = `${normalizeId(company)}--${normalizeId(padName)}`;
  const recordNumber = Number(row.ordinal ?? row.record_number ?? row._recordNumber);

  return {
    padId: canonicalId || legacyId || fallbackId,
    canonicalId,
    legacyId,
    aliases: list(row.aliases),
    recordNumber: Number.isFinite(recordNumber) ? recordNumber : null,
    recordRevision: text(row.recordRevision ?? row.record_revision ?? row.updated_at ?? row.updatedAt) || "unversioned",
    recordType,
    company,
    padName,
    state: text(row.state),
    county: text(row.county),
    township: text(row.township),
    address: text(row.address),
    coordinate: coordinateResult.ok ? coordinateResult.value : null,
    wellNames: list(row.wellNames ?? row.well_name ?? row.wellName),
    apiNumbers: list(row.apis ?? row.api),
    propertyNumbers: list(row.propertyNumbers ?? row.property_number ?? row.property),
    safeRoadTerms: list(row.safeRoadTerms ?? row.safe_road_terms),
    structuredRoadSequence: text(row.structuredRoadSequence ?? row.structured_road_sequence ?? row.Structured_Road_Sequence),
    writtenDirections: text(row.written_directions ?? row.writtenDirections ?? row.directions_clear),
    verificationStatus: text(row.verificationState ?? row.verification_status ?? row.verificationStatus),
    operatingStatus: text(row.operatingState ?? row.operating_status ?? row.operatingStatus),
    updatedAt: text(row.updated_at ?? row.updatedAt) || null,
  };
}

function normalizeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function counts(rows: PadSummary[]) {
  return {
    locations: rows.length,
    pads: rows.filter((row) => row.recordType === "pad").length,
    disposals: rows.filter((row) => row.recordType === "disposal").length,
    mapped: rows.filter((row) => row.coordinate).length,
  };
}

export function resolveDirectoryPad(rows: readonly PadSummary[], id: string) {
  const canonicalMatches = rows.filter((row) => row.padId === id || row.canonicalId === id);
  if (canonicalMatches.length === 1) return canonicalMatches[0];
  if (canonicalMatches.length > 1) return null;

  const legacyMatches = rows.filter((row) => row.legacyId === id);
  return legacyMatches.length === 1 ? legacyMatches[0] : null;
}

export function resolveDirectoryFavoriteIds(rows: readonly PadSummary[], storedIds: readonly string[]) {
  const favoriteIds = new Set<string>();
  const migrations: Array<{ from: string; to: string }> = [];
  for (const storedId of storedIds) {
    const row = resolveDirectoryPad(rows, storedId);
    if (!row) {
      favoriteIds.add(storedId);
      continue;
    }
    favoriteIds.add(row.padId);
    if (storedId !== row.padId) migrations.push({ from: storedId, to: row.padId });
  }
  return { favoriteIds, migrations };
}

function snapshot(rows: PadSummary[], sourceState: DirectorySourceState, metadata: RawRecord = {}): DirectorySnapshot {
  const fetchedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    snapshotId: text(metadata.snapshotId ?? metadata.snapshot_id) || `${sourceState}:${text(metadata.contentSha256 ?? metadata.content_sha256) || rows.length}`,
    sourceRevision: text(metadata.sourceRevision ?? metadata.source_revision) || "unversioned",
    sourceState,
    generatedAt: text(metadata.generatedAt ?? metadata.generated_at) || null,
    fetchedAt,
    lastVerifiedAt: sourceState === "live_current" || sourceState === "live_stale" ? fetchedAt : text(metadata.lastVerifiedAt ?? metadata.last_verified_at) || null,
    rows,
    counts: counts(rows),
  };
}

async function fetchV18Page(afterOrdinal: number, snapshotId?: string) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/brinesearch_v18_directory_page`, {
    method: "POST",
    headers: { apikey: publishableKey, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      p_snapshot_id: snapshotId || null,
      p_after_ordinal: afterOrdinal,
      p_limit: pageSize,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const body = await response.text();
    if (response.status === 404 || /PGRST202|brinesearch_v18_directory_page/i.test(body)) {
      throw new V18DirectoryRpcUnavailable("V18 directory RPC is not installed");
    }
    throw new Error(`V18 directory request failed (${response.status})`);
  }
  return object(await response.json());
}

async function fetchV18SnapshotAttempt() {
  const rows: RawRecord[] = [];
  let metadata: RawRecord = {};
  let afterOrdinal = 0;
  let pinnedSnapshot: string | undefined;
  let pinnedMetadata: string | undefined;
  let publicationState: "current" | "retained" = "current";

  for (;;) {
    const payload = await fetchV18Page(afterOrdinal, pinnedSnapshot);
    const error = text(payload.error);
    if (error) throw new Error(`V18 directory contract failed: ${error}`);
    const nextMetadata = object(payload.snapshot);
    const snapshotId = text(nextMetadata.snapshotId);
    const initialPage = !pinnedSnapshot;
    if (Number(payload.schemaVersion) !== 1 || !validateSnapshotMetadata(nextMetadata, undefined, !initialPage)) throw new Error("V18 directory snapshot metadata failed");
    if (!snapshotId) throw new Error("V18 directory omitted snapshot identity");
    if (pinnedSnapshot && snapshotId !== pinnedSnapshot) throw new Error("V18 directory changed snapshots during paging");
    if (publicationState === "retained" && nextMetadata.publicationState !== "retained") throw new Error("V18 directory retained snapshot state reversed during paging");
    publicationState = nextMetadata.publicationState as "current" | "retained";
    const metadataSignature = immutableMetadataSignature(nextMetadata);
    if (pinnedMetadata && metadataSignature !== pinnedMetadata) throw new Error("V18 directory metadata changed during paging");
    pinnedSnapshot = snapshotId;
    pinnedMetadata = metadataSignature;
    metadata = nextMetadata;

    const batch = Array.isArray(payload.rows) ? (payload.rows as RawRecord[]) : [];
    const page = object(payload.page);
    const pageAfter = Number(page.afterOrdinal);
    const nextAfter = Number(page.nextAfterOrdinal);
    if (pageAfter !== afterOrdinal || Number(page.rowCount) !== batch.length || batch.length > pageSize || batch.some((row, index) => !validateLiveRow(row, afterOrdinal + index + 1))) {
      throw new Error("V18 directory ordinal continuity failed");
    }
    if (nextAfter !== afterOrdinal + batch.length) throw new Error("V18 directory cursor does not match its rows");
    rows.push(...batch);
    if (page.complete === true) break;
    if (!batch.length || nextAfter <= afterOrdinal || nextAfter > 10_000) throw new Error("V18 directory paging was not bounded");
    afterOrdinal = nextAfter;
  }

  const expectedRows = Number(metadata.rowCount);
  if (!validateSnapshotMetadata(metadata, rows.length, true) || !Number.isInteger(expectedRows)) throw new Error("V18 directory row count failed");
  const mapped = rows.map((row) => mapRecord(row, "live_current"));
  if (mapped.some((row) => !row.canonicalId || row.padId !== row.canonicalId) || new Set(mapped.map((row) => row.padId)).size !== mapped.length) throw new Error("V18 directory contains invalid or duplicate identities");
  const actualCounts = counts(mapped);
  const typeCounts = object(metadata.typeCounts);
  const coordinateCounts = object(metadata.coordinateCounts);
  if (Number(typeCounts.pad) !== actualCounts.pads || Number(typeCounts.disposal) !== actualCounts.disposals || Number(typeCounts.other) !== actualCounts.locations - actualCounts.pads - actualCounts.disposals || Number(coordinateCounts.verifiedDriverEntrance) !== actualCounts.mapped) {
    throw new Error("V18 directory type counts failed");
  }
  return snapshot(mapped, publicationState === "current" ? "live_current" : "live_stale", metadata);
}

async function fetchV18Snapshot() {
  try {
    return await fetchV18SnapshotAttempt();
  } catch (error) {
    if (error instanceof V18DirectoryRpcUnavailable) throw error;
    if (error instanceof Error && error.message.includes("snapshot_expired")) return fetchV18SnapshotAttempt();
    throw error;
  }
}

async function fetchLiveSnapshot() {
  return fetchV18Snapshot();
}

function packagedSnapshot() {
  const payload = fallbackData as RawFallback;
  const rows = (payload.pads || []).map((row) => mapRecord(row, "packaged_fallback"));
  return snapshot(rows, "packaged_fallback", payload.metadata || {});
}

export async function loadDirectorySnapshot() {
  try {
    return await fetchLiveSnapshot();
  } catch (error) {
    console.warn("V18 live directory unavailable; checking a complete device snapshot.", error);
    try {
      const cached = await readActiveSnapshot();
      if (cached) return cached;
    } catch (cacheError) {
      console.warn("V18 cached directory unavailable; using the complete packaged fallback.", cacheError);
    }
    return packagedSnapshot();
  }
}

export function getPackagedSnapshotForTest() {
  return packagedSnapshot();
}
