import SQLiteESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";
import * as SQLite from "wa-sqlite";
import { IDBBatchAtomicVFS } from "wa-sqlite/src/examples/IDBBatchAtomicVFS.js";
import { createSerialTaskQueue } from "./offlineRouteQueue";
import {
  offlineRouteMetaKey,
  offlineRouteSchema,
  type OfflinePadRow,
  type OfflineRouteContract,
  type OfflineRouteRecord,
  type OfflineRouteRow,
  type OfflineRouteStepRow,
} from "./offlineRouteModel";

type WorkerRequest =
  | { requestId: number; type: "upsert"; record: OfflineRouteRecord }
  | { requestId: number; type: "read"; padId: string; recordRevision: string }
  | { requestId: number; type: "search"; query: string; limit: number };

type QueryResult = { rows: unknown[][]; columns: string[] };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (value: unknown) => void;
};

let databasePromise: Promise<{ sqlite3: ReturnType<typeof SQLite.Factory>; db: number }> | null = null;
const enqueueOperation = createSerialTaskQueue();

async function openDatabase() {
  const module = await SQLiteESMFactory();
  const sqlite3 = SQLite.Factory(module);
  const vfs = new IDBBatchAtomicVFS("brinesearch-v18-route-sqlite", { durability: "default" });
  sqlite3.vfs_register(vfs, true);
  const db = await sqlite3.open_v2("brinesearch-v18-routes.sqlite");
  for (const statement of offlineRouteSchema) await sqlite3.run(db, statement);
  await sqlite3.run(db, "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", ["schema_version", "1"]);
  return { sqlite3, db };
}

function database() {
  databasePromise ||= openDatabase();
  return databasePromise;
}

function records(result: QueryResult) {
  return result.rows.map((row) => Object.fromEntries(result.columns.map((column, index) => [column, row[index]])));
}

async function query(
  sqlite3: ReturnType<typeof SQLite.Factory>,
  db: number,
  label: string,
  statement: string,
  parameters: Array<string | number | null>,
) {
  try {
    return await sqlite3.execWithParams(db, statement, parameters);
  } catch (reason) {
    throw new Error(`Offline SQLite ${label} query failed: ${reason instanceof Error ? reason.message : "unknown error"}`);
  }
}

async function upsert(record: OfflineRouteRecord) {
  const { sqlite3, db } = await database();
  await sqlite3.run(db, "BEGIN IMMEDIATE");
  try {
    const pad = record.pad;
    await sqlite3.run(db, `INSERT INTO pads(id, name, operator, county, state, lat, lon, updated_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        operator=excluded.operator,
        county=excluded.county,
        state=excluded.state,
        lat=excluded.lat,
        lon=excluded.lon,
        updated_at=excluded.updated_at`, [pad.id, pad.name, pad.operator, pad.county, pad.state, pad.lat, pad.lon, pad.updated_at]);
    await sqlite3.run(db, "DELETE FROM route_steps WHERE route_id IN (SELECT id FROM routes WHERE pad_id = ?)", [pad.id]);
    await sqlite3.run(db, "DELETE FROM routes WHERE pad_id = ?", [pad.id]);
    const route = record.route;
    await sqlite3.run(db, "INSERT INTO routes(id, pad_id, route_group, status, revised_at) VALUES(?, ?, ?, ?, ?)", [route.id, route.pad_id, route.route_group, route.status, route.revised_at]);
    for (const step of record.steps) {
      await sqlite3.run(db, `INSERT INTO route_steps(
        id, route_id, step_index, road_name, road_id, instruction, miles,
        start_lat, start_lon, end_lat, end_lon
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        step.id, step.route_id, step.step_index, step.road_name, step.road_id, step.instruction, step.miles,
        step.start_lat, step.start_lon, step.end_lat, step.end_lon,
      ]);
    }
    await sqlite3.run(db, "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [offlineRouteMetaKey(pad.id), JSON.stringify(record.contract)]);
    await sqlite3.run(db, "COMMIT");
  } catch (reason) {
    await sqlite3.run(db, "ROLLBACK").catch(() => undefined);
    throw reason;
  }
  return true;
}

async function read(padId: string, recordRevision: string): Promise<OfflineRouteRecord | null> {
  const { sqlite3, db } = await database();
  const padRows = records(await query(sqlite3, db, "pad", "SELECT id, name, operator, county, state, lat, lon, updated_at FROM pads WHERE id = ? LIMIT 1", [padId]));
  const routeRows = records(await query(sqlite3, db, "route", "SELECT id, pad_id, route_group, status, revised_at FROM routes WHERE pad_id = ? ORDER BY route_group, id LIMIT 1", [padId]));
  const metaRows = records(await query(sqlite3, db, "metadata", "SELECT value FROM meta WHERE key = ? LIMIT 1", [offlineRouteMetaKey(padId)]));
  if (!padRows[0] || !routeRows[0] || typeof metaRows[0]?.value !== "string") return null;
  let contract: OfflineRouteContract;
  try {
    contract = JSON.parse(metaRows[0].value as string) as OfflineRouteContract;
  } catch {
    return null;
  }
  if (contract.recordRevision !== recordRevision) return null;
  const stepRows = records(await query(sqlite3, db, "steps", `SELECT
      id, route_id, step_index, road_name, road_id, instruction, miles,
      start_lat, start_lon, end_lat, end_lon
    FROM route_steps WHERE route_id = ? ORDER BY step_index`, [routeRows[0].id as string]));
  return {
    pad: padRows[0] as unknown as OfflinePadRow,
    route: routeRows[0] as unknown as OfflineRouteRow,
    steps: stepRows as unknown as OfflineRouteStepRow[],
    contract,
  };
}

async function search(searchText: string, limit: number) {
  const { sqlite3, db } = await database();
  const safeLimit = Math.min(25, Math.max(1, Math.trunc(limit)));
  const prefix = `${searchText.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
  return records(await query(sqlite3, db, "search", `SELECT id, name, operator, county, state, lat, lon, updated_at
    FROM pads WHERE name LIKE ? ESCAPE '\\' ORDER BY name COLLATE NOCASE, id LIMIT ?`, [prefix, safeLimit]));
}

workerScope.onmessage = (event) => {
  const request = event.data;
  const operation = enqueueOperation(async () => {
    if (request.type === "upsert") return upsert(request.record);
    if (request.type === "read") return read(request.padId, request.recordRevision);
    return search(request.query, request.limit);
  });
  operation.then((result) => {
    workerScope.postMessage({ requestId: request.requestId, ok: true, result });
  }).catch((reason) => {
    workerScope.postMessage({ requestId: request.requestId, ok: false, error: reason instanceof Error ? reason.message : "SQLite operation failed" });
  });
};
