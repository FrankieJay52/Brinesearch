export interface AscentSavedDirectionExactMatchBatch1Record {
  padId: string;
  canonicalId: string;
  legacyId: string;
  recordRevision: string;
  company: "Ascent";
  padName: string;
  state: "Ohio";
  county: "Belmont" | "Guernsey";
  structuredRoadSequence: string;
  structuredRoadSequenceSha256: string;
  selectedTerminalPublicRoadSequence: readonly string[];
  trustedDestination: {
    latitude: number;
    longitude: number;
    source: "saved_pad_gps";
    destinationGpsSource: "saved";
    directoryCoordinateRole: "saved pad reference";
  };
  routeDestination: {
    latitude: number;
    longitude: number;
  };
  waypoints: readonly [{ latitude: number; longitude: number }];
  title: "Navigate reviewed route";
  detail: string;
  reviewedRoadSequence: string;
  finalLegNotice: string;
  preserveMeasuredApproach: true;
  measuredApproachEvidence: {
    source: "ascent_batch2_exact_terminal_highway";
    roadId: string;
    identityId: string;
    displayName: string;
    routeSystem: "SR" | "US";
    routeNumber: string;
    geometryDigest: string;
    matchedIdentitySha256: string;
    roadCoordinatesSha256: string;
    lastHighwaySourceStepOrder: number;
    startAuthority: "candidate_nearest_highway_point";
    startCandidateOnly: true;
    startAnchoredRoadId: string;
    graphEvidenceReceiptKeySha256: string;
    graphEvidenceReceiptSha256: string;
    graphEvidenceRouteCoordinateSha256: string;
    gpsTetherAuthority: "unapproved_straight_network_snap_to_saved_gps";
    gpsTetherNavigationGeometry: false;
    gpsTetherDistanceMeters: number;
  };
}

/**
 * Six highway-direct records whose saved source, exact Road Manager identity,
 * immutable graph receipt, and neutral GPS tail already coexist in Batch 2.
 *
 * The waypoint is the frozen point on the exact terminal highway. It is a
 * Google shaping control only; it is not an entrance, junction approval, or
 * new road identity. The final GPS movement remains unnamed and unapproved.
 */
