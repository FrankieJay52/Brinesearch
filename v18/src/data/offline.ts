import type { DirectorySnapshot, PadMapReference, PadSummary } from "./types";
import { parseCoordinatePair } from "./coordinates";
import { isSafePublicList, isSafePublicText } from "./publicFields";

const databaseName = "brinesearch-v18";
const databaseVersion = 3;
const stores = ["meta", "directorySnapshots", "directoryRows", "savedDetails", "favorites", "recents", "identityState", "routeManifests"] as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxFavoriteRecords = 2_000;
const maxRecentRecords = 64;
const databaseOpenDeadlineMs = 5_000;

async function deviceDigest(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

function textArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? [...value] : null;
}

export function validateCachedPad(value: unknown): PadSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Partial<PadSummary>;
  if (typeof row.padId !== "string" || !uuidPattern.test(row.padId) || row.canonicalId !== row.padId) return null;
  if (typeof row.recordRevision !== "string" || !/^[1-9][0-9]*$/.test(row.recordRevision)) return null;
  if (!Number.isInteger(row.recordNumber) || Number(row.recordNumber) < 1) return null;
  if (!new Set(["pad", "disposal", "other"]).has(String(row.recordType))) return null;
  for (const key of ["company", "padName", "state", "county", "township", "address", "structuredRoadSequence", "writtenDirections", "verificationStatus", "operatingStatus"] as const) {
    if (typeof row[key] !== "string") return null;
  }
  if (!isSafePublicText(row.padName, "padName") || !isSafePublicText(row.company, "company")) return null;
  if (!isSafePublicText(row.state, "state", true)) return null;
  if (!isSafePublicText(row.county, "county", true) || !isSafePublicText(row.township, "township", true)) return null;
  if (!isSafePublicText(row.address, "address", true) || !isSafePublicText(row.structuredRoadSequence, "structuredRoadSequence", true)) return null;
  if (!isSafePublicText(row.writtenDirections, "writtenDirections", true)) return null;
  if (!isSafePublicText(row.verificationStatus, "verificationState", true) || !isSafePublicText(row.operatingStatus, "operatingState", true)) return null;
  if (!isSafePublicText(row.legacyId, "legacyId", true)) return null;
  const wellNames = textArray(row.wellNames);
  const aliases = textArray(row.aliases);
  const apiNumbers = textArray(row.apiNumbers);
  const propertyNumbers = textArray(row.propertyNumbers);
  const safeRoadTerms = textArray(row.safeRoadTerms);
  if (!aliases || !wellNames || !apiNumbers || !propertyNumbers || !safeRoadTerms) return null;
  if (!isSafePublicList(aliases, "aliases") || !isSafePublicList(wellNames, "wellNames") || !isSafePublicList(apiNumbers, "apis") || !isSafePublicList(propertyNumbers, "propertyNumbers") || !isSafePublicList(safeRoadTerms, "safeRoadTerms")) return null;
  let coordinate: PadSummary["coordinate"] = null;
  if (row.coordinate !== null) {
    if (!row.coordinate || row.coordinate.role !== "driver_entrance") return null;
    const parsed = parseCoordinatePair(row.coordinate.latitude, row.coordinate.longitude, "driver_entrance");
    if (!parsed.ok) return null;
    coordinate = parsed.value;
  }
  let mapReference: PadMapReference | null = null;
  if (row.mapReference !== undefined && row.mapReference !== null) {
    if (coordinate || typeof row.mapReference !== "object"
      || row.mapReference.role !== "reference"
      || (row.mapReference.kind !== "official_pad_reference"
        && row.mapReference.kind !== "official_wellhead_reference"
        && row.mapReference.kind !== "saved_pad_reference")) return null;
    const parsed = parseCoordinatePair(row.mapReference.latitude, row.mapReference.longitude, "reference");
    if (!parsed.ok) return null;
    mapReference = { ...parsed.value, role: "reference", kind: row.mapReference.kind };
  }
  if (row.updatedAt !== null && typeof row.updatedAt !== "string") return null;
  if (row.legacyId !== null && typeof row.legacyId !== "string") return null;
  return {
    padId: row.padId,
    canonicalId: row.padId,
    legacyId: row.legacyId ?? null,
    aliases,
    recordNumber: Number(row.recordNumber),
    recordRevision: row.recordRevision,
    recordType: row.recordType as PadSummary["recordType"],
    company: row.company as string,
    padName: row.padName as string,
    state: row.state as string,
    county: row.county as string,
    township: row.township as string,
    address: row.address as string,
    coordinate,
    mapReference,
    wellNames,
    apiNumbers,
    propertyNumbers,
    safeRoadTerms,
    structuredRoadSequence: row.structuredRoadSequence as string,
    writtenDirections: row.writtenDirections as string,
    verificationStatus: row.verificationStatus as string,
    operatingStatus: row.operatingStatus as string,
    updatedAt: row.updatedAt ?? null,
  };
}

