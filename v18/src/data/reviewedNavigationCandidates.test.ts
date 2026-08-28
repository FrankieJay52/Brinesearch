import { describe, expect, it } from "vitest";
import type { PadSummary } from "./types";
import {
  ALBATROSS_REVIEWED_GOOGLE_URL,
  ATHENA_REVIEWED_GOOGLE_URL,
  BEETLE_REVIEWED_GOOGLE_URL,
  BILINOVICH_REVIEWED_GOOGLE_URL,
  BRAVO_REVIEWED_GOOGLE_URL,
  CASTON_REVIEWED_GOOGLE_URL,
  CROWIE_REVIEWED_GOOGLE_URL,
  DUKE_REVIEWED_GOOGLE_URL,
  GILCHER_REVIEWED_GOOGLE_URL,
  GIL_REVIEWED_GOOGLE_URL,
  HOOP_REVIEWED_GOOGLE_URL,
  LAKE_REVIEWED_GOOGLE_URL,
  LAWSON_REVIEWED_GOOGLE_URL,
  MALDON_REVIEWED_GOOGLE_URL,
  PICKENS_REVIEWED_GOOGLE_URL,
  PORTERFIELD_REVIEWED_GOOGLE_URL,
  RUTH_REVIEWED_GOOGLE_URL,
  SKULL_FORK_REVIEWED_GOOGLE_URL,
  THOMAS_REVIEWED_GOOGLE_URL,
  WITHEY_REVIEWED_GOOGLE_URL,
  buildReviewedNavigationUrl,
  reviewedNavigationCandidateForPad,
  reviewedNavigationSafetyHoldForPad,
  reviewedNavigationUrlMatchesContract,
} from "./reviewedNavigationCandidates";

function bilinovich(): PadSummary {
  return {
    padId: "59061829-1122-4aae-872d-cf5024310373",
    canonicalId: "59061829-1122-4aae-872d-cf5024310373",
    legacyId: "ascent--bilinovich",
    aliases: [],
    recordNumber: 77,
    recordRevision: "1787794115232844",
    recordType: "pad",
    company: "Ascent",
    padName: "BILINOVICH",
    state: "Ohio",
    county: "Guernsey",
    township: "LONDONDERRY",
    address: "23212 Turkle Road",
    coordinate: null,
    mapReference: null,
    wellNames: [],
    apiNumbers: [],
    propertyNumbers: [],
    safeRoadTerms: ["Logan Rd / CR-964"],
    structuredRoadSequence: "I-70 W → Exit 193 → OH-513 N → US-22 E → McCoy Rd → Blaze Rd → Logan Rd → Turkle Rd / lease access → BILINOVICH",
    writtenDirections: "",
    verificationStatus: "official_api_verified",
    operatingStatus: "ACTIVE",
    updatedAt: "2026-08-27T01:28:35.232844Z",
  };
}

function lawson(): PadSummary {
  return {
    ...bilinovich(),
    padId: "143f5268-33e4-4598-8101-40220b5cfdc4",
    canonicalId: "143f5268-33e4-4598-8101-40220b5cfdc4",
    legacyId: "ascent--lawson",
    recordRevision: "1786258360881449",
    padName: "LAWSON",
    address: "23291 Millers Fork Road",
    structuredRoadSequence: "US-22 → Mc Coy Rd → Tyson Mill Rd → Millers Fork Rd → OR → US-250 → US-22 → Mc Coy Rd → Tyson Mill Rd → Millers Fork Rd → OR → I-70 → Exit 193 → OH-513 → US-22 → Mc Coy Rd → Tyson Mill Rd → Millers Fork Rd",
    mapReference: { latitude: 40.124991, longitude: -81.295913, role: "reference", kind: "saved_pad_reference" },
  };
}

function correctedBilinovich(): PadSummary {
  return {
    ...bilinovich(),
    recordRevision: "1787802711836476",
    structuredRoadSequence: "US-22 E → McCoy Rd / CR-82 → Merry Rd / TR-967 → Penrose Rd / CR-694 → Logan Rd / CR-964 → Turkle Rd / TR-693 → trusted lease approach → BILINOVICH",
    mapReference: { latitude: 40.08863, longitude: -81.304164, role: "reference", kind: "saved_pad_reference" },
  };
}

function beetle(): PadSummary {
  return {
    ...bilinovich(),
    padId: "0e6f23f1-3bfb-44b0-aa4e-f24dde611880",
    canonicalId: "0e6f23f1-3bfb-44b0-aa4e-f24dde611880",
    legacyId: "ascent--beetle",
    recordRevision: "1787459253071652",
    padName: "BEETLE",
    county: "Harrison",
    township: "SHORT CREEK",
    address: "",
    structuredRoadSequence: "OH-519 → US-250 → Pad",
    coordinate: null,
    mapReference: { latitude: 40.185403, longitude: -80.922718, role: "reference", kind: "saved_pad_reference" },
  };
}

function duke(): PadSummary {
  return {
    ...bilinovich(),
    padId: "bb351070-6c94-45e5-942f-e155f9e86f7e",
    canonicalId: "bb351070-6c94-45e5-942f-e155f9e86f7e",
    legacyId: "ascent--duke",
    recordRevision: "1786265812046205",
    padName: "DUKE",
    county: "Harrison",
    township: "GREEN",
    address: "",
    structuredRoadSequence: "US-250 → Foxes Bottom Rd → Springdale Hill Rd → Lamborn Rd",
    mapReference: { latitude: 40.214409, longitude: -80.891316, role: "reference", kind: "saved_pad_reference" },
  };
}

