import { describe, expect, it } from "vitest";
import type { PadSummary } from "./types";
import { ascentSavedDirectionExactMatchBatch1 } from "./ascentSavedDirectionExactMatchBatch1";
import {
  ALBATROSS_REVIEWED_GOOGLE_URL,
  ATHENA_REVIEWED_GOOGLE_URL,
  BAKOS_REVIEWED_GOOGLE_URL,
  BANNOCK_REVIEWED_GOOGLE_URL,
  BEETLE_REVIEWED_GOOGLE_URL,
  BILINOVICH_REVIEWED_GOOGLE_URL,
  BRAVO_REVIEWED_GOOGLE_URL,
  CASTON_REVIEWED_GOOGLE_URL,
  CIRCLE_OAKS_REVIEWED_GOOGLE_URL,
  CROWIE_REVIEWED_GOOGLE_URL,
  DUKE_REVIEWED_GOOGLE_URL,
  DUTTON_REVIEWED_GOOGLE_URL,
  ECHO_REVIEWED_GOOGLE_URL,
  GILCHER_REVIEWED_GOOGLE_URL,
  GIL_REVIEWED_GOOGLE_URL,
  HASTINGS_REVIEWED_GOOGLE_URL,
  HOOP_REVIEWED_GOOGLE_URL,
  JACKALOPE_REVIEWED_GOOGLE_URL,
  JEFFCO_REVIEWED_GOOGLE_URL,
  KUNGLE_A_REVIEWED_GOOGLE_URL,
  KUNGLE_B_REVIEWED_GOOGLE_URL,
  LAKE_REVIEWED_GOOGLE_URL,
  LAWSON_REVIEWED_GOOGLE_URL,
  LAVADA_REVIEWED_GOOGLE_URL,
  LODESTAR_REVIEWED_GOOGLE_URL,
  LODGE_REVIEWED_GOOGLE_URL,
  LORRAINE_REVIEWED_GOOGLE_URL,
  MALDON_REVIEWED_GOOGLE_URL,
  MATUSEK_REVIEWED_GOOGLE_URL,
  MOONSTONE_REVIEWED_GOOGLE_URL,
  NORTH_STAR_REVIEWED_GOOGLE_URL,
  PANG_REVIEWED_GOOGLE_URL,
  PICKENS_REVIEWED_GOOGLE_URL,
  PORTERFIELD_B_REVIEWED_GOOGLE_URL,
  PORTERFIELD_REVIEWED_GOOGLE_URL,
  RECTOR_C_REVIEWED_GOOGLE_URL,
  RUTH_REVIEWED_GOOGLE_URL,
  ROCK_RIDGE_REVIEWED_GOOGLE_URL,
  RICHLAND_B_REVIEWED_GOOGLE_URL,
  SADLER_REVIEWED_GOOGLE_URL,
  SLABAUGH_REVIEWED_GOOGLE_URL,
  SKULL_FORK_REVIEWED_GOOGLE_URL,
  TARPLEY_REVIEWED_GOOGLE_URL,
  THOMAS_REVIEWED_GOOGLE_URL,
  TOWE_REVIEWED_GOOGLE_URL,
  TRUCHAN_NW_REVIEWED_GOOGLE_URL,
  TRUCHAN_NE_REVIEWED_GOOGLE_URL,
  TROYER_REVIEWED_GOOGLE_URL,
  WITHEY_REVIEWED_GOOGLE_URL,
  WHEELING_VALLEY_REVIEWED_GOOGLE_URL,
  WAMPUM_REVIEWED_GOOGLE_URL,
  WINSTON_SMITH_REVIEWED_GOOGLE_URL,
  buildReviewedNavigationUrl,
  ownerApprovalPresentationForReceipt,
  ownerApprovalReceiptInputForAudit,
  ownerApprovalReceiptRowsForAudit,
  reviewedNavigationContractRowsForAudit,
  reviewedNavigationCandidateForPad,
  reviewedNavigationSafetyHoldForPad,
  reviewedNavigationSequenceItems,
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

function exactMatchBatch1Pad(record: typeof ascentSavedDirectionExactMatchBatch1[number]): PadSummary {
  return {
    ...bilinovich(),
    padId: record.padId,
    canonicalId: record.canonicalId,
    legacyId: record.legacyId,
    recordRevision: record.recordRevision,
    company: record.company,
    padName: record.padName,
    state: record.state,
    county: record.county,
    coordinate: null,
    mapReference: {
      latitude: record.trustedDestination.latitude,
      longitude: record.trustedDestination.longitude,
      role: "reference",
      kind: "saved_pad_reference",
    },
    structuredRoadSequence: record.structuredRoadSequence,
  };
}

function firstI70WaveRouteFixtures() {
  const savedPad = (
    padId: string,
    legacyId: string,
    recordRevision: string,
    padName: string,
    county: string,
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
    county,
    structuredRoadSequence,
    coordinate: null,
    mapReference: { latitude, longitude, role: "reference", kind: "saved_pad_reference" },
  });

  return [
    {
      name: "RICHLAND B",
      pad: savedPad(
        "73f48788-9990-435a-adee-999740e958de",
        "ascent--richland-b",
        "1786258360881449",
        "RICHLAND B",
        "Belmont",
        "I-70 → Exit 213 → OH-331 → US-40 → Lloydsville Bannock Rd → Lude Rd → OR → OH-149 → US-40 → Lloydsville Bannock Rd → Lude Rd → OR → I-70 → Exit 208 → OH-149 → US-40 → Lloydsville Bannock Rd → Lude Rd",
        40.077481,
        -80.995772,
      ),
      routeUrl: RICHLAND_B_REVIEWED_GOOGLE_URL,
      expectedUrl: "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.077481%2C-80.995772&waypoints=40.075237%2C-80.990567%7C40.076936%2C-80.994184",
      destination: "40.077481,-80.995772",
      waypoints: ["40.075237,-80.990567", "40.076936,-80.994184"],
      notice: /POGUE RD.*context only.*not promoted/iu,
    },
    {
      name: "LAVADA",
      pad: savedPad(
        "883420b3-07b9-4682-912e-42ba278d1132",
        "ascent--lavada",
        "1786265812046205",
        "LAVADA",
        "Guernsey",
        "I-70 → Exit 186 → OH-285 → OH-265 → Salem Rd → Lease Road",
        39.97411,
        -81.412098,
      ),
      routeUrl: LAVADA_REVIEWED_GOOGLE_URL,
      expectedUrl: "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.97411%2C-81.412098&waypoints=39.981189%2C-81.414833",
      destination: "39.97411,-81.412098",
      waypoints: ["39.981189,-81.414833"],
      notice: /Leatherwood Road.*renderer context.*not promoted/iu,
    },
    {
      name: "WAMPUM",
      pad: savedPad(
        "8e823835-2c10-4275-84e9-4067376fa364",
        "ascent--wampum",
        "1786258360881449",
        "WAMPUM",
        "Guernsey",
        "I-70 → OH-285 → OH-313 → Salem Rd → Nighthawk Rd → Keep Right Onto Divison Rd → Lease Road",
        39.962923,
        -81.440117,
      ),
      routeUrl: WAMPUM_REVIEWED_GOOGLE_URL,
      expectedUrl: "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.962923%2C-81.440117&waypoints=39.941409%2C-81.446907%7C39.953452%2C-81.440293%7C39.961901%2C-81.441644",
      destination: "39.962923,-81.440117",
      waypoints: [
        "39.941409,-81.446907",
        "39.953452,-81.440293",
        "39.961901,-81.441644",
      ],
      notice: /pre-fork Nighthawk.*post-fork Division.*Divison spelling.*context only/iu,
    },
    {
      name: "SLABAUGH",
      pad: savedPad(
        "eae4741b-7fb4-4bc3-8b20-26043032acda",
        "ascent--slabaugh",
        "1786265512886177",
        "SLABAUGH",
        "Guernsey",
        "I-70 → OH-285 → OH-313 → Salem Rd → Nighthawk Rd → Lease Road",
        39.95541,
        -81.4408,
      ),
      routeUrl: SLABAUGH_REVIEWED_GOOGLE_URL,
      expectedUrl: "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.95541%2C-81.4408&waypoints=39.941409%2C-81.446907%7C39.952222%2C-81.440069",
      destination: "39.95541,-81.4408",
      waypoints: ["39.941409,-81.446907", "39.952222,-81.440069"],
      notice: /DIVISION RD.*context only.*does not replace Nighthawk Road/iu,
    },
    {
      name: "RECTOR-C",
      pad: savedPad(
        "0a2a4a64-6e64-4b7d-9652-e1a97db4fc4f",
        "ascent--rector-c",
        "1786265812046205",
        "RECTOR-C",
        "Guernsey",
        "OH-285 → OH-313E → Salem Rd → New Gottengen Rd → Meadowlark Rd → Lease Road",
        39.955552,
        -81.395087,
      ),
      routeUrl: RECTOR_C_REVIEWED_GOOGLE_URL,
      expectedUrl: "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.955552%2C-81.395087&waypoints=39.941409%2C-81.446907%7C39.9652842%2C-81.3804816",
      destination: "39.955552,-81.395087",
      waypoints: ["39.941409,-81.446907", "39.9652842,-81.3804816"],
      notice: /Earlier one-control attempts.*OH-313.*Locust Grove.*rejected/iu,
    },
    {
      name: "TARPLEY",
      pad: savedPad(
        "25dc64b5-4a52-4cef-8b2c-62e7e36d64c7",
        "ascent--tarpley",
        "1786265812046205",
        "TARPLEY",
        "Guernsey",
        "Route 70 → OH-513 → Bridgewater Rd → Lease Road",
        40.063839,
        -81.293734,
      ),
      routeUrl: TARPLEY_REVIEWED_GOOGLE_URL,
      expectedUrl: "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.063839%2C-81.293734&waypoints=40.05541%2C-81.319658%7C40.058189%2C-81.295487",
      destination: "40.063839,-81.293734",
      waypoints: ["40.05541,-81.319658", "40.058189,-81.295487"],
      notice: /Pisgah Road \/ CR-94.*Morris Ln.*context only.*not promoted/iu,
    },
  ] as const;
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
    recordRevision: "1788117937351112",
    padName: "PICKENS",
    county: "Harrison",
    structuredRoadSequence: "OH-9 south → Turn left onto OH-519 east → Turn right onto Lease Road",
    coordinate: { latitude: 40.182544, longitude: -80.977135, role: "driver_entrance" },
    mapReference: null,
  };
}