export function cachedSnapshotSourceState(sourceState: unknown): "cached_live" | "cached_stale" {
  return sourceState === "live_stale" || sourceState === "cached_stale" ? "cached_stale" : "cached_live";
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(databaseName, databaseVersion);
    const deadline = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Device storage did not become available in time"));
    }, databaseOpenDeadlineMs);
    const fail = (reason: DOMException | Error | null, fallback: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(deadline);
      reject(reason || new Error(fallback));
    };
    request.onupgradeneeded = () => {
      for (const store of stores) {
        if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
      }
      const recents = request.transaction!.objectStore("recents");
      if (!recents.indexNames.contains("openedAt")) recents.createIndex("openedAt", "openedAt");
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      window.clearTimeout(deadline);
      resolve(database);
    };
    request.onerror = () => fail(request.error, "Device storage could not be opened");
    request.onblocked = () => fail(null, "Device storage upgrade is blocked by another open BrineSearch tab");
  });
}

async function transact<T>(store: (typeof stores)[number], mode: IDBTransactionMode, operation: (target: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      let requestResult!: T;
      let requestSucceeded = false;
      let settled = false;
      const transaction = database.transaction(store, mode);
      const fail = (reason: DOMException | Error | null, fallback: string) => {
        if (settled) return;
        settled = true;
        reject(reason || new Error(fallback));
      };
      let request: IDBRequest<T>;
      try {
        request = operation(transaction.objectStore(store));
      } catch (reason) {
        transaction.abort();
        fail(reason instanceof Error ? reason : null, "Device storage operation failed");
        return;
      }
      request.onsuccess = () => {
        requestResult = request.result;
        requestSucceeded = true;
      };
      request.onerror = () => fail(request.error, "Device storage request failed");
      transaction.oncomplete = () => {
        if (settled) return;
        if (!requestSucceeded) {
          fail(null, "Device storage transaction completed without a request result");
          return;
        }
        settled = true;
        resolve(requestResult);
      };
      transaction.onerror = () => fail(transaction.error, "Device storage transaction failed");
      transaction.onabort = () => fail(transaction.error, "Device storage transaction was aborted");
    });
  } finally {
    database.close();
  }
}

export async function saveCompleteSnapshot(snapshot: DirectorySnapshot) {
  const rows = snapshot.rows.slice().sort((left, right) => Number(left.recordNumber) - Number(right.recordNumber));
  const deviceContentSha256 = await deviceDigest(rows);
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["directorySnapshots", "directoryRows", "meta"], "readwrite");
      const snapshotStore = transaction.objectStore("directorySnapshots");
      const rowStore = transaction.objectStore("directoryRows");
      const metadata = { ...snapshot, rows: [], deviceContentSha256 };
      snapshotStore.clear();
      rowStore.clear();
      snapshotStore.put(metadata, snapshot.snapshotId);
      for (const row of rows) {
        rowStore.put({ snapshotId: snapshot.snapshotId, row }, `${snapshot.snapshotId}:${row.padId}`);
      }
      transaction.objectStore("meta").put(snapshot.snapshotId, "activeSnapshotId");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Snapshot storage was aborted"));
    });
  } finally {
    database.close();
  }
}

