import { parseCoordinatePair } from "./coordinates";
import type { DirectorySnapshot, PadMapReference, PadMapReferenceKind } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://wvxzqtoiwhrgovzddtvz.supabase.co";
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_5_sw9B-bcSdWgDzp4Z3pnQ_b-tutvtd";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digestPattern = /^[0-9a-f]{64}$/;
const responseKeys = new Set(["schemaVersion", "snapshotId", "sourceRevision", "rowCount", "kindCounts", "contentSha256", "rows"]);
const rowKeys = new Set(["padId", "referenceKind", "latitude", "longitude"]);
const referenceKinds = new Set<PadMapReferenceKind>(["official_pad_reference", "official_wellhead_reference"]);

type RawRecord = Record<string, unknown>;

function object(value: unknown): RawRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RawRecord : {};
}

export function normalizePadReferencePayload(value: unknown, expectedSnapshotId: string, expectedSourceRevision: string) {
  const payload = object(Array.isArray(value) && value.length === 1 ? value[0] : value);
  if (Object.keys(payload).some((key) => !responseKeys.has(key))
    || payload.schemaVersion !== 1
    || payload.snapshotId !== expectedSnapshotId
    || payload.sourceRevision !== expectedSourceRevision
    || !/^[1-9][0-9]*$/.test(expectedSourceRevision)
    || typeof payload.contentSha256 !== "string"
    || !digestPattern.test(payload.contentSha256)
    || !Number.isInteger(payload.rowCount)
    || Number(payload.rowCount) < 0
    || Number(payload.rowCount) > 1_000
    || !Array.isArray(payload.rows)
    || payload.rows.length !== Number(payload.rowCount)) return null;

  const kindCounts = object(payload.kindCounts);
  if (Object.keys(kindCounts).some((key) => !new Set(["officialPadReference", "officialWellheadReference"]).has(key))
    || !Number.isInteger(kindCounts.officialPadReference)
    || !Number.isInteger(kindCounts.officialWellheadReference)
    || Number(kindCounts.officialPadReference) < 0
    || Number(kindCounts.officialWellheadReference) < 0
    || Number(kindCounts.officialPadReference) + Number(kindCounts.officialWellheadReference) !== Number(payload.rowCount)) return null;

  const references = new Map<string, PadMapReference>();
  let padCount = 0;
  let wellheadCount = 0;
  for (const raw of payload.rows) {
    const row = object(raw);
    if (Object.keys(row).some((key) => !rowKeys.has(key))
      || typeof row.padId !== "string"
      || !uuidPattern.test(row.padId)
      || references.has(row.padId)
      || typeof row.referenceKind !== "string"
      || !referenceKinds.has(row.referenceKind as PadMapReferenceKind)) return null;
    const coordinate = parseCoordinatePair(row.latitude, row.longitude, "reference");
    if (!coordinate.ok) return null;
    const kind = row.referenceKind as PadMapReferenceKind;
    if (kind === "official_pad_reference") padCount += 1;
    else wellheadCount += 1;
    references.set(row.padId, { ...coordinate.value, role: "reference", kind });
  }
  if (padCount !== Number(kindCounts.officialPadReference)
    || wellheadCount !== Number(kindCounts.officialWellheadReference)) return null;
  return references;
}

export function attachPadReferences(snapshot: DirectorySnapshot, references: Map<string, PadMapReference>) {
  if (!references.size) return snapshot;
  const directoryRows = new Map(snapshot.rows.map((row) => [row.padId, row]));
  if ([...references.keys()].some((padId) => {
    const row = directoryRows.get(padId);
    return !row || row.recordType !== "pad" || row.state !== "Ohio" || row.coordinate !== null;
  })) return snapshot;
  return {
    ...snapshot,
    rows: snapshot.rows.map((row) => {
      const reference = references.get(row.padId) || null;
      if (!reference || row.coordinate) return { ...row, mapReference: null };
      return { ...row, mapReference: reference };
    }),
  };
}

export async function loadPadReferences(snapshot: DirectorySnapshot) {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/brinesearch_v18_pad_reference_coordinates`, {
      method: "POST",
      headers: { apikey: publishableKey, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ p_snapshot_id: snapshot.snapshotId }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return snapshot;
    const references = normalizePadReferencePayload(await response.json(), snapshot.snapshotId, snapshot.sourceRevision);
    return references ? attachPadReferences(snapshot, references) : snapshot;
  } catch {
    return snapshot;
  }
}