function troyer(): PadSummary {
  return {
    ...bilinovich(),
    padId: "6c93d03a-76e8-4c03-b47e-8b7011c81a1a",
    canonicalId: "6c93d03a-76e8-4c03-b47e-8b7011c81a1a",
    legacyId: "ascent--troyer",
    recordRevision: "1786258360881449",
    padName: "TROYER",
    county: "Guernsey",
    structuredRoadSequence: "US-22 → Mc Coy Rd → Pennyroyal Rd → Penrose Rd → OR → OH-513 → US-22 → Mc Coy Rd → Pennyroyal Rd → Penrose Rd",
    coordinate: null,
    mapReference: { latitude: 40.087025, longitude: -81.259818, role: "reference", kind: "saved_pad_reference" },
  };
}

function circleOaks(): PadSummary {
  return {
    ...bilinovich(),
    padId: "b22c557a-950a-4ed7-a65a-f4730b9bc727",
    canonicalId: "b22c557a-950a-4ed7-a65a-f4730b9bc727",
    legacyId: "ascent--circle-oaks",
    recordRevision: "1787459253071652",
    padName: "CIRCLE-OAKS",
    county: "Guernsey",
    structuredRoadSequence: "OH-342 → OH-258 → Martha Rd → Titus Rd → Pad",
    coordinate: { latitude: 40.176413, longitude: -81.348770, role: "driver_entrance" },
    mapReference: null,
  };
}

function porterfieldB(): PadSummary {
  return {
    ...bilinovich(),
    padId: "41f0bfc3-7be1-450f-abfc-96dce544547b",
    canonicalId: "41f0bfc3-7be1-450f-abfc-96dce544547b",
    legacyId: "ascent--porterfield-b",
    recordRevision: "1786258360881449",
    padName: "PORTERFIELD B",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 215 → US-40 → Vineyard Rd → Lease Road → OR → OH-331 → US-40 → Vineyard Rd → Lease Road",
    coordinate: null,
    mapReference: { latitude: 40.090438, longitude: -80.921210, role: "reference", kind: "saved_pad_reference" },
  };
}

function rockRidge(): PadSummary {
  return {
    ...bilinovich(),
    padId: "19a4f7ef-4334-4b1c-8443-2c5ccb323d1d",
    canonicalId: "19a4f7ef-4334-4b1c-8443-2c5ccb323d1d",
    legacyId: "ascent--rock-ridge",
    recordRevision: "1786265812046205",
    padName: "ROCK RIDGE",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 202 → OH-800 → Shannon Rd → Lowe Rd → 1st Cross Rd → Fairview Rd → Douglas/fairview Rd → Putney Ridge Rd → Lease Road",
    coordinate: { latitude: 39.998772, longitude: -81.224825, role: "driver_entrance" },
    mapReference: null,
  };
}

function bakos(): PadSummary {
  return {
    ...bilinovich(),
    padId: "d7898e8c-1bb6-48f8-b5e0-87bc1898420e",
    canonicalId: "d7898e8c-1bb6-48f8-b5e0-87bc1898420e",
    legacyId: "ascent--bakos",
    recordRevision: "1787615581785257",
    padName: "BAKOS",
    county: "Belmont",
    structuredRoadSequence: "US-250 → Right/west Onto Holly View Dr → OR → Holly View Dr → Pad → OR → US-250 → Left/west Onto Holy View Dr → No St Sign And Rd",
    coordinate: null,
    mapReference: { latitude: 40.151125, longitude: -80.852968, role: "reference", kind: "saved_pad_reference" },
  };
}

function bannock(): PadSummary {
  return {
    ...bilinovich(),
    padId: "333598ca-37b3-4b44-9411-a490cc3da672",
    canonicalId: "333598ca-37b3-4b44-9411-a490cc3da672",
    legacyId: "ascent--bannock",
    recordRevision: "1786744183028038",
    padName: "BANNOCK",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 213 → OH-331 → Lafferty-bannock Rd → Lease Road → OR → OH-9 → OH-149 → OH-331 → Lafferty-bannock Rd",
    coordinate: { latitude: 40.111003, longitude: -81.002932, role: "driver_entrance" },
    mapReference: null,
  };
}

function sadler(): PadSummary {
  return {
    ...bilinovich(),
    padId: "166c5d6c-3a8d-4481-b8bf-5d74b7605f0d",
    canonicalId: "166c5d6c-3a8d-4481-b8bf-5d74b7605f0d",
    legacyId: "ascent--sadler",
    recordRevision: "1786440150388625",
    padName: "SADLER",
    county: "Harrison",
    structuredRoadSequence: "US-250 → CR-86 / Jamison Rd → Pad",
    coordinate: { latitude: 40.207568, longitude: -80.935841, role: "driver_entrance" },
    mapReference: null,
  };
}

function towe(): PadSummary {
  return {
    ...bilinovich(),
    padId: "800c877a-6b4f-4a87-a710-b1e00af63c62",
    canonicalId: "800c877a-6b4f-4a87-a710-b1e00af63c62",
    legacyId: "ascent--towe",
    recordRevision: "1786159709605865",
    padName: "TOWE",
    county: "Harrison",
    structuredRoadSequence: "Willis Run Rd → Oak Hill Rd → Pad",
    coordinate: { latitude: 40.385998, longitude: -81.212569, role: "driver_entrance" },
    mapReference: null,
  };
}

function dutton(): PadSummary {
  return {
    ...bilinovich(),
    padId: "fbdb5ee4-38d6-4801-81cc-8ad4abbb24e2",
    canonicalId: "fbdb5ee4-38d6-4801-81cc-8ad4abbb24e2",
    legacyId: "ascent--dutton",
    recordRevision: "1787459253071652",
    padName: "DUTTON",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 213 → OH-331 → Dutton Dr → OR → OH-9 → OH-149 → OH-331 → Dutton Dr → OR → OH-331 → Dutton Dr",
    coordinate: null,
    mapReference: { latitude: 40.150027, longitude: -81.017133, role: "reference", kind: "saved_pad_reference" },
  };
}

function kungleB(): PadSummary {
  return {
    ...bilinovich(),
    padId: "ad5ef012-46f5-46ca-93c7-0f5b492cb201",
    canonicalId: "ad5ef012-46f5-46ca-93c7-0f5b492cb201",
    legacyId: "ascent--kungle-b",
    recordRevision: "1786258360881449",
    padName: "KUNGLE B",
    county: "Belmont",
    structuredRoadSequence: "OH-2 → OH-872W → OH-7S → OH-148W → Potts Rd → OR → OH-556E → Clover Ridge Rd → OH-148E → Potts Rd → OR → OH-9 → OH-148E → Potts Rd",
    coordinate: null,
    mapReference: { latitude: 39.88678, longitude: -80.87008, role: "reference", kind: "saved_pad_reference" },
  };
}

function truchanNw(): PadSummary {
  return {
    ...bilinovich(),
    padId: "c10e2066-d6b7-4117-aea9-137dd1237b3a",
    canonicalId: "c10e2066-d6b7-4117-aea9-137dd1237b3a",
    legacyId: "ascent--truchan-nw",
    recordRevision: "1786258360881449",
    padName: "TRUCHAN NW",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 216 → OH-9 → Shepherdstown Rd → Fairpoint Shepherdstown Rd → OR → OH-9 → Shepherdstown Rd → Fairpoint Shepherdstown Rd",
    coordinate: null,
    mapReference: { latitude: 40.147814, longitude: -80.935886, role: "reference", kind: "saved_pad_reference" },
  };
}

function moonstone(): PadSummary {
  return {
    ...bilinovich(),
    padId: "ca1560b5-4ea6-4eb7-a82e-de2467937eb2",
    canonicalId: "ca1560b5-4ea6-4eb7-a82e-de2467937eb2",
    legacyId: "ascent--moonstone",
    recordRevision: "1786265812046205",
    padName: "MOONSTONE",
    county: "Noble",
    structuredRoadSequence: "OH-147 → OH-513 → OH-146 → Lew Marten Rd → Pad",
    coordinate: null,
    mapReference: { latitude: 39.83664, longitude: -81.379628, role: "reference", kind: "saved_pad_reference" },
  };
}

function jeffco(): PadSummary {
  return {
    ...bilinovich(),
    padId: "9aa065c0-8896-49e2-b02d-d4ca71acefc3",
    canonicalId: "9aa065c0-8896-49e2-b02d-d4ca71acefc3",
    legacyId: "ascent--jeffco",
    recordRevision: "1786265812046205",
    padName: "JEFFCO",
    county: "Harrison",
    structuredRoadSequence: "OH-151 → Rose Valley Rd → Beech Rd → Pad",
    coordinate: null,
    mapReference: { latitude: 40.292482, longitude: -80.896856, role: "reference", kind: "saved_pad_reference" },
  };
}

function kungleA(): PadSummary {
  return {
    ...bilinovich(),
    padId: "47a0305e-c641-499b-990c-0f7fe83493b8",
    canonicalId: "47a0305e-c641-499b-990c-0f7fe83493b8",
    legacyId: "ascent--kungle-a",
    recordRevision: "1787459253071652",
    padName: "KUNGLE A",
    county: "Belmont",
    structuredRoadSequence: "OH-2 → OH-872 → OH-7 → OH-148 → Potts Rd → OR → OH-556 → Clover Ridge Rd → OH-148 → Potts Rd → OR → OH-147 → OH-148 → Potts Rd",
    coordinate: null,
    mapReference: { latitude: 39.88507, longitude: -80.88258, role: "reference", kind: "saved_pad_reference" },
  };
}

function truchanNe(): PadSummary {
  return {
    ...bilinovich(),
    padId: "cd4f6dcc-b603-4155-84b2-30d7ee87bbc7",
    canonicalId: "cd4f6dcc-b603-4155-84b2-30d7ee87bbc7",
    legacyId: "ascent--truchan-ne",
    recordRevision: "1786258360881449",
    padName: "TRUCHAN NE",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 216 → OH-9 → Shepherdstown Rd → Fairpoint Shepherdstown Rd → Sloans Run Rd → OR → OH-9 → Shepherdstown Rd → Fairpoint Shepherdstown Rd → Sloans Run Rd",
    coordinate: null,
    mapReference: { latitude: 40.146637, longitude: -80.931651, role: "reference", kind: "saved_pad_reference" },
  };
}