export async function readActiveSnapshot(): Promise<DirectorySnapshot | null> {
  const activeId = await transact<unknown>("meta", "readonly", (store) => store.get("activeSnapshotId"));
  if (typeof activeId !== "string" || !activeId) return null;
  const stored = await transact<unknown>("directorySnapshots", "readonly", (store) => store.get(activeId));
  if (!stored || typeof stored !== "object") return null;
  const metadata = stored as DirectorySnapshot & { deviceContentSha256?: unknown };
  if (metadata.schemaVersion !== 1 || metadata.snapshotId !== activeId || !uuidPattern.test(metadata.snapshotId || "") || !/^[1-9][0-9]*$/.test(metadata.sourceRevision || "") || !metadata.lastVerifiedAt || Number.isNaN(Date.parse(metadata.lastVerifiedAt)) || typeof metadata.deviceContentSha256 !== "string" || !/^[0-9a-f]{64}$/.test(metadata.deviceContentSha256)) {
    return null;
  }
  const legacyRows = Array.isArray(metadata.rows) && metadata.rows.length > 0 ? metadata.rows : null;
  const storedRows = legacyRows ? [] : await transact<unknown[]>("directoryRows", "readonly", (store) => store.getAll());
  const rawRows = legacyRows ?? storedRows
    .filter((value): value is { snapshotId: string; row: unknown } => Boolean(value && typeof value === "object" && (value as { snapshotId?: unknown }).snapshotId === activeId))
    .map((value) => value.row);
  const rows = rawRows.map(validateCachedPad);
  if (!rows.length || rows.some((row) => row === null)) return null;
  const verifiedRows = rows as PadSummary[];
  verifiedRows.sort((left, right) => Number(left.recordNumber) - Number(right.recordNumber));
  if (verifiedRows.some((row, index) => row.recordNumber !== index + 1)) return null;
  if (new Set(verifiedRows.map((row) => row.padId)).size !== verifiedRows.length) return null;
  const actualCounts = {
    locations: verifiedRows.length,
    pads: verifiedRows.filter((row) => row.recordType === "pad").length,
    disposals: verifiedRows.filter((row) => row.recordType === "disposal").length,
    mapped: verifiedRows.filter((row) => row.coordinate !== null).length,
  };
  if (!metadata.counts || Object.entries(actualCounts).some(([key, count]) => metadata.counts[key as keyof typeof actualCounts] !== count)) return null;
  if (await deviceDigest(verifiedRows) !== metadata.deviceContentSha256) return null;
  const sourceState = cachedSnapshotSourceState(metadata.sourceState);
  return { ...metadata, rows: verifiedRows, sourceState };
}

export async function setFavorite(padId: string, favorite: boolean) {
  if (favorite) await transact("favorites", "readwrite", (store) => store.put({ padId, savedAt: new Date().toISOString() }, padId));
  else await transact("favorites", "readwrite", (store) => store.delete(padId));
}

