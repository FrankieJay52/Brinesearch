declare module "wa-sqlite/src/examples/IDBBatchAtomicVFS.js" {
  import type { SQLiteVFS } from "wa-sqlite";

  export class IDBBatchAtomicVFS implements SQLiteVFS {
    constructor(name?: string, options?: { durability?: "default" | "strict" | "relaxed"; purge?: "deferred" | "manual"; purgeAtLeast?: number });
    close(): Promise<void>;
    mxPathName?: number;
    xClose(fileId: number): number;
    xRead(fileId: number, data: Uint8Array, offset: number): number;
    xWrite(fileId: number, data: Uint8Array, offset: number): number;
    xTruncate(fileId: number, size: number): number;
    xSync(fileId: number, flags: number): number;
    xFileSize(fileId: number, size: DataView): number;
    xLock(fileId: number, flags: number): number;
    xUnlock(fileId: number, flags: number): number;
    xCheckReservedLock(fileId: number, output: DataView): number;
    xFileControl(fileId: number, operation: number, argument: DataView): number;
    xSectorSize(fileId: number): number;
    xDeviceCharacteristics(fileId: number): number;
    xOpen(name: string | null, fileId: number, flags: number, outputFlags: DataView): number;
    xDelete(name: string, syncDir: number): number;
    xAccess(name: string, flags: number, output: DataView): number;
    xFullPathname(name: string, output: Uint8Array): number;
  }
}
