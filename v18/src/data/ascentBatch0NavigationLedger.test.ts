import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PadMapReferenceKind, PadSummary } from "./types";
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
    ]))).toEqual({ "1": 1, "2": 8, "3": 192, reviewed_handoff_authority_held: 46 });
    expect(Object.fromEntries(["DONE", "GPS_ONLY"].map((status) => [
      status,
      ledger.filter((row) => row.driver_rule_status === status).length,
    ]))).toEqual({ DONE: 55, GPS_ONLY: 192 });
    expect(Object.fromEntries(["saved", "ODNR pad", "ODNR wellhead", "missing"].map((source) => [
      source,
      ledger.filter((row) => row.gps_source === source).length,
    ]))).toEqual({ saved: 230, "ODNR pad": 12, "ODNR wellhead": 5, missing: 0 });
    expect(ledger.filter((row) => row.current_state === "reviewed_handoff_authority_held").map((row) => row.name).sort())
      .toEqual(["ALBATROSS", "ATHENA", "BAKOS", "BANNOCK", "BEETLE", "BILINOVICH", "BRAVO", "CASTON", "CIRCLE-OAKS", "CROWIE", "DUKE", "DUTTON", "ECHO", "GIL", "GILCHER", "HASTINGS", "HOOP", "JACKALOPE", "JEFFCO", "KUNGLE A", "KUNGLE B", "LAKE", "LAWSON", "LODESTAR", "LODGE", "LORRAINE", "MALDON", "MATUSEK", "MOONSTONE", "NORTH STAR", "PANG", "PICKENS", "PORTERFIELD B", "PORTERFIELD GAS UNIT", "ROCK RIDGE", "RUTH", "SADLER", "SKULL FORK", "THOMAS", "TOWE", "TROYER", "TRUCHAN NE", "TRUCHAN NW", "WHEELING VALLEY", "WINSTON SMITH", "WITHEY"]);
    expect(ledger.every((row) => row.origin === "phone current location")).toBe(true);
    expect(ledger.filter((row) => row.driver_rule_status === "DONE").every((row) => row.blocker === "")).toBe(true);
    expect(ledger.filter((row) => row.driver_rule_status === "GPS_ONLY")
      .every((row) => row.blocker === "No reviewed named-road sequence; use the trusted GPS destination only.")).toBe(true);
  });

  it("keeps all 192 pads without a reviewed named sequence GPS-only", () => {
    const gpsOnly = ledger.filter((row) => row.driver_rule_status === "GPS_ONLY");
    expect(gpsOnly).toHaveLength(192);
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

  it("resolves all forty-six exact-record reviewed handoffs without waiting on promotion state", () => {
    const reviewed = ledger.filter((row) => row.current_state === "reviewed_handoff_authority_held");
    expect(reviewed).toHaveLength(46);
    const evidenceCounts = { exact_named_road_identities: 0, validated_google_handoff: 0 };
    for (const row of reviewed) {
      const pad = padFromLedger(row);
      const candidate = reviewedNavigationCandidateForPad(pad);
      expect(candidate?.ownerApproval, row.name).toMatchObject({
        kind: "owner_approved_directions",
        approvedAt: "2026-08-28",
      });
      evidenceCounts[candidate!.ownerApproval!.evidence] += 1;
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

  it("uses one label for all 55 DONE handoffs and GPS-only only where no sequence exists", () => {
    expect([...new Set(ledger.filter((row) => row.driver_rule_status === "DONE")
      .map((row) => row.navigation_label))]).toEqual(["Named roads to saved pin"]);
    expect([...new Set(ledger.filter((row) => row.driver_rule_status === "GPS_ONLY")
      .map((row) => row.navigation_label))]).toEqual(["GPS destination only"]);
  });
});
