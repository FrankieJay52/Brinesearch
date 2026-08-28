import { isInsideCoordinateServiceArea } from "./coordinates";

export const ownerGoogleVerifyStorageKey = "brinesearch:v18:owner-google-verify-drafts:v1";
export const ownerGoogleVerifyStorageEvent = "brinesearch-owner-google-verify-drafts";
export const ownerGoogleVerifyDraftLimit = 50;

export interface OwnerGoogleVerifyPoint {
  latitude: number;
  longitude: number;
}

export type OwnerGoogleVerifySectionState =
  | "approved_named_road"
  | "lease_or_unnamed"
  | "not_approved";

export interface OwnerGoogleVerifySectionMark {
  sectionId: string;
  ordinal: number;
  state: OwnerGoogleVerifySectionState;
  roadName: string | null;
  start: OwnerGoogleVerifyPoint;
  end: OwnerGoogleVerifyPoint;
}

export interface OwnerGoogleVerifyDraft {
  schemaVersion: 1;
  draftId: string;
  pad: {
    padId: string;
    padName: string;
    company: string;
    recordRevision: string;
    destination: OwnerGoogleVerifyPoint & {
      source: string;
      label: string;
    };
    candidateEntrance: OwnerGoogleVerifyPoint | null;
  };
  anchor: OwnerGoogleVerifyPoint;
  turnPins: OwnerGoogleVerifyPoint[];
  sectionMarks: OwnerGoogleVerifySectionMark[];
  savedAt: string;
}

export interface OwnerGoogleVerifySummary {
  draftCount: number;
  lastDraft: OwnerGoogleVerifyDraft | null;
}

interface OwnerGoogleVerifyStore {
  schemaVersion: 1;
  drafts: OwnerGoogleVerifyDraft[];
}

function browserStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

function safeText(value: unknown, maximum = 500) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function safeOptionalText(value: unknown, maximum = 500) {
  return value === null || typeof value === "string" && value.length <= maximum;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key)) && allowed.every((key) => key in value);
}

function validCoordinateNumbers(point: Record<string, unknown>) {
  return typeof point.latitude === "number"
    && Number.isFinite(point.latitude)
    && point.latitude >= -90
    && point.latitude <= 90
    && typeof point.longitude === "number"
    && Number.isFinite(point.longitude)
    && point.longitude >= -180
    && point.longitude <= 180
    && !(point.latitude === 0 && point.longitude === 0)
    && isInsideCoordinateServiceArea(point.latitude, point.longitude);
}

function validPoint(value: unknown): value is OwnerGoogleVerifyPoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const point = value as Record<string, unknown>;
  return hasOnlyKeys(point, ["latitude", "longitude"])
    && validCoordinateNumbers(point);
}

function validSectionMark(value: unknown): value is OwnerGoogleVerifySectionMark {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const mark = value as Record<string, unknown>;
  return hasOnlyKeys(mark, ["sectionId", "ordinal", "state", "roadName", "start", "end"])
    && safeText(mark.sectionId, 120)
    && typeof mark.ordinal === "number"
    && Number.isInteger(mark.ordinal)
    && mark.ordinal >= 1
    && new Set<OwnerGoogleVerifySectionState>([
      "approved_named_road",
      "lease_or_unnamed",
      "not_approved",
    ]).has(mark.state as OwnerGoogleVerifySectionState)
    && safeOptionalText(mark.roadName, 120)
    && validPoint(mark.start)
    && validPoint(mark.end)
    && (mark.state !== "approved_named_road" || typeof mark.roadName === "string" && mark.roadName.trim().length > 0);
}

function validDraft(value: unknown): value is OwnerGoogleVerifyDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  if (!hasOnlyKeys(draft, ["schemaVersion", "draftId", "pad", "anchor", "turnPins", "sectionMarks", "savedAt"])) return false;
  const pad = draft.pad;
  if (!pad || typeof pad !== "object" || Array.isArray(pad)) return false;
  const padRecord = pad as Record<string, unknown>;
  if (!hasOnlyKeys(padRecord, ["padId", "padName", "company", "recordRevision", "destination", "candidateEntrance"])) return false;
  const destination = padRecord.destination;
  if (!destination || typeof destination !== "object" || Array.isArray(destination)) return false;
  const destinationRecord = destination as Record<string, unknown>;
  if (!hasOnlyKeys(destinationRecord, ["latitude", "longitude", "source", "label"]) || !validCoordinateNumbers(destinationRecord)) return false;
  const structurallyValid = draft.schemaVersion === 1
    && safeText(draft.draftId, 240)
    && safeText(padRecord.padId, 120)
    && safeText(padRecord.padName, 160)
    && typeof padRecord.company === "string"
    && padRecord.company.length <= 160
    && safeText(padRecord.recordRevision, 160)
    && destinationRecord.source === "saved_pad_gps"
    && destinationRecord.label === "Saved pad GPS"
    && (padRecord.candidateEntrance === null || validPoint(padRecord.candidateEntrance))
    && validPoint(draft.anchor)
    && Array.isArray(draft.turnPins)
    && draft.turnPins.length <= 5
    && draft.turnPins.every(validPoint)
    && Array.isArray(draft.sectionMarks)
    && draft.sectionMarks.length <= 200
    && draft.sectionMarks.every(validSectionMark)
    && safeText(draft.savedAt, 80)
    && Number.isFinite(new Date(draft.savedAt as string).getTime());
  if (!structurallyValid) return false;
  const anchor = draft.anchor as OwnerGoogleVerifyPoint;
  const turnPins = draft.turnPins as OwnerGoogleVerifyPoint[];
  const sectionMarks = draft.sectionMarks as OwnerGoogleVerifySectionMark[];
  const destinationPoint = destination as OwnerGoogleVerifyPoint;
  const boundaries = [anchor, ...turnPins, destinationPoint];
  if (sectionMarks.length > boundaries.length - 1) return false;
  const ordinals = new Set<number>();
  return sectionMarks.every((mark) => {
    if (ordinals.has(mark.ordinal) || mark.ordinal > boundaries.length - 1) return false;
    ordinals.add(mark.ordinal);
    const start = boundaries[mark.ordinal - 1];
    const end = boundaries[mark.ordinal];
    return mark.start.latitude === start.latitude
      && mark.start.longitude === start.longitude
      && mark.end.latitude === end.latitude
      && mark.end.longitude === end.longitude;
  });
}

