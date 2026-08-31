import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PadMapReferenceKind, PadSummary } from "./types";
import { ascentSavedDirectionExactMatchBatch1 } from "./ascentSavedDirectionExactMatchBatch1";
import { reviewedNavigationCandidateForPad } from "./reviewedNavigationCandidates";
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
  const latitude = Number(row.directory_latitude);
  const longitude = Number(row.directory_longitude);
  const referenceKinds: Record<string, PadMapReferenceKind> = {
    "saved pad reference": "saved_pad_reference",
    "official pad reference": "official_pad_reference",
    "official wellhead reference": "official_wellhead_reference",
  };
  const isEntrance = row.directory_coordinate_role === "verified driver entrance";
  return {
    padId: row.record_id,
    canonicalId: row.record_id,
    legacyId: row.legacy_id,
    aliases: [],
    recordNumber: null,
    recordRevision: row.record_revision,
    recordType: "pad",
    company: row.company,
    padName: row.name,
    state: row.state,
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
    structuredRoadSequence: row.structured_road_sequence,
    writtenDirections: "",
    verificationStatus: "",
    operatingStatus: "",
    updatedAt: null,
  };
}

describe("Batch 0 six-county Ascent navigation ledger", () => {
  it("contains the exact 247 identities and one-rule driver accounting", () => {
    expect(ledger).toHaveLength(247);
    expect(new Set(ledger.map((row) => row.record_id)).size).toBe(247);
    expect(new Set(ledger.map((row) => row.name)).size).toBe(247);
    expect(Object.fromEntries(["1", "2", "3", "reviewed_handoff_authority_held"].map((state) => [
      state,
      ledger.filter((row) => row.current_state === state).length,
    ]))).toEqual({ "1": 1, "2": 8, "3": 160, reviewed_handoff_authority_held: 78 });
    expect(Object.fromEntries(["DONE", "GPS_ONLY"].map((status) => [
      status,
      ledger.filter((row) => row.driver_rule_status === status).length,
    ]))).toEqual({ DONE: 87, GPS_ONLY: 160 });
    expect(Object.fromEntries(["saved", "ODNR pad", "ODNR wellhead", "missing"].map((source) => [
      source,
      ledger.filter((row) => row.gps_source === source).length,
    ]))).toEqual({ saved: 230, "ODNR pad": 12, "ODNR wellhead": 5, missing: 0 });
    expect(ledger.filter((row) => row.current_state === "reviewed_handoff_authority_held").map((row) => row.name).sort())
      .toEqual(["ALABASTER", "ALBATROSS", "ATHENA", "AXLE", "BAKOS", "BANNOCK", "BEETLE", "BILINOVICH", "BRAVO", "CARLOS", "CASTON", "CECELIA", "CERMAK", "CIRCLE-OAKS", "COOK", "CRAVAT COAL", "CRAVAT NORTH", "CROWIE", "DICKSON", "DONNA", "DUKE", "DUTTON", "ECHO", "ELITE", "GIL", "GILCHER", "HASTINGS", "HELLER", "HOOP", "J BARR J", "JACKALOPE", "JEFFCO", "JENNINGS", "KALDOR", "KEMPER", "KUNGLE A", "KUNGLE B", "KURTH", "LAKE", "LAVADA", "LAWSON", "LODESTAR", "LODGE", "LORRAINE", "MALDON", "MARQUARD", "MATUSEK", "MOHOROVICH", "MONROE NORTH", "MOONSTONE", "NORTH STAR", "PANG", "PICKENS", "PORTERFIELD B", "PORTERFIELD GAS UNIT", "PUGGLE", "RECTOR-C", "RED-HILL-FARM", "REITZ", "RICHLAND B", "ROCK RIDGE", "RUTH", "SADLER", "SHUTWAY", "SIDWELL", "SKULL FORK", "SLABAUGH", "TARPLEY", "THOMAS", "TOWE", "TROYER", "TRUCHAN NE", "TRUCHAN NW", "WAMPUM", "WATSON", "WHEELING VALLEY", "WINSTON SMITH", "WITHEY"]);
    expect(ledger.every((row) => row.origin === "phone current location")).toBe(true);
    expect(ledger.filter((row) => row.driver_rule_status === "DONE").every((row) => row.blocker === "")).toBe(true);
    expect(ledger.filter((row) => row.driver_rule_status === "GPS_ONLY")
      .every((row) => row.blocker === "No reviewed named-road sequence; use the trusted GPS destination only.")).toBe(true);
  });

  it("keeps all 160 pads without a reviewed named sequence GPS-only", () => {
    const gpsOnly = ledger.filter((row) => row.driver_rule_status === "GPS_ONLY");
    expect(gpsOnly).toHaveLength(160);
    for (const row of gpsOnly) {
      const action = buildFixedNavigationAction(unavailableView, padFromLedger(row));
      expect(action.kind, row.name).toBe("destination_pin");
      expect(action.title, row.name).toBe("GET DIRECTIONS");
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

  it("resolves all seventy-eight exact-record reviewed handoffs without waiting on promotion state", () => {
    const reviewed = ledger.filter((row) => row.current_state === "reviewed_handoff_authority_held");
    expect(reviewed).toHaveLength(78);
    const nonOwnerReviewedIds = new Set<string>(ascentSavedDirectionExactMatchBatch1.map((record) => record.padId));
    const visualQaReviewedIds = new Set<string>([
      "73f48788-9990-435a-adee-999740e958de",
      "883420b3-07b9-4682-912e-42ba278d1132",
      "8e823835-2c10-4275-84e9-4067376fa364",
      "eae4741b-7fb4-4bc3-8b20-26043032acda",
      "0a2a4a64-6e64-4b7d-9652-e1a97db4fc4f",
      "25dc64b5-4a52-4cef-8b2c-62e7e36d64c7",
      "0f848006-4c09-4c7f-b9f2-4743d5ccd37f",
      "4213711f-0f23-440a-b0ec-42a1f9be4db0",
      "5a0ede1b-4586-4edc-9438-7cb29a24e58e",
      "8a7b9669-169d-45a5-bf55-b9be5cbd51e2",
      "45b2cfd7-1936-406d-bf6c-de0b8acc8e88",
      "18257dbf-d681-46dd-be38-a8e4a6aab56f",
      "69c63442-de05-4d15-95da-07da587bc070",
      "b9d1a8de-2ddd-4345-82a1-7e2a1f6ff2cb",
      "23053421-06d5-47a2-bf77-5c3fdea4939b",
      "83499ca1-3c45-4502-b7c2-688e88343093",
      "ce1bff99-9c64-435e-a517-e5b8f1a102b7",
      "b8490b6c-0924-4b1d-a46e-6dc54e7e7267",
      "5484ef9c-cc1f-4eca-9527-63d4a64183fb",
      "638487d0-2ef4-4e5c-8a16-cbb478c490c6",
      "8698112a-c3b4-453e-94d0-bcf4b2476cfb",
      "fc8a81c6-ccd5-4d1c-9eb6-507f05317688",
      "88709ded-fda7-42df-ba94-b6bb6c04e45a",
      "4b0b99b7-da77-4b27-a2f7-7e8d3a9875d3",
      "314652b0-0abb-47cb-a263-88ca23582144",
      "3e31e56b-6c85-4f0c-9a38-0554b42581a5",
    ]);
    const evidenceCounts = { exact_named_road_identities: 0, validated_google_handoff: 0 };
    for (const row of reviewed) {
      const pad = padFromLedger(row);
      const candidate = reviewedNavigationCandidateForPad(pad);
      if (nonOwnerReviewedIds.has(row.record_id)) {
        expect(candidate?.ownerApproval, row.name).toBeUndefined();
        expect(candidate?.preserveMeasuredApproach, row.name).toBe(true);
        expect(candidate?.detail, row.name).toMatch(/unapproved/iu);
      } else if (visualQaReviewedIds.has(row.record_id)) {
        expect(candidate?.ownerApproval, row.name).toBeUndefined();
        expect(candidate?.preserveMeasuredApproach, row.name).toBeUndefined();
        expect(candidate?.detail, row.name).toMatch(/unapproved/iu);
      } else {
        expect(candidate?.ownerApproval, row.name).toMatchObject({
          kind: "owner_approved_directions",
          approvedAt: "2026-08-28",
        });
        evidenceCounts[candidate!.ownerApproval!.evidence] += 1;
      }
      expect(candidate?.reviewedRoadSequence, row.name).toBeTruthy();
      expect(candidate?.finalLegNotice, row.name).toBeTruthy();
      const action = buildFixedNavigationAction(unavailableView, pad);
      expect(action.kind, row.name).toBe("reviewed_route");
      expect(action.title, row.name).toBe("GET DIRECTIONS");
      const url = new URL(action.href!);
      expect(url.origin, row.name).toBe("https://www.google.com");
      expect(url.searchParams.get("origin"), row.name).toBeNull();
      expect(url.searchParams.get("api"), row.name).toBe("1");
      expect(url.searchParams.get("travelmode"), row.name).toBe("driving");
      expect(url.searchParams.get("dir_action"), row.name).toBe("navigate");
      expect(url.searchParams.get("destination")?.split(",").map(Number), row.name)
        .toEqual([Number(row.destination_latitude), Number(row.destination_longitude)]);
      expect(url.searchParams.get("waypoints")?.split("|").length, row.name).toBeGreaterThanOrEqual(1);
      expect(url.searchParams.get("waypoints")?.split("|").length, row.name).toBeLessThanOrEqual(3);
    }
    expect(evidenceCounts).toEqual({ exact_named_road_identities: 28, validated_google_handoff: 18 });
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
        title: "GET DIRECTIONS",
        detail: expect.stringMatching(/^GPS destination only ·/u),
        href: expect.stringContaining("dir_action=navigate"),
      });
    }
  });

  it("uses one label for all 87 DONE handoffs and GPS-only only where no sequence exists", () => {
    expect([...new Set(ledger.filter((row) => row.driver_rule_status === "DONE")
      .map((row) => row.navigation_label))]).toEqual(["Named roads to saved pin"]);
    expect([...new Set(ledger.filter((row) => row.driver_rule_status === "GPS_ONLY")
      .map((row) => row.navigation_label))]).toEqual(["GPS destination only"]);
  });
});