export const ascentSavedDirectionExactMatchBatch1 = [
  {
    padId: "952f385d-659a-4f00-80c6-3aff474d5f27",
    canonicalId: "952f385d-659a-4f00-80c6-3aff474d5f27",
    legacyId: "ascent--heller",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "HELLER",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 216 → OH-9 → OH-147 → Lease Road → OR → I-70 → Exit 208 → OH-149 → OH-147 → Bridge St → Main St → Lease Road → OR → OH-7 26th St → OH-7 → OH-149 → TR-573A → OH-147 → Lease Road",
    structuredRoadSequenceSha256: "10fe5bc9c61284fdcf276e44d16dd8617c1c4e7c5ca2b932a8434d4c9c020ed8",
    selectedTerminalPublicRoadSequence: ["OH-147"],
    trustedDestination: {
      latitude: 39.974278,
      longitude: -80.887661,
      source: "saved_pad_gps",
      destinationGpsSource: "saved",
      directoryCoordinateRole: "saved pad reference",
    },
    routeDestination: { latitude: 39.974278, longitude: -80.887661 },
    waypoints: [{ latitude: 39.974208, longitude: -80.887673 }],
    title: "Navigate reviewed route",
    detail: "OH-147 → unapproved GPS handoff",
    reviewedRoadSequence: "Google-selected approach → OH-147 near HELLER → unapproved GPS handoff → saved HELLER GPS",
    finalLegNotice: "The frozen control reaches the exact OH-147 identity beside HELLER. The remaining movement to the saved GPS stays an unnamed, unapproved GPS handoff; the neutral straight tether is not road or navigation geometry.",
    preserveMeasuredApproach: true,
    measuredApproachEvidence: {
      source: "ascent_batch2_exact_terminal_highway",
      roadId: "7c24a7d7-cc47-46bc-85b6-f52c6835749f",
      identityId: "96364bc2-399f-8941-a26a-bc895cf4efb3",
      displayName: "KEY-BELLAIRE RD",
      routeSystem: "SR",
      routeNumber: "147",
      geometryDigest: "b78979a27baa5d5a020006035154c573",
      matchedIdentitySha256: "a1539f28a37380e2381bc706de722df63fe175579dc30f54152401dcb74e790e",
      roadCoordinatesSha256: "c6a50cf0d768a63724026726604b1fcb3fb473d8dfe2282aef6861029d579f71",
      lastHighwaySourceStepOrder: 4,
      startAuthority: "candidate_nearest_highway_point",
      startCandidateOnly: true,
      startAnchoredRoadId: "7c24a7d7-cc47-46bc-85b6-f52c6835749f",
      graphEvidenceReceiptKeySha256: "89730d4b0065cf2ce876567d9c78a3ad76eb193c46bd2a7085dcf7979a291d3a",
      graphEvidenceReceiptSha256: "8693a1964561d06d675e6ac881a4c146137df167303e38074217d3c6fb6c855b",
      graphEvidenceRouteCoordinateSha256: "c6a50cf0d768a63724026726604b1fcb3fb473d8dfe2282aef6861029d579f71",
      gpsTetherAuthority: "unapproved_straight_network_snap_to_saved_gps",
      gpsTetherNavigationGeometry: false,
      gpsTetherDistanceMeters: 7.878377139404914,
    },
  },
  {
    padId: "fcbf5085-4ba2-496d-9c20-516e8b52f9bd",
    canonicalId: "fcbf5085-4ba2-496d-9c20-516e8b52f9bd",
    legacyId: "ascent--jennings",
    recordRevision: "1787615581785257",
    company: "Ascent",
    padName: "JENNINGS",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "I-70 → Exit 186 → OH-285 → Pad",
    structuredRoadSequenceSha256: "0d6fd364908dae6fd9eb9febde35e9d6a768201951ffd815a058a785e5e4ed26",
    selectedTerminalPublicRoadSequence: ["OH-285"],
    trustedDestination: {
      latitude: 40.010991,
      longitude: -81.457719,
      source: "saved_pad_gps",
      destinationGpsSource: "saved",
      directoryCoordinateRole: "saved pad reference",
    },
    routeDestination: { latitude: 40.010991, longitude: -81.457719 },
    waypoints: [{ latitude: 40.011053, longitude: -81.457868 }],
    title: "Navigate reviewed route",
    detail: "OH-285 → unapproved GPS handoff",
    reviewedRoadSequence: "Google-selected approach → OH-285 near JENNINGS → unapproved GPS handoff → saved JENNINGS GPS",
    finalLegNotice: "The frozen control reaches the exact OH-285 identity beside JENNINGS. The remaining movement to the saved GPS stays an unnamed, unapproved GPS handoff; the neutral straight tether is not road or navigation geometry.",
    preserveMeasuredApproach: true,
    measuredApproachEvidence: {
      source: "ascent_batch2_exact_terminal_highway",
      roadId: "3deab4c8-2a90-4579-bcb6-373cef11a0ce",
      identityId: "13fe0da8-ba4e-ba64-250b-98789544f9fd",
      displayName: "WINTERGREEN RD",
      routeSystem: "SR",
      routeNumber: "285",
      geometryDigest: "e6eacbaa3ebae8bbfe98a2dfcee9db57",
      matchedIdentitySha256: "abb830abbf20a83afeba46aec62380f18e6a1e6b2a0cfcf8605029cccfc5e99b",
      roadCoordinatesSha256: "c58f34932dc6430bd17a8cbc3043104515f03d038037ab2c08c6ac82e4520329",
      lastHighwaySourceStepOrder: 3,
      startAuthority: "candidate_nearest_highway_point",
      startCandidateOnly: true,
      startAnchoredRoadId: "3deab4c8-2a90-4579-bcb6-373cef11a0ce",
      graphEvidenceReceiptKeySha256: "c597710ce77c3705c8bbcdd9f14ad2281367f76153fa372df56842ec1df164b8",
      graphEvidenceReceiptSha256: "c10e251665933ce55493249c63f29f4191360409ed12a2230323e19aa4a7603a",
      graphEvidenceRouteCoordinateSha256: "c58f34932dc6430bd17a8cbc3043104515f03d038037ab2c08c6ac82e4520329",
      gpsTetherAuthority: "unapproved_straight_network_snap_to_saved_gps",
      gpsTetherNavigationGeometry: false,
      gpsTetherDistanceMeters: 14.185422457747588,
    },
  },
  {
    padId: "c09f4dd1-68f9-46d1-90b3-560240550ecd",
    canonicalId: "c09f4dd1-68f9-46d1-90b3-560240550ecd",
    legacyId: "ascent--kemper",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "KEMPER",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "Exit 208 → OH-149 → OH-147 → Pad",
    structuredRoadSequenceSha256: "f58fdd3d626350034e1011cd865ce68b4f2238f604ba814ba864fdb4ddd5032a",
    selectedTerminalPublicRoadSequence: ["OH-147"],
    trustedDestination: {
      latitude: 39.98664,
      longitude: -80.84253,
      source: "saved_pad_gps",
      destinationGpsSource: "saved",
      directoryCoordinateRole: "saved pad reference",
    },
    routeDestination: { latitude: 39.98664, longitude: -80.84253 },
    waypoints: [{ latitude: 39.986694, longitude: -80.842534 }],
    title: "Navigate reviewed route",
    detail: "OH-147 → unapproved GPS handoff",
    reviewedRoadSequence: "Google-selected approach → OH-147 near KEMPER → unapproved GPS handoff → saved KEMPER GPS",
    finalLegNotice: "The frozen control reaches the exact OH-147 identity beside KEMPER. The remaining movement to the saved GPS stays an unnamed, unapproved GPS handoff; the neutral straight tether is not road or navigation geometry.",
    preserveMeasuredApproach: true,
    measuredApproachEvidence: {
      source: "ascent_batch2_exact_terminal_highway",
      roadId: "7c24a7d7-cc47-46bc-85b6-f52c6835749f",
      identityId: "96364bc2-399f-8941-a26a-bc895cf4efb3",
      displayName: "KEY-BELLAIRE RD",
      routeSystem: "SR",
      routeNumber: "147",
      geometryDigest: "b78979a27baa5d5a020006035154c573",
      matchedIdentitySha256: "a1539f28a37380e2381bc706de722df63fe175579dc30f54152401dcb74e790e",
      roadCoordinatesSha256: "8150ce39c8ce9f75996efe123d2c1ed43a5162bcd4c5548eb468a61907ca1fd5",
      lastHighwaySourceStepOrder: 3,
      startAuthority: "candidate_nearest_highway_point",
      startCandidateOnly: true,
      startAnchoredRoadId: "7c24a7d7-cc47-46bc-85b6-f52c6835749f",
      graphEvidenceReceiptKeySha256: "5f2b3b9ca39e6191cedd0cbab55197f447359e7ead7ada0e776634f92fc86537",
      graphEvidenceReceiptSha256: "892c4ce7873f977ef8a8cf99eb38e2dc4eaeb536a1de810f2a60d7c745cb255a",
      graphEvidenceRouteCoordinateSha256: "8150ce39c8ce9f75996efe123d2c1ed43a5162bcd4c5548eb468a61907ca1fd5",
      gpsTetherAuthority: "unapproved_straight_network_snap_to_saved_gps",
      gpsTetherNavigationGeometry: false,
      gpsTetherDistanceMeters: 3.746607218345151,
    },
  },
  {
    padId: "be83fc24-5c6a-49cd-88a0-52016ca7b657",
    canonicalId: "be83fc24-5c6a-49cd-88a0-52016ca7b657",
    legacyId: "ascent--red-hill-farm",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "RED-HILL-FARM",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "US-22 → Access Road → OR → OH-513 → US-22 → Access Road",
    structuredRoadSequenceSha256: "ad705cc57c78e15858f2bba10dccaeb2a627c0a4dfc9df0f26f4d5298f449cf3",
    selectedTerminalPublicRoadSequence: ["US-22"],
    trustedDestination: {
      latitude: 40.136541,
      longitude: -81.336794,
      source: "saved_pad_gps",
      destinationGpsSource: "saved",
      directoryCoordinateRole: "saved pad reference",
    },
    routeDestination: { latitude: 40.136541, longitude: -81.336794 },
    waypoints: [{ latitude: 40.138155, longitude: -81.337876 }],
    title: "Navigate reviewed route",
    detail: "US-22 → unapproved GPS/access handoff",
    reviewedRoadSequence: "Google-selected approach → US-22 near RED-HILL-FARM → unapproved GPS/access handoff → saved RED-HILL-FARM GPS",
    finalLegNotice: "The frozen control reaches the exact US-22 identity near RED-HILL-FARM. The separate 198-metre movement to the saved GPS stays an unnamed, unapproved GPS/access handoff; the neutral straight tether is not road or navigation geometry.",
    preserveMeasuredApproach: true,
    measuredApproachEvidence: {
      source: "ascent_batch2_exact_terminal_highway",
      roadId: "fd43709b-2880-4b6c-934a-6f9addc6e5cb",
      identityId: "e1e234a2-97f7-0e9b-cad5-0dd061ded9f6",
      displayName: "US 22",
      routeSystem: "US",
      routeNumber: "22",
      geometryDigest: "0d862222d4db70e622929fb343871b41",
      matchedIdentitySha256: "eecedaa2236a933c3497879afb900983064ff42a541823011d893f3c738b661b",
      roadCoordinatesSha256: "7d0d517b435dc881d8b862589d5aaadc81e41bb8d69899b5bdabfe835c4e1122",
      lastHighwaySourceStepOrder: 1,
      startAuthority: "candidate_nearest_highway_point",
      startCandidateOnly: true,
      startAnchoredRoadId: "fd43709b-2880-4b6c-934a-6f9addc6e5cb",
      graphEvidenceReceiptKeySha256: "c972883d8a47f1443143fc23e215c0f84613d12516a51cfdd9511f7c68a076cf",
      graphEvidenceReceiptSha256: "4782b679357cff4129f60d640ffcaf7caf0ee612e5497d13a84c1fef3a461eb6",
      graphEvidenceRouteCoordinateSha256: "7d0d517b435dc881d8b862589d5aaadc81e41bb8d69899b5bdabfe835c4e1122",
      gpsTetherAuthority: "unapproved_straight_network_snap_to_saved_gps",
      gpsTetherNavigationGeometry: false,
      gpsTetherDistanceMeters: 198.36400693513545,
    },
  },
  {
    padId: "fa2d692c-4f3a-4a28-8985-3809c9dbd15d",
    canonicalId: "fa2d692c-4f3a-4a28-8985-3809c9dbd15d",
    legacyId: "ascent--axle",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "AXLE",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → OH-800 → OH-147 → Access Road → Lease Road",
    structuredRoadSequenceSha256: "caf6d8d51a6f953f7098c34563606e85aa9cafddfa0c74fbb3ea6945a08d9ad7",
    selectedTerminalPublicRoadSequence: ["OH-147"],
    trustedDestination: {
      latitude: 39.984049,
      longitude: -81.195962,
      source: "saved_pad_gps",
      destinationGpsSource: "saved",
      directoryCoordinateRole: "saved pad reference",
    },
    routeDestination: { latitude: 39.984049, longitude: -81.195962 },
    waypoints: [{ latitude: 39.978808, longitude: -81.194557 }],
    title: "Navigate reviewed route",
    detail: "OH-147 → unapproved access / GPS handoff",
    reviewedRoadSequence: "Google-selected approach → OH-147 near AXLE → unapproved access / GPS handoff → saved AXLE GPS",
    finalLegNotice: "The frozen control reaches the exact OH-147 identity near AXLE. The exact teal prefix stops before the separate unverified access remainder, which stays solid neutral and unapproved. The straight GPS tether also stays neutral and is not road or navigation geometry.",
    preserveMeasuredApproach: true,
    measuredApproachEvidence: {
      source: "ascent_batch2_exact_terminal_highway",
      roadId: "7c24a7d7-cc47-46bc-85b6-f52c6835749f",
      identityId: "96364bc2-399f-8941-a26a-bc895cf4efb3",
      displayName: "KEY-BELLAIRE RD",
      routeSystem: "SR",
      routeNumber: "147",
      geometryDigest: "b78979a27baa5d5a020006035154c573",
      matchedIdentitySha256: "a1539f28a37380e2381bc706de722df63fe175579dc30f54152401dcb74e790e",
      roadCoordinatesSha256: "dae38d30fb9b8442b803459952feb58d6d4521fb1cb863f2160b3d297e4c1421",
      lastHighwaySourceStepOrder: 3,
      startAuthority: "candidate_nearest_highway_point",
      startCandidateOnly: true,
      startAnchoredRoadId: "7c24a7d7-cc47-46bc-85b6-f52c6835749f",
      graphEvidenceReceiptKeySha256: "4c2e4e14c53b34f5b58dcf16ad819b3779d136b4642eb5eaabc6b51bc6faa6d5",
      graphEvidenceReceiptSha256: "488e43ac9baff14fb8995dfb980f00d6f190e743fa365f76bad7e5a47961f43f",
      graphEvidenceRouteCoordinateSha256: "dae38d30fb9b8442b803459952feb58d6d4521fb1cb863f2160b3d297e4c1421",
      gpsTetherAuthority: "unapproved_straight_network_snap_to_saved_gps",
      gpsTetherNavigationGeometry: false,
      gpsTetherDistanceMeters: 299.9090977139086,
    },
  },
  {
    padId: "85d74b99-da49-4a5a-aadf-1ce2b461071c",
    canonicalId: "85d74b99-da49-4a5a-aadf-1ce2b461071c",
    legacyId: "ascent--kaldor",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "KALDOR",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "Exit 208 → OH-147 → Lease Road",
    structuredRoadSequenceSha256: "ae2c475d4075cc4d8c75a10afa655ff21975da68efe2d206a1df54c40057ea61",
    selectedTerminalPublicRoadSequence: ["OH-147"],
    trustedDestination: {
      latitude: 39.976061,
      longitude: -80.838183,
      source: "saved_pad_gps",
      destinationGpsSource: "saved",
      directoryCoordinateRole: "saved pad reference",
    },
    routeDestination: { latitude: 39.976061, longitude: -80.838183 },
    waypoints: [{ latitude: 39.986736, longitude: -80.842346 }],
    title: "Navigate reviewed route",
    detail: "OH-147 → unapproved lease / GPS handoff",
    reviewedRoadSequence: "Google-selected approach → OH-147 near KALDOR → unapproved lease / GPS handoff → saved KALDOR GPS",
    finalLegNotice: "The frozen control reaches the exact OH-147 identity near KALDOR. The saved source describes the remaining movement only as Lease Road; its mapped remainder stays solid neutral and unapproved. The separate straight GPS tether also stays neutral and is not road or navigation geometry.",
    preserveMeasuredApproach: true,
    measuredApproachEvidence: {
      source: "ascent_batch2_exact_terminal_highway",
      roadId: "7c24a7d7-cc47-46bc-85b6-f52c6835749f",
      identityId: "96364bc2-399f-8941-a26a-bc895cf4efb3",
      displayName: "KEY-BELLAIRE RD",
      routeSystem: "SR",
      routeNumber: "147",
      geometryDigest: "b78979a27baa5d5a020006035154c573",
      matchedIdentitySha256: "a1539f28a37380e2381bc706de722df63fe175579dc30f54152401dcb74e790e",
      roadCoordinatesSha256: "5755f884b548e5767d78ea05a4c82c570fea9357465621e51b3de7f8f7ed924f",
      lastHighwaySourceStepOrder: 2,
      startAuthority: "candidate_nearest_highway_point",
      startCandidateOnly: true,
      startAnchoredRoadId: "7c24a7d7-cc47-46bc-85b6-f52c6835749f",
      graphEvidenceReceiptKeySha256: "c4bfbfbb5ac58092f69a7b50f1528c030c2425687c7accaba04237cbcb9c5916",
      graphEvidenceReceiptSha256: "e4429e00d91f58a8a8995b41fb41e6ac7f3380fde0039a1c332d871ae9ee4590",
      graphEvidenceRouteCoordinateSha256: "5755f884b548e5767d78ea05a4c82c570fea9357465621e51b3de7f8f7ed924f",
      gpsTetherAuthority: "unapproved_straight_network_snap_to_saved_gps",
      gpsTetherNavigationGeometry: false,
      gpsTetherDistanceMeters: 538.3996263081775,
    },
  },
] as const satisfies readonly AscentSavedDirectionExactMatchBatch1Record[];
