// Existing Road Manager identities only. These four handoffs were checked in
// Google Maps against the ordered named roads on 2026-08-29. They do not create
// road identities, geometry, owner approval, State 1, or a public Google route.

export const HENDERSON_EXISTING_IDENTITY_GOOGLE_URL = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.050354%2C-80.935656&waypoints=40.04515836261071%2C-80.93138802916964";
export const DONNA_EXISTING_IDENTITY_GOOGLE_URL = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.123656%2C-81.252093&waypoints=40.13684805880106%2C-81.26539342871865%7C40.12056256387059%2C-81.25403279554483";
export const LAVADA_EXISTING_IDENTITY_GOOGLE_URL = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.97411%2C-81.412098&waypoints=39.97854060948695%2C-81.41572491587105";
export const MATADOR_EXISTING_IDENTITY_GOOGLE_URL = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.821516%2C-81.39377&waypoints=39.822537610438516%2C-81.40962075392099%7C39.82057240921476%2C-81.40018671777406";

export const ascentExistingIdentityNavigationBatch1 = [
  {
    padId: "036d0ac7-d72e-49e4-a400-ee0a631029e1",
    canonicalId: "036d0ac7-d72e-49e4-a400-ee0a631029e1",
    legacyId: "ascent--henderson",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "HENDERSON",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "Exit 208 → I-70 → OH-149 → OH-147 → OH-9 → Henderson Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "OH-9 → Henderson Rd / TR-722 → saved GPS",
    routeUrl: HENDERSON_EXISTING_IDENTITY_GOOGLE_URL,
    reviewedRoadSequence: "OH-9 → Henderson Rd / TR-722 → saved HENDERSON GPS",
    finalLegNotice: "Google turn-list QA followed OH-9 and Henderson Road / TR-722 in order to HENDERSON's exact saved GPS. The final unnamed access remains unapproved; this handoff does not create route geometry, owner approval, or State 1 authority.",
    trustedDestination: { latitude: 40.050354, longitude: -80.935656, source: "saved_pad_gps" },
    routeDestination: { latitude: 40.050354, longitude: -80.935656 },
    waypoints: [
      { latitude: 40.04515836261071, longitude: -80.93138802916964 },
    ],
    roadIdentityHook: {
      identities: [
        { roadId: "987e52bb-df4e-46a2-9313-9e38d543482a", county: "Belmont", officialName: "Henderson Rd", routeNumber: "TR-722" },
      ],
    },
  },
  {
    padId: "8a7b9669-169d-45a5-bf55-b9be5cbd51e2",
    canonicalId: "8a7b9669-169d-45a5-bf55-b9be5cbd51e2",
    legacyId: "ascent--donna",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "DONNA",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "OH-800 → US-22 → Skull Fork Rd → Bond Ln → OR → I-77 → Exit 47 → US-22 → Skull Fork Rd → Bond Ln → OR → I-70 → Exit 193 → OH-513 → US-22 → Skull Fork Rd → Bond Ln",
    title: "Navigate reviewed route",
    detail: "US-22 → Skull Fork Rd / CR-98 → Bond Ln / TR-8965 → saved GPS",
    routeUrl: DONNA_EXISTING_IDENTITY_GOOGLE_URL,
    reviewedRoadSequence: "US-22 → Skull Fork Rd / CR-98 → Bond Ln / TR-8965 → saved DONNA GPS",
    finalLegNotice: "Google turn-list QA followed Skull Fork Road / CR-98 and Bond Lane / TR-8965 in order to DONNA's exact saved GPS. Any final unnamed access remains unapproved; this handoff does not create route geometry, owner approval, or State 1 authority.",
    trustedDestination: { latitude: 40.123656, longitude: -81.252093, source: "saved_pad_gps" },
    routeDestination: { latitude: 40.123656, longitude: -81.252093 },
    waypoints: [
      { latitude: 40.13684805880106, longitude: -81.26539342871865 },
      { latitude: 40.12056256387059, longitude: -81.25403279554483 },
    ],
    roadIdentityHook: {
      identities: [
        { roadId: "554591f1-401d-40ca-b432-46ca89ff9d0a", county: "Guernsey", officialName: "Skullfork Rd", routeNumber: "CR-98" },
        { roadId: "a687a907-021c-46ab-b3e7-4350f77756f6", county: "Guernsey", officialName: "Bond Ln", routeNumber: "TR-8965" },
      ],
    },
  },
  {
    padId: "883420b3-07b9-4682-912e-42ba278d1132",
    canonicalId: "883420b3-07b9-4682-912e-42ba278d1132",
    legacyId: "ascent--lavada",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "LAVADA",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "I-70 → Exit 186 → OH-285 → OH-265 → Salem Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "OH-265 → Salem Rd / CR-74 → saved GPS",
    routeUrl: LAVADA_EXISTING_IDENTITY_GOOGLE_URL,
    reviewedRoadSequence: "OH-265 → Salem Rd / CR-74 → saved LAVADA GPS",
    finalLegNotice: "Google turn-list QA followed OH-265 and Salem Road / CR-74 in order to LAVADA's exact saved GPS. Any final unnamed access remains unapproved; this handoff does not create route geometry, owner approval, or State 1 authority.",
    trustedDestination: { latitude: 39.97411, longitude: -81.412098, source: "saved_pad_gps" },
    routeDestination: { latitude: 39.97411, longitude: -81.412098 },
    waypoints: [
      { latitude: 39.97854060948695, longitude: -81.41572491587105 },
    ],
    roadIdentityHook: {
      identities: [
        { roadId: "bdae3fc7-0497-4994-a048-5b9e6db12140", county: "Guernsey", officialName: "Salem Rd", routeNumber: "CR-74" },
      ],
    },
  },
  {
    padId: "b48399d6-1890-4a19-af28-dba54b28fb55",
    canonicalId: "b48399d6-1890-4a19-af28-dba54b28fb55",
    legacyId: "ascent--matador",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "MATADOR",
    state: "Ohio",
    county: "Noble",
    structuredRoadSequence: "I-77 → OH-821 → OH-215 → OH-146 → Cowgill Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "OH-146 → Cowgill Rd / CR-4 → saved GPS",
    routeUrl: MATADOR_EXISTING_IDENTITY_GOOGLE_URL,
    reviewedRoadSequence: "OH-146 → Cowgill Rd / CR-4 → saved MATADOR GPS",
    finalLegNotice: "Google turn-list QA followed OH-146 and Cowgill Road / CR-4 in order to MATADOR's exact saved GPS. The final unnamed access remains unapproved; this handoff does not create route geometry, owner approval, or State 1 authority.",
    trustedDestination: { latitude: 39.821516, longitude: -81.39377, source: "saved_pad_gps" },
    routeDestination: { latitude: 39.821516, longitude: -81.39377 },
    waypoints: [
      { latitude: 39.822537610438516, longitude: -81.40962075392099 },
      { latitude: 39.82057240921476, longitude: -81.40018671777406 },
    ],
    roadIdentityHook: {
      identities: [
        { roadId: "bc613553-15e3-4888-a79f-1818567b7f78", county: "Noble", officialName: "Cowgill Rd", routeNumber: "CR-4" },
      ],
    },
  },
] as const;
