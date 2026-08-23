import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPadWellRows } from "./wellRows";

const pad = {
  padId: "12da2a9f-c9ae-467f-abf5-723c31daecfe",
  canonicalId: "12da2a9f-c9ae-467f-abf5-723c31daecfe",
  recordRevision: "1786405417119866",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("V18 reviewed well-row contract", () => {
  it("preserves the reviewed Albert row order and pairings", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      padId: pad.padId,
      recordRevision: pad.recordRevision,
      rows: [
        { wellName: "ALBERT W KKW BL 2H", apiNumber: "34-013-2-1385-00-00", propertyNumber: "1553862" },
        { wellName: "ALBERT SW KKW BL 4H", apiNumber: "34-013-2-1381-00-00", propertyNumber: "1553863" },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(loadPadWellRows(pad, "live_current")).resolves.toEqual([
      { wellName: "ALBERT W KKW BL 2H", apiNumber: "34-013-2-1385-00-00", propertyNumber: "1553862" },
      { wellName: "ALBERT SW KKW BL 4H", apiNumber: "34-013-2-1381-00-00", propertyNumber: "1553863" },
    ]);
  });

  it("fails closed when the row contract is stale or includes extra fields", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        padId: pad.padId,
        recordRevision: "1786405417119867",
        rows: [],
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        padId: pad.padId,
        recordRevision: pad.recordRevision,
        rows: [{
          wellName: "ALBERT W KKW BL 2H",
          apiNumber: "34-013-2-1385-00-00",
          propertyNumber: "1553862",
          officialOperator: "must not cross the public contract",
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", request);

    await expect(loadPadWellRows(pad, "live_current")).resolves.toBeNull();
    await expect(loadPadWellRows(pad, "live_current")).resolves.toBeNull();
  });

  it("does not call the live RPC for a packaged fallback record", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);

    await expect(loadPadWellRows(pad, "packaged_fallback")).resolves.toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it("pins the SQL projection to three public display fields", () => {
    const migration = readFileSync(
      new URL("../../../supabase/migrations/20260823120000_v18_public_well_rows_contract.sql", import.meta.url),
      "utf8",
    );
    expect(migration).toContain("public.public_pad_detail");
    expect(migration).toContain("public.brinesearch_directory_snapshot_rows_v18");
    expect(migration).toContain("'wellName',safe_rows.well_name");
    expect(migration).toContain("'apiNumber',safe_rows.api_number");
    expect(migration).toContain("'propertyNumber',safe_rows.property_number");
    expect(migration).not.toMatch(/'official(?:Operator|Status)'/);
    expect(migration).not.toMatch(/\b(insert|update|delete|truncate)\s+(into|from|public\.)/i);
  });
});
