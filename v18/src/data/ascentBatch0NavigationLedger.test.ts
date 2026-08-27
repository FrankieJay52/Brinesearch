import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PadMapReferenceKind, PadSummary } from "./types";
import { buildFixedNavigationAction, type GoogleHandoffView } from "@/features/pad/PadPage";

const ledgerText = readFileSync(
  new URL("../../../docs/batch0-ascent-six-county-navigation-ledger-20260827.csv", import.meta.url),
  "utf8",
);

function parseCsv(text: string) {
  const table: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/u, ""));
      if (row.some(Boolean)) table.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  expect(quoted).toBe(false);
  const [headers, ...values] = table;
  return values.map((fields) => Object.fromEntries(headers.map((header, index) => [header, fields[index] ?? ""])));
}

const ledger = parseCsv(ledgerText);
const unavailableView: GoogleHandoffView = {
  available: false,
  state: "held",
  routeUrl: null,
  reason: "No exact approved route is available for a Google handoff.",
  mode: null,
  approachLabel: null,
  finalLegMode: null,
  selectionRequired: false,
  selectedRouteIsPrimary: true,
};

function padFromLedger(row: Record<string, string>): PadSummary {
  const latitude = Number(row.destination_latitude);
  const longitude = Number(row.destination_longitude);
  const referenceKinds: Record<string, PadMapReferenceKind> = {
    "saved pad reference": "saved_pad_reference",
    "official pad reference": "official_pad_reference",
    "official wellhead reference": "official_wellhead_reference",
  };
  const isEntrance = row.directory_coordinate_role === "verified driver entrance";
  return {
    padId: row.record_id,
    canonicalId: row.record_id,
    legacyId: `ascent--${row.name.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}`,
    aliases: [],
    recordNumber: null,
    recordRevision: row.record_revision,
    recordType: "pad",
    company: "Ascent",
    padName: row.name,
    state: "Ohio",
    county: row.county,
    township: "",
    address: "",
    coordinate: isEntrance ? { latitude, longitude, role: "driver_entrance" } : null,
    mapReference: isEntrance ? null : {
      latitude,
      longitude,
      role: "reference",
      kind: referenceKinds[row.directory_coordinate_role],
    },
    wellNames: [],
    apiNumbers: [],
    propertyNumbers: [],
    safeRoadTerms: [],
    structuredRoadSequence: "",
    writtenDirections: "",
    verificationStatus: "",
    operatingStatus: "",
    updatedAt: null,
  };
}

describe("Batch 0 six-county Ascent navigation ledger", () => {
  it("contains the exact 247 identities and honest state/source accounting", () => {
    expect(ledger).toHaveLength(247);
    expect(new Set(ledger.map((row) => row.record_id)).size).toBe(247);
    expect(new Set(ledger.map((row) => row.name)).size).toBe(247);
    expect(Object.fromEntries(["1", "2", "3", "reviewed_handoff_authority_held"].map((state) => [
      state,
      ledger.filter((row) => row.current_state === state).length,
    ]))).toEqual({ "1": 1, "2": 8, "3": 236, reviewed_handoff_authority_held: 2 });
    expect(Object.fromEntries(["saved", "ODNR pad", "ODNR wellhead", "missing"].map((source) => [
      source,
      ledger.filter((row) => row.gps_source === source).length,
    ]))).toEqual({ saved: 230, "ODNR pad": 12, "ODNR wellhead": 5, missing: 0 });
    expect(ledger.filter((row) => row.current_state === "reviewed_handoff_authority_held").map((row) => row.name).sort())
      .toEqual(["BILINOVICH", "LAWSON"]);
    expect(ledger.every((row) => row.origin === "phone current location")).toBe(true);
    expect(ledger.filter((row) => row.current_state !== "1").every((row) => row.blocker.length > 0)).toBe(true);
  });

  it("gives all 236 state-3 pads one exact GPS-only Navigate with no route authority", () => {
    const stateThree = ledger.filter((row) => row.current_state === "3");
    expect(stateThree).toHaveLength(236);
    for (const row of stateThree) {
      const action = buildFixedNavigationAction(unavailableView, padFromLedger(row), null);
      expect(action.kind, row.name).toBe("destination_pin");
      expect(action.title, row.name).toBe("Navigate");
      expect(action.detail, row.name).toMatch(/^GPS destination only ·/u);
      expect(action.href, row.name).not.toBeNull();
      const url = new URL(action.href!);
      expect(url.searchParams.get("origin"), row.name).toBeNull();
      expect(url.searchParams.get("waypoints"), row.name).toBeNull();
      expect(url.searchParams.get("dir_action"), row.name).toBe("navigate");
      expect(url.searchParams.get("destination"), row.name)
        .toBe(`${row.destination_latitude},${row.destination_longitude}`);
    }
  });

  it("keeps GPS-only Navigate available before the six named approaches are chosen", () => {
    const namedPadIds = new Set([
      "185d9eb6-58af-4009-bf53-fdd23113a572",
      "95dcbd15-afd0-4357-a521-e23bcd6b4118",
      "61e21e3c-360b-40b0-8153-209b4fb3d5eb",
      "b9a8e55c-3583-4019-85fc-54a03d420ace",
      "655a97d5-ffdf-4b13-bf66-3d22022239b4",
      "f5a82acf-d7c0-4ce3-ad4e-0de810551450",
    ]);
    const selectionRequired = { ...unavailableView, selectionRequired: true };
    const namedPads = ledger.filter((row) => namedPadIds.has(row.record_id));
    expect(namedPads).toHaveLength(6);
    for (const row of namedPads) {
      expect(buildFixedNavigationAction(selectionRequired, padFromLedger(row), null)).toMatchObject({
        kind: "destination_pin",
        title: "Navigate",
        detail: expect.stringMatching(/^GPS destination only ·/u),
        href: expect.stringContaining("dir_action=navigate"),
      });
    }
  });

  it("uses only the frozen three-state labels and the two unchanged reviewed-held labels", () => {
    const labels = Object.fromEntries(["1", "2", "3", "reviewed_handoff_authority_held"].map((state) => [
      state,
      [...new Set(ledger.filter((row) => row.current_state === state).map((row) => row.navigation_label))],
    ]));
    expect(labels).toEqual({
      "1": ["Reviewed approved route"],
      "2": ["Approved roads then GPS"],
      "3": ["GPS destination only"],
      reviewed_handoff_authority_held: ["Navigate reviewed route"],
    });
  });
});