function matusek(): PadSummary {
  return {
    ...bilinovich(),
    padId: "d6d0a0fd-1cd3-48ae-8e41-90d744b9f8f6",
    canonicalId: "d6d0a0fd-1cd3-48ae-8e41-90d744b9f8f6",
    legacyId: "ascent--matusek",
    recordRevision: "1786258360881449",
    padName: "MATUSEK",
    county: "Belmont",
    structuredRoadSequence: "I-70 → OH-9 / Shepherdstown Rd → Fairpoint Shepherdstown Rd → Sloans Run Rd → See Dunn Rd → Lease Road → OR → Dunn Rd",
    coordinate: null,
    mapReference: { latitude: 40.146555, longitude: -80.922785, role: "reference", kind: "saved_pad_reference" },
  };
}

function lorraine(): PadSummary {
  return {
    ...bilinovich(),
    padId: "a35f0ea7-13d7-45dd-8fe2-fe73e4964df2",
    canonicalId: "a35f0ea7-13d7-45dd-8fe2-fe73e4964df2",
    legacyId: "ascent--lorraine",
    recordRevision: "1786265812046205",
    padName: "LORRAINE",
    county: "Belmont",
    structuredRoadSequence: "US-250 → CR-5 / Crescent Rd → CR-10 → CR10 Barton Blaine Rd",
    coordinate: null,
    mapReference: { latitude: 40.09955, longitude: -80.840213, role: "reference", kind: "saved_pad_reference" },
  };
}

function pang(): PadSummary {
  return {
    ...bilinovich(),
    padId: "74032b6e-179d-4672-8720-55ac86cab232",
    canonicalId: "74032b6e-179d-4672-8720-55ac86cab232",
    legacyId: "ascent--pang",
    recordRevision: "1786258360881449",
    padName: "PANG",
    county: "Belmont",
    structuredRoadSequence: "Main St → OH-9 → Shepherdstown Rd → Access Road → OR → Marietta St → Newell Ave → OH-9 → Shepherdstown Rd → Access Road",
    coordinate: null,
    mapReference: { latitude: 40.147178, longitude: -80.948742, role: "reference", kind: "saved_pad_reference" },
  };
}

function hastings(): PadSummary {
  return {
    ...bilinovich(),
    padId: "f2f82142-f6d8-4f8d-b440-2ff86f624158",
    canonicalId: "f2f82142-f6d8-4f8d-b440-2ff86f624158",
    legacyId: "ascent--hastings",
    recordRevision: "1786265812046205",
    padName: "HASTINGS",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 213 → OH-331 → OH-149 → Chaney Rd → Lease Road",
    coordinate: null,
    mapReference: { latitude: 40.163138, longitude: -81.021428, role: "reference", kind: "saved_pad_reference" },
  };
}

function wheelingValley(): PadSummary {
  return {
    ...bilinovich(),
    padId: "25dc9adf-e09a-4cfa-8900-59492fbad0ec",
    canonicalId: "25dc9adf-e09a-4cfa-8900-59492fbad0ec",
    legacyId: "ascent--wheeling-valley",
    recordRevision: "1786258360881449",
    padName: "WHEELING VALLEY",
    county: "Belmont",
    structuredRoadSequence: "I-70 → OH-9 / N Toward Shepherdstown Rd → Fairpoint Shepherdstown Rd → Sloans Run Rd → Dunn Rd → Morgan Rd",
    coordinate: null,
    mapReference: { latitude: 40.153061, longitude: -80.923517, role: "reference", kind: "saved_pad_reference" },
  };
}

function jackalope(): PadSummary {
  return {
    ...bilinovich(),
    padId: "f80dea77-db11-45f8-b30c-6c6abb85e469",
    canonicalId: "f80dea77-db11-45f8-b30c-6c6abb85e469",
    legacyId: "ascent--jackalope",
    recordRevision: "1786265812046205",
    padName: "JACKALOPE",
    county: "Guernsey",
    structuredRoadSequence: "OH-800 → OH-342 → OH-258 → Martha Rd → Titus Rd → Lodge Rd → Cox → Pad",
    coordinate: null,
    mapReference: { latitude: 40.164159, longitude: -81.356092, role: "reference", kind: "saved_pad_reference" },
  };
}

function lodge(): PadSummary {
  return {
    ...bilinovich(),
    padId: "5c4a497e-cf33-48dd-8272-9fd06ebb9e6a",
    canonicalId: "5c4a497e-cf33-48dd-8272-9fd06ebb9e6a",
    legacyId: "ascent--lodge",
    recordRevision: "1786265812046205",
    padName: "LODGE",
    county: "Guernsey",
    structuredRoadSequence: "OH-342 → OH-258 → Martha Rd → Titus Rd → Lodge Rd → Lease Road → OR → Pad",
    coordinate: null,
    mapReference: { latitude: 40.164138, longitude: -81.351162, role: "reference", kind: "official_wellhead_reference" },
  };
}

function echo(): PadSummary {
  return {
    ...bilinovich(),
    padId: "83b27fd3-4615-4ea1-ad36-0b05b359f5d2",
    canonicalId: "83b27fd3-4615-4ea1-ad36-0b05b359f5d2",
    legacyId: "ascent--echo",
    recordRevision: "1786265812046205",
    padName: "ECHO",
    county: "Harrison",
    structuredRoadSequence: "OH-519 → Hite Rd → Jokey Hollow Rd → Lease Road",
    coordinate: null,
    mapReference: { latitude: 40.179321, longitude: -81.026812, role: "reference", kind: "saved_pad_reference" },
  };
}

function northStar(): PadSummary {
  return {
    ...bilinovich(),
    padId: "475462f4-7e7a-4432-801c-5e513d5e953f",
    canonicalId: "475462f4-7e7a-4432-801c-5e513d5e953f",
    legacyId: "ascent--north-star",
    recordRevision: "1786258360881449",
    padName: "NORTH STAR",
    county: "Noble",
    structuredRoadSequence: "I-77 → Exit 25 → OH-78 → Archer Ridge Rd → Lease Road",
    coordinate: null,
    mapReference: { latitude: 39.739847, longitude: -81.420197, role: "reference", kind: "saved_pad_reference" },
  };
}

function lodestar(): PadSummary {
  return {
    ...bilinovich(),
    padId: "691fb27b-2b35-471d-81fa-9239f6bd4081",
    canonicalId: "691fb27b-2b35-471d-81fa-9239f6bd4081",
    legacyId: "ascent--lodestar",
    recordRevision: "1786258360881449",
    padName: "LODESTAR",
    county: "Noble",
    structuredRoadSequence: "I-77 → Exit 25 → OH-78 E → Archer Ridge Rd / CR-2 → Hill Rd / TR-307 → Lease Road",
    coordinate: null,
    mapReference: { latitude: 39.750091, longitude: -81.409571, role: "reference", kind: "saved_pad_reference" },
  };
}

function winstonSmith(): PadSummary {
  return {
    ...bilinovich(),
    padId: "0b7ed9a5-7748-4d92-992a-7f2cecf9dd08",
    canonicalId: "0b7ed9a5-7748-4d92-992a-7f2cecf9dd08",
    legacyId: "ascent--winston-smith",
    recordRevision: "1786258360881449",
    padName: "WINSTON SMITH",
    county: "Noble",
    structuredRoadSequence: "I-77 → Exit 25 → OH-78 → Archer Ridge Rd → Hill Rd → Keep Left Onto Gurewicz Rd → Lease Road",
    coordinate: null,
    mapReference: { latitude: 39.752765, longitude: -81.396584, role: "reference", kind: "saved_pad_reference" },
  };
}

function vannelle(): PadSummary {
  return {
    ...bilinovich(),
    padId: "ce5d219e-1d2c-47c8-b921-3f2abfe45c5d",
    canonicalId: "ce5d219e-1d2c-47c8-b921-3f2abfe45c5d",
    legacyId: "ascent--vannelle",
    recordRevision: "1786258360881449",
    padName: "VANNELLE",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 216 → OH-9 → Shepherdstown Rd → Pad → OR → OH-9 → Shepherdstown Rd → Pad → OR → OH-149 → OH-9 → Shepherdstown Rd → Pad",
    coordinate: null,
    mapReference: { latitude: 40.14744, longitude: -80.961696, role: "reference", kind: "saved_pad_reference" },
  };
}

function batch6ReviewedRouteFixtures() {
  return [
    {
      name: "BAKOS",
      pad: bakos(),
      routeUrl: BAKOS_REVIEWED_GOOGLE_URL,
      destination: "40.151125,-80.852968",
      waypoints: [
        "40.1516769902779,-80.8451322878882",
        "40.1510618834494,-80.8504752159943",
      ],
      reviewedSequence: "Google-selected state-road approach → US-250 → Holly View Dr / TR-452 → saved pad GPS",
      notice: /exact current route receipt/u,
    },
    {
      name: "BANNOCK",
      pad: bannock(),
      routeUrl: BANNOCK_REVIEWED_GOOGLE_URL,
      destination: "40.111003,-81.002932",
      waypoints: ["40.10871301297529,-80.97829303262223"],
      reviewedSequence: "Google-selected state-road approach → OH-331 → Lafferty-Bannock Rd / CR-10 → unapproved entrance handoff → verified driver entrance",
      notice: /accepts either OH-331 approach direction without backtracking/u,
    },
    {
      name: "SADLER",
      pad: sadler(),
      routeUrl: SADLER_REVIEWED_GOOGLE_URL,
      destination: "40.207568,-80.935841",
      waypoints: ["40.218227603057535,-80.94472982304073"],
      reviewedSequence: "Google-selected state-road approach → US-250 → Jamison Rd / CR-86 → verified driver entrance",
      notice: /Google currently spells the road Jameson/u,
    },
    {
      name: "TOWE",
      pad: towe(),
      routeUrl: TOWE_REVIEWED_GOOGLE_URL,
      destination: "40.385998,-81.212569",
      waypoints: [
        "40.36026193640823,-81.218134577079",
        "40.379819440170614,-81.20908591279908",
      ],
      reviewedSequence: "Google-selected state-road approach → US-250 → Willis Run Rd / TR-213 → Oak Hill Rd / TR-212 → verified driver entrance",
      notice: /accept either state-road approach direction without backtracking/u,
    },
  ] as const;
}

