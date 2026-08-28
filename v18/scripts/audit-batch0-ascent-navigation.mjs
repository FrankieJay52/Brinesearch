import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const outputCsv = path.join(repositoryRoot, "docs", "batch0-ascent-six-county-navigation-ledger-20260827.csv");
const outputMarkdown = path.join(repositoryRoot, "docs", "batch0-ascent-six-county-navigation-ledger-20260827.md");
const generatedAuditPaths = new Set([
  "docs/batch0-ascent-six-county-navigation-ledger-20260827.csv",
  "docs/batch0-ascent-six-county-navigation-ledger-20260827.md",
]);
const counties = ["Belmont", "Guernsey", "Harrison", "Jefferson", "Monroe", "Noble"];

const explicitStates = new Map([
  ["d7898e8c-1bb6-48f8-b5e0-87bc1898420e", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "BAKOS exact-record US-250 and Holly View Drive reviewed handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "d7898e8c-1bb6-48f8-b5e0-87bc1898420e",
      legacyId: "ascent--bakos",
      recordRevision: "1787615581785257",
      company: "Ascent",
      padName: "BAKOS",
      state: "Ohio",
      county: "Belmont",
      structuredRoadSequence: "US-250 → Right/west Onto Holly View Dr → OR → Holly View Dr → Pad → OR → US-250 → Left/west Onto Holy View Dr → No St Sign And Rd",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.151125, longitude: -80.852968 },
    },
  }],
  ["333598ca-37b3-4b44-9411-a490cc3da672", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff reaches the verified entrance; graph and public-Google authority remain held.",
    receipt: "BANNOCK exact-record OH-331 and Lafferty-Bannock Road reviewed entrance handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "333598ca-37b3-4b44-9411-a490cc3da672",
      legacyId: "ascent--bannock",
      recordRevision: "1786744183028038",
      company: "Ascent",
      padName: "BANNOCK",
      state: "Ohio",
      county: "Belmont",
      structuredRoadSequence: "I-70 → Exit 213 → OH-331 → Lafferty-bannock Rd → Lease Road → OR → OH-9 → OH-149 → OH-331 → Lafferty-bannock Rd",
      directoryDestination: { gpsSource: "saved", coordinateRole: "verified driver entrance", latitude: 40.111003, longitude: -81.002932 },
    },
  }],
  ["166c5d6c-3a8d-4481-b8bf-5d74b7605f0d", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff reaches the verified entrance; graph and public-Google authority remain held.",
    receipt: "SADLER exact-record US-250 and Jamison Road reviewed entrance handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "166c5d6c-3a8d-4481-b8bf-5d74b7605f0d",
      legacyId: "ascent--sadler",
      recordRevision: "1786440150388625",
      company: "Ascent",
      padName: "SADLER",
      state: "Ohio",
      county: "Harrison",
      structuredRoadSequence: "US-250 → CR-86 / Jamison Rd → Pad",
      directoryDestination: { gpsSource: "saved", coordinateRole: "verified driver entrance", latitude: 40.207568, longitude: -80.935841 },
    },
  }],
  ["800c877a-6b4f-4a87-a710-b1e00af63c62", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff reaches the verified entrance; graph and public-Google authority remain held.",
    receipt: "TOWE exact-record US-250, Willis Run, and Oak Hill Road reviewed entrance handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "800c877a-6b4f-4a87-a710-b1e00af63c62",
      legacyId: "ascent--towe",
      recordRevision: "1786159709605865",
      company: "Ascent",
      padName: "TOWE",
      state: "Ohio",
      county: "Harrison",
      structuredRoadSequence: "Willis Run Rd → Oak Hill Rd → Pad",
      directoryDestination: { gpsSource: "saved", coordinateRole: "verified driver entrance", latitude: 40.385998, longitude: -81.212569 },
    },
  }],
  ["e2b32e85-9e93-4388-8215-9d8167cbbeb8", {
    state: "1",
    blocker: "",
    receipt: "Cologie exact public route and reviewed Google handoff",
  }],
  ["518659d9-bca2-47b0-b294-3141ba679fc4", {
    state: "2",
    blocker: "Approved public-road core ends at its exact handoff; the final saved-GPS leg is not approved geometry.",
    receipt: "LASSO frozen exact-core destination release",
  }],
  ["185d9eb6-58af-4009-bf53-fdd23113a572", {
    state: "2",
    blocker: "Approved named public-road approaches end at an exact handoff; the final saved-GPS leg is not approved geometry.",
    receipt: "CARDINAL named-approach release",
  }],
  ["95dcbd15-afd0-4357-a521-e23bcd6b4118", {
    state: "2",
    blocker: "Approved named public-road approaches end at an exact handoff; the final saved-GPS leg is not approved geometry.",
    receipt: "CONOTTON named-approach release",
  }],
  ["61e21e3c-360b-40b0-8153-209b4fb3d5eb", {
    state: "2",
    blocker: "Approved named public-road approaches end at an exact handoff; the final saved-GPS leg is not approved geometry.",
    receipt: "ELLEN named-approach release",
  }],
  ["b9a8e55c-3583-4019-85fc-54a03d420ace", {
    state: "2",
    blocker: "Approved named public-road approaches end at an exact handoff; the final saved-GPS leg is not approved geometry.",
    receipt: "HAMILTON named-approach release",
  }],
  ["655a97d5-ffdf-4b13-bf66-3d22022239b4", {
    state: "2",
    blocker: "Approved named public-road approaches end at an exact handoff; the final saved-GPS leg is not approved geometry.",
    receipt: "PETTAY named-approach release",
  }],
  ["f5a82acf-d7c0-4ce3-ad4e-0de810551450", {
    state: "2",
    blocker: "Approved named public-road approaches end at an exact handoff; the final saved-GPS leg is not approved geometry.",
    receipt: "SPROULL named-approach release",
  }],
  ["b7526e45-0b33-4988-ae1c-0a4140971f8e", {
    state: "2",
    blocker: "The approved OH-519 road core ends at the lease handoff; the final leg to the saved pin is GPS-only.",
    receipt: "BANJO frozen OH-519 named approach",
  }],
  ["0e6f23f1-3bfb-44b0-aa4e-f24dde611880", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "BEETLE exact-record Sixteen Road reviewed handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "0e6f23f1-3bfb-44b0-aa4e-f24dde611880",
      legacyId: "ascent--beetle",
      recordRevision: "1787459253071652",
      company: "Ascent",
      padName: "BEETLE",
      state: "Ohio",
      county: "Harrison",
      structuredRoadSequence: "OH-519 → US-250 → Pad",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.185403, longitude: -80.922718 },
    },
  }],
  ["75600d0c-17b8-488b-96c9-4b7b8ffc8b1b", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff reaches the verified entrance; graph and public-Google authority remain held.",
    receipt: "PICKENS exact-record OH-519 turn reviewed handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "75600d0c-17b8-488b-96c9-4b7b8ffc8b1b",
      legacyId: "ascent--pickens",
      recordRevision: "1787615581785257",
      company: "Ascent",
      padName: "PICKENS",
      state: "Ohio",
      county: "Harrison",
      structuredRoadSequence: "OH-9 south → Turn left onto OH-519 east → Turn right onto Lease Road",
      directoryDestination: { gpsSource: "saved", coordinateRole: "verified driver entrance", latitude: 40.182544, longitude: -80.977135 },
    },
  }],
  ["bb351070-6c94-45e5-942f-e155f9e86f7e", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "DUKE exact-record Cologie-corridor reviewed handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "bb351070-6c94-45e5-942f-e155f9e86f7e",
      legacyId: "ascent--duke",
      recordRevision: "1786265812046205",
      company: "Ascent",
      padName: "DUKE",
      state: "Ohio",
      county: "Harrison",
      structuredRoadSequence: "US-250 → Foxes Bottom Rd → Springdale Hill Rd → Lamborn Rd",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.214409, longitude: -80.891316 },
    },
  }],
  ["0b7105a0-1b36-4182-8d10-1f2e297c8bab", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "PORTERFIELD GAS UNIT exact-record Vineyard Road reviewed handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "0b7105a0-1b36-4182-8d10-1f2e297c8bab",
      legacyId: "ascent--porterfield-gas-unit",
      recordRevision: "1786258360881449",
      company: "Ascent",
      padName: "PORTERFIELD GAS UNIT",
      state: "Ohio",
      county: "Belmont",
      structuredRoadSequence: "I-70 → Exit 215 → US-40 → Vineyard Rd → OR → OH-331 → US-40 → Vineyard Rd",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.090431, longitude: -80.928503 },
    },
  }],
  ["41f0bfc3-7be1-450f-abfc-96dce544547b", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "PORTERFIELD B exact-record Vineyard Road reviewed handoff clipped at its own saved GPS",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "41f0bfc3-7be1-450f-abfc-96dce544547b",
      legacyId: "ascent--porterfield-b",
      recordRevision: "1786258360881449",
      company: "Ascent",
      padName: "PORTERFIELD B",
      state: "Ohio",
      county: "Belmont",
      structuredRoadSequence: "I-70 → Exit 215 → US-40 → Vineyard Rd → Lease Road → OR → OH-331 → US-40 → Vineyard Rd → Lease Road",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.090438, longitude: -80.921210 },
    },
  }],
  ["19a4f7ef-4334-4b1c-8443-2c5ccb323d1d", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff reaches the verified entrance; graph and public-Google authority remain held.",
    receipt: "ROCK RIDGE exact-record Shannon, Lowe, Fairview, Douglas/Fairview, and Putney Ridge reviewed entrance handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "19a4f7ef-4334-4b1c-8443-2c5ccb323d1d",
      legacyId: "ascent--rock-ridge",
      recordRevision: "1786265812046205",
      company: "Ascent",
      padName: "ROCK RIDGE",
      state: "Ohio",
      county: "Belmont",
      structuredRoadSequence: "I-70 → Exit 202 → OH-800 → Shannon Rd → Lowe Rd → 1st Cross Rd → Fairview Rd → Douglas/fairview Rd → Putney Ridge Rd → Lease Road",
      directoryDestination: { gpsSource: "saved", coordinateRole: "verified driver entrance", latitude: 39.998772, longitude: -81.224825 },
    },
  }],
  ["143f5268-33e4-4598-8101-40220b5cfdc4", {
    state: "reviewed_handoff_authority_held",
    blocker: "A record-bound reviewed handoff exists, but approved graph and public-Google authority remain held.",
    receipt: "LAWSON record-bound reviewed handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "143f5268-33e4-4598-8101-40220b5cfdc4",
      legacyId: "ascent--lawson",
      recordRevision: "1786258360881449",
      company: "Ascent",
      padName: "LAWSON",
      state: "Ohio",
      county: "Guernsey",
      structuredRoadSequence: "US-22 → Mc Coy Rd → Tyson Mill Rd → Millers Fork Rd → OR → US-250 → US-22 → Mc Coy Rd → Tyson Mill Rd → Millers Fork Rd → OR → I-70 → Exit 193 → OH-513 → US-22 → Mc Coy Rd → Tyson Mill Rd → Millers Fork Rd",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.124991, longitude: -81.295913 },
    },
  }],
  ["59061829-1122-4aae-872d-cf5024310373", {
    state: "reviewed_handoff_authority_held",
    blocker: "The frozen no-Blaze reviewed handoff works, but approved graph and public-Google authority remain held.",
    receipt: "BILINOVICH frozen PR #174 no-Blaze handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "59061829-1122-4aae-872d-cf5024310373",
      legacyId: "ascent--bilinovich",
      recordRevision: "1787802711836476",
      company: "Ascent",
      padName: "BILINOVICH",
      state: "Ohio",
      county: "Guernsey",
      structuredRoadSequence: "US-22 E → McCoy Rd / CR-82 → Merry Rd / TR-967 → Penrose Rd / CR-694 → Logan Rd / CR-964 → Turkle Rd / TR-693 → trusted lease approach → BILINOVICH",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.08863, longitude: -81.304164 },
    },
    actionDestination: {
      gpsSource: "ODNR pad",
      latitude: 40.08738445,
      longitude: -81.30282620,
    },
  }],
  ["fba35b8e-ccc6-406b-b27c-ac9ce4eed29d", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "CROWIE exact-record Vineyard and Williams Road reviewed handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "fba35b8e-ccc6-406b-b27c-ac9ce4eed29d",
      legacyId: "ascent--crowie",
      recordRevision: "1786265812046205",
      company: "Ascent",
      padName: "CROWIE",
      state: "Ohio",
      county: "Belmont",
      structuredRoadSequence: "Exit 215 → US-40 → Vineyard Rd → Williams Rd → OR → Exit 213 → US-40",
      directoryDestination: { gpsSource: "saved", coordinateRole: "verified driver entrance", latitude: 40.0979, longitude: -80.9384 },
    },
  }],
  ["58c94af4-32b1-4f80-a278-a5f73688fa23", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "CASTON exact-record McCoy, Jasper, and Caston Road reviewed handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "58c94af4-32b1-4f80-a278-a5f73688fa23",
      legacyId: "ascent--caston",
      recordRevision: "1786258360881449",
      company: "Ascent",
      padName: "CASTON",
      state: "Ohio",
      county: "Guernsey",
      structuredRoadSequence: "US-22 → Mc Coy Rd → Jasper Rd → Caston Rd → OR → OH-513 → US-22 → Mc Coy Rd → Jasper Rd → Caston Rd",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.130458, longitude: -81.328059 },
    },
  }],
  ["bd2e0e20-8aa8-4e05-a4c0-0af312234853", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "GIL exact-record McCoy, Merry, Penrose, and Logan Road reviewed handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "bd2e0e20-8aa8-4e05-a4c0-0af312234853",
      legacyId: "ascent--gil",
      recordRevision: "1786258360881449",
      company: "Ascent",
      padName: "GIL",
      state: "Ohio",
      county: "Guernsey",
      structuredRoadSequence: "US-22 / Mccoy Rd → Mccoy Rd → Merry Rd → Penrose Rd → Logan Rd → Lease Road",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.09387, longitude: -81.29646 },
    },
  }],
  ["71c9c874-5514-46a4-8d91-b105c6734799", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "GILCHER exact-record McCoy, Merry, and Penrose Road reviewed handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "71c9c874-5514-46a4-8d91-b105c6734799",
      legacyId: "ascent--gilcher",
      recordRevision: "1786258360881449",
      company: "Ascent",
      padName: "GILCHER",
      state: "Ohio",
      county: "Guernsey",
      structuredRoadSequence: "US-22 → Mc Coy Rd → Merry Rd → Penrose Rd → OR → OH-513 → US-22 → Mc Coy Rd → Merry Rd → Penrose Rd",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.100079, longitude: -81.295657 },
    },
  }],
  ["ccf7415a-331b-440a-829d-28282a33cde1", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "LAKE exact-record McCoy, Tyson Mill, and Pennyroyal Road reviewed handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "ccf7415a-331b-440a-829d-28282a33cde1",
      legacyId: "ascent--lake",
      recordRevision: "1786258360881449",
      company: "Ascent",
      padName: "LAKE",
      state: "Ohio",
      county: "Guernsey",
      structuredRoadSequence: "US-22 → Mc Coy Rd → Tyson Mill Rd → Pennyroyal Rd → OR → US-250 → US-22 → Mc Coy Rd → Tyson Mill Rd → Pennyroyal Rd → OR → I-70 → Exit 193 → OH-513 → US-22 → Mc Coy Rd → Tyson Mill Rd → Pennyroyal Rd",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.14776, longitude: -81.295527 },
    },
  }],
  ["1e898176-672d-4174-8878-4aae0aee2128", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "THOMAS exact-record OH-513 and Tyson Mill Road reviewed handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "1e898176-672d-4174-8878-4aae0aee2128",
      legacyId: "ascent--thomas",
      recordRevision: "1786265812046205",
      company: "Ascent",
      padName: "THOMAS",
      state: "Ohio",
      county: "Guernsey",
      structuredRoadSequence: "I-70 → Exit 193 → OH-513 → Tyson Mill Rd → Lease Road",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.096986, longitude: -81.307667 },
    },
  }],
  ["6c93d03a-76e8-4c03-b47e-8b7011c81a1a", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "TROYER exact-record McCoy, Pennyroyal, Penrose, and Jesse Lane pad-access reviewed handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "6c93d03a-76e8-4c03-b47e-8b7011c81a1a",
      legacyId: "ascent--troyer",
      recordRevision: "1786258360881449",
      company: "Ascent",
      padName: "TROYER",
      state: "Ohio",
      county: "Guernsey",
      structuredRoadSequence: "US-22 → Mc Coy Rd → Pennyroyal Rd → Penrose Rd → OR → OH-513 → US-22 → Mc Coy Rd → Pennyroyal Rd → Penrose Rd",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.087025, longitude: -81.259818 },
    },
  }],
  ["b22c557a-950a-4ed7-a65a-f4730b9bc727", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff reaches the verified entrance; graph and public-Google authority remain held.",
    receipt: "CIRCLE-OAKS exact-record OH-258, Martha, and Titus Road reviewed entrance handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "b22c557a-950a-4ed7-a65a-f4730b9bc727",
      legacyId: "ascent--circle-oaks",
      recordRevision: "1787459253071652",
      company: "Ascent",
      padName: "CIRCLE-OAKS",
      state: "Ohio",
      county: "Guernsey",
      structuredRoadSequence: "OH-342 → OH-258 → Martha Rd → Titus Rd → Pad",
      directoryDestination: { gpsSource: "saved", coordinateRole: "verified driver entrance", latitude: 40.176413, longitude: -81.348770 },
    },
  }],
  ["48d810bf-e59f-4314-9efb-8103a818a3bd", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "ALBATROSS exact-record Brooks Road reviewed local approach; final saved-GPS handoff unapproved",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "48d810bf-e59f-4314-9efb-8103a818a3bd",
      legacyId: "ascent--albatross",
      recordRevision: "1786265812046205",
      company: "Ascent",
      padName: "ALBATROSS",
      state: "Ohio",
      county: "Belmont",
      structuredRoadSequence: "I-70 → Exit 202 → OH-800 → Brooks Rd",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.079353, longitude: -81.224381 },
    },
  }],
  ["8f616827-d7da-4b40-b9c2-49fd5e713822", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "MALDON exact-record Shannon and Lowe Road reviewed local approach; final saved-GPS handoff unapproved",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "8f616827-d7da-4b40-b9c2-49fd5e713822",
      legacyId: "ascent--maldon",
      recordRevision: "1786265812046205",
      company: "Ascent",
      padName: "MALDON",
      state: "Ohio",
      county: "Belmont",
      structuredRoadSequence: "I-70 → Exit 202 → OH-800 → Shannon Rd → Lowe Rd → Pad",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.010241, longitude: -81.197285 },
    },
  }],
  ["f2df293f-13a2-401e-96b2-21e71ac63e6a", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "WITHEY exact-record Gobblers Knob Road reviewed entrance handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "f2df293f-13a2-401e-96b2-21e71ac63e6a",
      legacyId: "ascent--withey",
      recordRevision: "1786246617744175",
      company: "Ascent",
      padName: "WITHEY",
      state: "Ohio",
      county: "Belmont",
      structuredRoadSequence: "Exit 202 → I-70 → OH-800 → Gobblers Knob Rd → Lease Road",
      directoryDestination: { gpsSource: "saved", coordinateRole: "verified driver entrance", latitude: 39.962005, longitude: -81.216813 },
    },
  }],
  ["06ac93a2-3b46-44fd-9fa6-2fd29201858a", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "SKULL FORK exact-record Repik Lane reviewed entrance handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "06ac93a2-3b46-44fd-9fa6-2fd29201858a",
      legacyId: "ascent--skull-fork",
      recordRevision: "1787459253071652",
      company: "Ascent",
      padName: "SKULL FORK",
      state: "Ohio",
      county: "Guernsey",
      structuredRoadSequence: "I-70 → Exit 202 → OH-800 → US-22 → Repik Ln → Pad",
      directoryDestination: { gpsSource: "saved", coordinateRole: "verified driver entrance", latitude: 40.159734, longitude: -81.260675 },
    },
  }],
  ["351b72fb-eb48-4355-b6fc-d8e9a867f79c", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "HOOP exact-record US-22 and Titus Road reviewed approach; post-Titus GPS/lease tail unapproved",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "351b72fb-eb48-4355-b6fc-d8e9a867f79c",
      legacyId: "ascent--hoop",
      recordRevision: "1787459253071652",
      company: "Ascent",
      padName: "HOOP",
      state: "Ohio",
      county: "Guernsey",
      structuredRoadSequence: "I-77 → US-22 → Titus Rd → Lease Road",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.166384, longitude: -81.325728 },
    },
  }],
  ["4c73e244-6132-4d40-83fc-3fe5e6e65bf6", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "BRAVO exact-record Hite Road reviewed local approach; Google Crazy Road label is display-only and final GPS/lease tail unapproved",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "4c73e244-6132-4d40-83fc-3fe5e6e65bf6",
      legacyId: "ascent--bravo",
      recordRevision: "1786265812046205",
      company: "Ascent",
      padName: "BRAVO",
      state: "Ohio",
      county: "Harrison",
      structuredRoadSequence: "OH-519 → Hite Rd → Lease Road",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.178556, longitude: -81.015064 },
    },
  }],
  ["7dcd1f71-fa32-4edc-ae3d-aa9717d0c72c", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "RUTH exact-record US-250 reviewed approach; final entrance movement unapproved",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "7dcd1f71-fa32-4edc-ae3d-aa9717d0c72c",
      legacyId: "ascent--ruth",
      recordRevision: "1787459253071652",
      company: "Ascent",
      padName: "RUTH",
      state: "Ohio",
      county: "Jefferson",
      structuredRoadSequence: "US-250 E → Lease Road",
      directoryDestination: { gpsSource: "saved", coordinateRole: "verified driver entrance", latitude: 40.173626, longitude: -80.879115 },
    },
  }],
  ["3850e94a-826f-4b6b-a54f-d21d482fca46", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "ATHENA exact-record OH-151 reviewed local approach; final saved-GPS handoff unapproved",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "3850e94a-826f-4b6b-a54f-d21d482fca46",
      legacyId: "ascent--athena",
      recordRevision: "1787459253071652",
      company: "Ascent",
      padName: "ATHENA",
      state: "Ohio",
      county: "Jefferson",
      structuredRoadSequence: "OH-151 → Pad",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.278613, longitude: -80.765988 },
    },
  }],
  ["0b675c3f-2c04-4901-955d-8629e7dba05e", {
    state: "3",
    blocker: "The West Grove lease-end receipt does not approve route geometry or a Google handoff; use the saved GPS destination only.",
    receipt: "UNA frozen West Grove lease endpoint plus trusted GPS fallback",
  }],
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function csv(value) {
  const raw = String(value ?? "");
  const text = typeof value === "string" && /^[\s\uFEFF]*[=+\-@]/u.test(value) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function reviewedBindingForPad(padId) {
  return explicitStates.get(padId)?.reviewedBinding || null;
}

export function reviewedActionDestinationForPad(padId) {
  return explicitStates.get(padId)?.actionDestination || null;
}

export function explicitReceiptForPad(padId) {
  return explicitStates.get(padId)?.receipt || null;
}

export function reviewedBindingMatches(row, directoryDestination, binding) {
  if (!binding || !directoryDestination) return false;
  return row.padId === binding.padId
    && row.legacyId === binding.legacyId
    && String(row.recordRevision) === binding.recordRevision
    && row.company === binding.company
    && row.padName === binding.padName
    && row.state === binding.state
    && row.county === binding.county
    && row.structuredRoadSequence === binding.structuredRoadSequence
    && directoryDestination.gpsSource === binding.directoryDestination.gpsSource
    && directoryDestination.coordinateRole === binding.directoryDestination.coordinateRole
    && Math.abs(directoryDestination.latitude - binding.directoryDestination.latitude) <= 1e-9
    && Math.abs(directoryDestination.longitude - binding.directoryDestination.longitude) <= 1e-9;
}

export function candidateContentDigest(entries) {
  const digest = createHash("sha256");
  for (const entry of [...entries].sort((left, right) => left.path.localeCompare(right.path))) {
    digest.update(entry.path);
    digest.update("\0");
    digest.update(entry.content);
    digest.update("\0");
  }
  return digest.digest("hex");
}

export function hostedBuildArtifact(relativePath) {
  const normalized = String(relativePath).replaceAll("\\", "/");
  return normalized === ".netlify" || normalized.startsWith(".netlify/");
}

export function implementationPathSet(changedFromBase, trackedDirty, untracked, frozen) {
  const candidateUntracked = frozen
    ? untracked.filter((value) => !hostedBuildArtifact(value))
    : untracked;
  return [...new Set([
    ...changedFromBase,
    ...candidateUntracked,
    ...(frozen ? trackedDirty : []),
  ])]
    .filter((value) => !generatedAuditPaths.has(value))
    .sort();
}

function countBy(rows, field) {
  return rows.reduce((counts, row) => {
    const value = row[field];
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function git(...args) {
  return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

function normalizedNewlines(value) {
  return value.replace(/\r\n?/gu, "\n");
}

function tryGit(...args) {
  try {
    return execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function gitBlob(relativePath) {
  try {
    return execFileSync("git", ["show", `HEAD:${relativePath}`], {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function gitPaths(...args) {
  const output = git(...args);
  return output ? output.split(/\r?\n/u).filter(Boolean).map((value) => value.replaceAll("\\", "/")) : [];
}

async function implementationProvenance(baseMainSha, frozen = null) {
  const implementationSha = frozen?.implementationSha || git(
      "log",
      "-1",
      "--format=%H",
      "HEAD",
      "--",
      ".",
      ":(exclude)docs/batch0-ascent-six-county-navigation-ledger-20260827.csv",
      ":(exclude)docs/batch0-ascent-six-county-navigation-ledger-20260827.md",
    );
  const changedFromBase = frozen?.implementationPaths || gitPaths("diff", "--name-only", baseMainSha, "--", ".");
  const trackedDirty = [...new Set([
    ...gitPaths("diff", "--name-only", "HEAD", "--", "."),
    ...gitPaths("diff", "--cached", "--name-only", "HEAD", "--", "."),
  ])].filter((value) => !generatedAuditPaths.has(value));
  // Netlify creates its own untracked .netlify working files before this audit
  // runs. They are not candidate source, and must not make a frozen, committed
  // report depend on the build provider. Every other untracked path remains in
  // the fingerprint so genuine implementation work cannot be omitted.
  const allUntracked = gitPaths("ls-files", "--others", "--exclude-standard");
  const candidateUntracked = frozen
    ? allUntracked.filter((value) => !hostedBuildArtifact(value))
    : allUntracked;
  const implementationPaths = implementationPathSet(changedFromBase, trackedDirty, allUntracked, Boolean(frozen));
  const dirtyPaths = [...new Set([...trackedDirty, ...candidateUntracked])];
  const dirty = new Set(dirtyPaths);
  const entries = [];
  for (const relativePath of implementationPaths) {
    try {
      const committed = dirty.has(relativePath) ? null : gitBlob(relativePath);
      entries.push({
        path: relativePath,
        content: committed || await readFile(path.join(repositoryRoot, ...relativePath.split("/"))),
      });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      entries.push({ path: relativePath, content: "<deleted>" });
    }
  }
  return {
    baseMainSha,
    implementationSha,
    candidateContentSha256: candidateContentDigest(entries),
    uncommittedChanges: dirtyPaths.length > 0,
    implementationPaths,
  };
}

export function parseMarkdownProvenance(markdown) {
  const baseMainSha = /- Base origin\/main SHA: `([0-9a-f]{40})`/u.exec(markdown)?.[1];
  const implementationSha = /- Candidate implementation HEAD: `([0-9a-f]{40})`/u.exec(markdown)?.[1];
  const candidateContentSha256 = /- Candidate content SHA-256: `([0-9a-f]{64})`/u.exec(markdown)?.[1];
  const section = /## Candidate implementation files\s+([\s\S]*?)\s+## Counts/u.exec(markdown)?.[1] || "";
  const implementationPaths = [...section.matchAll(/^- `([^`]+)`$/gmu)].map((match) => match[1]);
  assert(baseMainSha && implementationSha && candidateContentSha256, "Saved Batch 0 provenance is incomplete");
  assert(implementationPaths.length > 0, "Saved Batch 0 implementation file list is empty");
  assert(new Set(implementationPaths).size === implementationPaths.length, "Saved Batch 0 implementation file list is duplicated");
  assert(implementationPaths.every((value) => {
    const normalized = value.replaceAll("\\", "/");
    return value === normalized
      && !path.isAbsolute(value)
      && !normalized.split("/").includes("..")
      && !normalized.startsWith("/");
  }), "Saved Batch 0 implementation file list contains an unsafe path");
  return { baseMainSha, implementationSha, candidateContentSha256, implementationPaths };
}

async function githubPullRequestBaseSha() {
  if (!process.env.GITHUB_EVENT_PATH) return null;
  try {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
    const value = event?.pull_request?.base?.sha;
    return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function netlifyMainRefreshRequired({ netlify, commitRef, headSha }) {
  if (netlify !== "true") return false;
  assert(/^[0-9a-f]{40}$/u.test(headSha), "Current HEAD SHA is invalid");
  assert(commitRef === headSha,
    `Netlify commit ${commitRef || "missing"} does not match current HEAD ${headSha}`);
  return true;
}

export function githubMainRefreshRequired({ githubActions, githubSha, headSha }) {
  if (githubActions !== "true") return false;
  assert(/^[0-9a-f]{40}$/u.test(headSha), "Current HEAD SHA is invalid");
  assert(githubSha === headSha,
    `GitHub commit ${githubSha || "missing"} does not match current HEAD ${headSha}`);
  return true;
}

function refreshProviderOriginMain(headSha) {
  const netlifyRefresh = netlifyMainRefreshRequired({
    netlify: process.env.NETLIFY,
    commitRef: process.env.COMMIT_REF,
    headSha,
  });
  const githubRefresh = githubMainRefreshRequired({
    githubActions: process.env.GITHUB_ACTIONS,
    githubSha: process.env.GITHUB_SHA,
    headSha,
  });
  if (!netlifyRefresh && !githubRefresh) return;
  execFileSync("git", [
    "fetch",
    "--no-tags",
    "origin",
    "+refs/heads/main:refs/remotes/origin/main",
  ], {
    cwd: repositoryRoot,
    stdio: "ignore",
  });
}

export function frozenProvenanceCheckoutMode({ headSha, originMainSha, frozenBaseSha }) {
  assert(/^[0-9a-f]{40}$/u.test(headSha), "Current HEAD SHA is invalid");
  assert(/^[0-9a-f]{40}$/u.test(originMainSha), "Current origin/main SHA is invalid");
  assert(/^[0-9a-f]{40}$/u.test(frozenBaseSha), "Saved Batch 0 base SHA is invalid");
  if (headSha === originMainSha) return "merged-main";
  assert(originMainSha === frozenBaseSha,
    `Saved Batch 0 base ${frozenBaseSha} does not match current origin/main ${originMainSha}`);
  return "candidate-branch";
}

export function frozenProvenanceNeedsBaseHistory(checkoutMode) {
  assert(checkoutMode === "candidate-branch" || checkoutMode === "merged-main",
    `Unsupported frozen provenance checkout mode ${checkoutMode}`);
  return checkoutMode === "candidate-branch";
}

async function publicConfiguration() {
  const source = await readFile(path.join(repositoryRoot, "v18", "src", "data", "directory.ts"), "utf8");
  const supabaseUrl = /VITE_SUPABASE_URL\s*\|\|\s*"([^"]+)"/u.exec(source)?.[1];
  const publishableKey = /VITE_SUPABASE_PUBLISHABLE_KEY\s*\|\|\s*"([^"]+)"/u.exec(source)?.[1];
  assert(supabaseUrl && publishableKey, "V18 public Supabase configuration is unavailable");
  return { supabaseUrl, publishableKey };
}

async function rpc(configuration, name, body, timeoutMs = 15_000) {
  const response = await fetch(`${configuration.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: configuration.publishableKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  assert(response.ok, `${name} failed once with HTTP ${response.status}: ${text.slice(0, 240)}`);
  return JSON.parse(text);
}

async function directory(configuration) {
  const rows = [];
  let snapshot = null;
  let afterOrdinal = 0;
  for (;;) {
    const payload = object(await rpc(configuration, "brinesearch_v18_directory_page", {
      p_snapshot_id: snapshot?.snapshotId || null,
      p_after_ordinal: afterOrdinal,
      p_limit: 1000,
    }));
    const nextSnapshot = object(payload.snapshot);
    assert(nextSnapshot.snapshotId, "Directory snapshot identity is missing");
    if (snapshot) {
      assert(nextSnapshot.snapshotId === snapshot.snapshotId, "Directory snapshot changed during paging");
      assert(String(nextSnapshot.sourceRevision) === String(snapshot.sourceRevision), "Directory revision changed during paging");
    }
    snapshot = nextSnapshot;
    const page = object(payload.page);
    const batch = Array.isArray(payload.rows) ? payload.rows : [];
    assert(Number(page.afterOrdinal) === afterOrdinal, "Directory cursor is not exact");
    rows.push(...batch);
    if (page.complete === true) break;
    const nextAfter = Number(page.nextAfterOrdinal);
    assert(batch.length > 0 && nextAfter === rows.length && nextAfter > afterOrdinal, "Directory paging failed closed");
    afterOrdinal = nextAfter;
  }
  assert(Number(snapshot.rowCount) === rows.length, "Directory row count diverged");
  return { snapshot, rows };
}

export function auditCoordinatePair(latitudeRaw, longitudeRaw) {
  const missing = (value) => value === null || value === undefined
    || typeof value === "string" && value.trim() === "";
  if (missing(latitudeRaw) || missing(longitudeRaw)) return null;
  if ([latitudeRaw, longitudeRaw].some((value) => typeof value === "boolean" || typeof value === "object")) return null;
  const latitude = Number(latitudeRaw);
  const longitude = Number(longitudeRaw);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  if (latitude < 37 || latitude > 43 || longitude < -84 || longitude > -74) return null;
  return { latitude, longitude };
}

function trustedDirectoryDestination(row, references) {
  const entrance = object(row.driverEntrance);
  if (entrance.role === "driver_entrance" && entrance.qualityState === "validated") {
    const coordinate = auditCoordinatePair(entrance.latitude, entrance.longitude);
    if (!coordinate) return null;
    return {
      gpsSource: "saved",
      coordinateRole: "verified driver entrance",
      ...coordinate,
    };
  }
  const reference = references.get(row.padId);
  if (!reference) return null;
  const source = {
    saved_pad_reference: "saved",
    official_pad_reference: "ODNR pad",
    official_wellhead_reference: "ODNR wellhead",
  }[reference.referenceKind];
  assert(source, `Unsupported GPS source for ${row.padId}`);
  const coordinate = auditCoordinatePair(reference.latitude, reference.longitude);
  if (!coordinate) return null;
  return {
    gpsSource: source,
    coordinateRole: reference.referenceKind.replaceAll("_", " "),
    ...coordinate,
  };
}

export function markdownSummary({ provenance, snapshot, rows, referenceDigest, csvDigest }) {
  const states = countBy(rows, "current_state");
  const sources = countBy(rows, "gps_source");
  const directorySources = countBy(rows, "directory_gps_source");
  const countyRows = counties.map((county) => {
    const matching = rows.filter((row) => row.county === county);
    const counts = countBy(matching, "current_state");
    const noGps = matching.filter((row) => row.gps_source === "missing").length;
    return `| ${county} | ${matching.length} | ${counts["1"] || 0} | ${counts["2"] || 0} | ${counts["3"] || 0} | ${counts.reviewed_handoff_authority_held || 0} | ${noGps} |`;
  }).join("\n");
  return `# Batch 0 Ascent six-county navigation ledger — 2026-08-27
- Base origin/main SHA: \`${provenance.baseMainSha}\`
- Candidate implementation HEAD: \`${provenance.implementationSha}\`
- Candidate content SHA-256: \`${provenance.candidateContentSha256}\`
- Uncommitted non-generated changes: **${provenance.uncommittedChanges ? "yes" : "no"}**
- 247 / 1 approved / 8 core+GPS / 210 GPS-only / 28 reviewed-held
- Production writes zero
- ALBATROSS + ATHENA + BAKOS + BANNOCK + BEETLE + BILINOVICH + BRAVO + CASTON + CIRCLE-OAKS + CROWIE + DUKE + GIL + GILCHER + HOOP + LAKE + LAWSON + MALDON + PICKENS + PORTERFIELD B + PORTERFIELD GAS UNIT + ROCK RIDGE + RUTH + SADLER + SKULL FORK + THOMAS + TOWE + TROYER + WITHEY: \`reviewed_handoff_authority_held\`

This candidate ledger binds the 247 current Ascent pads in Belmont, Guernsey, Harrison, Jefferson, Monroe, and Noble counties to production directory snapshot \`${snapshot.snapshotId}\` and source revision \`${snapshot.sourceRevision}\`. It describes candidate implementation content based on origin/main; it does not claim that unmerged work is already on main.

## Candidate implementation files

${provenance.implementationPaths.map((value) => `- \`${value}\``).join("\n")}

## Counts

- State 1 — Reviewed approved route: **${states["1"] || 0}**
- State 2 — Approved roads then GPS: **${states["2"] || 0}**
- State 3 — GPS destination only: **${states["3"] || 0}**
- Reviewed handoff authority held: **${states.reviewed_handoff_authority_held || 0}**
- No trusted GPS: **${rows.filter((row) => row.gps_source === "missing").length}**
- Exactly one navigation action destination: **${rows.filter((row) => row.gps_source !== "missing").length}**

| County | Pads | State 1 | State 2 | State 3 | Reviewed-held | No GPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${countyRows}

## GPS source accounting

The required \`gps_source\` column describes the coordinate used by the Navigate action: saved **${sources.saved || 0}**, ODNR pad **${sources["ODNR pad"] || 0}**, ODNR wellhead **${sources["ODNR wellhead"] || 0}**, missing **${sources.missing || 0}**. The separate \`directory_gps_source\` column preserves the canonical public-directory source: saved **${directorySources.saved || 0}**, ODNR pad **${directorySources["ODNR pad"] || 0}**, ODNR wellhead **${directorySources["ODNR wellhead"] || 0}**, missing **${directorySources.missing || 0}**.

BILINOVICH is the one deliberate distinction: its frozen PR #174 handoff navigates to the ODNR pad-surface destination \`40.08738445, -81.30282620\`; its current directory reference remains the saved lease-approach coordinate \`40.08863, -81.304164\`. Neither coordinate is called an entrance. The frozen URL and receipt remain unchanged, and Blaze Road remains excluded.

## Authority boundary

- The phone's current location is the origin. State 3 URLs contain no origin or waypoint.
- State 1 is limited to Cologie's exact clipped public route and reviewed Google handoff.
- State 2 draws approved public-road geometry only to its exact handoff. Its lease/pin leg is GPS-only.
- State 3 uses an exact saved or ODNR coordinate without approving Google's chosen roads.
- ALBATROSS, ATHENA, BAKOS, BANNOCK, BEETLE, BILINOVICH, BRAVO, CASTON, CIRCLE-OAKS, CROWIE, DUKE, GIL, GILCHER, HOOP, LAKE, LAWSON, MALDON, PICKENS, PORTERFIELD B, PORTERFIELD GAS UNIT, ROCK RIDGE, RUTH, SADLER, SKULL FORK, THOMAS, TOWE, TROYER, and WITHEY remain \`reviewed_handoff_authority_held\` rather than being promoted: their exact record-bound reviewed handoffs are separate from graph/public-Google authority. The exact DUKE, PICKENS, and PORTERFIELD GAS UNIT links have owner phone/field validation; the other validated links have live Google turn-list validation. That proof does not promote graph or public-Google authority.
- Written directions are not converted into geometry, and ODNR points are never labeled as entrances.
- The public reference projection SHA-256 is \`${referenceDigest}\`.
- The generated CSV SHA-256 is \`${csvDigest}\`.
- Production database writes for this ledger: **0**.

Regenerate from the current live public contracts with \`npm --prefix v18 run audit:batch0-navigation -- --write\`. The audit performs one request per page/contract and has no retry path.
`;
}

async function main() {
  const headSha = git("rev-parse", "HEAD");
  refreshProviderOriginMain(headSha);
  const originMainSha = tryGit("rev-parse", "origin/main");
  const checking = process.argv.includes("--check");
  let provenance;
  if (checking) {
    const frozen = parseMarkdownProvenance(await readFile(outputMarkdown, "utf8"));
    assert(originMainSha, "origin/main is required when checking the Batch 0 ledger");
    const checkoutMode = frozenProvenanceCheckoutMode({
      headSha,
      originMainSha,
      frozenBaseSha: frozen.baseMainSha,
    });
    const githubBase = await githubPullRequestBaseSha();
    if (frozenProvenanceNeedsBaseHistory(checkoutMode)) {
      if (githubBase) {
        assert(githubBase === frozen.baseMainSha,
          `Saved Batch 0 base ${frozen.baseMainSha} does not match the pull-request base ${githubBase}`);
      } else {
        const mergeBase = git("merge-base", "HEAD", "origin/main");
        assert(mergeBase === frozen.baseMainSha,
          `Saved Batch 0 base ${frozen.baseMainSha} does not match candidate-branch merge base ${mergeBase}`);
      }
      const currentPaths = gitPaths("diff", "--name-only", frozen.baseMainSha, "--", ".")
        .filter((value) => !generatedAuditPaths.has(value))
        .sort();
      assert(JSON.stringify(currentPaths) === JSON.stringify([...frozen.implementationPaths].sort()),
        "Saved Batch 0 implementation file list is stale");
    }
    assert(!githubBase || checkoutMode === "candidate-branch",
      "A pull-request checkout cannot use merged-main provenance mode");
    provenance = await implementationProvenance(frozen.baseMainSha, frozen);
    assert(provenance.candidateContentSha256 === frozen.candidateContentSha256,
      `Saved Batch 0 candidate content fingerprint is stale (${provenance.candidateContentSha256} != ${frozen.candidateContentSha256})`);
  } else {
    assert(originMainSha, "origin/main is required when generating the Batch 0 ledger");
    const mergeBase = git("merge-base", "HEAD", "origin/main");
    assert(mergeBase === originMainSha, `Batch 0 branch must start at current origin/main (${originMainSha}); merge base is ${mergeBase}`);
    provenance = await implementationProvenance(originMainSha);
  }
  const configuration = await publicConfiguration();
  const { snapshot, rows: directoryRows } = await directory(configuration);
  assert(snapshot.publicationState === "current", "Directory snapshot is not current");

  const rawReferences = await rpc(configuration, "brinesearch_v18_pad_reference_coordinates", {
    p_snapshot_id: snapshot.snapshotId,
  });
  const referencePayload = object(Array.isArray(rawReferences) ? rawReferences[0] : rawReferences);
  assert(referencePayload.snapshotId === snapshot.snapshotId, "Pad references do not match the directory snapshot");
  assert(String(referencePayload.sourceRevision) === String(snapshot.sourceRevision), "Pad references do not match the directory revision");
  assert(Array.isArray(referencePayload.rows), "Pad-reference rows are unavailable");
  const references = new Map(referencePayload.rows.map((row) => [row.padId, row]));

  const targets = directoryRows.filter((row) => row.company === "Ascent"
    && row.state === "Ohio" && counties.includes(row.county));
  assert(targets.length === 247, `Expected 247 exact Ascent targets; received ${targets.length}`);
  assert(new Set(targets.map((row) => row.padId)).size === 247, "Ascent target identities are not unique");
  assert(new Set(targets.map((row) => row.padName)).size === 247, "Ascent target names are not unique");
  for (const padId of explicitStates.keys()) {
    assert(targets.some((row) => row.padId === padId), `Explicit state receipt target ${padId} is absent`);
  }
  for (const [padId, explicit] of explicitStates) {
    if (explicit.state === "reviewed_handoff_authority_held") {
      assert(explicit.reviewedBinding, `Reviewed handoff ${padId} lacks an exact audit binding`);
    }
  }

  const ledger = targets.map((row) => {
    const directoryDestination = trustedDirectoryDestination(row, references);
    const explicit = explicitStates.get(row.padId);
    if (explicit?.state === "reviewed_handoff_authority_held") {
      assert(
        reviewedBindingMatches(row, directoryDestination, explicit.reviewedBinding),
        `Reviewed handoff binding drifted for ${row.padId}`,
      );
      if (explicit.actionDestination) {
        assert(explicit.actionDestination.gpsSource === "ODNR pad", `Reviewed action destination source drifted for ${row.padId}`);
        assert(
          explicit.actionDestination.latitude !== directoryDestination.latitude
            || explicit.actionDestination.longitude !== directoryDestination.longitude,
          `Reviewed action destination was incorrectly collapsed into the directory destination for ${row.padId}`,
        );
      }
    }
    const actionDestination = explicit?.actionDestination || directoryDestination;
    const currentState = explicit?.state || (actionDestination ? "3" : "unknown");
    const navigationLabel = explicit?.navigationLabel || {
      "1": "Reviewed approved route",
      "2": "Approved roads then GPS",
      "3": "GPS destination only",
    }[currentState] || "";
    const blocker = explicit ? explicit.blocker : currentState === "3"
      ? row.structuredRoadSequence
        ? "No state-1/2 clipped-route and mobile-handoff receipt is released; use the trusted GPS destination only."
        : "No reviewed exact public-road sequence is released; use the trusted GPS destination only."
      : "Trusted GPS destination is missing.";
    return {
      record_id: row.padId,
      legacy_id: row.legacyId || "",
      name: row.padName,
      company: row.company,
      state: row.state,
      county: row.county,
      structured_road_sequence: row.structuredRoadSequence || "",
      current_state: currentState,
      gps_source: actionDestination?.gpsSource || "missing",
      destination_latitude: actionDestination?.latitude ?? "",
      destination_longitude: actionDestination?.longitude ?? "",
      directory_gps_source: directoryDestination?.gpsSource || "missing",
      directory_coordinate_role: directoryDestination?.coordinateRole || "missing",
      directory_latitude: directoryDestination?.latitude ?? "",
      directory_longitude: directoryDestination?.longitude ?? "",
      record_revision: row.recordRevision,
      navigation_label: navigationLabel,
      origin: actionDestination ? "phone current location" : "",
      blocker,
      receipt: explicit?.receipt || "trusted GPS fallback",
    };
  }).sort((left, right) => counties.indexOf(left.county) - counties.indexOf(right.county)
    || left.name.localeCompare(right.name));

  const stateCounts = countBy(ledger, "current_state");
  assert(stateCounts["1"] === 1 && stateCounts["2"] === 8 && stateCounts["3"] === 210
    && stateCounts.reviewed_handoff_authority_held === 28,
    `State counts diverged: ${JSON.stringify(stateCounts)}`);
  assert(ledger.every((row) => row.gps_source !== "missing"), "At least one target lacks a trusted Navigate destination");

  const headers = Object.keys(ledger[0]);
  const csvText = `${headers.join(",")}\n${ledger.map((row) => headers.map((header) => csv(row[header])).join(",")).join("\n")}\n`;
  const csvDigest = createHash("sha256").update(csvText).digest("hex");
  const markdownText = markdownSummary({
    provenance,
    snapshot,
    rows: ledger,
    referenceDigest: referencePayload.contentSha256,
    csvDigest,
  });
  if (process.argv.includes("--write")) {
    await writeFile(outputCsv, csvText, "utf8");
    await writeFile(outputMarkdown, markdownText, "utf8");
  } else if (checking) {
    const savedCsv = normalizedNewlines(await readFile(outputCsv, "utf8"));
    const renderedCsv = normalizedNewlines(csvText);
    const savedMarkdown = normalizedNewlines(await readFile(outputMarkdown, "utf8"));
    const renderedMarkdown = normalizedNewlines(markdownText);
    assert(savedCsv === renderedCsv,
      `Checked-in Batch 0 CSV is stale (${createHash("sha256").update(savedCsv).digest("hex")} != ${createHash("sha256").update(renderedCsv).digest("hex")})`);
    assert(savedMarkdown === renderedMarkdown,
      `Checked-in Batch 0 Markdown is stale (${createHash("sha256").update(savedMarkdown).digest("hex")} != ${createHash("sha256").update(renderedMarkdown).digest("hex")})`);
  }
  console.log(JSON.stringify({
    ...provenance,
    snapshotId: snapshot.snapshotId,
    sourceRevision: snapshot.sourceRevision,
    targetCount: ledger.length,
    stateCounts,
    gpsSourceCounts: countBy(ledger, "gps_source"),
    directoryGpsSourceCounts: countBy(ledger, "directory_gps_source"),
    outputCsv: process.argv.includes("--write") ? outputCsv : null,
    outputMarkdown: process.argv.includes("--write") ? outputMarkdown : null,
    productionWrites: 0,
  }, null, 2));
}

const invokedAsScript = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) await main();