export async function readFavoriteIds() {
  const database = await openDatabase();
  try {
    return await new Promise<string[]>((resolve, reject) => {
      const transaction = database.transaction("favorites", "readonly");
      const keys: string[] = [];
      let examined = 0;
      const cursor = transaction.objectStore("favorites").openKeyCursor();
      cursor.onsuccess = () => {
        if (!cursor.result) return resolve(keys);
        examined += 1;
        if (examined > maxFavoriteRecords) return reject(new Error("Favorite store exceeds its bounded device contract"));
        const key = String(cursor.result.key);
        if (uuidPattern.test(key) || isSafePublicText(key, "legacyId")) keys.push(key);
        cursor.result.continue();
      };
      cursor.onerror = () => reject(cursor.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function migrateFavoriteIdentity(fromPadId: string, toPadId: string) {
  if (fromPadId === toPadId) return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("favorites", "readwrite");
      const store = transaction.objectStore("favorites");
      const source = store.get(fromPadId);
      source.onsuccess = () => {
        const savedAt = source.result && typeof source.result === "object" && typeof (source.result as { savedAt?: unknown }).savedAt === "string"
          ? (source.result as { savedAt: string }).savedAt
          : new Date().toISOString();
        store.put({ padId: toPadId, savedAt }, toPadId);
        store.delete(fromPadId);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Favorite identity migration was aborted"));
    });
  } finally {
    database.close();
  }
}

export type RecentLocation = { padId: string; openedAt: string };

export function resolveRecentIdentities(
  recents: RecentLocation[],
  resolvePadId: (padId: string) => string | null,
) {
  const byPadId = new Map<string, RecentLocation>();
  const migrations: { from: string; to: string }[] = [];
  for (const recent of recents) {
    const resolvedPadId = resolvePadId(recent.padId) || recent.padId;
    if (resolvedPadId !== recent.padId) migrations.push({ from: recent.padId, to: resolvedPadId });
    const current = byPadId.get(resolvedPadId);
    if (!current || Date.parse(recent.openedAt) > Date.parse(current.openedAt)) {
      byPadId.set(resolvedPadId, { padId: resolvedPadId, openedAt: recent.openedAt });
    }
  }
  return {
    recents: [...byPadId.values()].sort((left, right) => Date.parse(right.openedAt) - Date.parse(left.openedAt)),
    migrations: [...new Map(migrations.map((migration) => [`${migration.from}\u0000${migration.to}`, migration])).values()],
  };
}

export async function migrateRecentIdentity(fromPadId: string, toPadId: string) {
  if (fromPadId === toPadId) return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("recents", "readwrite");
      const store = transaction.objectStore("recents");
      const sourceRequest = store.get(fromPadId);
      const targetRequest = store.get(toPadId);
      let reads = 0;
      const merge = () => {
        reads += 1;
        if (reads !== 2) return;
        const source = sourceRequest.result as Partial<RecentLocation> | undefined;
        const target = targetRequest.result as Partial<RecentLocation> | undefined;
        if (!source || typeof source.openedAt !== "string" || Number.isNaN(Date.parse(source.openedAt))) return;
        const targetOpenedAt = typeof target?.openedAt === "string" && !Number.isNaN(Date.parse(target.openedAt))
          ? target.openedAt
          : null;
        const openedAt = targetOpenedAt && Date.parse(targetOpenedAt) > Date.parse(source.openedAt)
          ? targetOpenedAt
          : source.openedAt;
        store.put({ padId: toPadId, openedAt }, toPadId);
        store.delete(fromPadId);
      };
      sourceRequest.onsuccess = merge;
      targetRequest.onsuccess = merge;
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Recent identity migration was aborted"));
    });
  } finally {
    database.close();
  }
}

export async function readRecentLocations(limit = 8): Promise<RecentLocation[]> {
  const safeLimit = Number.isInteger(limit) ? Math.min(20, Math.max(1, limit)) : 8;
  const database = await openDatabase();
  try {
    return await new Promise<RecentLocation[]>((resolve, reject) => {
      const transaction = database.transaction("recents", "readonly");
      const rows: RecentLocation[] = [];
      let examined = 0;
      const cursor = transaction.objectStore("recents").index("openedAt").openCursor(null, "prev");
      cursor.onsuccess = () => {
        if (!cursor.result || rows.length >= safeLimit || examined >= maxRecentRecords) return resolve(rows);
        examined += 1;
        const candidate = cursor.result.value as Partial<RecentLocation>;
        if (typeof candidate.padId === "string"
          && (uuidPattern.test(candidate.padId) || isSafePublicText(candidate.padId, "legacyId"))
          && typeof candidate.openedAt === "string" && !Number.isNaN(Date.parse(candidate.openedAt))) {
          rows.push({ padId: candidate.padId, openedAt: candidate.openedAt });
        }
        cursor.result.continue();
      };
      cursor.onerror = () => reject(cursor.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function saveRecent(pad: PadSummary) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("recents", "readwrite");
      const store = transaction.objectStore("recents");
      store.put({ padId: pad.padId, openedAt: new Date().toISOString() }, pad.padId);
      const count = store.count();
      count.onsuccess = () => {
        let remaining = Math.max(0, Number(count.result) - maxRecentRecords);
        if (!remaining) return;
        const cursor = store.index("openedAt").openCursor();
        cursor.onsuccess = () => {
          if (!cursor.result || remaining <= 0) return;
          cursor.result.delete();
          remaining -= 1;
          cursor.result.continue();
        };
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Recent-location storage was aborted"));
    });
  } finally {
    database.close();
  }
}