function normalizedDraft(value: unknown): OwnerGoogleVerifyDraft | null {
  if (!validDraft(value)) return null;
  return {
    schemaVersion: 1,
    draftId: value.draftId,
    pad: {
      padId: value.pad.padId,
      padName: value.pad.padName,
      company: value.pad.company,
      recordRevision: value.pad.recordRevision,
      destination: {
        latitude: value.pad.destination.latitude,
        longitude: value.pad.destination.longitude,
        source: value.pad.destination.source,
        label: value.pad.destination.label,
      },
      candidateEntrance: value.pad.candidateEntrance
        ? { latitude: value.pad.candidateEntrance.latitude, longitude: value.pad.candidateEntrance.longitude }
        : null,
    },
    anchor: { latitude: value.anchor.latitude, longitude: value.anchor.longitude },
    turnPins: value.turnPins.map((point) => ({ latitude: point.latitude, longitude: point.longitude })),
    sectionMarks: value.sectionMarks.map((mark) => ({
      sectionId: mark.sectionId,
      ordinal: mark.ordinal,
      state: mark.state,
      roadName: mark.roadName,
      start: { latitude: mark.start.latitude, longitude: mark.start.longitude },
      end: { latitude: mark.end.latitude, longitude: mark.end.longitude },
    })),
    savedAt: value.savedAt,
  };
}

export function readOwnerGoogleVerifyDrafts(storage: Pick<Storage, "getItem"> | null = browserStorage()) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(ownerGoogleVerifyStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    const store = parsed as Record<string, unknown>;
    if (store.schemaVersion !== 1 || !Array.isArray(store.drafts)) return [];
    return store.drafts.map(normalizedDraft).filter((draft): draft is OwnerGoogleVerifyDraft => Boolean(draft))
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
      .slice(0, ownerGoogleVerifyDraftLimit);
  } catch {
    return [];
  }
}

export function ownerGoogleVerifySummary(storage: Pick<Storage, "getItem"> | null = browserStorage()): OwnerGoogleVerifySummary {
  const drafts = readOwnerGoogleVerifyDrafts(storage);
  return { draftCount: drafts.length, lastDraft: drafts[0] || null };
}

export function latestOwnerGoogleVerifyDraftForPad(
  padId: string,
  storage: Pick<Storage, "getItem"> | null = browserStorage(),
) {
  return readOwnerGoogleVerifyDrafts(storage).find((draft) => draft.pad.padId === padId) || null;
}

export function saveOwnerGoogleVerifyDraft(
  draft: OwnerGoogleVerifyDraft,
  storage: Pick<Storage, "getItem" | "setItem"> | null = browserStorage(),
) {
  const normalized = normalizedDraft(draft);
  if (!normalized) throw new Error("Owner route verification draft failed validation.");
  if (!storage) throw new Error("Device draft storage is unavailable.");
  const existing = readOwnerGoogleVerifyDrafts(storage);
  const store: OwnerGoogleVerifyStore = {
    schemaVersion: 1,
    drafts: [normalized, ...existing.filter((candidate) => candidate.draftId !== normalized.draftId)]
      .slice(0, ownerGoogleVerifyDraftLimit),
  };
  storage.setItem(ownerGoogleVerifyStorageKey, JSON.stringify(store));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ownerGoogleVerifyStorageEvent));
  return normalized;
}

export function ownerGoogleVerifyExportJson(
  storage: Pick<Storage, "getItem"> | null = browserStorage(),
  exportedAt = new Date().toISOString(),
) {
  return JSON.stringify({
    schemaVersion: 1,
    kind: "brinesearch-owner-google-route-verification-drafts",
    exportedAt,
    authority: "draft_only",
    driverNavigateChanged: false,
    drafts: readOwnerGoogleVerifyDrafts(storage),
  }, null, 2);
}