function porterfield(): PadSummary {
  return {
    ...bilinovich(),
    padId: "0b7105a0-1b36-4182-8d10-1f2e297c8bab",
    canonicalId: "0b7105a0-1b36-4182-8d10-1f2e297c8bab",
    legacyId: "ascent--porterfield-gas-unit",
    recordRevision: "1786258360881449",
    padName: "PORTERFIELD GAS UNIT",
    county: "Belmont",
    township: "Richland",
    structuredRoadSequence: "I-70 → Exit 215 → US-40 → Vineyard Rd → OR → OH-331 → US-40 → Vineyard Rd",
    mapReference: { latitude: 40.090431, longitude: -80.928503, role: "reference", kind: "saved_pad_reference" },
  };
}

function pickens(): PadSummary {
  return {
    ...bilinovich(),
    padId: "75600d0c-17b8-488b-96c9-4b7b8ffc8b1b",
    canonicalId: "75600d0c-17b8-488b-96c9-4b7b8ffc8b1b",
    legacyId: "ascent--pickens",
    recordRevision: "1787615581785257",
    padName: "PICKENS",
    county: "Harrison",
    structuredRoadSequence: "OH-9 south → Turn left onto OH-519 east → Turn right onto Lease Road",
    coordinate: { latitude: 40.182544, longitude: -80.977135, role: "driver_entrance" },
    mapReference: null,
  };
}

function batch2RouteFixtures() {
  const savedPad = (
    padId: string,
    legacyId: string,
    recordRevision: string,
    padName: string,
    structuredRoadSequence: string,
    latitude: number,
    longitude: number,
  ): PadSummary => ({
    ...bilinovich(),
    padId,
    canonicalId: padId,
    legacyId,
    recordRevision,
    padName,
    county: "Guernsey",
    structuredRoadSequence,
    coordinate: null,
    mapReference: { latitude, longitude, role: "reference", kind: "saved_pad_reference" },
  });

  return [
    {
      name: "CROWIE",
      pad: {
        ...bilinovich(),
        padId: "fba35b8e-ccc6-406b-b27c-ac9ce4eed29d",
        canonicalId: "fba35b8e-ccc6-406b-b27c-ac9ce4eed29d",
        legacyId: "ascent--crowie",
        recordRevision: "1786265812046205",
        padName: "CROWIE",
        county: "Belmont",
        structuredRoadSequence: "Exit 215 → US-40 → Vineyard Rd → Williams Rd → OR → Exit 213 → US-40",
        coordinate: { latitude: 40.0979, longitude: -80.9384, role: "driver_entrance" },
        mapReference: null,
      } satisfies PadSummary,
      routeUrl: CROWIE_REVIEWED_GOOGLE_URL,
      destination: "40.0979,-80.9384",
      waypoints: ["40.073689,-80.945041", "40.088246,-80.944086"],
      reviewedSequence: "US-40 → Vineyard Rd / CR-56 → Williams Rd → verified driver entrance",
    },
    {
      name: "CASTON",
      pad: savedPad(
        "58c94af4-32b1-4f80-a278-a5f73688fa23",
        "ascent--caston",
        "1786258360881449",
        "CASTON",
        "US-22 → Mc Coy Rd → Jasper Rd → Caston Rd → OR → OH-513 → US-22 → Mc Coy Rd → Jasper Rd → Caston Rd",
        40.130458,
        -81.328059,
      ),
      routeUrl: CASTON_REVIEWED_GOOGLE_URL,
      destination: "40.130458,-81.328059",
      waypoints: ["40.123106982,-81.353948693", "40.113698669772,-81.314757942078", "40.127876178092,-81.316090497685"],
      reviewedSequence: "US-22 E → McCoy Rd / CR-82 → Jasper Rd / CR-93 → Caston Rd → saved pad GPS",
    },
    {
      name: "GIL",
      pad: savedPad(
        "bd2e0e20-8aa8-4e05-a4c0-0af312234853",
        "ascent--gil",
        "1786258360881449",
        "GIL",
        "US-22 / Mccoy Rd → Mccoy Rd → Merry Rd → Penrose Rd → Logan Rd → Lease Road",
        40.09387,
        -81.29646,
      ),
      routeUrl: GIL_REVIEWED_GOOGLE_URL,
      destination: "40.09387,-81.29646",
      waypoints: ["40.123106982,-81.353948693", "40.095922776519,-81.28417385453", "40.099552104984,-81.297815548031"],
      reviewedSequence: "US-22 → McCoy Rd / CR-82 → Merry Rd / TR-967 → Penrose Rd / CR-694 → Logan Rd / CR-964 → saved pad GPS",
    },
    {
      name: "GILCHER",
      pad: savedPad(
        "71c9c874-5514-46a4-8d91-b105c6734799",
        "ascent--gilcher",
        "1786258360881449",
        "GILCHER",
        "US-22 → Mc Coy Rd → Merry Rd → Penrose Rd → OR → OH-513 → US-22 → Mc Coy Rd → Merry Rd → Penrose Rd",
        40.100079,
        -81.295657,
      ),
      routeUrl: GILCHER_REVIEWED_GOOGLE_URL,
      destination: "40.100079,-81.295657",
      waypoints: ["40.123106982,-81.353948693", "40.105015636324,-81.279619885553", "40.095922776519,-81.28417385453"],
      reviewedSequence: "US-22 E → McCoy Rd / CR-82 → Merry Rd / TR-967 → Penrose Rd / CR-694 → saved pad GPS",
    },
    {
      name: "LAKE",
      pad: savedPad(
        "ccf7415a-331b-440a-829d-28282a33cde1",
        "ascent--lake",
        "1786258360881449",
        "LAKE",
        "US-22 → Mc Coy Rd → Tyson Mill Rd → Pennyroyal Rd → OR → US-250 → US-22 → Mc Coy Rd → Tyson Mill Rd → Pennyroyal Rd → OR → I-70 → Exit 193 → OH-513 → US-22 → Mc Coy Rd → Tyson Mill Rd → Pennyroyal Rd",
        40.14776,
        -81.295527,
      ),
      routeUrl: LAKE_REVIEWED_GOOGLE_URL,
      destination: "40.14776,-81.295527",
      waypoints: ["40.123106982,-81.353948693", "40.11184081055,-81.300972387724", "40.134573026404,-81.287284993921"],
      reviewedSequence: "US-22 E → McCoy Rd / CR-82 → Tyson Mill Rd → Pennyroyal Rd → saved pad GPS",
    },
    {
      name: "THOMAS",
      pad: savedPad(
        "1e898176-672d-4174-8878-4aae0aee2128",
        "ascent--thomas",
        "1786265812046205",
        "THOMAS",
        "I-70 → Exit 193 → OH-513 → Tyson Mill Rd → Lease Road",
        40.096986,
        -81.307667,
      ),
      routeUrl: THOMAS_REVIEWED_GOOGLE_URL,
      destination: "40.096986,-81.307667",
      waypoints: ["40.087850494651,-81.32056155136"],
      reviewedSequence: "I-70 → Exit 193 → OH-513 N → Tyson Mill Rd → saved pad GPS",
    },
  ] as const;
}