function batch7ReviewedRouteFixtures() {
  return [
    {
      name: "DUTTON",
      pad: dutton(),
      routeUrl: DUTTON_REVIEWED_GOOGLE_URL,
      destination: "40.150027,-81.017133",
      waypoints: ["40.143135410968,-81.033512001895"],
      reviewedSequence: "Google-selected state-road approach → OH-331 → Dutton Dr / TR-1586 → unapproved access/GPS handoff → saved pad GPS",
      notice: /not relabeled as a verified entrance/u,
    },
    {
      name: "KUNGLE B",
      pad: kungleB(),
      routeUrl: KUNGLE_B_REVIEWED_GOOGLE_URL,
      destination: "39.88678,-80.87008",
      waypoints: ["39.886820116283,-80.869735364419"],
      reviewedSequence: "Google-selected state-road approach → OH-148 → Potts Rd / TR-506 → unapproved entrance/GPS handoff → saved pad GPS",
      notice: /accepts either state-road approach direction without backtracking/u,
    },
    {
      name: "TRUCHAN NW",
      pad: truchanNw(),
      routeUrl: TRUCHAN_NW_REVIEWED_GOOGLE_URL,
      destination: "40.147814,-80.935886",
      waypoints: [
        "40.151952334248,-80.961064815011",
        "40.15863093394,-80.943718975075",
      ],
      reviewedSequence: "Google-selected state-road approach → OH-9 → Shepherdstown Rd / CR-64 → Fairpoint-Shepherdstown Rd / TR-216 → unapproved entrance/GPS handoff → saved pad GPS",
      notice: /Google currently spells the terminal road Shepardstown/u,
    },
    {
      name: "MOONSTONE",
      pad: moonstone(),
      routeUrl: MOONSTONE_REVIEWED_GOOGLE_URL,
      destination: "39.83664,-81.379628",
      waypoints: ["39.829803091222,-81.379580538853"],
      reviewedSequence: "Google-selected state-road approach → OH-146 → Lew Martin Rd / TR-228 → unapproved entrance/GPS handoff → saved pad GPS",
      notice: /record spells the road Lew Marten/u,
    },
    {
      name: "JEFFCO",
      pad: jeffco(),
      routeUrl: JEFFCO_REVIEWED_GOOGLE_URL,
      destination: "40.292482,-80.896856",
      waypoints: [
        "40.3144086,-80.8963895",
        "40.2968376,-80.9022309",
      ],
      reviewedSequence: "Google-selected state-road approach → OH-151 → Rose Valley Rd / CR-14 → Beech Rd / TR-64 → unapproved GPS handoff → saved pad GPS",
      notice: /saved-GPS handoff remain unapproved/u,
    },
  ] as const;
}

function batch8ReviewedRouteFixtures() {
  return [
    {
      name: "KUNGLE A",
      pad: kungleA(),
      routeUrl: KUNGLE_A_REVIEWED_GOOGLE_URL,
      destination: "39.88507,-80.88258",
      waypoints: ["39.886820116283,-80.869735364419"],
      reviewedSequence: "Google-selected state-road approach → OH-148 → Potts Rd / TR-506 → unapproved access/GPS handoff → saved pad GPS",
      notice: /exact public-road geometry ends before the saved pad GPS/iu,
    },
    {
      name: "TRUCHAN NE",
      pad: truchanNe(),
      routeUrl: TRUCHAN_NE_REVIEWED_GOOGLE_URL,
      destination: "40.146637,-80.931651",
      waypoints: [
        "40.151952334248,-80.961064815011",
        "40.15863093394,-80.943718975075",
        "40.146780343386,-80.934175287918",
      ],
      reviewedSequence: "Google-selected state-road approach → OH-9 → Shepherdstown Rd / CR-64 → Fairpoint-Shepherdstown Rd / TR-216 → Sloans Run Rd / TR-704 → unapproved access/GPS handoff → saved pad GPS",
      notice: /inside the exact Sloans Run Road/u,
    },
    {
      name: "MATUSEK",
      pad: matusek(),
      routeUrl: MATUSEK_REVIEWED_GOOGLE_URL,
      destination: "40.146555,-80.922785",
      waypoints: [
        "40.151952334248,-80.961064815011",
        "40.15863093394,-80.943718975075",
        "40.146780343386,-80.934175287918",
      ],
      reviewedSequence: "Google-selected state-road approach → OH-9 → Shepherdstown Rd / CR-64 → Fairpoint-Shepherdstown Rd / TR-216 → Sloans Run Rd / TR-704 → unapproved access/GPS handoff → saved pad GPS",
      notice: /renderer label is not promoted to exact public-road identity/u,
    },
    {
      name: "LORRAINE",
      pad: lorraine(),
      routeUrl: LORRAINE_REVIEWED_GOOGLE_URL,
      destination: "40.09955,-80.840213",
      waypoints: [
        "40.149707596819,-80.842549734013",
        "40.116658061827,-80.859991873154",
        "40.101497884455,-80.841503024754",
      ],
      reviewedSequence: "Google-selected state-road approach → US-250 → CR-5 / Crescent Rd → shared CR-5 / CR-10 pavement → CR-10 / Barton-Blaine Rd → unapproved access/GPS handoff → saved pad GPS",
      notice: /keeps the route on CR-10 \/ Barton-Blaine Road/u,
    },
  ] as const;
}

function batch9ReviewedRouteFixtures() {
  return [
    {
      name: "PANG",
      pad: pang(),
      routeUrl: PANG_REVIEWED_GOOGLE_URL,
      destination: "40.147178,-80.948742",
      waypoints: ["40.151952334248,-80.961064815011"],
      reviewedSequence: "Google-selected state-road approach → OH-9 → Shepherdstown Rd / CR-64 → unapproved access/GPS handoff → saved pad GPS",
      notice: /final unnamed access/u,
    },
    {
      name: "HASTINGS",
      pad: hastings(),
      routeUrl: HASTINGS_REVIEWED_GOOGLE_URL,
      destination: "40.163138,-81.021428",
      waypoints: ["40.160397859316,-81.016701259012"],
      reviewedSequence: "Google-selected state-road approach → OH-149 → Chaney Rd / TR-386 → unapproved access/GPS handoff → saved pad GPS",
      notice: /upstream state-highway approach remains origin-dependent/u,
    },
    {
      name: "WHEELING VALLEY",
      pad: wheelingValley(),
      routeUrl: WHEELING_VALLEY_REVIEWED_GOOGLE_URL,
      destination: "40.153061,-80.923517",
      waypoints: [
        "40.15863093394,-80.943718975075",
        "40.147055385412,-80.922842319818",
        "40.153787436713,-80.924159995223",
      ],
      reviewedSequence: "Google-selected state-road approach → OH-9 → Shepherdstown Rd / CR-64 → Fairpoint-Shepherdstown Rd / TR-216 → Sloans Run Rd / TR-704 → Dunn Rd / TR-424 → Morgan Rd / TR-423 → unapproved GPS handoff → saved pad GPS",
      notice: /without a skipped road, reversal, or backtrack/u,
    },
    {
      name: "JACKALOPE",
      pad: jackalope(),
      routeUrl: JACKALOPE_REVIEWED_GOOGLE_URL,
      destination: "40.164159,-81.356092",
      waypoints: [
        "40.211888715,-81.390778629",
        "40.204197138,-81.382414119",
        "40.174296992,-81.360075011",
      ],
      reviewedSequence: "Google-selected state-road approach → OH-258 → Martha Rd / CR-781 → Titus Rd / CR-878 → Lodge Rd / CR-78 → Cox Rd / TR-8772 → Lodge Rd → unapproved GPS handoff → saved pad GPS",
      notice: /Titus\/Lodge\/Sligo point junction remains held/u,
    },
    {
      name: "LODGE",
      pad: lodge(),
      routeUrl: LODGE_REVIEWED_GOOGLE_URL,
      destination: "40.164138,-81.351162",
      waypoints: [
        "40.211888715,-81.390778629",
        "40.204197138,-81.382414119",
        "40.174296992,-81.360075011",
      ],
      reviewedSequence: "Google-selected state-road approach → OH-258 → Martha Rd / CR-781 → Titus Rd / CR-878 → Lodge Rd / CR-78 → unapproved lease/GPS handoff → official wellhead reference",
      notice: /official wellhead reference, not a verified driver entrance/u,
    },
    {
      name: "ECHO",
      pad: echo(),
      routeUrl: ECHO_REVIEWED_GOOGLE_URL,
      destination: "40.179321,-81.026812",
      waypoints: [
        "40.185661298825,-81.014226704981",
        "40.164465208939,-81.016699529454",
        "40.173032633439,-81.025592955042",
      ],
      reviewedSequence: "Google-selected state-road approach → OH-519 / Stumptown Rd → Hite Rd / TR-274 → Jockey Hollow Rd / TR-254 → unapproved lease/GPS handoff → saved pad GPS",
      notice: /Exact membership disambiguates the source's Jokey spelling/u,
    },
    {
      name: "NORTH STAR",
      pad: northStar(),
      routeUrl: NORTH_STAR_REVIEWED_GOOGLE_URL,
      destination: "39.739847,-81.420197",
      waypoints: [
        "39.774007303642,-81.451385717411",
        "39.755313742543,-81.424376369949",
      ],
      reviewedSequence: "Google-selected state-road approach → OH-78 → Archers Ridge Rd / CR-2 → unapproved lease/GPS handoff → saved pad GPS",
      notice: /earlier Hohman\/Town Highway 87 shortcut/u,
    },
    {
      name: "LODESTAR",
      pad: lodestar(),
      routeUrl: LODESTAR_REVIEWED_GOOGLE_URL,
      destination: "39.750091,-81.409571",
      waypoints: [
        "39.774007303642,-81.451385717411",
        "39.754750338267,-81.412456525463",
      ],
      reviewedSequence: "Google-selected state-road approach → OH-78 → Archers Ridge Rd / CR-2 → Hill Rd / TR-307 → unapproved lease/GPS handoff → saved pad GPS",
      notice: /exact current identity membership independently proves/u,
    },
  ] as const;
}

function batch5SharedCorridorFixtures() {
  return [
    {
      name: "CIRCLE-OAKS",
      pad: circleOaks(),
      routeUrl: CIRCLE_OAKS_REVIEWED_GOOGLE_URL,
      destination: "40.176413,-81.34877",
      waypoints: [
        "40.211888715,-81.390778629",
        "40.204197138,-81.382414119",
      ],
      reviewedSequence: "Google-selected state-road approach → OH-258 → Martha Rd / CR-781 → Titus Rd / CR-878 → verified driver entrance",
      notice: /accept either state-road approach direction without backtracking/u,
    },
    {
      name: "PORTERFIELD B",
      pad: porterfieldB(),
      routeUrl: PORTERFIELD_B_REVIEWED_GOOGLE_URL,
      destination: "40.090438,-80.92121",
      waypoints: [
        "40.073689,-80.945041",
        "40.088246,-80.944086",
        "40.090469,-80.928294",
      ],
      reviewedSequence: "Google-selected approach → US-40 W → Vineyard Rd / CR-56 → saved pad GPS",
      notice: /PORTERFIELD B's own exact destination/u,
    },
    {
      name: "ROCK RIDGE",
      pad: rockRidge(),
      routeUrl: ROCK_RIDGE_REVIEWED_GOOGLE_URL,
      destination: "39.998772,-81.224825",
      waypoints: [
        "40.007077099,-81.176502113",
        "40.007544767,-81.205526285",
        "39.997476604,-81.217520411",
      ],
      reviewedSequence: "Google-selected state-road approach → I-70 Exit 202 → OH-800 S → Shannon Rd / TR-801 → Lowe Rd / TR-162 → Fairview Rd / CR-114 → Douglass Rd / CR-120 → Pultney Ridge Rd / CR-70 → verified driver entrance",
      notice: /exact current official identities/u,
    },
  ] as const;
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
      reviewedSequence: "US-40 → Vineyard Rd / CR-56 → Williams Rd → unapproved access / GPS handoff → verified driver entrance",
      notice: /remaining movement is explicitly an unapproved access \/ GPS handoff/u,
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
    const wrongDestination = new URL(valid);
    wrongDestination.searchParams.set("destination", "40.3,-80.8");
    expect(reviewedNavigationUrlMatchesContract(wrongDestination.toString(), destination, waypoints)).toBe(false);
    expect(reviewedNavigationUrlMatchesContract(`${valid}&api=1`, destination, waypoints)).toBe(false);
    expect(reviewedNavigationUrlMatchesContract(`${valid}&origin=Cadiz%2C%20OH`, destination, waypoints)).toBe(false);
    expect(reviewedNavigationUrlMatchesContract(`${valid}&unexpected=1`, destination, waypoints)).toBe(false);
    expect(reviewedNavigationUrlMatchesContract(valid.replace("&waypoints=40.21%2C-80.91", ""), destination, waypoints)).toBe(false);
    expect(reviewedNavigationUrlMatchesContract(valid.replace("https://", "http://"), destination, waypoints)).toBe(false);
    expect(reviewedNavigationUrlMatchesContract(valid.replace("www.google.com", "maps.google.com"), destination, waypoints)).toBe(false);
    expect(reviewedNavigationUrlMatchesContract(`${valid}#unsafe`, destination, waypoints)).toBe(false);

    const orderedWaypoints = [
      { latitude: 40.21, longitude: -80.91 },
      { latitude: 40.22, longitude: -80.92 },
      { latitude: 40.23, longitude: -80.93 },
    ];
    const ordered = buildReviewedNavigationUrl(destination, orderedWaypoints);
    const reversed = new URL(ordered);
    reversed.searchParams.set("waypoints", [...orderedWaypoints].reverse().map(({ latitude, longitude }) => `${latitude},${longitude}`).join("|"));
    expect(reviewedNavigationUrlMatchesContract(reversed.toString(), destination, orderedWaypoints)).toBe(false);
    const truncated = new URL(ordered);
    truncated.searchParams.set("waypoints", orderedWaypoints.slice(0, 2).map(({ latitude, longitude }) => `${latitude},${longitude}`).join("|"));
    expect(reviewedNavigationUrlMatchesContract(truncated.toString(), destination, orderedWaypoints)).toBe(false);
    const fourWaypoints = new URL(ordered);
    fourWaypoints.searchParams.set("waypoints", [...orderedWaypoints, { latitude: 40.24, longitude: -80.94 }]
      .map(({ latitude, longitude }) => `${latitude},${longitude}`).join("|"));
    expect(reviewedNavigationUrlMatchesContract(fourWaypoints.toString(), destination, orderedWaypoints)).toBe(false);
  });

  it("pins the exact owner-approved pad membership and every current receipt", () => {
    const rows = ownerApprovalReceiptRowsForAudit();
    expect(rows).toHaveLength(46);
    expect(new Set(rows.map(({ padId }) => padId)).size).toBe(46);
    expect(rows.every(({ matchesCurrentContent }) => matchesCurrentContent)).toBe(true);
    expect(rows.filter(({ evidence }) => evidence === "exact_named_road_identities").map(({ padId }) => padId)).toEqual([
      "143f5268-33e4-4598-8101-40220b5cfdc4",
      "59061829-1122-4aae-872d-cf5024310373",
      "0e6f23f1-3bfb-44b0-aa4e-f24dde611880",
      "bb351070-6c94-45e5-942f-e155f9e86f7e",
      "d7898e8c-1bb6-48f8-b5e0-87bc1898420e",
      "333598ca-37b3-4b44-9411-a490cc3da672",
      "bd2e0e20-8aa8-4e05-a4c0-0af312234853",
      "71c9c874-5514-46a4-8d91-b105c6734799",
      "b22c557a-950a-4ed7-a65a-f4730b9bc727",
      "166c5d6c-3a8d-4481-b8bf-5d74b7605f0d",
      "800c877a-6b4f-4a87-a710-b1e00af63c62",
      "fbdb5ee4-38d6-4801-81cc-8ad4abbb24e2",
      "ad5ef012-46f5-46ca-93c7-0f5b492cb201",
      "c10e2066-d6b7-4117-aea9-137dd1237b3a",
      "ca1560b5-4ea6-4eb7-a82e-de2467937eb2",
      "9aa065c0-8896-49e2-b02d-d4ca71acefc3",
      "47a0305e-c641-499b-990c-0f7fe83493b8",
      "cd4f6dcc-b603-4155-84b2-30d7ee87bbc7",
      "a35f0ea7-13d7-45dd-8fe2-fe73e4964df2",
      "74032b6e-179d-4672-8720-55ac86cab232",
      "f2f82142-f6d8-4f8d-b440-2ff86f624158",
      "25dc9adf-e09a-4cfa-8900-59492fbad0ec",
      "83b27fd3-4615-4ea1-ad36-0b05b359f5d2",
      "475462f4-7e7a-4432-801c-5e513d5e953f",
      "691fb27b-2b35-471d-81fa-9239f6bd4081",
      "0b7ed9a5-7748-4d92-992a-7f2cecf9dd08",
      "4c73e244-6132-4d40-83fc-3fe5e6e65bf6",
      "75600d0c-17b8-488b-96c9-4b7b8ffc8b1b",
    ]);
    expect(rows.filter(({ evidence }) => evidence === "validated_google_handoff").map(({ padId }) => padId)).toEqual([
      "0b7105a0-1b36-4182-8d10-1f2e297c8bab",
      "41f0bfc3-7be1-450f-abfc-96dce544547b",
      "19a4f7ef-4334-4b1c-8443-2c5ccb323d1d",
      "fba35b8e-ccc6-406b-b27c-ac9ce4eed29d",
      "58c94af4-32b1-4f80-a278-a5f73688fa23",
      "ccf7415a-331b-440a-829d-28282a33cde1",
      "1e898176-672d-4174-8878-4aae0aee2128",
      "6c93d03a-76e8-4c03-b47e-8b7011c81a1a",
      "d6d0a0fd-1cd3-48ae-8e41-90d744b9f8f6",
      "f80dea77-db11-45f8-b30c-6c6abb85e469",
      "5c4a497e-cf33-48dd-8272-9fd06ebb9e6a",
      "48d810bf-e59f-4314-9efb-8103a818a3bd",
      "8f616827-d7da-4b40-b9c2-49fd5e713822",
      "f2df293f-13a2-401e-96b2-21e71ac63e6a",
      "06ac93a2-3b46-44fd-9fa6-2fd29201858a",
      "351b72fb-eb48-4355-b6fc-d8e9a867f79c",
      "7dcd1f71-fa32-4edc-ae3d-aa9717d0c72c",
      "3850e94a-826f-4b6b-a54f-d21d482fca46",
    ]);
  });

  it("withdraws owner approval when any approved route content changes", () => {
    const approved = ownerApprovalReceiptInputForAudit("0e6f23f1-3bfb-44b0-aa4e-f24dde611880");
    expect(approved).not.toBeNull();
    expect(ownerApprovalPresentationForReceipt(approved!)).toMatchObject({
      kind: "owner_approved_directions",
      evidence: "exact_named_road_identities",
    });

    const changedWaypoints = approved!.waypoints.map((point, index) => index === 0
      ? { ...point, latitude: point.latitude + 0.000001 }
      : point);
    const mutations = [
      { ...approved!, recordRevision: "changed" },
      { ...approved!, routeUrl: `${approved!.routeUrl}&origin=Cadiz%2C%20OH` },
      { ...approved!, reviewedRoadSequence: `${approved!.reviewedRoadSequence} → changed road` },
      { ...approved!, finalLegNotice: `${approved!.finalLegNotice} changed` },
      { ...approved!, detail: `${approved!.detail} changed` },
      { ...approved!, waypoints: changedWaypoints },
      { ...approved!, routeDestination: { ...approved!.routeDestination, latitude: approved!.routeDestination.latitude + 0.000001 } },
    ];
    for (const mutation of mutations) {
      expect(ownerApprovalPresentationForReceipt(mutation)).toBeUndefined();
    }
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
      ownerApproval: {
        kind: "owner_approved_directions",
        evidence: "exact_named_road_identities",
        approvedAt: "2026-08-28",
      },
    });
    expect(reviewedNavigationSequenceItems(candidate!)).toEqual([
      "US-22",
      "McCoy Rd / CR-82",
      "Merry Rd / TR-967",
      "Penrose Rd / CR-694",
      "Logan Rd / CR-964",
      "Turkle Rd / TR-693",
      "trusted lease approach",
      "BILINOVICH pad-surface destination",
    ]);
    expect(candidate!.finalLegNotice).toMatch(/no-Blaze directions/u);
    expect(candidate!.finalLegNotice).toMatch(/private final geometry and entrance remain unapproved/u);
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
      reviewedRoadSequence: "US-22 → McCoy Rd → Tyson Mill Rd → Millers Fork Rd → saved LAWSON GPS",
      ownerApproval: {
        kind: "owner_approved_directions",
        evidence: "exact_named_road_identities",
        approvedAt: "2026-08-28",
      },
    });
    expect(candidate!.finalLegNotice).toMatch(/exact US-22, McCoy Road, Tyson Mill Road, and Millers Fork Road identities/u);

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
      ownerApproval: {
        kind: "owner_approved_directions",
        evidence: "exact_named_road_identities",
        approvedAt: "2026-08-28",
      },
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
    expect(url.searchParams.get("waypoints")?.split("|")).toEqual(["40.1868067,-80.9781928"]);
    expect(url.searchParams.get("travelmode")).toBe("driving");
    expect(url.searchParams.get("dir_action")).toBe("navigate");
    expect(candidate!.reviewedRoadSequence).not.toContain("→ approved access");
    expect(candidate!.reviewedRoadSequence).not.toContain("Georgetown");
    expect(candidate!.routeUrl).not.toContain("40.18626%2C-80.97647");
    expect(candidate!.routeUrl).not.toContain("40.185875%2C-80.97798");
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

  it("returns TROYER only for its exact record and preserves the validated local-road order", () => {
    const candidate = reviewedNavigationCandidateForPad(troyer());
    expect(candidate).toMatchObject({
      padId: "6c93d03a-76e8-4c03-b47e-8b7011c81a1a",
      routeUrl: TROYER_REVIEWED_GOOGLE_URL,
      reviewedRoadSequence: "US-22 E → McCoy Rd / CR-82 → Pennyroyal Rd / CR-95 → Penrose Rd / CR-694 → Jesse Ln / pad access → saved pad GPS",
      finalLegNotice: expect.stringMatching(/not promoted to approved graph or public-Google authority/u),
    });
    const url = new URL(candidate!.routeUrl);
    expect(url.searchParams.get("origin")).toBeNull();
    expect(url.searchParams.get("destination")).toBe("40.087025,-81.259818");
    expect(url.searchParams.get("waypoints")?.split("|")).toEqual([
      "40.123106982,-81.353948693",
      "40.10466556,-81.273528365",
      "40.083490401,-81.263386973",
    ]);
  });

  it("fails TROYER closed on identity, revision, sequence, destination, or source drift", () => {
    const exact = troyer();
    for (const [field, value] of [
      ["padId", "11111111-1111-4111-8111-111111111111"],
      ["canonicalId", "11111111-1111-4111-8111-111111111111"],
      ["legacyId", "ascent--other"],
      ["recordRevision", "changed"],
      ["company", "Other"],
      ["padName", "TROYER EAST"],
      ["state", "West Virginia"],
      ["county", "Belmont"],
      ["structuredRoadSequence", `${exact.structuredRoadSequence} → changed`],
    ] as const) {
      expect(reviewedNavigationCandidateForPad({ ...exact, [field]: value }), field).toBeNull();
    }
    expect(reviewedNavigationCandidateForPad({
      ...exact,
      mapReference: { ...exact.mapReference!, latitude: 40.087026 },
    })).toBeNull();
    expect(reviewedNavigationCandidateForPad({
      ...exact,
      mapReference: { ...exact.mapReference!, kind: "official_pad_reference" },
    })).toBeNull();
    expect(reviewedNavigationCandidateForPad({ ...exact, mapReference: null })).toBeNull();
  });

  it("returns the batch-6 reviewed routes only for their exact records and ordered controls", () => {
    for (const fixture of batch6ReviewedRouteFixtures()) {
      const candidate = reviewedNavigationCandidateForPad(fixture.pad);
      expect(candidate, fixture.name).toMatchObject({
        padId: fixture.pad.padId,
        routeUrl: fixture.routeUrl,
        reviewedRoadSequence: fixture.reviewedSequence,
        finalLegNotice: expect.stringMatching(fixture.notice),
      });
      const url = new URL(candidate!.routeUrl);
      expect(url.origin, fixture.name).toBe("https://www.google.com");
      expect(url.pathname, fixture.name).toBe("/maps/dir/");
      expect(url.searchParams.get("origin"), fixture.name).toBeNull();
      expect(url.searchParams.get("api"), fixture.name).toBe("1");
      expect(url.searchParams.get("travelmode"), fixture.name).toBe("driving");
      expect(url.searchParams.get("dir_action"), fixture.name).toBe("navigate");
      expect(url.searchParams.get("destination"), fixture.name).toBe(fixture.destination);
      expect(url.searchParams.get("waypoints")?.split("|"), fixture.name).toEqual(fixture.waypoints);

    }
  });

  it("keeps BANNOCK's working Google Navigate URL byte-stable while its map display changes", () => {
    expect(BANNOCK_REVIEWED_GOOGLE_URL).toBe("https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.111003%2C-81.002932&waypoints=40.10871301297529%2C-80.97829303262223");
    expect(reviewedNavigationCandidateForPad(bannock())?.routeUrl).toBe(BANNOCK_REVIEWED_GOOGLE_URL);
  });

  it("fails the batch-6 reviewed routes closed on every record or destination drift", () => {
    for (const fixture of batch6ReviewedRouteFixtures()) {
      const exact = fixture.pad;
      for (const [field, value] of [
        ["padId", "11111111-1111-4111-8111-111111111111"],
        ["canonicalId", "11111111-1111-4111-8111-111111111111"],
        ["legacyId", "ascent--other"],
        ["recordRevision", "changed"],
        ["company", "Other"],
        ["padName", `${fixture.name} EAST`],
        ["state", "West Virginia"],
        ["county", fixture.pad.county === "Belmont" ? "Harrison" : "Belmont"],
        ["structuredRoadSequence", `${exact.structuredRoadSequence} → changed`],
      ] as const) {
        expect(reviewedNavigationCandidateForPad({ ...exact, [field]: value }), `${fixture.name}:${field}`).toBeNull();
      }

      if (exact.coordinate) {
        expect(reviewedNavigationCandidateForPad({ ...exact, coordinate: null }), fixture.name).toBeNull();
        expect(reviewedNavigationCandidateForPad({
          ...exact,
          coordinate: { ...exact.coordinate, longitude: exact.coordinate.longitude - 0.000001 },
        }), fixture.name).toBeNull();
        expect(reviewedNavigationCandidateForPad({
          ...exact,
          coordinate: null,
          mapReference: { latitude: exact.coordinate.latitude, longitude: exact.coordinate.longitude, role: "reference", kind: "saved_pad_reference" },
        }), fixture.name).toBeNull();
      } else {
        expect(reviewedNavigationCandidateForPad({ ...exact, mapReference: null }), fixture.name).toBeNull();
        expect(reviewedNavigationCandidateForPad({
          ...exact,
          mapReference: { ...exact.mapReference!, latitude: exact.mapReference!.latitude + 0.000001 },
        }), fixture.name).toBeNull();
        expect(reviewedNavigationCandidateForPad({
          ...exact,
          coordinate: { latitude: exact.mapReference!.latitude, longitude: exact.mapReference!.longitude, role: "driver_entrance" },
          mapReference: null,
        }), fixture.name).toBeNull();
      }
    }
  });

  it("returns the batch-7 reviewed routes only for their exact records and ordered controls", () => {
    for (const fixture of batch7ReviewedRouteFixtures()) {
      const candidate = reviewedNavigationCandidateForPad(fixture.pad);
      expect(candidate, fixture.name).toMatchObject({
        padId: fixture.pad.padId,
        routeUrl: fixture.routeUrl,
        reviewedRoadSequence: fixture.reviewedSequence,
        finalLegNotice: expect.stringMatching(fixture.notice),
      });
      const url = new URL(candidate!.routeUrl);
      expect(url.origin, fixture.name).toBe("https://www.google.com");
      expect(url.pathname, fixture.name).toBe("/maps/dir/");
      expect(url.searchParams.get("origin"), fixture.name).toBeNull();
      expect(url.searchParams.get("api"), fixture.name).toBe("1");
      expect(url.searchParams.get("travelmode"), fixture.name).toBe("driving");
      expect(url.searchParams.get("dir_action"), fixture.name).toBe("navigate");
      expect(url.searchParams.get("destination"), fixture.name).toBe(fixture.destination);
      expect(url.searchParams.get("waypoints")?.split("|"), fixture.name).toEqual(fixture.waypoints);

    }
  });

  it("fails the batch-7 reviewed routes closed on every record or destination drift", () => {
    for (const fixture of batch7ReviewedRouteFixtures()) {
      const exact = fixture.pad;
      for (const [field, value] of [
        ["padId", "11111111-1111-4111-8111-111111111111"],
        ["canonicalId", "11111111-1111-4111-8111-111111111111"],
        ["legacyId", "ascent--other"],
        ["recordRevision", "changed"],
        ["company", "Other"],
        ["padName", `${fixture.name} EAST`],
        ["state", "West Virginia"],
        ["county", fixture.pad.county === "Belmont" ? "Harrison" : "Belmont"],
        ["structuredRoadSequence", `${exact.structuredRoadSequence} → changed`],
      ] as const) {
        expect(reviewedNavigationCandidateForPad({ ...exact, [field]: value }), `${fixture.name}:${field}`).toBeNull();
      }

      expect(reviewedNavigationCandidateForPad({ ...exact, mapReference: null }), fixture.name).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...exact,
        mapReference: { ...exact.mapReference!, longitude: exact.mapReference!.longitude - 0.000001 },
      }), fixture.name).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...exact,
        coordinate: { latitude: exact.mapReference!.latitude, longitude: exact.mapReference!.longitude, role: "driver_entrance" },
        mapReference: null,
      }), fixture.name).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...exact,
        mapReference: { ...exact.mapReference!, kind: "official_pad_reference" },
      }), fixture.name).toBeNull();
    }
  });

  it("returns the batch-8 reviewed routes only for their exact records and ordered controls", () => {
    for (const fixture of batch8ReviewedRouteFixtures()) {
      const candidate = reviewedNavigationCandidateForPad(fixture.pad);
      expect(candidate, fixture.name).toMatchObject({
        padId: fixture.pad.padId,
        routeUrl: fixture.routeUrl,
        reviewedRoadSequence: fixture.reviewedSequence,
        finalLegNotice: expect.stringMatching(fixture.notice),
      });
      expect(candidate!.detail, fixture.name).toMatch(/unapproved/iu);
      expect(candidate!.reviewedRoadSequence, fixture.name).toMatch(/unapproved/iu);
      expect(candidate!.finalLegNotice, fixture.name).toMatch(/unapproved/iu);
      const url = new URL(candidate!.routeUrl);
      expect(url.origin, fixture.name).toBe("https://www.google.com");
      expect(url.pathname, fixture.name).toBe("/maps/dir/");
      expect(url.searchParams.get("origin"), fixture.name).toBeNull();
      expect(url.searchParams.get("api"), fixture.name).toBe("1");
      expect(url.searchParams.get("travelmode"), fixture.name).toBe("driving");
      expect(url.searchParams.get("dir_action"), fixture.name).toBe("navigate");
      expect(url.searchParams.get("destination"), fixture.name).toBe(fixture.destination);
      expect(url.searchParams.get("waypoints")?.split("|"), fixture.name).toEqual(fixture.waypoints);
    }
  });

  it("fails the batch-8 reviewed routes closed on every record or destination drift", () => {
    for (const fixture of batch8ReviewedRouteFixtures()) {
      const exact = fixture.pad;
      for (const [field, value] of [
        ["padId", "11111111-1111-4111-8111-111111111111"],
        ["canonicalId", "11111111-1111-4111-8111-111111111111"],
        ["legacyId", "ascent--other"],
        ["recordRevision", "changed"],
        ["company", "Other"],
        ["padName", `${fixture.name} EAST`],
        ["state", "West Virginia"],
        ["county", "Harrison"],
        ["structuredRoadSequence", `${exact.structuredRoadSequence} → changed`],
      ] as const) {
        expect(reviewedNavigationCandidateForPad({ ...exact, [field]: value }), `${fixture.name}:${field}`).toBeNull();
      }

      expect(reviewedNavigationCandidateForPad({ ...exact, mapReference: null }), fixture.name).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...exact,
        mapReference: { ...exact.mapReference!, latitude: exact.mapReference!.latitude + 0.000001 },
      }), fixture.name).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...exact,
        mapReference: { ...exact.mapReference!, longitude: exact.mapReference!.longitude - 0.000001 },
      }), fixture.name).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...exact,
        coordinate: { latitude: exact.mapReference!.latitude, longitude: exact.mapReference!.longitude, role: "driver_entrance" },
      }), fixture.name).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...exact,
        coordinate: { latitude: exact.mapReference!.latitude, longitude: exact.mapReference!.longitude, role: "driver_entrance" },
        mapReference: null,
      }), fixture.name).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...exact,
        mapReference: { ...exact.mapReference!, kind: "official_pad_reference" },
      }), fixture.name).toBeNull();
    }
  });

  it("returns the batch-9 reviewed routes only for their exact records and ordered controls", () => {
    for (const fixture of batch9ReviewedRouteFixtures()) {
      const candidate = reviewedNavigationCandidateForPad(fixture.pad);
      expect(candidate, fixture.name).toMatchObject({
        padId: fixture.pad.padId,
        routeUrl: fixture.routeUrl,
        reviewedRoadSequence: fixture.reviewedSequence,
        finalLegNotice: expect.stringMatching(fixture.notice),
      });
      expect(candidate!.detail, fixture.name).toMatch(/unapproved/iu);
      expect(candidate!.reviewedRoadSequence, fixture.name).toMatch(/unapproved/iu);
      expect(candidate!.finalLegNotice, fixture.name).toMatch(/unapproved/iu);
      const url = new URL(candidate!.routeUrl);
      expect(url.origin, fixture.name).toBe("https://www.google.com");
      expect(url.pathname, fixture.name).toBe("/maps/dir/");
      expect(url.searchParams.get("origin"), fixture.name).toBeNull();
      expect(url.searchParams.get("api"), fixture.name).toBe("1");
      expect(url.searchParams.get("travelmode"), fixture.name).toBe("driving");
      expect(url.searchParams.get("dir_action"), fixture.name).toBe("navigate");
      expect(url.searchParams.get("destination"), fixture.name).toBe(fixture.destination);
      expect(url.searchParams.get("waypoints")?.split("|"), fixture.name).toEqual(fixture.waypoints);
    }
  });

  it("fails the batch-9 reviewed routes closed on every record or destination drift", () => {
    for (const fixture of batch9ReviewedRouteFixtures()) {
      const exact = fixture.pad;
      for (const [field, value] of [
        ["padId", "11111111-1111-4111-8111-111111111111"],
        ["canonicalId", "11111111-1111-4111-8111-111111111111"],
        ["legacyId", "ascent--other"],
        ["recordRevision", "changed"],
        ["company", "Other"],
        ["padName", `${fixture.name} EAST`],
        ["state", "West Virginia"],
        ["county", exact.county === "Harrison" ? "Belmont" : "Harrison"],
        ["structuredRoadSequence", `${exact.structuredRoadSequence} → changed`],
      ] as const) {
        expect(reviewedNavigationCandidateForPad({ ...exact, [field]: value }), `${fixture.name}:${field}`).toBeNull();
      }

      expect(reviewedNavigationCandidateForPad({ ...exact, mapReference: null }), fixture.name).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...exact,
        mapReference: { ...exact.mapReference!, latitude: exact.mapReference!.latitude + 0.000001 },
      }), fixture.name).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...exact,
        mapReference: { ...exact.mapReference!, longitude: exact.mapReference!.longitude - 0.000001 },
      }), fixture.name).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...exact,
        coordinate: { latitude: exact.mapReference!.latitude, longitude: exact.mapReference!.longitude, role: "driver_entrance" },
      }), fixture.name).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...exact,
        coordinate: { latitude: exact.mapReference!.latitude, longitude: exact.mapReference!.longitude, role: "driver_entrance" },
        mapReference: null,
      }), fixture.name).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...exact,
        mapReference: { ...exact.mapReference!, kind: "official_pad_reference" },
      }), fixture.name).toBeNull();
    }
  });

  it("keeps VANNELLE on GPS-only navigation after the shared-corridor control backtracked", () => {
    expect(reviewedNavigationCandidateForPad(vannelle())).toBeNull();
  });

  it("returns WINSTON SMITH only for its exact record and three ordered local-road controls", () => {
    const exact = winstonSmith();
    const candidate = reviewedNavigationCandidateForPad(exact);
    expect(candidate).toMatchObject({
      padId: exact.padId,
      routeUrl: WINSTON_SMITH_REVIEWED_GOOGLE_URL,
      reviewedRoadSequence: "Google-selected state-road approach → OH-78 → Archers Ridge Rd / CR-2 → Hill Rd / TR-307 → Gurewicz Rd / TR-303A → unapproved lease/GPS handoff → saved pad GPS",
      finalLegNotice: expect.stringMatching(/exact current identity membership independently proves/u),
    });
    expect(candidate!.detail).toMatch(/unapproved/iu);
    expect(candidate!.finalLegNotice).toMatch(/reviewed handoff rather than graph approval/iu);
    const authorityText = [candidate!.detail, candidate!.reviewedRoadSequence, candidate!.finalLegNotice]
      .join(" ")
      .replace(/\bunapproved\b/giu, "");
    expect(authorityText).not.toMatch(/\bapproved\b|public Google route|graph approved/iu);

    const url = new URL(candidate!.routeUrl);
    expect(url.origin).toBe("https://www.google.com");
    expect(url.pathname).toBe("/maps/dir/");
    expect(url.searchParams.get("origin")).toBeNull();
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("travelmode")).toBe("driving");
    expect(url.searchParams.get("dir_action")).toBe("navigate");
    expect(url.searchParams.get("destination")).toBe("39.752765,-81.396584");
    expect(url.searchParams.get("waypoints")?.split("|")).toEqual([
      "39.774007303642,-81.451385717411",
      "39.754750338267,-81.412456525463",
      "39.747281218039,-81.405362294553",
    ]);
  });

  it("fails WINSTON SMITH closed on identity, revision, source, coordinate, or occurrence drift", () => {
    const exact = winstonSmith();
    for (const [field, value] of [
      ["padId", "11111111-1111-4111-8111-111111111111"],
      ["canonicalId", "11111111-1111-4111-8111-111111111111"],
      ["legacyId", "ascent--other"],
      ["recordRevision", "changed"],
      ["company", "Other"],
      ["padName", "WINSTON SMITH EAST"],
      ["state", "West Virginia"],
      ["county", "Harrison"],
      ["structuredRoadSequence", "I-77 → OH-78 → Gurewicz Rd → Lease Road"],
    ] as const) {
      expect(reviewedNavigationCandidateForPad({ ...exact, [field]: value }), field).toBeNull();
    }

    expect(reviewedNavigationCandidateForPad({ ...exact, mapReference: null })).toBeNull();
    expect(reviewedNavigationCandidateForPad({
      ...exact,
      mapReference: { ...exact.mapReference!, latitude: exact.mapReference!.latitude + 0.000001 },
    })).toBeNull();
    expect(reviewedNavigationCandidateForPad({
      ...exact,
      mapReference: { ...exact.mapReference!, longitude: exact.mapReference!.longitude - 0.000001 },
    })).toBeNull();
    expect(reviewedNavigationCandidateForPad({
      ...exact,
      mapReference: { ...exact.mapReference!, kind: "official_pad_reference" },
    })).toBeNull();
    expect(reviewedNavigationCandidateForPad({
      ...exact,
      coordinate: { latitude: 39.752765, longitude: -81.396584, role: "driver_entrance" },
      mapReference: null,
    })).toBeNull();
  });

  it("returns the new shared-corridor routes only for their exact records and ordered controls", () => {
    for (const fixture of batch5SharedCorridorFixtures()) {
      const candidate = reviewedNavigationCandidateForPad(fixture.pad);
      expect(candidate, fixture.name).toMatchObject({
        padId: fixture.pad.padId,
        routeUrl: fixture.routeUrl,
        reviewedRoadSequence: fixture.reviewedSequence,
        finalLegNotice: expect.stringMatching(fixture.notice),
      });
      const url = new URL(candidate!.routeUrl);
      expect(url.origin, fixture.name).toBe("https://www.google.com");
      expect(url.searchParams.get("origin"), fixture.name).toBeNull();
      expect(url.searchParams.get("api"), fixture.name).toBe("1");
      expect(url.searchParams.get("travelmode"), fixture.name).toBe("driving");
      expect(url.searchParams.get("dir_action"), fixture.name).toBe("navigate");
      expect(url.searchParams.get("destination"), fixture.name).toBe(fixture.destination);
      expect(url.searchParams.get("waypoints")?.split("|"), fixture.name).toEqual(fixture.waypoints);
    }
  });

  it("fails the new shared-corridor routes closed on every record or destination drift", () => {
    for (const fixture of batch5SharedCorridorFixtures()) {
      const exact = fixture.pad;
      for (const [field, value] of [
        ["padId", "11111111-1111-4111-8111-111111111111"],
        ["canonicalId", "11111111-1111-4111-8111-111111111111"],
        ["legacyId", "ascent--other"],
        ["recordRevision", "changed"],
        ["company", "Other"],
        ["padName", `${fixture.name} EAST`],
        ["state", "West Virginia"],
        ["county", fixture.pad.county === "Belmont" ? "Guernsey" : "Belmont"],
        ["structuredRoadSequence", `${exact.structuredRoadSequence} → changed`],
      ] as const) {
        expect(reviewedNavigationCandidateForPad({ ...exact, [field]: value }), `${fixture.name}:${field}`).toBeNull();
      }

      if (exact.coordinate) {
        expect(reviewedNavigationCandidateForPad({ ...exact, coordinate: null }), fixture.name).toBeNull();
        expect(reviewedNavigationCandidateForPad({
          ...exact,
          coordinate: { ...exact.coordinate, latitude: exact.coordinate.latitude + 0.000001 },
        }), fixture.name).toBeNull();
        expect(reviewedNavigationCandidateForPad({
          ...exact,
          coordinate: null,
          mapReference: { latitude: exact.coordinate.latitude, longitude: exact.coordinate.longitude, role: "reference", kind: "saved_pad_reference" },
        }), fixture.name).toBeNull();
      } else {
        expect(reviewedNavigationCandidateForPad({ ...exact, mapReference: null }), fixture.name).toBeNull();
        expect(reviewedNavigationCandidateForPad({
          ...exact,
          mapReference: { ...exact.mapReference!, longitude: exact.mapReference!.longitude - 0.000001 },
        }), fixture.name).toBeNull();
        expect(reviewedNavigationCandidateForPad({
          ...exact,
          mapReference: { ...exact.mapReference!, kind: "official_pad_reference" },
        }), fixture.name).toBeNull();
      }
    }
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

      if (fixture.name === "SKULL FORK") {
        expect(candidate!.finalLegNotice).toMatch(/Cadiz Road \/ US-22 → Repik Lane \/ TR-9876 → SKULL FORK's exact trusted pin/u);
        expect(candidate!.finalLegNotice).toMatch(/does not invent a pad-deck point/u);
        expect(candidate!.routeUrl).toBe(SKULL_FORK_REVIEWED_GOOGLE_URL);
      }
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

  it("returns the six evidence-passing first-wave handoffs with exact phone-origin controls", () => {
    for (const fixture of firstI70WaveRouteFixtures()) {
      const candidate = reviewedNavigationCandidateForPad(fixture.pad);
      expect(candidate, fixture.name).toMatchObject({
        padId: fixture.pad.padId,
        title: "Navigate reviewed route",
        routeUrl: fixture.routeUrl,
        ownerApproval: undefined,
        preserveMeasuredApproach: undefined,
      });
      expect(candidate?.detail, fixture.name).toMatch(/unapproved/iu);
      expect(candidate?.reviewedRoadSequence, fixture.name).toMatch(/unapproved/iu);
      expect(candidate?.finalLegNotice, fixture.name).toMatch(/not official road or navigation geometry|does not rewrite the exact directory record or create official road geometry/iu);
      expect(candidate?.finalLegNotice, fixture.name).toMatch(fixture.notice);
      expect(fixture.routeUrl, fixture.name).toBe(fixture.expectedUrl);

      const url = new URL(candidate!.routeUrl);
      expect(url.searchParams.get("origin"), fixture.name).toBeNull();
      expect(url.searchParams.get("api"), fixture.name).toBe("1");
      expect(url.searchParams.get("travelmode"), fixture.name).toBe("driving");
      expect(url.searchParams.get("dir_action"), fixture.name).toBe("navigate");
      expect(url.searchParams.get("destination"), fixture.name).toBe(fixture.destination);
      expect(url.searchParams.get("waypoints")?.split("|"), fixture.name).toEqual(fixture.waypoints);
    }
  });

  it("fails every first-wave handoff closed on exact record or saved-destination drift", () => {
    for (const fixture of firstI70WaveRouteFixtures()) {
      const exact = fixture.pad;
      for (const [field, value] of [
        ["padId", "11111111-1111-4111-8111-111111111111"],
        ["canonicalId", "11111111-1111-4111-8111-111111111111"],
        ["legacyId", "ascent--other"],
        ["recordRevision", "changed"],
        ["company", "Other"],
        ["padName", `${fixture.name} EAST`],
        ["state", "West Virginia"],
        ["county", fixture.pad.county === "Belmont" ? "Guernsey" : "Belmont"],
        ["structuredRoadSequence", `${fixture.pad.structuredRoadSequence} → changed`],
      ] as const) {
        expect(reviewedNavigationCandidateForPad({ ...exact, [field]: value }), `${fixture.name}:${field}`)
          .toBeNull();
      }
      expect(reviewedNavigationCandidateForPad({ ...exact, mapReference: null }), fixture.name).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...exact,
        mapReference: { ...exact.mapReference!, longitude: exact.mapReference!.longitude + 0.000001 },
      }), fixture.name).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...exact,
        mapReference: { ...exact.mapReference!, kind: "official_pad_reference" },
      }), fixture.name).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...exact,
        coordinate: {
          latitude: exact.mapReference!.latitude,
          longitude: exact.mapReference!.longitude,
          role: "driver_entrance",
        },
        mapReference: null,
      }), fixture.name).toBeNull();
    }
  });

  it("returns the six exact-match highway-direct handoffs with one terminal-road control", () => {
    for (const record of ascentSavedDirectionExactMatchBatch1) {
      const pad = exactMatchBatch1Pad(record);
      const candidate = reviewedNavigationCandidateForPad(pad);
      expect(candidate, record.padName).toMatchObject({
        padId: record.padId,
        title: record.title,
        detail: record.detail,
        reviewedRoadSequence: record.reviewedRoadSequence,
        finalLegNotice: record.finalLegNotice,
        preserveMeasuredApproach: true,
        ownerApproval: undefined,
      });
      const expectedUrl = buildReviewedNavigationUrl(record.routeDestination, record.waypoints);
      expect(candidate?.routeUrl, record.padName).toBe(expectedUrl);
      expect(reviewedNavigationUrlMatchesContract(
        candidate!.routeUrl,
        record.routeDestination,
        record.waypoints,
      ), record.padName).toBe(true);
      const url = new URL(candidate!.routeUrl);
      expect(url.searchParams.get("origin"), record.padName).toBeNull();
      expect(url.searchParams.get("destination"), record.padName)
        .toBe(`${record.routeDestination.latitude},${record.routeDestination.longitude}`);
      expect(url.searchParams.get("waypoints")?.split("|"), record.padName).toEqual([
        `${record.waypoints[0].latitude},${record.waypoints[0].longitude}`,
      ]);
    }
  });

  it("fails every exact-match highway-direct handoff closed on record or destination drift", () => {
    for (const record of ascentSavedDirectionExactMatchBatch1) {
      const exact = exactMatchBatch1Pad(record);
      for (const [field, value] of [
        ["padId", "11111111-1111-4111-8111-111111111111"],
        ["canonicalId", "11111111-1111-4111-8111-111111111111"],
        ["legacyId", "ascent--other"],
        ["recordRevision", "changed"],
        ["company", "Other"],
        ["padName", `${record.padName} EAST`],
        ["state", "West Virginia"],
        ["county", record.county === "Belmont" ? "Guernsey" : "Belmont"],
        ["structuredRoadSequence", `${record.structuredRoadSequence} → changed`],
      ] as const) {
        expect(reviewedNavigationCandidateForPad({ ...exact, [field]: value }), `${record.padName}:${field}`)
          .toBeNull();
      }
      expect(reviewedNavigationCandidateForPad({ ...exact, mapReference: null }), record.padName).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...exact,
        mapReference: { ...exact.mapReference!, longitude: exact.mapReference!.longitude + 0.000001 },
      }), record.padName).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...exact,
        mapReference: { ...exact.mapReference!, kind: "official_pad_reference" },
      }), record.padName).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...exact,
        coordinate: {
          latitude: record.trustedDestination.latitude,
          longitude: record.trustedDestination.longitude,
          role: "driver_entrance",
        },
        mapReference: null,
      }), record.padName).toBeNull();
    }
  });

  it("keeps all twelve additional handoffs outside the 46 owner-approval receipts", () => {
    const contracts = reviewedNavigationContractRowsForAudit();
    const receiptRows = ownerApprovalReceiptRowsForAudit();
    expect(contracts).toHaveLength(58);
    expect(receiptRows).toHaveLength(46);
    expect(receiptRows.every((row) => row.matchesCurrentContent)).toBe(true);
    const receiptIds = new Set<string>(receiptRows.map((row) => row.padId));
    const ownerReceipted = contracts.filter((contract) => receiptIds.has(contract.padId));
    expect(ownerReceipted).toHaveLength(46);
    expect(ownerReceipted.every((contract) => contract.preserveMeasuredApproach === false)).toBe(true);
    const unreceipted = contracts.filter((contract) => !receiptIds.has(contract.padId));
    expect(unreceipted.map((contract) => contract.padId).sort()).toEqual(
      [
        ...ascentSavedDirectionExactMatchBatch1.map((record) => record.padId),
        ...firstI70WaveRouteFixtures().map((fixture) => fixture.pad.padId),
      ].sort(),
    );
    const measuredApproachIds = new Set<string>(ascentSavedDirectionExactMatchBatch1.map((record) => record.padId));
    for (const contract of unreceipted) {
      expect(contract.ownerApproval, contract.padName).toBeNull();
      expect(contract.detail, contract.padName).toMatch(/unapproved/iu);
      if (measuredApproachIds.has(contract.padId)) {
        expect(contract.preserveMeasuredApproach, contract.padName).toBe(true);
        expect(contract.finalLegNotice, contract.padName).toMatch(/not road or navigation geometry/iu);
      } else {
        expect(contract.preserveMeasuredApproach, contract.padName).toBe(false);
        expect(contract.selectedTerminalPublicRoadSequence, contract.padName).toEqual([]);
      }
    }
  });
});