function batch3RouteFixtures() {
  const pad = (
    padId: string,
    legacyId: string,
    recordRevision: string,
    padName: string,
    county: string,
    structuredRoadSequence: string,
    latitude: number,
    longitude: number,
    source: "saved" | "entrance",
  ): PadSummary => ({
    ...bilinovich(),
    padId,
    canonicalId: padId,
    legacyId,
    recordRevision,
    padName,
    county,
    structuredRoadSequence,
    coordinate: source === "entrance"
      ? { latitude, longitude, role: "driver_entrance" }
      : null,
    mapReference: source === "saved"
      ? { latitude, longitude, role: "reference", kind: "saved_pad_reference" }
      : null,
  });

  return [
    {
      name: "ALBATROSS",
      pad: pad(
        "48d810bf-e59f-4314-9efb-8103a818a3bd",
        "ascent--albatross",
        "1786265812046205",
        "ALBATROSS",
        "Belmont",
        "I-70 → Exit 202 → OH-800 → Brooks Rd",
        40.079353,
        -81.224381,
        "saved",
      ),
      routeUrl: ALBATROSS_REVIEWED_GOOGLE_URL,
      destination: "40.079353,-81.224381",
      waypoints: ["40.0817058,-81.2127365"],
      reviewedSequence: "Google-selected approach → OH-800 near Brooks Rd → Brooks Rd → unapproved GPS handoff to saved pad GPS",
    },
    {
      name: "MALDON",
      pad: pad(
        "8f616827-d7da-4b40-b9c2-49fd5e713822",
        "ascent--maldon",
        "1786265812046205",
        "MALDON",
        "Belmont",
        "I-70 → Exit 202 → OH-800 → Shannon Rd → Lowe Rd → Pad",
        40.010241,
        -81.197285,
        "saved",
      ),
      routeUrl: MALDON_REVIEWED_GOOGLE_URL,
      destination: "40.010241,-81.197285",
      waypoints: ["40.0068106,-81.1762346", "40.0106308,-81.1957784"],
      reviewedSequence: "Google-selected approach → Shannon Rd → Lowe Rd → unapproved GPS handoff to saved pad GPS",
    },
    {
      name: "WITHEY",
      pad: pad(
        "f2df293f-13a2-401e-96b2-21e71ac63e6a",
        "ascent--withey",
        "1786246617744175",
        "WITHEY",
        "Belmont",
        "Exit 202 → I-70 → OH-800 → Gobblers Knob Rd → Lease Road",
        39.962005,
        -81.216813,
        "entrance",
      ),
      routeUrl: WITHEY_REVIEWED_GOOGLE_URL,
      destination: "39.962005,-81.216813",
      waypoints: ["39.967149,-81.2055552"],
      reviewedSequence: "Google-selected approach → Gobblers Knob Rd → verified driver entrance",
    },
    {
      name: "SKULL FORK",
      pad: pad(
        "06ac93a2-3b46-44fd-9fa6-2fd29201858a",
        "ascent--skull-fork",
        "1787459253071652",
        "SKULL FORK",
        "Guernsey",
        "I-70 → Exit 202 → OH-800 → US-22 → Repik Ln → Pad",
        40.159734,
        -81.260675,
        "entrance",
      ),
      routeUrl: SKULL_FORK_REVIEWED_GOOGLE_URL,
      destination: "40.159734,-81.260675",
      waypoints: ["40.16761,-81.259685"],
      reviewedSequence: "Google-selected approach → Repik Ln → verified driver entrance",
    },
    {
      name: "HOOP",
      pad: pad(
        "351b72fb-eb48-4355-b6fc-d8e9a867f79c",
        "ascent--hoop",
        "1787459253071652",
        "HOOP",
        "Guernsey",
        "I-77 → US-22 → Titus Rd → Lease Road",
        40.166384,
        -81.325728,
        "saved",
      ),
      routeUrl: HOOP_REVIEWED_GOOGLE_URL,
      destination: "40.166384,-81.325728",
      waypoints: [
        "40.053083897672,-81.551936547892",
        "40.1495834623593,-81.3150932898081",
        "40.1536867643988,-81.3127475000983",
      ],
      reviewedSequence: "Google-selected approach to reviewed US-22 anchor → US-22 E → Titus Rd → unapproved GPS/lease handoff to saved pad GPS",
    },
    {
      name: "BRAVO",
      pad: pad(
        "4c73e244-6132-4d40-83fc-3fe5e6e65bf6",
        "ascent--bravo",
        "1786265812046205",
        "BRAVO",
        "Harrison",
        "OH-519 → Hite Rd → Lease Road",
        40.178556,
        -81.015064,
        "saved",
      ),
      routeUrl: BRAVO_REVIEWED_GOOGLE_URL,
      destination: "40.178556,-81.015064",
      waypoints: ["40.1849138,-80.9958138"],
      reviewedSequence: "Google-selected approach → Hite Rd (displayed by Google as Crazy Rd) → unapproved GPS/lease handoff to saved pad GPS",
    },
    {
      name: "RUTH",
      pad: pad(
        "7dcd1f71-fa32-4edc-ae3d-aa9717d0c72c",
        "ascent--ruth",
        "1787459253071652",
        "RUTH",
        "Jefferson",
        "US-250 E → Lease Road",
        40.173626,
        -80.879115,
        "entrance",
      ),
      routeUrl: RUTH_REVIEWED_GOOGLE_URL,
      destination: "40.173626,-80.879115",
      waypoints: ["40.1771191,-80.8806516"],
      reviewedSequence: "Google-selected approach → US-250 near entrance → unapproved entrance movement → verified driver entrance",
    },
    {
      name: "ATHENA",
      pad: pad(
        "3850e94a-826f-4b6b-a54f-d21d482fca46",
        "ascent--athena",
        "1787459253071652",
        "ATHENA",
        "Jefferson",
        "OH-151 → Pad",
        40.278613,
        -80.765988,
        "saved",
      ),
      routeUrl: ATHENA_REVIEWED_GOOGLE_URL,
      destination: "40.278613,-80.765988",
      waypoints: ["40.2799914,-80.7619003"],
      reviewedSequence: "Google-selected approach → OH-151 near pad → unapproved GPS handoff to saved pad GPS",
    },
  ] as const;
}

describe("reviewed navigation candidates", () => {
  it("builds current-location Google handoffs and rejects invalid waypoint counts or coordinates", () => {
    const url = new URL(buildReviewedNavigationUrl(
      { latitude: 40.2, longitude: -80.9 },
      [{ latitude: 40.21, longitude: -80.91 }],
    ));
    expect(url.searchParams.get("origin")).toBeNull();
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("travelmode")).toBe("driving");
    expect(url.searchParams.get("dir_action")).toBe("navigate");
    expect(() => buildReviewedNavigationUrl({ latitude: 40.2, longitude: -80.9 }, [])).toThrow();
    expect(() => buildReviewedNavigationUrl({ latitude: 40.2, longitude: -80.9 }, [
      { latitude: 40.21, longitude: -80.91 },
      { latitude: 40.22, longitude: -80.92 },
      { latitude: 40.23, longitude: -80.93 },
      { latitude: 40.24, longitude: -80.94 },
    ])).toThrow();
    expect(() => buildReviewedNavigationUrl(
      { latitude: Number.NaN, longitude: -80.9 },
      [{ latitude: 40.21, longitude: -80.91 }],
    )).toThrow();
  });

  it("rejects duplicate, missing, unknown, fixed-origin, and over-budget URL parameters", () => {
    const destination = { latitude: 40.2, longitude: -80.9 };
    const waypoints = [{ latitude: 40.21, longitude: -80.91 }];
    const valid = buildReviewedNavigationUrl(destination, waypoints);
    expect(reviewedNavigationUrlMatchesContract(valid, destination, waypoints)).toBe(true);
    expect(reviewedNavigationUrlMatchesContract(`${valid}&destination=40.3%2C-80.8`, destination, waypoints)).toBe(false);
    expect(reviewedNavigationUrlMatchesContract(`${valid}&api=1`, destination, waypoints)).toBe(false);
    expect(reviewedNavigationUrlMatchesContract(`${valid}&origin=Cadiz%2C%20OH`, destination, waypoints)).toBe(false);
    expect(reviewedNavigationUrlMatchesContract(`${valid}&unexpected=1`, destination, waypoints)).toBe(false);
    expect(reviewedNavigationUrlMatchesContract(valid.replace("&waypoints=40.21%2C-80.91", ""), destination, waypoints)).toBe(false);
    const fourWaypoints = `${valid}&waypoints=40.21%2C-80.91%7C40.22%2C-80.92%7C40.23%2C-80.93%7C40.24%2C-80.94`;
    expect(reviewedNavigationUrlMatchesContract(fourWaypoints, destination, waypoints)).toBe(false);
  });

  it("withdraws the unsafe BILINOVICH Blaze handoff and binds the safety hold to the exact stale record", () => {
    expect(reviewedNavigationCandidateForPad(bilinovich())).toBeNull();
    expect(reviewedNavigationSafetyHoldForPad(bilinovich())).toMatchObject({
      padId: "59061829-1122-4aae-872d-cf5024310373",
      title: "Reviewed route withdrawn",
      detail: "Do not use Blaze Road · corrected route pending",
    });
  });

  it("returns the exact corrected BILINOVICH no-Blaze handoff without promoting graph authority", () => {
    const corrected = correctedBilinovich();
    const candidate = reviewedNavigationCandidateForPad(corrected);

    expect(candidate).toMatchObject({
      padId: "59061829-1122-4aae-872d-cf5024310373",
      title: "Navigate reviewed route",
      detail: "McCoy → Merry → Penrose → Logan → Turkle → pad GPS",
      routeUrl: BILINOVICH_REVIEWED_GOOGLE_URL,
    });
    expect(reviewedNavigationSafetyHoldForPad(corrected)).toBeNull();

    const url = new URL(candidate!.routeUrl);
    const waypoints = url.searchParams.get("waypoints")?.split("|");
    expect(url.searchParams.get("origin")).toBeNull();
    expect(BILINOVICH_REVIEWED_GOOGLE_URL).toBe("https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.08738445%2C-81.30282620&waypoints=40.123106982%2C-81.353948693%7C40.095894612%2C-81.283992781%7C40.099684564%2C-81.297880136");
    expect(url.searchParams.get("destination")).toBe("40.08738445,-81.30282620");
    expect(waypoints).toEqual([
      "40.123106982,-81.353948693",
      "40.095894612,-81.283992781",
      "40.099684564,-81.297880136",
    ]);
    expect(waypoints).toHaveLength(3);
    expect(url.searchParams.get("dir_action")).toBe("navigate");
    expect(candidate!.routeUrl).not.toContain("40.112583770%2C-81.294937982");
  });

  it.each([
    ["padId", "not-bilinovich"],
    ["canonicalId", "not-bilinovich"],
    ["legacyId", "ascent--other"],
    ["recordRevision", "changed"],
    ["company", "Other"],
    ["padName", "BILINOVICH EAST"],
    ["state", "West Virginia"],
    ["county", "Harrison"],
    ["structuredRoadSequence", "McCoy Rd → Merry Rd → Pad"],
  ] as const)("fails the corrected BILINOVICH handoff closed when %s diverges", (field, value) => {
    expect(reviewedNavigationCandidateForPad({ ...correctedBilinovich(), [field]: value })).toBeNull();
  });

  it.each([
    ["padId", "not-bilinovich"],
    ["canonicalId", "not-bilinovich"],
    ["legacyId", "ascent--other"],
    ["recordRevision", "changed"],
    ["company", "Other"],
    ["padName", "BILINOVICH EAST"],
    ["state", "West Virginia"],
    ["county", "Harrison"],
    ["structuredRoadSequence", "McCoy Rd → Merry Rd → Pad"],
  ] as const)("fails the BILINOVICH safety hold closed when %s diverges", (field, value) => {
    expect(reviewedNavigationCandidateForPad({ ...bilinovich(), [field]: value })).toBeNull();
    expect(reviewedNavigationSafetyHoldForPad({ ...bilinovich(), [field]: value })).toBeNull();
  });

  it("returns LAWSON's exact reviewed road-core-to-GPS handoff without promoting graph authority", () => {
    const candidate = reviewedNavigationCandidateForPad(lawson());
    expect(candidate).toMatchObject({
      padId: "143f5268-33e4-4598-8101-40220b5cfdc4",
      title: "Navigate reviewed route",
      detail: "Reviewed road core → saved GPS · graph status separate",
      routeUrl: LAWSON_REVIEWED_GOOGLE_URL,
    });

    const url = new URL(candidate!.routeUrl);
    expect(url.searchParams.get("origin")).toBeNull();
    expect(url.searchParams.get("destination")).toBe("40.124991,-81.295913");
    expect(url.searchParams.get("waypoints")?.split("|")).toEqual([
      "40.123106982,-81.353948693",
      "40.111789555,-81.300978103",
      "40.124973191,-81.294865644",
    ]);
    expect(url.searchParams.get("dir_action")).toBe("navigate");
  });

  it.each([
    ["canonicalId", "not-lawson"],
    ["legacyId", "ascent--other"],
    ["recordRevision", "changed"],
    ["company", "Other"],
    ["padName", "LAWSON EAST"],
    ["county", "Harrison"],
    ["structuredRoadSequence", "US-22 → nearest road → LAWSON"],
  ] as const)("fails LAWSON closed when %s diverges", (field, value) => {
    expect(reviewedNavigationCandidateForPad({ ...lawson(), [field]: value })).toBeNull();
  });

  it("fails LAWSON and BILINOVICH closed when their current trusted record coordinate drifts", () => {
    expect(reviewedNavigationCandidateForPad({
      ...lawson(),
      mapReference: { latitude: 40.125, longitude: -81.295913, role: "reference", kind: "saved_pad_reference" },
    })).toBeNull();
    expect(reviewedNavigationCandidateForPad({
      ...correctedBilinovich(),
      mapReference: { latitude: 40.08863, longitude: -81.304, role: "reference", kind: "saved_pad_reference" },
    })).toBeNull();
  });

  it("returns BEETLE's owner-reviewed Sixteen Road handoff without promoting graph authority", () => {
    const candidate = reviewedNavigationCandidateForPad(beetle());
    expect(BEETLE_REVIEWED_GOOGLE_URL).toBe("https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.185403%2C-80.922718&waypoints=40.1869745925099%2C-80.9192177275288%7C40.185340499%2C-80.919294431%7C40.185025%2C-80.920500");

    expect(candidate).toMatchObject({
      padId: "0e6f23f1-3bfb-44b0-aa4e-f24dde611880",
      title: "Navigate reviewed route",
      detail: "OH-519 → Sixteen Rd → lease approach · GPS-only final leg",
      routeUrl: BEETLE_REVIEWED_GOOGLE_URL,
      reviewedRoadSequence: "OH-519 → Sixteen Rd → lease approach → saved pad GPS",
      finalLegNotice: expect.stringContaining("not approved public-road geometry"),
    });

    const url = new URL(candidate!.routeUrl);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("www.google.com");
    expect(url.pathname).toBe("/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("origin")).toBeNull();
    expect(url.searchParams.get("destination")).toBe("40.185403,-80.922718");
    expect(url.searchParams.get("waypoints")?.split("|")).toEqual([
      "40.1869745925099,-80.9192177275288",
      "40.185340499,-80.919294431",
      "40.185025,-80.920500",
    ]);
    expect(url.searchParams.get("travelmode")).toBe("driving");
    expect(url.searchParams.get("dir_action")).toBe("navigate");
    expect(candidate!.routeUrl).not.toContain("40.1870079210496%2C-80.9203701394203");
    expect(candidate!.routeUrl).not.toContain("40.1871547%2C-80.9192191");
    expect(candidate!.routeUrl).not.toContain("40.1883181%2C-80.9122508");
    expect(candidate!.reviewedRoadSequence).not.toContain("US-250");
  });

  it.each([
    ["padId", "not-beetle"],
    ["canonicalId", "not-beetle"],
    ["legacyId", "ascent--other"],
    ["recordRevision", "changed"],
    ["company", "Other"],
    ["padName", "BEETLE EAST"],
    ["state", "West Virginia"],
    ["county", "Belmont"],
    ["structuredRoadSequence", "OH-519 → nearest road → BEETLE"],
  ] as const)("fails the BEETLE reviewed handoff closed when %s diverges", (field, value) => {
    expect(reviewedNavigationCandidateForPad({ ...beetle(), [field]: value })).toBeNull();
  });

  it.each([
    ["missing", null],
    ["changed latitude", { latitude: 40.1855, longitude: -80.922718, role: "reference", kind: "saved_pad_reference" }],
    ["changed longitude", { latitude: 40.185403, longitude: -80.923, role: "reference", kind: "saved_pad_reference" }],
    ["incomplete", { latitude: 40.185403, longitude: Number.NaN, role: "reference", kind: "saved_pad_reference" }],
    ["different source", { latitude: 40.185403, longitude: -80.922718, role: "reference", kind: "official_pad_reference" }],
  ] as const)("fails the BEETLE reviewed handoff closed when its trusted destination is %s", (_label, mapReference) => {
    expect(reviewedNavigationCandidateForPad({ ...beetle(), mapReference })).toBeNull();
  });

  it("returns PICKENS's owner-reviewed OH-519 turn handoff without promoting the access road", () => {
    const candidate = reviewedNavigationCandidateForPad(pickens());
    expect(candidate).toMatchObject({
      padId: "75600d0c-17b8-488b-96c9-4b7b8ffc8b1b",
      routeUrl: PICKENS_REVIEWED_GOOGLE_URL,
      detail: "OH-519 / Stumptown Rd → unapproved access road → verified entrance",
      reviewedRoadSequence: "Google-selected state-route approach → OH-519 / Stumptown Rd → unapproved access-road handoff → verified driver entrance",
      finalLegNotice: expect.stringContaining("not approved public-road geometry"),
    });

    const url = new URL(candidate!.routeUrl);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("www.google.com");
    expect(url.pathname).toBe("/maps/dir/");
    expect(url.searchParams.get("origin")).toBeNull();
    expect(url.searchParams.get("destination")).toBe("40.182544,-80.977135");
    expect(url.searchParams.get("waypoints")?.split("|")).toEqual(["40.18626,-80.97647"]);
    expect(url.searchParams.get("travelmode")).toBe("driving");
    expect(url.searchParams.get("dir_action")).toBe("navigate");
    expect(candidate!.reviewedRoadSequence).not.toContain("→ approved access");
  });

  it.each([
    ["padId", "not-pickens"],
    ["canonicalId", "not-pickens"],
    ["legacyId", "ascent--other"],
    ["recordRevision", "changed"],
    ["company", "Other"],
    ["padName", "PICKENS EAST"],
    ["state", "West Virginia"],
    ["county", "Belmont"],
    ["structuredRoadSequence", "OH-519 → nearest road → PICKENS"],
  ] as const)("fails the PICKENS reviewed handoff closed when %s diverges", (field, value) => {
    expect(reviewedNavigationCandidateForPad({ ...pickens(), [field]: value })).toBeNull();
  });

  it("fails PICKENS closed when its verified entrance is missing, changed, or relabeled", () => {
    expect(reviewedNavigationCandidateForPad({ ...pickens(), coordinate: null })).toBeNull();
    expect(reviewedNavigationCandidateForPad({
      ...pickens(),
      coordinate: { latitude: 40.1826, longitude: -80.977135, role: "driver_entrance" },
    })).toBeNull();
    expect(reviewedNavigationCandidateForPad({
      ...pickens(),
      coordinate: { latitude: 40.182544, longitude: -80.977135, role: "saved_pad_destination" },
    })).toBeNull();
  });

  it("never gives Ascent PICKENS's handoff to the distinct EOG PICKENS record", () => {
    expect(reviewedNavigationCandidateForPad({
      ...pickens(),
      padId: "75427489-c68e-4f5b-bd57-f52b2c054413",
      canonicalId: "75427489-c68e-4f5b-bd57-f52b2c054413",
      legacyId: "eog--pickens",
      company: "EOG",
    })).toBeNull();
  });

  it("returns DUKE's exact record-bound Cologie-corridor handoff", () => {
    const candidate = reviewedNavigationCandidateForPad(duke());
    expect(candidate).toMatchObject({
      padId: "bb351070-6c94-45e5-942f-e155f9e86f7e",
      routeUrl: DUKE_REVIEWED_GOOGLE_URL,
      reviewedRoadSequence: "US-250 → Foxes Bottom Rd → Springdale Hill Rd → Lamborn Rd → saved pad GPS",
    });
    const url = new URL(candidate!.routeUrl);
    expect(url.searchParams.get("origin")).toBeNull();
    expect(url.searchParams.get("destination")).toBe("40.214409,-80.891316");
    expect(url.searchParams.get("waypoints")?.split("|")).toEqual([
      "40.2376772526251,-80.9645933421097",
      "40.2344651449313,-80.9216048043883",
      "40.2438460898288,-80.9156965297937",
    ]);
  });

  it.each([
    ["padId", "not-duke"],
    ["canonicalId", "not-duke"],
    ["legacyId", "ascent--other"],
    ["recordRevision", "changed"],
    ["company", "Other"],
    ["padName", "DUKE EAST"],
    ["state", "West Virginia"],
    ["county", "Belmont"],
    ["structuredRoadSequence", "US-250 → nearest road → DUKE"],
  ] as const)("fails DUKE closed when %s diverges", (field, value) => {
    expect(reviewedNavigationCandidateForPad({ ...duke(), [field]: value })).toBeNull();
  });

  it("fails DUKE closed when its exact saved destination changes", () => {
    expect(reviewedNavigationCandidateForPad({
      ...duke(),
      mapReference: { latitude: 40.2145, longitude: -80.891316, role: "reference", kind: "saved_pad_reference" },
    })).toBeNull();
    expect(reviewedNavigationCandidateForPad({
      ...duke(),
      mapReference: { latitude: 40.214409, longitude: -80.891316, role: "reference", kind: "official_pad_reference" },
    })).toBeNull();
  });

  it("returns PORTERFIELD's exact record-bound US-40 and Vineyard Road handoff", () => {
    const candidate = reviewedNavigationCandidateForPad(porterfield());
    expect(candidate).toMatchObject({
      padId: "0b7105a0-1b36-4182-8d10-1f2e297c8bab",
      routeUrl: PORTERFIELD_REVIEWED_GOOGLE_URL,
      reviewedRoadSequence: "I-70 → Exit 215 → US-40 W → Vineyard Rd / CR-56 → saved pad GPS",
    });
    const url = new URL(candidate!.routeUrl);
    expect(url.searchParams.get("origin")).toBeNull();
    expect(url.searchParams.get("destination")).toBe("40.090431,-80.928503");
    expect(url.searchParams.get("waypoints")?.split("|")).toEqual([
      "40.073689,-80.945041",
      "40.088246,-80.944086",
      "40.090469,-80.928294",
    ]);
  });

  it.each([
    ["padId", "not-porterfield"],
    ["canonicalId", "not-porterfield"],
    ["legacyId", "ascent--other"],
    ["recordRevision", "changed"],
    ["company", "Other"],
    ["padName", "PORTERFIELD"],
    ["state", "West Virginia"],
    ["county", "Harrison"],
    ["structuredRoadSequence", "US-40 → nearest road → PORTERFIELD"],
  ] as const)("fails PORTERFIELD closed when %s diverges", (field, value) => {
    expect(reviewedNavigationCandidateForPad({ ...porterfield(), [field]: value })).toBeNull();
  });

  it("fails PORTERFIELD closed when its saved destination changes", () => {
    expect(reviewedNavigationCandidateForPad({
      ...porterfield(),
      mapReference: { latitude: 40.0905, longitude: -80.928503, role: "reference", kind: "saved_pad_reference" },
    })).toBeNull();
    expect(reviewedNavigationCandidateForPad({
      ...porterfield(),
      mapReference: { latitude: 40.090431, longitude: -80.928503, role: "reference", kind: "official_wellhead_reference" },
    })).toBeNull();
  });

  it("never cross-binds same-name pads from another company, county, or exact identity", () => {
    const sameNameOtherCompany = { ...duke(), padId: "11111111-1111-4111-8111-111111111111", canonicalId: "11111111-1111-4111-8111-111111111111", company: "Other" };
    const sameNameOtherCounty = { ...duke(), padId: "22222222-2222-4222-8222-222222222222", canonicalId: "22222222-2222-4222-8222-222222222222", county: "Belmont" };
    expect(sameNameOtherCompany.padName).toBe("DUKE");
    expect(sameNameOtherCounty.padName).toBe("DUKE");
    expect(reviewedNavigationCandidateForPad(sameNameOtherCompany)).toBeNull();
    expect(reviewedNavigationCandidateForPad(sameNameOtherCounty)).toBeNull();
  });

  it("returns each phone-validated batch-2 route only for its exact record and trusted destination", () => {
    for (const fixture of batch2RouteFixtures()) {
      const candidate = reviewedNavigationCandidateForPad(fixture.pad);
      expect(candidate, fixture.name).toMatchObject({
        padId: fixture.pad.padId,
        routeUrl: fixture.routeUrl,
        reviewedRoadSequence: fixture.reviewedSequence,
        finalLegNotice: expect.any(String),
      });

      const url = new URL(candidate!.routeUrl);
      expect(url.protocol, fixture.name).toBe("https:");
      expect(url.hostname, fixture.name).toBe("www.google.com");
      expect(url.pathname, fixture.name).toBe("/maps/dir/");
      expect(url.searchParams.get("origin"), fixture.name).toBeNull();
      expect(url.searchParams.get("api"), fixture.name).toBe("1");
      expect(url.searchParams.get("travelmode"), fixture.name).toBe("driving");
      expect(url.searchParams.get("dir_action"), fixture.name).toBe("navigate");
      expect(url.searchParams.get("destination"), fixture.name).toBe(fixture.destination);
      expect(url.searchParams.get("waypoints")?.split("|"), fixture.name).toEqual(fixture.waypoints);
    }
  });

  it("fails every batch-2 route closed on identity, revision, sequence, coordinate, or source drift", () => {
    for (const fixture of batch2RouteFixtures()) {
      const changedIdentity = [
        { ...fixture.pad, padId: "11111111-1111-4111-8111-111111111111" },
        { ...fixture.pad, canonicalId: "11111111-1111-4111-8111-111111111111" },
        { ...fixture.pad, legacyId: "ascent--other" },
        { ...fixture.pad, recordRevision: "changed" },
        { ...fixture.pad, company: "Other" },
        { ...fixture.pad, padName: `${fixture.name} EAST` },
        { ...fixture.pad, state: "West Virginia" },
        { ...fixture.pad, county: fixture.pad.county === "Belmont" ? "Guernsey" : "Belmont" },
        { ...fixture.pad, structuredRoadSequence: `${fixture.pad.structuredRoadSequence} → changed` },
      ];
      for (const changed of changedIdentity) {
        expect(reviewedNavigationCandidateForPad(changed), fixture.name).toBeNull();
      }

      if (fixture.pad.coordinate) {
        expect(reviewedNavigationCandidateForPad({ ...fixture.pad, coordinate: null }), fixture.name).toBeNull();
        expect(reviewedNavigationCandidateForPad({
          ...fixture.pad,
          coordinate: { ...fixture.pad.coordinate, latitude: fixture.pad.coordinate.latitude + 0.001 },
        }), fixture.name).toBeNull();
        expect(reviewedNavigationCandidateForPad({
          ...fixture.pad,
          coordinate: { ...fixture.pad.coordinate, role: "saved_pad_destination" },
        }), fixture.name).toBeNull();
      } else {
        expect(reviewedNavigationCandidateForPad({ ...fixture.pad, mapReference: null }), fixture.name).toBeNull();
        expect(reviewedNavigationCandidateForPad({
          ...fixture.pad,
          mapReference: { ...fixture.pad.mapReference!, longitude: fixture.pad.mapReference!.longitude + 0.001 },
        }), fixture.name).toBeNull();
        expect(reviewedNavigationCandidateForPad({
          ...fixture.pad,
          mapReference: { ...fixture.pad.mapReference!, kind: "official_pad_reference" },
        }), fixture.name).toBeNull();
      }
    }
  });

  it("never cross-binds a batch-2 same-name pad from another company or county", () => {
    for (const fixture of batch2RouteFixtures()) {
      expect(reviewedNavigationCandidateForPad({ ...fixture.pad, company: "Other" }), fixture.name).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...fixture.pad,
        county: fixture.pad.county === "Belmont" ? "Guernsey" : "Belmont",
      }), fixture.name).toBeNull();
    }
  });

  it("returns every turn-list-validated batch-3 route only for its exact record and trusted destination", () => {
    for (const fixture of batch3RouteFixtures()) {
      const candidate = reviewedNavigationCandidateForPad(fixture.pad);
      expect(candidate, fixture.name).toMatchObject({
        padId: fixture.pad.padId,
        routeUrl: fixture.routeUrl,
        reviewedRoadSequence: fixture.reviewedSequence,
        finalLegNotice: expect.any(String),
      });

      const url = new URL(candidate!.routeUrl);
      expect(url.protocol, fixture.name).toBe("https:");
      expect(url.hostname, fixture.name).toBe("www.google.com");
      expect(url.pathname, fixture.name).toBe("/maps/dir/");
      expect(url.searchParams.get("origin"), fixture.name).toBeNull();
      expect(url.searchParams.get("api"), fixture.name).toBe("1");
      expect(url.searchParams.get("travelmode"), fixture.name).toBe("driving");
      expect(url.searchParams.get("dir_action"), fixture.name).toBe("navigate");
      expect(url.searchParams.get("destination"), fixture.name).toBe(fixture.destination);
      expect(url.searchParams.get("waypoints")?.split("|"), fixture.name).toEqual(fixture.waypoints);
    }
  });

  it("keeps batch-3 saved-GPS tails visibly unapproved and does not promote Google's HOOP label", () => {
    for (const fixture of batch3RouteFixtures()) {
      const candidate = reviewedNavigationCandidateForPad(fixture.pad)!;
      if (fixture.pad.mapReference?.kind === "saved_pad_reference") {
        expect(candidate.detail, fixture.name).toMatch(/unapproved/i);
        expect(candidate.reviewedRoadSequence, fixture.name).toMatch(/unapproved/i);
        expect(candidate.finalLegNotice, fixture.name).toMatch(/unapproved/i);
      }

      if (fixture.name === "HOOP") {
        expect(candidate.detail).not.toContain("Hoop Ln");
        expect(candidate.reviewedRoadSequence).not.toContain("Hoop Ln");
        expect(candidate.finalLegNotice).toContain("Google may display Hoop Lane");
      }
    }
  });

  it("fails every batch-3 route closed on identity, revision, sequence, coordinate, or source drift", () => {
    for (const fixture of batch3RouteFixtures()) {
      const changedIdentity = [
        { ...fixture.pad, padId: "11111111-1111-4111-8111-111111111111" },
        { ...fixture.pad, canonicalId: "11111111-1111-4111-8111-111111111111" },
        { ...fixture.pad, legacyId: "ascent--other" },
        { ...fixture.pad, recordRevision: "changed" },
        { ...fixture.pad, company: "Other" },
        { ...fixture.pad, padName: `${fixture.name} EAST` },
        { ...fixture.pad, state: "West Virginia" },
        { ...fixture.pad, county: fixture.pad.county === "Belmont" ? "Guernsey" : "Belmont" },
        { ...fixture.pad, structuredRoadSequence: `${fixture.pad.structuredRoadSequence} → changed` },
      ];
      for (const changed of changedIdentity) {
        expect(reviewedNavigationCandidateForPad(changed), fixture.name).toBeNull();
      }

      if (fixture.pad.coordinate) {
        expect(reviewedNavigationCandidateForPad({ ...fixture.pad, coordinate: null }), fixture.name).toBeNull();
        expect(reviewedNavigationCandidateForPad({
          ...fixture.pad,
          coordinate: { ...fixture.pad.coordinate, latitude: fixture.pad.coordinate.latitude + 0.001 },
        }), fixture.name).toBeNull();
        expect(reviewedNavigationCandidateForPad({
          ...fixture.pad,
          coordinate: { ...fixture.pad.coordinate, role: "saved_pad_destination" },
        }), fixture.name).toBeNull();
      } else {
        expect(reviewedNavigationCandidateForPad({ ...fixture.pad, mapReference: null }), fixture.name).toBeNull();
        expect(reviewedNavigationCandidateForPad({
          ...fixture.pad,
          mapReference: { ...fixture.pad.mapReference!, longitude: fixture.pad.mapReference!.longitude + 0.001 },
        }), fixture.name).toBeNull();
        expect(reviewedNavigationCandidateForPad({
          ...fixture.pad,
          mapReference: { ...fixture.pad.mapReference!, kind: "official_pad_reference" },
        }), fixture.name).toBeNull();
      }
    }
  });

  it("never cross-binds a batch-3 same-name pad from another company or county", () => {
    for (const fixture of batch3RouteFixtures()) {
      expect(reviewedNavigationCandidateForPad({ ...fixture.pad, company: "Other" }), fixture.name).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...fixture.pad,
        county: fixture.pad.county === "Belmont" ? "Guernsey" : "Belmont",
      }), fixture.name).toBeNull();
    }
  });
});
