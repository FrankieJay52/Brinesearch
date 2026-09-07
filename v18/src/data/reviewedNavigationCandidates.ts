import { parseCoordinatePair } from "./coordinates";
import type { PadSummary } from "./types";
import { trustedPadDestination, type PadDestinationSource } from "./googleDestination";
import { ascentSavedDirectionExactMatchBatch1 } from "./ascentSavedDirectionExactMatchBatch1";

export interface ReviewedNavigationCandidate {
  padId: string;
  title: string;
  detail: string;
  routeUrl: string;
  reviewedRoadSequence?: string;
  finalLegNotice?: string;
  preserveMeasuredApproach?: true;
  ownerApproval?: OwnerApprovedNavigationPresentation;
}

// These record-bound handoffs are ordinary driver navigation once Google has
// been checked against the ordered named roads. Their working URLs remain
// byte-stable unless wrong-road evidence requires a new review. They are not
// State-1 grades, and the contracts themselves remain geometry-free. A separate
// build-time catalog may reconstruct display-only routable lines through their
// frozen destinations and ordered controls, plus a solid neutral
// `unapproved_gps_tether` where needed. The browser never routes or rewrites
// these contracts.

export interface OwnerApprovedNavigationPresentation {
  kind: "owner_approved_directions";
  evidence: "exact_named_road_identities" | "validated_google_handoff";
  approvedAt: "2026-08-28";
}

export interface ReviewedNavigationSafetyHold {
  padId: string;
  title: string;
  detail: string;
}

export interface ReviewedNavigationCoordinate {
  latitude: number;
  longitude: number;
}

const ownerApprovedNavigationReceiptEntries = [
  ["143f5268-33e4-4598-8101-40220b5cfdc4", "exact_named_road_identities", "2f79a77d4b426a89"], // LAWSON
  ["59061829-1122-4aae-872d-cf5024310373", "exact_named_road_identities", "fe52b13b8786952d"], // BILINOVICH
  ["0e6f23f1-3bfb-44b0-aa4e-f24dde611880", "exact_named_road_identities", "5226bce429e00602"], // BEETLE
  ["bb351070-6c94-45e5-942f-e155f9e86f7e", "exact_named_road_identities", "7ae28b658c211473"], // DUKE
  ["d7898e8c-1bb6-48f8-b5e0-87bc1898420e", "exact_named_road_identities", "5e04be98967722ec"], // BAKOS
  ["333598ca-37b3-4b44-9411-a490cc3da672", "exact_named_road_identities", "ad056a867c8dcf38"], // BANNOCK
  ["bd2e0e20-8aa8-4e05-a4c0-0af312234853", "exact_named_road_identities", "99e914d4ad67f742"], // GIL
  ["71c9c874-5514-46a4-8d91-b105c6734799", "exact_named_road_identities", "6ec187b6fa2d4864"], // GILCHER
  ["b22c557a-950a-4ed7-a65a-f4730b9bc727", "exact_named_road_identities", "3ede02569e2e9522"], // CIRCLE-OAKS
  ["166c5d6c-3a8d-4481-b8bf-5d74b7605f0d", "exact_named_road_identities", "75402eaffa3e0451"], // SADLER
  ["800c877a-6b4f-4a87-a710-b1e00af63c62", "exact_named_road_identities", "79242c39fe96570d"], // TOWE
  ["fbdb5ee4-38d6-4801-81cc-8ad4abbb24e2", "exact_named_road_identities", "0dfa0799f5aaaaf3"], // DUTTON
  ["ad5ef012-46f5-46ca-93c7-0f5b492cb201", "exact_named_road_identities", "f23bc1287e74c55a"], // KUNGLE B
  ["c10e2066-d6b7-4117-aea9-137dd1237b3a", "exact_named_road_identities", "c21fd08143e5a2f9"], // TRUCHAN NW
  ["ca1560b5-4ea6-4eb7-a82e-de2467937eb2", "exact_named_road_identities", "e387f613bd9de8cf"], // MOONSTONE
  ["9aa065c0-8896-49e2-b02d-d4ca71acefc3", "exact_named_road_identities", "39b6224fb8883dd5"], // JEFFCO
  ["47a0305e-c641-499b-990c-0f7fe83493b8", "exact_named_road_identities", "d2f5a45e55536664"], // KUNGLE A
  ["cd4f6dcc-b603-4155-84b2-30d7ee87bbc7", "exact_named_road_identities", "1971369320635c89"], // TRUCHAN NE
  ["a35f0ea7-13d7-45dd-8fe2-fe73e4964df2", "exact_named_road_identities", "c29838bd5dfd3741"], // LORRAINE
  ["74032b6e-179d-4672-8720-55ac86cab232", "exact_named_road_identities", "c3f4701ffec3ac65"], // PANG
  ["f2f82142-f6d8-4f8d-b440-2ff86f624158", "exact_named_road_identities", "d93f5a1f65d55d63"], // HASTINGS
  ["25dc9adf-e09a-4cfa-8900-59492fbad0ec", "exact_named_road_identities", "a38e7b5d8af398c5"], // WHEELING VALLEY
  ["83b27fd3-4615-4ea1-ad36-0b05b359f5d2", "exact_named_road_identities", "62b8a765bc667f1f"], // ECHO
  ["475462f4-7e7a-4432-801c-5e513d5e953f", "exact_named_road_identities", "36cb79e4853d7290"], // NORTH STAR
  ["691fb27b-2b35-471d-81fa-9239f6bd4081", "exact_named_road_identities", "96e1bb037b953a31"], // LODESTAR
  ["0b7ed9a5-7748-4d92-992a-7f2cecf9dd08", "exact_named_road_identities", "6577e418dbac20e4"], // WINSTON SMITH
  ["4c73e244-6132-4d40-83fc-3fe5e6e65bf6", "exact_named_road_identities", "23e0287b45f6ff57"], // BRAVO
  ["75600d0c-17b8-488b-96c9-4b7b8ffc8b1b", "exact_named_road_identities", "76cc6d6b7d882699"], // PICKENS
  ["0b7105a0-1b36-4182-8d10-1f2e297c8bab", "validated_google_handoff", "4675fb363ebe71b6"], // PORTERFIELD GAS UNIT
  ["41f0bfc3-7be1-450f-abfc-96dce544547b", "validated_google_handoff", "e0d0cf0742dd637b"], // PORTERFIELD B
  ["19a4f7ef-4334-4b1c-8443-2c5ccb323d1d", "validated_google_handoff", "9dfaaa8c5c191624"], // ROCK RIDGE
  ["fba35b8e-ccc6-406b-b27c-ac9ce4eed29d", "validated_google_handoff", "3574a472d9401038"], // CROWIE
  ["58c94af4-32b1-4f80-a278-a5f73688fa23", "validated_google_handoff", "c9fa4f5b9f653949"], // CASTON
  ["ccf7415a-331b-440a-829d-28282a33cde1", "validated_google_handoff", "2c390b9f4396ed43"], // LAKE
  ["1e898176-672d-4174-8878-4aae0aee2128", "validated_google_handoff", "550a7ab9fc186ab3"], // THOMAS
  ["6c93d03a-76e8-4c03-b47e-8b7011c81a1a", "validated_google_handoff", "b3f46307476f1b6f"], // TROYER
  ["d6d0a0fd-1cd3-48ae-8e41-90d744b9f8f6", "validated_google_handoff", "f336c7fff9bb3859"], // MATUSEK
  ["f80dea77-db11-45f8-b30c-6c6abb85e469", "validated_google_handoff", "5ef4b0d8f542dfe4"], // JACKALOPE
  ["5c4a497e-cf33-48dd-8272-9fd06ebb9e6a", "validated_google_handoff", "802f04a80b73ff0a"], // LODGE
  ["48d810bf-e59f-4314-9efb-8103a818a3bd", "validated_google_handoff", "a1620982bbc43f72"], // ALBATROSS
  ["8f616827-d7da-4b40-b9c2-49fd5e713822", "validated_google_handoff", "e6c398ec022ccff4"], // MALDON
  ["f2df293f-13a2-401e-96b2-21e71ac63e6a", "validated_google_handoff", "197c6bd9b7e58f7b"], // WITHEY
  ["06ac93a2-3b46-44fd-9fa6-2fd29201858a", "validated_google_handoff", "ca76998eb8de6826"], // SKULL FORK
  ["351b72fb-eb48-4355-b6fc-d8e9a867f79c", "validated_google_handoff", "449f9f41c74f863f"], // HOOP
  ["7dcd1f71-fa32-4edc-ae3d-aa9717d0c72c", "validated_google_handoff", "d3f8b184674630da"], // RUTH
  ["3850e94a-826f-4b6b-a54f-d21d482fca46", "validated_google_handoff", "8864af288dea9f58"], // ATHENA
] as const satisfies readonly (readonly [string, OwnerApprovedNavigationPresentation["evidence"], string])[];

const ownerApprovedNavigationReceiptByPadId = new Map<
  string,
  {
    evidence: OwnerApprovedNavigationPresentation["evidence"];
    contentFingerprint: string;
  }
>(ownerApprovedNavigationReceiptEntries.map(
  ([padId, evidence, contentFingerprint]) => [padId, { evidence, contentFingerprint }],
));

export function reviewedNavigationSequenceItems(candidate: Pick<ReviewedNavigationCandidate, "reviewedRoadSequence">) {
  return (candidate.reviewedRoadSequence || "")
    .split("→")
    .map((value) => value.trim())
    .filter(Boolean);
}

function reviewedCoordinate(value: ReviewedNavigationCoordinate) {
  const parsed = parseCoordinatePair(value.latitude, value.longitude, "reference");
  if (!parsed.ok) throw new Error("Reviewed navigation contains an invalid coordinate");
  return `${parsed.value.latitude},${parsed.value.longitude}`;
}

/**
 * Builds the only supported client-reviewed Google handoff shape. The phone's
 * location remains the origin, and the three-point mobile waypoint budget is
 * enforced instead of silently dropping a reviewed turn.
 */
export function buildReviewedNavigationUrl(
  destination: ReviewedNavigationCoordinate,
  waypoints: readonly ReviewedNavigationCoordinate[],
) {
  if (!waypoints.length || waypoints.length > 3) {
    throw new Error("Reviewed navigation requires one to three shaping points");
  }
  const parameters = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    dir_action: "navigate",
    destination: reviewedCoordinate(destination),
    waypoints: waypoints.map(reviewedCoordinate).join("|"),
  });
  return `https://www.google.com/maps/dir/?${parameters.toString()}`;
}

export function reviewedNavigationUrlMatchesContract(
  value: string,
  destination: ReviewedNavigationCoordinate,
  waypoints: readonly ReviewedNavigationCoordinate[],
) {
  try {
    const routeUrl = new URL(value);
    const requiredParameters = ["api", "travelmode", "dir_action", "destination", "waypoints"] as const;
    const allowedParameters = new Set(requiredParameters);
    const routeDestination = routeUrl.searchParams.get("destination")?.split(",").map(Number) || [];
    const routeWaypoints = routeUrl.searchParams.get("waypoints")?.split("|").map((point) => point.split(",").map(Number)) || [];
    return routeUrl.origin === "https://www.google.com"
      && routeUrl.pathname === "/maps/dir/"
      && routeUrl.hash === ""
      && !routeUrl.searchParams.has("origin")
      && [...routeUrl.searchParams.keys()].every((key) => allowedParameters.has(key as typeof requiredParameters[number]))
      && requiredParameters.every((key) => routeUrl.searchParams.getAll(key).length === 1)
      && routeUrl.searchParams.get("api") === "1"
      && routeUrl.searchParams.get("travelmode") === "driving"
      && routeUrl.searchParams.get("dir_action") === "navigate"
      && routeDestination.length === 2
      && routeDestination.every(Number.isFinite)
      && Math.abs(routeDestination[0] - destination.latitude) <= 1e-9
      && Math.abs(routeDestination[1] - destination.longitude) <= 1e-9
      && routeWaypoints.length >= 1
      && routeWaypoints.length <= 3
      && routeWaypoints.length === waypoints.length
      && routeWaypoints.every((point, index) => point.length === 2
        && point.every(Number.isFinite)
        && Math.abs(point[0] - waypoints[index].latitude) <= 1e-9
        && Math.abs(point[1] - waypoints[index].longitude) <= 1e-9);
  } catch {
    return false;
  }
}

const LAWSON_ROUTE_DESTINATION = { latitude: 40.124991, longitude: -81.295913 } as const;
const LAWSON_WAYPOINTS = [
  { latitude: 40.123106982, longitude: -81.353948693 },
  { latitude: 40.111789555, longitude: -81.300978103 },
  { latitude: 40.124973191, longitude: -81.294865644 },
] as const;
const BILINOVICH_ROUTE_DESTINATION = { latitude: 40.08738445, longitude: -81.30282620 } as const;
const BILINOVICH_WAYPOINTS = [
  { latitude: 40.123106982, longitude: -81.353948693 },
  { latitude: 40.095894612, longitude: -81.283992781 },
  { latitude: 40.099684564, longitude: -81.297880136 },
] as const;
const BEETLE_ROUTE_DESTINATION = { latitude: 40.185403, longitude: -80.922718 } as const;
const BEETLE_WAYPOINTS = [
  { latitude: 40.1869745925099, longitude: -80.9192177275288 },
  { latitude: 40.185340499, longitude: -80.919294431 },
  { latitude: 40.185025, longitude: -80.920500 },
] as const;
const DUKE_ROUTE_DESTINATION = { latitude: 40.214409, longitude: -80.891316 } as const;
const DUKE_WAYPOINTS = [
  { latitude: 40.2376772526251, longitude: -80.9645933421097 },
  { latitude: 40.2344651449313, longitude: -80.9216048043883 },
  { latitude: 40.2438460898288, longitude: -80.9156965297937 },
] as const;
const PORTERFIELD_ROUTE_DESTINATION = { latitude: 40.090431, longitude: -80.928503 } as const;
const PORTERFIELD_WAYPOINTS = [
  { latitude: 40.073689, longitude: -80.945041 },
  { latitude: 40.088246, longitude: -80.944086 },
  { latitude: 40.090469, longitude: -80.928294 },
] as const;
const PORTERFIELD_B_ROUTE_DESTINATION = { latitude: 40.090438, longitude: -80.921210 } as const;
const PORTERFIELD_B_WAYPOINTS = [
  { latitude: 40.073689, longitude: -80.945041 },
  { latitude: 40.088246, longitude: -80.944086 },
  { latitude: 40.090469, longitude: -80.928294 },
] as const;
const BAKOS_ROUTE_DESTINATION = { latitude: 40.151125, longitude: -80.852968 } as const;
const BAKOS_WAYPOINTS = [
  { latitude: 40.1516769902779, longitude: -80.8451322878882 },
  { latitude: 40.1510618834494, longitude: -80.8504752159943 },
] as const;
const BANNOCK_ROUTE_DESTINATION = { latitude: 40.111003, longitude: -81.002932 } as const;
const BANNOCK_WAYPOINTS = [
  { latitude: 40.10871301297529, longitude: -80.97829303262223 },
] as const;
const ROCK_RIDGE_ROUTE_DESTINATION = { latitude: 39.998772, longitude: -81.224825 } as const;
const ROCK_RIDGE_WAYPOINTS = [
  { latitude: 40.007077099, longitude: -81.176502113 },
  { latitude: 40.007544767, longitude: -81.205526285 },
  { latitude: 39.997476604, longitude: -81.217520411 },
] as const;
const CROWIE_ROUTE_DESTINATION = { latitude: 40.0979, longitude: -80.9384 } as const;
const CROWIE_WAYPOINTS = [
  { latitude: 40.073689, longitude: -80.945041 },
  { latitude: 40.088246, longitude: -80.944086 },
] as const;
const CASTON_ROUTE_DESTINATION = { latitude: 40.130458, longitude: -81.328059 } as const;
const CASTON_WAYPOINTS = [
  { latitude: 40.123106982, longitude: -81.353948693 },
  { latitude: 40.113698669772, longitude: -81.314757942078 },
  { latitude: 40.127876178092, longitude: -81.316090497685 },
] as const;
const GIL_ROUTE_DESTINATION = { latitude: 40.09387, longitude: -81.29646 } as const;
const GIL_WAYPOINTS = [
  { latitude: 40.123106982, longitude: -81.353948693 },
  { latitude: 40.095922776519, longitude: -81.284173854530 },
  { latitude: 40.099552104984, longitude: -81.297815548031 },
] as const;
const GILCHER_ROUTE_DESTINATION = { latitude: 40.100079, longitude: -81.295657 } as const;
const GILCHER_WAYPOINTS = [
  { latitude: 40.123106982, longitude: -81.353948693 },
  { latitude: 40.105015636324, longitude: -81.279619885553 },
  { latitude: 40.095922776519, longitude: -81.284173854530 },
] as const;
const LAKE_ROUTE_DESTINATION = { latitude: 40.14776, longitude: -81.295527 } as const;
const LAKE_WAYPOINTS = [
  { latitude: 40.123106982, longitude: -81.353948693 },
  { latitude: 40.111840810550, longitude: -81.300972387724 },
  { latitude: 40.134573026404, longitude: -81.287284993921 },
] as const;
const THOMAS_ROUTE_DESTINATION = { latitude: 40.096986, longitude: -81.307667 } as const;
const THOMAS_WAYPOINTS = [
  { latitude: 40.087850494651, longitude: -81.320561551360 },
] as const;
const TROYER_ROUTE_DESTINATION = { latitude: 40.087025, longitude: -81.259818 } as const;
const TROYER_WAYPOINTS = [
  { latitude: 40.123106982, longitude: -81.353948693 },
  { latitude: 40.104665560, longitude: -81.273528365 },
  { latitude: 40.083490401, longitude: -81.263386973 },
] as const;
const CIRCLE_OAKS_ROUTE_DESTINATION = { latitude: 40.176413, longitude: -81.348770 } as const;
const CIRCLE_OAKS_WAYPOINTS = [
  { latitude: 40.211888715, longitude: -81.390778629 },
  { latitude: 40.204197138, longitude: -81.382414119 },
] as const;
const SADLER_ROUTE_DESTINATION = { latitude: 40.207568, longitude: -80.935841 } as const;
const SADLER_WAYPOINTS = [
  { latitude: 40.218227603057535, longitude: -80.94472982304073 },
] as const;
const TOWE_ROUTE_DESTINATION = { latitude: 40.385998, longitude: -81.212569 } as const;
const TOWE_WAYPOINTS = [
  { latitude: 40.36026193640823, longitude: -81.218134577079 },
  { latitude: 40.379819440170614, longitude: -81.20908591279908 },
] as const;
const DUTTON_ROUTE_DESTINATION = { latitude: 40.150027, longitude: -81.017133 } as const;
const DUTTON_WAYPOINTS = [
  { latitude: 40.143135410968, longitude: -81.033512001895 },
] as const;
const KUNGLE_B_ROUTE_DESTINATION = { latitude: 39.88678, longitude: -80.87008 } as const;
const KUNGLE_B_WAYPOINTS = [
  { latitude: 39.886820116283, longitude: -80.869735364419 },
] as const;
const TRUCHAN_NW_ROUTE_DESTINATION = { latitude: 40.147814, longitude: -80.935886 } as const;
const TRUCHAN_NW_WAYPOINTS = [
  { latitude: 40.151952334248, longitude: -80.961064815011 },
  { latitude: 40.15863093394, longitude: -80.943718975075 },
] as const;
const MOONSTONE_ROUTE_DESTINATION = { latitude: 39.83664, longitude: -81.379628 } as const;
const MOONSTONE_WAYPOINTS = [
  { latitude: 39.829803091222, longitude: -81.379580538853 },
] as const;
const JEFFCO_ROUTE_DESTINATION = { latitude: 40.292482, longitude: -80.896856 } as const;
const JEFFCO_WAYPOINTS = [
  { latitude: 40.3144086, longitude: -80.8963895 },
  { latitude: 40.2968376, longitude: -80.9022309 },
] as const;
const KUNGLE_A_ROUTE_DESTINATION = { latitude: 39.88507, longitude: -80.88258 } as const;
const KUNGLE_A_WAYPOINTS = [
  { latitude: 39.886820116283, longitude: -80.869735364419 },
] as const;
const TRUCHAN_NE_ROUTE_DESTINATION = { latitude: 40.146637, longitude: -80.931651 } as const;
const TRUCHAN_NE_WAYPOINTS = [
  { latitude: 40.151952334248, longitude: -80.961064815011 },
  { latitude: 40.15863093394, longitude: -80.943718975075 },
  { latitude: 40.146780343386, longitude: -80.934175287918 },
] as const;
const MATUSEK_ROUTE_DESTINATION = { latitude: 40.146555, longitude: -80.922785 } as const;
const MATUSEK_WAYPOINTS = [
  { latitude: 40.151952334248, longitude: -80.961064815011 },
  { latitude: 40.15863093394, longitude: -80.943718975075 },
  { latitude: 40.146780343386, longitude: -80.934175287918 },
] as const;
const LORRAINE_ROUTE_DESTINATION = { latitude: 40.09955, longitude: -80.840213 } as const;
const LORRAINE_WAYPOINTS = [
  { latitude: 40.149707596819, longitude: -80.842549734013 },
  { latitude: 40.116658061827, longitude: -80.859991873154 },
  { latitude: 40.101497884455, longitude: -80.841503024754 },
] as const;
const PANG_ROUTE_DESTINATION = { latitude: 40.147178, longitude: -80.948742 } as const;
const PANG_WAYPOINTS = [
  { latitude: 40.151952334248, longitude: -80.961064815011 },
] as const;
const HASTINGS_ROUTE_DESTINATION = { latitude: 40.163138, longitude: -81.021428 } as const;
const HASTINGS_WAYPOINTS = [
  { latitude: 40.160397859316, longitude: -81.016701259012 },
] as const;
const WHEELING_VALLEY_ROUTE_DESTINATION = { latitude: 40.153061, longitude: -80.923517 } as const;
const WHEELING_VALLEY_WAYPOINTS = [
  { latitude: 40.15863093394, longitude: -80.943718975075 },
  { latitude: 40.147055385412, longitude: -80.922842319818 },
  { latitude: 40.153787436713, longitude: -80.924159995223 },
] as const;
const JACKALOPE_ROUTE_DESTINATION = { latitude: 40.164159, longitude: -81.356092 } as const;
const JACKALOPE_WAYPOINTS = [
  { latitude: 40.211888715, longitude: -81.390778629 },
  { latitude: 40.204197138, longitude: -81.382414119 },
  { latitude: 40.174296992, longitude: -81.360075011 },
] as const;
const LODGE_ROUTE_DESTINATION = { latitude: 40.164138, longitude: -81.351162 } as const;
const LODGE_WAYPOINTS = JACKALOPE_WAYPOINTS;
const ECHO_ROUTE_DESTINATION = { latitude: 40.179321, longitude: -81.026812 } as const;
const ECHO_WAYPOINTS = [
  { latitude: 40.185661298825, longitude: -81.014226704981 },
  { latitude: 40.164465208939, longitude: -81.016699529454 },
  { latitude: 40.173032633439, longitude: -81.025592955042 },
] as const;
const NORTH_STAR_ROUTE_DESTINATION = { latitude: 39.739847, longitude: -81.420197 } as const;
const NORTH_STAR_WAYPOINTS = [
  { latitude: 39.774007303642, longitude: -81.451385717411 },
  { latitude: 39.755313742543, longitude: -81.424376369949 },
] as const;
const LODESTAR_ROUTE_DESTINATION = { latitude: 39.750091, longitude: -81.409571 } as const;
const LODESTAR_WAYPOINTS = [
  { latitude: 39.774007303642, longitude: -81.451385717411 },
  { latitude: 39.754750338267, longitude: -81.412456525463 },
] as const;
const WINSTON_SMITH_ROUTE_DESTINATION = { latitude: 39.752765, longitude: -81.396584 } as const;
const WINSTON_SMITH_WAYPOINTS = [
  { latitude: 39.774007303642, longitude: -81.451385717411 },
  { latitude: 39.754750338267, longitude: -81.412456525463 },
  { latitude: 39.747281218039, longitude: -81.405362294553 },
] as const;
const ALBATROSS_ROUTE_DESTINATION = { latitude: 40.079353, longitude: -81.224381 } as const;
const ALBATROSS_WAYPOINTS = [
  { latitude: 40.0817058, longitude: -81.2127365 },
] as const;
const MALDON_ROUTE_DESTINATION = { latitude: 40.010241, longitude: -81.197285 } as const;
const MALDON_WAYPOINTS = [
  { latitude: 40.0068106, longitude: -81.1762346 },
  { latitude: 40.0106308, longitude: -81.1957784 },
] as const;
const WITHEY_ROUTE_DESTINATION = { latitude: 39.962005, longitude: -81.216813 } as const;
const WITHEY_WAYPOINTS = [
  { latitude: 39.967149, longitude: -81.2055552 },
] as const;
// Frozen owner-confirmed driver rule: this existing control preserves
// Cadiz Road / US-22 -> Repik Lane / TR-9876 -> the exact trusted pin.
// A named public road followed to the pin is sufficient for this reviewed
// handoff; it does not create pad-deck or lease geometry or route authority.
const SKULL_FORK_ROUTE_DESTINATION = { latitude: 40.159734, longitude: -81.260675 } as const;
const SKULL_FORK_WAYPOINTS = [
  { latitude: 40.167610, longitude: -81.259685 },
] as const;
const HOOP_ROUTE_DESTINATION = { latitude: 40.166384, longitude: -81.325728 } as const;
const HOOP_WAYPOINTS = [
  { latitude: 40.053083897672, longitude: -81.551936547892 },
  { latitude: 40.1495834623593, longitude: -81.3150932898081 },
  { latitude: 40.1536867643988, longitude: -81.3127475000983 },
] as const;
const BRAVO_ROUTE_DESTINATION = { latitude: 40.178556, longitude: -81.015064 } as const;
const BRAVO_WAYPOINTS = [
  { latitude: 40.1849138, longitude: -80.9958138 },
] as const;
const RUTH_ROUTE_DESTINATION = { latitude: 40.173626, longitude: -80.879115 } as const;
const RUTH_WAYPOINTS = [
  { latitude: 40.1771191, longitude: -80.8806516 },
] as const;
const PICKENS_ROUTE_DESTINATION = { latitude: 40.182544, longitude: -80.977135 } as const;
const PICKENS_WAYPOINTS = [
  { latitude: 40.1868067, longitude: -80.9781928 },
] as const;
const ATHENA_ROUTE_DESTINATION = { latitude: 40.278613, longitude: -80.765988 } as const;
const ATHENA_WAYPOINTS = [
  { latitude: 40.2799914, longitude: -80.7619003 },
] as const;
const RICHLAND_B_ROUTE_DESTINATION = { latitude: 40.077481, longitude: -80.995772 } as const;
const RICHLAND_B_WAYPOINTS = [
  { latitude: 40.075237, longitude: -80.990567 },
  { latitude: 40.076936, longitude: -80.994184 },
] as const;
const LAVADA_ROUTE_DESTINATION = { latitude: 39.97411, longitude: -81.412098 } as const;
const LAVADA_WAYPOINTS = [
  { latitude: 39.981189, longitude: -81.414833 },
] as const;
const WAMPUM_ROUTE_DESTINATION = { latitude: 39.962923, longitude: -81.440117 } as const;
const WAMPUM_WAYPOINTS = [
  { latitude: 39.941409, longitude: -81.446907 },
  { latitude: 39.953452, longitude: -81.440293 },
  { latitude: 39.961901, longitude: -81.441644 },
] as const;
const SLABAUGH_ROUTE_DESTINATION = { latitude: 39.95541, longitude: -81.4408 } as const;
const SLABAUGH_WAYPOINTS = [
  { latitude: 39.941409, longitude: -81.446907 },
  { latitude: 39.952222, longitude: -81.440069 },
] as const;
const RECTOR_C_ROUTE_DESTINATION = { latitude: 39.955552, longitude: -81.395087 } as const;
const RECTOR_C_WAYPOINTS = [
  { latitude: 39.941409, longitude: -81.446907 },
  { latitude: 39.9652842, longitude: -81.3804816 },
] as const;
const TARPLEY_ROUTE_DESTINATION = { latitude: 40.063839, longitude: -81.293734 } as const;
const TARPLEY_WAYPOINTS = [
  { latitude: 40.05541, longitude: -81.319658 },
  { latitude: 40.058189, longitude: -81.295487 },
] as const;
const ALABASTER_ROUTE_DESTINATION = { latitude: 39.753932, longitude: -81.340877 } as const;
const ALABASTER_WAYPOINTS = [
  { latitude: 39.781098, longitude: -81.326968 },
  { latitude: 39.764877, longitude: -81.318449 },
  { latitude: 39.759918, longitude: -81.333307 },
] as const;
const COOK_ROUTE_DESTINATION = { latitude: 40.002019, longitude: -80.875167 } as const;
const COOK_WAYPOINTS = [
  { latitude: 40.002767, longitude: -80.875883 },
  { latitude: 40.002715, longitude: -80.875455 },
] as const;
const SIDWELL_ROUTE_DESTINATION = { latitude: 40.146316, longitude: -80.979282 } as const;
const SIDWELL_WAYPOINTS = [
  { latitude: 40.137945, longitude: -80.952025 },
  { latitude: 40.149932, longitude: -80.974296 },
] as const;
const DONNA_ROUTE_DESTINATION = { latitude: 40.123656, longitude: -81.252093 } as const;
const DONNA_WAYPOINTS = [
  { latitude: 40.142887, longitude: -81.262548 },
  { latitude: 40.120272, longitude: -81.254445 },
] as const;
const CECELIA_ROUTE_DESTINATION = { latitude: 40.282447, longitude: -80.756322 } as const;
const CECELIA_WAYPOINTS = [
  { latitude: 40.28077, longitude: -80.758898 },
  { latitude: 40.282425, longitude: -80.757726 },
] as const;
const DICKSON_ROUTE_DESTINATION = { latitude: 40.307082, longitude: -80.694744 } as const;
const DICKSON_WAYPOINTS = [
  { latitude: 40.355752, longitude: -80.808421 },
  { latitude: 40.346345, longitude: -80.814842 },
  { latitude: 40.316061, longitude: -80.716008 },
] as const;
const SHUTWAY_ROUTE_DESTINATION = { latitude: 40.113559, longitude: -81.076149 } as const;
const SHUTWAY_WAYPOINTS = [
  { latitude: 40.113608, longitude: -81.077486 },
] as const;
const CARLOS_ROUTE_DESTINATION = { latitude: 40.042305, longitude: -80.972809 } as const;
const CARLOS_WAYPOINTS = [
  { latitude: 40.0295248, longitude: -81.0390724 },
  { latitude: 40.03522, longitude: -80.974717 },
  { latitude: 40.03788, longitude: -80.975034 },
] as const;
const CRAVAT_NORTH_ROUTE_DESTINATION = { latitude: 40.158191, longitude: -80.913312 } as const;
const CRAVAT_NORTH_WAYPOINTS = [
  { latitude: 40.0691313, longitude: -80.9002496 },
  { latitude: 40.151952334248, longitude: -80.961064815011 },
  { latitude: 40.165847, longitude: -80.936123 },
] as const;
const KURTH_ROUTE_DESTINATION = { latitude: 40.031709, longitude: -80.841961 } as const;
const KURTH_WAYPOINTS = [
  { latitude: 40.0537082, longitude: -80.9182359 },
  { latitude: 40.039338, longitude: -80.857119 },
  { latitude: 40.03185, longitude: -80.842057 },
] as const;
const PUGGLE_ROUTE_DESTINATION = { latitude: 40.318098, longitude: -80.774283 } as const;
const PUGGLE_WAYPOINTS = [
  { latitude: 40.341887, longitude: -80.815764 },
  { latitude: 40.340191, longitude: -80.795637 },
  { latitude: 40.322794, longitude: -80.778771 },
] as const;
const REITZ_ROUTE_DESTINATION = { latitude: 39.95176, longitude: -80.857579 } as const;
const REITZ_WAYPOINTS = [
  { latitude: 39.973035, longitude: -80.866785 },
  { latitude: 39.957356, longitude: -80.858561 },
] as const;
const ELITE_ROUTE_DESTINATION = { latitude: 40.188588, longitude: -80.805198 } as const;
const ELITE_WAYPOINTS = [
  { latitude: 40.18229024541456, longitude: -80.81216401929144 },
] as const;
const MARQUARD_ROUTE_DESTINATION = { latitude: 40.190145, longitude: -80.798772 } as const;
const MARQUARD_WAYPOINTS = [
  { latitude: 40.18229024541456, longitude: -80.81216401929144 },
] as const;
const J_BARR_J_ROUTE_DESTINATION = { latitude: 40.03226, longitude: -81.263847 } as const;
const J_BARR_J_WAYPOINTS = [
  { latitude: 40.017045, longitude: -81.299503 },
  { latitude: 40.024285, longitude: -81.282984 },
] as const;
const MOHOROVICH_ROUTE_DESTINATION = { latitude: 39.951763, longitude: -81.374778 } as const;
const MOHOROVICH_WAYPOINTS = [
  { latitude: 40.017045, longitude: -81.299503 },
  { latitude: 39.9537789, longitude: -81.3563461 },
  { latitude: 39.9408465, longitude: -81.3706626 },
] as const;
const WATSON_ROUTE_DESTINATION = { latitude: 39.963226, longitude: -81.362466 } as const;
const WATSON_WAYPOINTS = [
  { latitude: 40.017045, longitude: -81.299503 },
  { latitude: 39.9537789, longitude: -81.3563461 },
  { latitude: 39.9408465, longitude: -81.3706626 },
] as const;
const CRAVAT_COAL_ROUTE_DESTINATION = { latitude: 40.168593, longitude: -80.931288 } as const;
const CRAVAT_COAL_WAYPOINTS = [
  { latitude: 40.071, longitude: -80.9002 },
  { latitude: 40.154305, longitude: -80.952863 },
  { latitude: 40.165847, longitude: -80.936123 },
] as const;
const MONROE_NORTH_ROUTE_DESTINATION = { latitude: 39.822655, longitude: -80.851694 } as const;
const MONROE_NORTH_WAYPOINTS = [
  { latitude: 39.834949, longitude: -80.827452 },
  { latitude: 39.827478, longitude: -80.843496 },
  { latitude: 39.8235, longitude: -80.85185 },
] as const;
const CERMAK_ROUTE_DESTINATION = { latitude: 40.244707, longitude: -80.807728 } as const;
const CERMAK_WAYPOINTS = [
  { latitude: 40.25843, longitude: -80.796177 },
  { latitude: 40.250469, longitude: -80.806159 },
] as const;

// Existing phone-validated handoffs are intentionally byte-for-byte stable.
// Building them from JavaScript numbers can drop reviewed trailing zeroes even
// though the coordinates are numerically equivalent.
export const LAWSON_REVIEWED_GOOGLE_URL = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.124991%2C-81.295913&waypoints=40.123106982%2C-81.353948693%7C40.111789555%2C-81.300978103%7C40.124973191%2C-81.294865644";
export const BILINOVICH_REVIEWED_GOOGLE_URL = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.08738445%2C-81.30282620&waypoints=40.123106982%2C-81.353948693%7C40.095894612%2C-81.283992781%7C40.099684564%2C-81.297880136";
export const BEETLE_REVIEWED_GOOGLE_URL = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.185403%2C-80.922718&waypoints=40.1869745925099%2C-80.9192177275288%7C40.185340499%2C-80.919294431%7C40.185025%2C-80.920500";
export const DUKE_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(DUKE_ROUTE_DESTINATION, DUKE_WAYPOINTS);
export const PORTERFIELD_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(PORTERFIELD_ROUTE_DESTINATION, PORTERFIELD_WAYPOINTS);
export const PORTERFIELD_B_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(PORTERFIELD_B_ROUTE_DESTINATION, PORTERFIELD_B_WAYPOINTS);
export const BAKOS_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(BAKOS_ROUTE_DESTINATION, BAKOS_WAYPOINTS);
export const BANNOCK_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(BANNOCK_ROUTE_DESTINATION, BANNOCK_WAYPOINTS);
export const ROCK_RIDGE_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(ROCK_RIDGE_ROUTE_DESTINATION, ROCK_RIDGE_WAYPOINTS);
export const CROWIE_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(CROWIE_ROUTE_DESTINATION, CROWIE_WAYPOINTS);
export const CASTON_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(CASTON_ROUTE_DESTINATION, CASTON_WAYPOINTS);
export const GIL_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(GIL_ROUTE_DESTINATION, GIL_WAYPOINTS);
export const GILCHER_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(GILCHER_ROUTE_DESTINATION, GILCHER_WAYPOINTS);
export const LAKE_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(LAKE_ROUTE_DESTINATION, LAKE_WAYPOINTS);
export const THOMAS_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(THOMAS_ROUTE_DESTINATION, THOMAS_WAYPOINTS);
export const TROYER_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(TROYER_ROUTE_DESTINATION, TROYER_WAYPOINTS);
export const CIRCLE_OAKS_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(CIRCLE_OAKS_ROUTE_DESTINATION, CIRCLE_OAKS_WAYPOINTS);
export const SADLER_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(SADLER_ROUTE_DESTINATION, SADLER_WAYPOINTS);
export const TOWE_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(TOWE_ROUTE_DESTINATION, TOWE_WAYPOINTS);
export const DUTTON_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(DUTTON_ROUTE_DESTINATION, DUTTON_WAYPOINTS);
export const KUNGLE_B_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(KUNGLE_B_ROUTE_DESTINATION, KUNGLE_B_WAYPOINTS);
export const TRUCHAN_NW_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(TRUCHAN_NW_ROUTE_DESTINATION, TRUCHAN_NW_WAYPOINTS);
export const MOONSTONE_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(MOONSTONE_ROUTE_DESTINATION, MOONSTONE_WAYPOINTS);
export const JEFFCO_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(JEFFCO_ROUTE_DESTINATION, JEFFCO_WAYPOINTS);
export const KUNGLE_A_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(KUNGLE_A_ROUTE_DESTINATION, KUNGLE_A_WAYPOINTS);
export const TRUCHAN_NE_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(TRUCHAN_NE_ROUTE_DESTINATION, TRUCHAN_NE_WAYPOINTS);
export const MATUSEK_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(MATUSEK_ROUTE_DESTINATION, MATUSEK_WAYPOINTS);
export const LORRAINE_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(LORRAINE_ROUTE_DESTINATION, LORRAINE_WAYPOINTS);
export const PANG_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(PANG_ROUTE_DESTINATION, PANG_WAYPOINTS);
export const HASTINGS_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(HASTINGS_ROUTE_DESTINATION, HASTINGS_WAYPOINTS);
export const WHEELING_VALLEY_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(WHEELING_VALLEY_ROUTE_DESTINATION, WHEELING_VALLEY_WAYPOINTS);
export const JACKALOPE_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(JACKALOPE_ROUTE_DESTINATION, JACKALOPE_WAYPOINTS);
export const LODGE_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(LODGE_ROUTE_DESTINATION, LODGE_WAYPOINTS);
export const ECHO_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(ECHO_ROUTE_DESTINATION, ECHO_WAYPOINTS);
export const NORTH_STAR_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(NORTH_STAR_ROUTE_DESTINATION, NORTH_STAR_WAYPOINTS);
export const LODESTAR_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(LODESTAR_ROUTE_DESTINATION, LODESTAR_WAYPOINTS);
export const WINSTON_SMITH_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(WINSTON_SMITH_ROUTE_DESTINATION, WINSTON_SMITH_WAYPOINTS);
export const ALBATROSS_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(ALBATROSS_ROUTE_DESTINATION, ALBATROSS_WAYPOINTS);
export const MALDON_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(MALDON_ROUTE_DESTINATION, MALDON_WAYPOINTS);
export const WITHEY_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(WITHEY_ROUTE_DESTINATION, WITHEY_WAYPOINTS);
export const SKULL_FORK_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(SKULL_FORK_ROUTE_DESTINATION, SKULL_FORK_WAYPOINTS);
export const HOOP_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(HOOP_ROUTE_DESTINATION, HOOP_WAYPOINTS);
export const BRAVO_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(BRAVO_ROUTE_DESTINATION, BRAVO_WAYPOINTS);
export const RUTH_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(RUTH_ROUTE_DESTINATION, RUTH_WAYPOINTS);
export const PICKENS_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(PICKENS_ROUTE_DESTINATION, PICKENS_WAYPOINTS);
export const ATHENA_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(ATHENA_ROUTE_DESTINATION, ATHENA_WAYPOINTS);
export const RICHLAND_B_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(RICHLAND_B_ROUTE_DESTINATION, RICHLAND_B_WAYPOINTS);
export const LAVADA_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(LAVADA_ROUTE_DESTINATION, LAVADA_WAYPOINTS);
export const WAMPUM_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(WAMPUM_ROUTE_DESTINATION, WAMPUM_WAYPOINTS);
export const SLABAUGH_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(SLABAUGH_ROUTE_DESTINATION, SLABAUGH_WAYPOINTS);
export const RECTOR_C_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(RECTOR_C_ROUTE_DESTINATION, RECTOR_C_WAYPOINTS);
export const TARPLEY_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(TARPLEY_ROUTE_DESTINATION, TARPLEY_WAYPOINTS);
export const ALABASTER_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(ALABASTER_ROUTE_DESTINATION, ALABASTER_WAYPOINTS);
export const COOK_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(COOK_ROUTE_DESTINATION, COOK_WAYPOINTS);
export const SIDWELL_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(SIDWELL_ROUTE_DESTINATION, SIDWELL_WAYPOINTS);
export const DONNA_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(DONNA_ROUTE_DESTINATION, DONNA_WAYPOINTS);
export const CECELIA_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(CECELIA_ROUTE_DESTINATION, CECELIA_WAYPOINTS);
export const DICKSON_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(DICKSON_ROUTE_DESTINATION, DICKSON_WAYPOINTS);
export const SHUTWAY_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(SHUTWAY_ROUTE_DESTINATION, SHUTWAY_WAYPOINTS);
export const CARLOS_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(CARLOS_ROUTE_DESTINATION, CARLOS_WAYPOINTS);
export const CRAVAT_NORTH_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(CRAVAT_NORTH_ROUTE_DESTINATION, CRAVAT_NORTH_WAYPOINTS);
export const KURTH_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(KURTH_ROUTE_DESTINATION, KURTH_WAYPOINTS);
export const PUGGLE_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(PUGGLE_ROUTE_DESTINATION, PUGGLE_WAYPOINTS);
export const REITZ_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(REITZ_ROUTE_DESTINATION, REITZ_WAYPOINTS);
export const ELITE_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(ELITE_ROUTE_DESTINATION, ELITE_WAYPOINTS);
export const MARQUARD_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(MARQUARD_ROUTE_DESTINATION, MARQUARD_WAYPOINTS);
export const J_BARR_J_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(J_BARR_J_ROUTE_DESTINATION, J_BARR_J_WAYPOINTS);
export const MOHOROVICH_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(MOHOROVICH_ROUTE_DESTINATION, MOHOROVICH_WAYPOINTS);
export const WATSON_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(WATSON_ROUTE_DESTINATION, WATSON_WAYPOINTS);
export const CRAVAT_COAL_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(CRAVAT_COAL_ROUTE_DESTINATION, CRAVAT_COAL_WAYPOINTS);
export const MONROE_NORTH_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(MONROE_NORTH_ROUTE_DESTINATION, MONROE_NORTH_WAYPOINTS);
export const CERMAK_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(CERMAK_ROUTE_DESTINATION, CERMAK_WAYPOINTS);

interface ReviewedNavigationContract extends ReviewedNavigationCandidate {
  canonicalId: string;
  legacyId: string;
  recordRevision: string;
  company: string;
  padName: string;
  state: string;
  county: string;
  structuredRoadSequence: string;
  trustedDestination: {
    latitude: number;
    longitude: number;
    source: PadDestinationSource;
  };
  routeDestination: ReviewedNavigationCoordinate;
  routeDestinationOverride?: "bilinovich_reviewed_odnr_pad_surface";
  waypoints: readonly ReviewedNavigationCoordinate[];
  selectedTerminalPublicRoadSequence?: readonly string[];
}

const ascentSavedDirectionExactMatchBatch1Contracts: readonly ReviewedNavigationContract[] =
  ascentSavedDirectionExactMatchBatch1.map((record) => ({
    padId: record.padId,
    canonicalId: record.canonicalId,
    legacyId: record.legacyId,
    recordRevision: record.recordRevision,
    company: record.company,
    padName: record.padName,
    state: record.state,
    county: record.county,
    structuredRoadSequence: record.structuredRoadSequence,
    title: record.title,
    detail: record.detail,
    routeUrl: buildReviewedNavigationUrl(record.routeDestination, record.waypoints),
    reviewedRoadSequence: record.reviewedRoadSequence,
    finalLegNotice: record.finalLegNotice,
    preserveMeasuredApproach: record.preserveMeasuredApproach,
    trustedDestination: {
      latitude: record.trustedDestination.latitude,
      longitude: record.trustedDestination.longitude,
      source: record.trustedDestination.source,
    },
    routeDestination: record.routeDestination,
    waypoints: record.waypoints,
    selectedTerminalPublicRoadSequence: record.selectedTerminalPublicRoadSequence,
  }));

const reviewedNavigationContracts: readonly ReviewedNavigationContract[] = [
  {
    padId: "143f5268-33e4-4598-8101-40220b5cfdc4",
    canonicalId: "143f5268-33e4-4598-8101-40220b5cfdc4",
    legacyId: "ascent--lawson",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "LAWSON",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "US-22 → Mc Coy Rd → Tyson Mill Rd → Millers Fork Rd → OR → US-250 → US-22 → Mc Coy Rd → Tyson Mill Rd → Millers Fork Rd → OR → I-70 → Exit 193 → OH-513 → US-22 → Mc Coy Rd → Tyson Mill Rd → Millers Fork Rd",
    title: "Navigate reviewed route",
    detail: "Reviewed road core → saved GPS · graph status separate",
    routeUrl: LAWSON_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "US-22 → McCoy Rd → Tyson Mill Rd → Millers Fork Rd → saved LAWSON GPS",
    finalLegNotice: "The owner-approved directions follow the exact US-22, McCoy Road, Tyson Mill Road, and Millers Fork Road identities in order. The saved LAWSON GPS remains a destination reference rather than a verified entrance or approved graph endpoint; no route line or public-Google release is created.",
    trustedDestination: {
      latitude: 40.124991,
      longitude: -81.295913,
      source: "saved_pad_gps",
    },
    routeDestination: LAWSON_ROUTE_DESTINATION,
    waypoints: LAWSON_WAYPOINTS,
  },
  {
    padId: "59061829-1122-4aae-872d-cf5024310373",
    canonicalId: "59061829-1122-4aae-872d-cf5024310373",
    legacyId: "ascent--bilinovich",
    recordRevision: "1787802711836476",
    company: "Ascent",
    padName: "BILINOVICH",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "US-22 E → McCoy Rd / CR-82 → Merry Rd / TR-967 → Penrose Rd / CR-694 → Logan Rd / CR-964 → Turkle Rd / TR-693 → trusted lease approach → BILINOVICH",
    title: "Navigate reviewed route",
    detail: "McCoy → Merry → Penrose → Logan → Turkle → pad GPS",
    routeUrl: BILINOVICH_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "US-22 → McCoy Rd / CR-82 → Merry Rd / TR-967 → Penrose Rd / CR-694 → Logan Rd / CR-964 → Turkle Rd / TR-693 → trusted lease approach → BILINOVICH pad-surface destination",
    finalLegNotice: "The owner-approved no-Blaze directions follow McCoy, Merry, Penrose, Logan, and Turkle in order. The action keeps the separately reviewed ODNR pad-surface destination, while the trusted lease approach remains a reference and the private final geometry and entrance remain unapproved; no graph line or public-Google release is created.",
    // The current record's saved reference is the reviewed lease approach.
    // The separately reviewed URL continues to the ODNR pad-surface point.
    trustedDestination: {
      latitude: 40.08863,
      longitude: -81.304164,
      source: "saved_pad_gps",
    },
    routeDestination: BILINOVICH_ROUTE_DESTINATION,
    routeDestinationOverride: "bilinovich_reviewed_odnr_pad_surface",
    waypoints: BILINOVICH_WAYPOINTS,
  },
  {
    // The first waypoint is 20 metres inside Sixteen Road from its verified
    // OH-519 junction. This avoids exact-intersection waypoint ambiguity and
    // is designed to accept either state-route direction at the turn.
    padId: "0e6f23f1-3bfb-44b0-aa4e-f24dde611880",
    canonicalId: "0e6f23f1-3bfb-44b0-aa4e-f24dde611880",
    legacyId: "ascent--beetle",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "BEETLE",
    state: "Ohio",
    county: "Harrison",
    structuredRoadSequence: "OH-519 → US-250 → Pad",
    title: "Navigate reviewed route",
    detail: "OH-519 → Sixteen Rd → lease approach · GPS-only final leg",
    routeUrl: BEETLE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "OH-519 → Sixteen Rd → lease approach → saved pad GPS",
    finalLegNotice: "Sixteen Road is the reviewed local-road approach. The satellite-supported lease entrance, lease shaping point, and remaining leg to the saved pad GPS are not approved public-road geometry.",
    trustedDestination: {
      latitude: 40.185403,
      longitude: -80.922718,
      source: "saved_pad_gps",
    },
    routeDestination: BEETLE_ROUTE_DESTINATION,
    waypoints: BEETLE_WAYPOINTS,
  },
  {
    // DUKE reuses only COLOGIE's three independently proven local turn
    // controls. Its exact saved destination and record binding remain unique.
    padId: "bb351070-6c94-45e5-942f-e155f9e86f7e",
    canonicalId: "bb351070-6c94-45e5-942f-e155f9e86f7e",
    legacyId: "ascent--duke",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "DUKE",
    state: "Ohio",
    county: "Harrison",
    structuredRoadSequence: "US-250 → Foxes Bottom Rd → Springdale Hill Rd → Lamborn Rd",
    title: "Navigate reviewed route",
    detail: "Foxes Bottom → Springdale Hill → Lamborn → saved GPS",
    routeUrl: DUKE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "US-250 → Foxes Bottom Rd → Springdale Hill Rd → Lamborn Rd → saved pad GPS",
    finalLegNotice: "The reviewed local-road handoff ends at DUKE's exact saved GPS on Lamborn Road. Exact graph and public Google authority remain separate.",
    trustedDestination: {
      latitude: 40.214409,
      longitude: -80.891316,
      source: "saved_pad_gps",
    },
    routeDestination: DUKE_ROUTE_DESTINATION,
    waypoints: DUKE_WAYPOINTS,
  },
  {
    padId: "0b7105a0-1b36-4182-8d10-1f2e297c8bab",
    canonicalId: "0b7105a0-1b36-4182-8d10-1f2e297c8bab",
    legacyId: "ascent--porterfield-gas-unit",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "PORTERFIELD GAS UNIT",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 215 → US-40 → Vineyard Rd → OR → OH-331 → US-40 → Vineyard Rd",
    title: "Navigate reviewed route",
    detail: "US-40 → Vineyard Rd → saved GPS",
    routeUrl: PORTERFIELD_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "I-70 → Exit 215 → US-40 W → Vineyard Rd / CR-56 → saved pad GPS",
    finalLegNotice: "The reviewed handoff follows US-40 to Vineyard Road and ends at PORTERFIELD GAS UNIT's exact saved GPS. Exact graph and public Google authority remain separate.",
    trustedDestination: {
      latitude: 40.090431,
      longitude: -80.928503,
      source: "saved_pad_gps",
    },
    routeDestination: PORTERFIELD_ROUTE_DESTINATION,
    waypoints: PORTERFIELD_WAYPOINTS,
  },
  {
    padId: "41f0bfc3-7be1-450f-abfc-96dce544547b",
    canonicalId: "41f0bfc3-7be1-450f-abfc-96dce544547b",
    legacyId: "ascent--porterfield-b",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "PORTERFIELD B",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 215 → US-40 → Vineyard Rd → Lease Road → OR → OH-331 → US-40 → Vineyard Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "US-40 → Vineyard Rd → saved GPS",
    routeUrl: PORTERFIELD_B_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approach → US-40 W → Vineyard Rd / CR-56 → saved pad GPS",
    finalLegNotice: "The reviewed handoff reuses the proven Vineyard Road turn controls but has PORTERFIELD B's own exact destination. Google remains on Vineyard Road for the final 0.4 mile and clips at the saved GPS; exact graph and public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.090438,
      longitude: -80.921210,
      source: "saved_pad_gps",
    },
    routeDestination: PORTERFIELD_B_ROUTE_DESTINATION,
    waypoints: PORTERFIELD_B_WAYPOINTS,
  },
  {
    padId: "19a4f7ef-4334-4b1c-8443-2c5ccb323d1d",
    canonicalId: "19a4f7ef-4334-4b1c-8443-2c5ccb323d1d",
    legacyId: "ascent--rock-ridge",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "ROCK RIDGE",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 202 → OH-800 → Shannon Rd → Lowe Rd → 1st Cross Rd → Fairview Rd → Douglas/fairview Rd → Putney Ridge Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "OH-800 → Shannon → Lowe → Fairview → Douglass → Pultney Ridge → entrance",
    routeUrl: ROCK_RIDGE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → I-70 Exit 202 → OH-800 S → Shannon Rd / TR-801 → Lowe Rd / TR-162 → Fairview Rd / CR-114 → Douglass Rd / CR-120 → Pultney Ridge Rd / CR-70 → verified driver entrance",
    finalLegNotice: "The reviewed display uses the exact current official identities for Shannon, Lowe, Fairview, Douglass, and Pultney Ridge roads. The three unchanged shaping points preserve that local-road order and the handoff clips at ROCK RIDGE's exact verified driver entrance; graph and public-Google authority remain separate.",
    trustedDestination: {
      latitude: 39.998772,
      longitude: -81.224825,
      source: "verified_driver_entrance",
    },
    routeDestination: ROCK_RIDGE_ROUTE_DESTINATION,
    waypoints: ROCK_RIDGE_WAYPOINTS,
  },
  {
    padId: "d7898e8c-1bb6-48f8-b5e0-87bc1898420e",
    canonicalId: "d7898e8c-1bb6-48f8-b5e0-87bc1898420e",
    legacyId: "ascent--bakos",
    recordRevision: "1787615581785257",
    company: "Ascent",
    padName: "BAKOS",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "US-250 → Right/west Onto Holly View Dr → OR → Holly View Dr → Pad → OR → US-250 → Left/west Onto Holy View Dr → No St Sign And Rd",
    title: "Navigate reviewed route",
    detail: "US-250 → Holly View Dr → saved GPS",
    routeUrl: BAKOS_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → US-250 → Holly View Dr / TR-452 → saved pad GPS",
    finalLegNotice: "The two shaping points come from BAKOS's exact current route receipt and preserve the turn from US-250 onto Holly View Drive. The route ends at BAKOS's exact saved GPS; the saved point is not relabeled as a verified entrance, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.151125,
      longitude: -80.852968,
      source: "saved_pad_gps",
    },
    routeDestination: BAKOS_ROUTE_DESTINATION,
    waypoints: BAKOS_WAYPOINTS,
  },
  {
    padId: "333598ca-37b3-4b44-9411-a490cc3da672",
    canonicalId: "333598ca-37b3-4b44-9411-a490cc3da672",
    legacyId: "ascent--bannock",
    recordRevision: "1786744183028038",
    company: "Ascent",
    padName: "BANNOCK",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 213 → OH-331 → Lafferty-bannock Rd → Lease Road → OR → OH-9 → OH-149 → OH-331 → Lafferty-bannock Rd",
    title: "Navigate reviewed route",
    detail: "OH-331 → Lafferty-Bannock Rd / CR-10 → verified entrance",
    routeUrl: BANNOCK_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-331 → Lafferty-Bannock Rd / CR-10 → unapproved entrance handoff → verified driver entrance",
    finalLegNotice: "The shaping point sits inside the exact Lafferty-Bannock Road / CR-10 identity and accepts either OH-331 approach direction without backtracking. Google's final short movement reaches BANNOCK's exact verified driver entrance but remains an unapproved entrance handoff; exact graph and public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.111003,
      longitude: -81.002932,
      source: "verified_driver_entrance",
    },
    routeDestination: BANNOCK_ROUTE_DESTINATION,
    waypoints: BANNOCK_WAYPOINTS,
  },
  {
    padId: "fba35b8e-ccc6-406b-b27c-ac9ce4eed29d",
    canonicalId: "fba35b8e-ccc6-406b-b27c-ac9ce4eed29d",
    legacyId: "ascent--crowie",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "CROWIE",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "Exit 215 → US-40 → Vineyard Rd → Williams Rd → OR → Exit 213 → US-40",
    title: "Navigate reviewed route",
    detail: "US-40 → Vineyard Rd → Williams Rd → unapproved handoff → entrance",
    routeUrl: CROWIE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "US-40 → Vineyard Rd / CR-56 → Williams Rd → unapproved access / GPS handoff → verified driver entrance",
    finalLegNotice: "The exact named-road portion follows US-40 and Vineyard Road, then continues onto Williams Road. Current official Williams Road geometry ends before CROWIE's exact verified driver entrance, so the remaining movement is explicitly an unapproved access / GPS handoff; graph and public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.0979,
      longitude: -80.9384,
      source: "verified_driver_entrance",
    },
    routeDestination: CROWIE_ROUTE_DESTINATION,
    waypoints: CROWIE_WAYPOINTS,
  },
  {
    padId: "58c94af4-32b1-4f80-a278-a5f73688fa23",
    canonicalId: "58c94af4-32b1-4f80-a278-a5f73688fa23",
    legacyId: "ascent--caston",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "CASTON",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "US-22 → Mc Coy Rd → Jasper Rd → Caston Rd → OR → OH-513 → US-22 → Mc Coy Rd → Jasper Rd → Caston Rd",
    title: "Navigate reviewed route",
    detail: "McCoy → Jasper → Caston → saved GPS",
    routeUrl: CASTON_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "US-22 E → McCoy Rd / CR-82 → Jasper Rd / CR-93 → Caston Rd → saved pad GPS",
    finalLegNotice: "The reviewed handoff follows McCoy Road, Jasper Road, and Caston Road to CASTON's exact saved GPS. The saved point is not relabeled as a verified entrance; exact graph and public Google authority remain separate.",
    trustedDestination: {
      latitude: 40.130458,
      longitude: -81.328059,
      source: "saved_pad_gps",
    },
    routeDestination: CASTON_ROUTE_DESTINATION,
    waypoints: CASTON_WAYPOINTS,
  },
  {
    padId: "bd2e0e20-8aa8-4e05-a4c0-0af312234853",
    canonicalId: "bd2e0e20-8aa8-4e05-a4c0-0af312234853",
    legacyId: "ascent--gil",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "GIL",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "US-22 / Mccoy Rd → Mccoy Rd → Merry Rd → Penrose Rd → Logan Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "McCoy → Merry → Penrose → Logan → saved GPS",
    routeUrl: GIL_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "US-22 → McCoy Rd / CR-82 → Merry Rd / TR-967 → Penrose Rd / CR-694 → Logan Rd / CR-964 → saved pad GPS",
    finalLegNotice: "The reviewed handoff follows McCoy, Merry, Penrose, and Logan roads to GIL's exact saved GPS. The final saved point remains GPS destination evidence, not approved lease geometry.",
    trustedDestination: {
      latitude: 40.09387,
      longitude: -81.29646,
      source: "saved_pad_gps",
    },
    routeDestination: GIL_ROUTE_DESTINATION,
    waypoints: GIL_WAYPOINTS,
  },
  {
    padId: "71c9c874-5514-46a4-8d91-b105c6734799",
    canonicalId: "71c9c874-5514-46a4-8d91-b105c6734799",
    legacyId: "ascent--gilcher",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "GILCHER",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "US-22 → Mc Coy Rd → Merry Rd → Penrose Rd → OR → OH-513 → US-22 → Mc Coy Rd → Merry Rd → Penrose Rd",
    title: "Navigate reviewed route",
    detail: "McCoy → Merry → Penrose → saved GPS",
    routeUrl: GILCHER_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "US-22 E → McCoy Rd / CR-82 → Merry Rd / TR-967 → Penrose Rd / CR-694 → saved pad GPS",
    finalLegNotice: "The reviewed handoff follows McCoy, Merry, and Penrose roads to GILCHER's exact saved GPS. The saved point is not relabeled as a verified entrance; exact graph and public Google authority remain separate.",
    trustedDestination: {
      latitude: 40.100079,
      longitude: -81.295657,
      source: "saved_pad_gps",
    },
    routeDestination: GILCHER_ROUTE_DESTINATION,
    waypoints: GILCHER_WAYPOINTS,
  },
  {
    padId: "ccf7415a-331b-440a-829d-28282a33cde1",
    canonicalId: "ccf7415a-331b-440a-829d-28282a33cde1",
    legacyId: "ascent--lake",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "LAKE",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "US-22 → Mc Coy Rd → Tyson Mill Rd → Pennyroyal Rd → OR → US-250 → US-22 → Mc Coy Rd → Tyson Mill Rd → Pennyroyal Rd → OR → I-70 → Exit 193 → OH-513 → US-22 → Mc Coy Rd → Tyson Mill Rd → Pennyroyal Rd",
    title: "Navigate reviewed route",
    detail: "McCoy → Tyson Mill → Pennyroyal → saved GPS",
    routeUrl: LAKE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "US-22 E → McCoy Rd / CR-82 → Tyson Mill Rd → Pennyroyal Rd → saved pad GPS",
    finalLegNotice: "The reviewed handoff follows McCoy, Tyson Mill, and Pennyroyal roads, then ends at LAKE's exact saved GPS. Google's final unnamed turn is not approved lease geometry.",
    trustedDestination: {
      latitude: 40.14776,
      longitude: -81.295527,
      source: "saved_pad_gps",
    },
    routeDestination: LAKE_ROUTE_DESTINATION,
    waypoints: LAKE_WAYPOINTS,
  },
  {
    padId: "1e898176-672d-4174-8878-4aae0aee2128",
    canonicalId: "1e898176-672d-4174-8878-4aae0aee2128",
    legacyId: "ascent--thomas",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "THOMAS",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "I-70 → Exit 193 → OH-513 → Tyson Mill Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "OH-513 → Tyson Mill → saved GPS",
    routeUrl: THOMAS_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "I-70 → Exit 193 → OH-513 N → Tyson Mill Rd → saved pad GPS",
    finalLegNotice: "The reviewed handoff follows OH-513 to Tyson Mill Road and ends at THOMAS's exact saved GPS. Google's final unnamed turn remains an unapproved GPS handoff, not approved lease geometry.",
    trustedDestination: {
      latitude: 40.096986,
      longitude: -81.307667,
      source: "saved_pad_gps",
    },
    routeDestination: THOMAS_ROUTE_DESTINATION,
    waypoints: THOMAS_WAYPOINTS,
  },
  {
    padId: "6c93d03a-76e8-4c03-b47e-8b7011c81a1a",
    canonicalId: "6c93d03a-76e8-4c03-b47e-8b7011c81a1a",
    legacyId: "ascent--troyer",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "TROYER",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "US-22 → Mc Coy Rd → Pennyroyal Rd → Penrose Rd → OR → OH-513 → US-22 → Mc Coy Rd → Pennyroyal Rd → Penrose Rd",
    title: "Navigate reviewed route",
    detail: "McCoy → Pennyroyal → Penrose → pad access → saved GPS",
    routeUrl: TROYER_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "US-22 E → McCoy Rd / CR-82 → Pennyroyal Rd / CR-95 → Penrose Rd / CR-694 → Jesse Ln / pad access → saved pad GPS",
    finalLegNotice: "The reviewed handoff follows McCoy, Pennyroyal, and Penrose roads. Google labels the final short movement Jesse Lane; that pad-access leg ends at TROYER's exact saved GPS and is not promoted to approved graph or public-Google authority.",
    trustedDestination: {
      latitude: 40.087025,
      longitude: -81.259818,
      source: "saved_pad_gps",
    },
    routeDestination: TROYER_ROUTE_DESTINATION,
    waypoints: TROYER_WAYPOINTS,
  },
  {
    padId: "b22c557a-950a-4ed7-a65a-f4730b9bc727",
    canonicalId: "b22c557a-950a-4ed7-a65a-f4730b9bc727",
    legacyId: "ascent--circle-oaks",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "CIRCLE-OAKS",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "OH-342 → OH-258 → Martha Rd → Titus Rd → Pad",
    title: "Navigate reviewed route",
    detail: "OH-258 → Martha → Titus → verified entrance",
    routeUrl: CIRCLE_OAKS_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-258 → Martha Rd / CR-781 → Titus Rd / CR-878 → verified driver entrance",
    finalLegNotice: "The two shaping points sit inside official Martha and Titus road identities and accept either state-road approach direction without backtracking. Google briefly labels the first Martha segment Newtown Road; that renderer label is not promoted to a separate road identity. Exact graph and public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.176413,
      longitude: -81.348770,
      source: "verified_driver_entrance",
    },
    routeDestination: CIRCLE_OAKS_ROUTE_DESTINATION,
    waypoints: CIRCLE_OAKS_WAYPOINTS,
  },
  {
    padId: "166c5d6c-3a8d-4481-b8bf-5d74b7605f0d",
    canonicalId: "166c5d6c-3a8d-4481-b8bf-5d74b7605f0d",
    legacyId: "ascent--sadler",
    recordRevision: "1786440150388625",
    company: "Ascent",
    padName: "SADLER",
    state: "Ohio",
    county: "Harrison",
    structuredRoadSequence: "US-250 → CR-86 / Jamison Rd → Pad",
    title: "Navigate reviewed route",
    detail: "US-250 → Jamison Rd / CR-86 → verified entrance",
    routeUrl: SADLER_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → US-250 → Jamison Rd / CR-86 → verified driver entrance",
    finalLegNotice: "The shaping point sits inside the exact Jamison Road / CR-86 identity after its verified junction with US-250. Google currently spells the road Jameson; that renderer spelling is not promoted to a separate road identity. The route clips at SADLER's exact verified driver entrance; exact graph and public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.207568,
      longitude: -80.935841,
      source: "verified_driver_entrance",
    },
    routeDestination: SADLER_ROUTE_DESTINATION,
    waypoints: SADLER_WAYPOINTS,
  },
  {
    padId: "800c877a-6b4f-4a87-a710-b1e00af63c62",
    canonicalId: "800c877a-6b4f-4a87-a710-b1e00af63c62",
    legacyId: "ascent--towe",
    recordRevision: "1786159709605865",
    company: "Ascent",
    padName: "TOWE",
    state: "Ohio",
    county: "Harrison",
    structuredRoadSequence: "Willis Run Rd → Oak Hill Rd → Pad",
    title: "Navigate reviewed route",
    detail: "US-250 → Willis Run Rd → Oak Hill Rd → verified entrance",
    routeUrl: TOWE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → US-250 → Willis Run Rd / TR-213 → Oak Hill Rd / TR-212 → verified driver entrance",
    finalLegNotice: "The two shaping points sit inside the exact Willis Run and Oak Hill road identities after their verified junctions. They preserve the owner-reviewed road order from US-250 and accept either state-road approach direction without backtracking. The route clips at TOWE's exact verified driver entrance; exact graph and public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.385998,
      longitude: -81.212569,
      source: "verified_driver_entrance",
    },
    routeDestination: TOWE_ROUTE_DESTINATION,
    waypoints: TOWE_WAYPOINTS,
  },
  {
    padId: "fbdb5ee4-38d6-4801-81cc-8ad4abbb24e2",
    canonicalId: "fbdb5ee4-38d6-4801-81cc-8ad4abbb24e2",
    legacyId: "ascent--dutton",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "DUTTON",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 213 → OH-331 → Dutton Dr → OR → OH-9 → OH-149 → OH-331 → Dutton Dr → OR → OH-331 → Dutton Dr",
    title: "Navigate reviewed route",
    detail: "OH-331 → Dutton Dr / TR-1586 → unapproved GPS handoff",
    routeUrl: DUTTON_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-331 → Dutton Dr / TR-1586 → unapproved access/GPS handoff → saved pad GPS",
    finalLegNotice: "The shaping point sits inside DUTTON's exact Dutton Drive / TR-1586 identity after its verified OH-331 junction and accepts the reviewed state-road approaches without backtracking. Movement from the last exact public-road geometry to DUTTON's saved pad GPS remains an unapproved access/GPS handoff; the saved point is not relabeled as a verified entrance, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.150027,
      longitude: -81.017133,
      source: "saved_pad_gps",
    },
    routeDestination: DUTTON_ROUTE_DESTINATION,
    waypoints: DUTTON_WAYPOINTS,
  },
  {
    padId: "ad5ef012-46f5-46ca-93c7-0f5b492cb201",
    canonicalId: "ad5ef012-46f5-46ca-93c7-0f5b492cb201",
    legacyId: "ascent--kungle-b",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "KUNGLE B",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "OH-2 → OH-872W → OH-7S → OH-148W → Potts Rd → OR → OH-556E → Clover Ridge Rd → OH-148E → Potts Rd → OR → OH-9 → OH-148E → Potts Rd",
    title: "Navigate reviewed route",
    detail: "OH-148 → Potts Rd / TR-506 → saved GPS",
    routeUrl: KUNGLE_B_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-148 → Potts Rd / TR-506 → unapproved entrance/GPS handoff → saved pad GPS",
    finalLegNotice: "The shaping point sits inside KUNGLE B's exact Potts Road / TR-506 identity after its verified OH-148 junction and accepts either state-road approach direction without backtracking. The final short movement reaches the exact saved pad GPS but remains an unapproved entrance/GPS handoff; the saved point is not relabeled as a verified entrance, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 39.88678,
      longitude: -80.87008,
      source: "saved_pad_gps",
    },
    routeDestination: KUNGLE_B_ROUTE_DESTINATION,
    waypoints: KUNGLE_B_WAYPOINTS,
  },
  {
    padId: "c10e2066-d6b7-4117-aea9-137dd1237b3a",
    canonicalId: "c10e2066-d6b7-4117-aea9-137dd1237b3a",
    legacyId: "ascent--truchan-nw",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "TRUCHAN NW",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 216 → OH-9 → Shepherdstown Rd → Fairpoint Shepherdstown Rd → OR → OH-9 → Shepherdstown Rd → Fairpoint Shepherdstown Rd",
    title: "Navigate reviewed route",
    detail: "OH-9 → Shepherdstown → Fairpoint-Shepherdstown → saved GPS",
    routeUrl: TRUCHAN_NW_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-9 → Shepherdstown Rd / CR-64 → Fairpoint-Shepherdstown Rd / TR-216 → unapproved entrance/GPS handoff → saved pad GPS",
    finalLegNotice: "The shaping points sit inside TRUCHAN NW's exact Shepherdstown Road / CR-64 and Fairpoint-Shepherdstown Road / TR-216 identities after their verified junctions. Google currently spells the terminal road Shepardstown; that renderer spelling is not promoted to a separate road identity. The final saved-GPS movement remains an unapproved entrance/GPS handoff, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.147814,
      longitude: -80.935886,
      source: "saved_pad_gps",
    },
    routeDestination: TRUCHAN_NW_ROUTE_DESTINATION,
    waypoints: TRUCHAN_NW_WAYPOINTS,
  },
  {
    padId: "ca1560b5-4ea6-4eb7-a82e-de2467937eb2",
    canonicalId: "ca1560b5-4ea6-4eb7-a82e-de2467937eb2",
    legacyId: "ascent--moonstone",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "MOONSTONE",
    state: "Ohio",
    county: "Noble",
    structuredRoadSequence: "OH-147 → OH-513 → OH-146 → Lew Marten Rd → Pad",
    title: "Navigate reviewed route",
    detail: "OH-146 → Lew Martin Rd / TR-228 → saved GPS",
    routeUrl: MOONSTONE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-146 → Lew Martin Rd / TR-228 → unapproved entrance/GPS handoff → saved pad GPS",
    finalLegNotice: "The shaping point sits inside MOONSTONE's exact Lew Martin Road / TR-228 identity after its verified OH-146 junction and accepts either state-road approach direction without backtracking. The record spells the road Lew Marten; the exact official identity spells it Lew Martin. The terminal Pad occurrence and final saved-GPS movement remain held and unapproved; exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 39.83664,
      longitude: -81.379628,
      source: "saved_pad_gps",
    },
    routeDestination: MOONSTONE_ROUTE_DESTINATION,
    waypoints: MOONSTONE_WAYPOINTS,
  },
  {
    padId: "9aa065c0-8896-49e2-b02d-d4ca71acefc3",
    canonicalId: "9aa065c0-8896-49e2-b02d-d4ca71acefc3",
    legacyId: "ascent--jeffco",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "JEFFCO",
    state: "Ohio",
    county: "Harrison",
    structuredRoadSequence: "OH-151 → Rose Valley Rd → Beech Rd → Pad",
    title: "Navigate reviewed route",
    detail: "OH-151 → Rose Valley Rd / CR-14 → Beech Rd / TR-64 → unapproved GPS handoff",
    routeUrl: JEFFCO_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-151 → Rose Valley Rd / CR-14 → Beech Rd / TR-64 → unapproved GPS handoff → saved pad GPS",
    finalLegNotice: "The shaping points sit inside JEFFCO's exact Rose Valley Road / CR-14 and Beech Road / TR-64 identities after their verified junctions. Google reaches the exact saved pad GPS after about 0.4 mile on Beech Road from either OH-151 direction without backtracking. The terminal Pad occurrence and saved-GPS handoff remain unapproved; the saved point is not relabeled as a verified entrance, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.292482,
      longitude: -80.896856,
      source: "saved_pad_gps",
    },
    routeDestination: JEFFCO_ROUTE_DESTINATION,
    waypoints: JEFFCO_WAYPOINTS,
  },
  {
    padId: "47a0305e-c641-499b-990c-0f7fe83493b8",
    canonicalId: "47a0305e-c641-499b-990c-0f7fe83493b8",
    legacyId: "ascent--kungle-a",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "KUNGLE A",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "OH-2 → OH-872 → OH-7 → OH-148 → Potts Rd → OR → OH-556 → Clover Ridge Rd → OH-148 → Potts Rd → OR → OH-147 → OH-148 → Potts Rd",
    title: "Navigate reviewed route",
    detail: "OH-148 → Potts Rd / TR-506 → unapproved GPS handoff",
    routeUrl: KUNGLE_A_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-148 → Potts Rd / TR-506 → unapproved access/GPS handoff → saved pad GPS",
    finalLegNotice: "The shaping point sits inside KUNGLE A's exact Potts Road / TR-506 identity after its verified OH-148 junction and accepts either state-road approach direction without backtracking. Exact public-road geometry ends before the saved pad GPS; the remaining movement is an unapproved access/GPS handoff. The saved point is not relabeled as a verified entrance, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 39.88507,
      longitude: -80.88258,
      source: "saved_pad_gps",
    },
    routeDestination: KUNGLE_A_ROUTE_DESTINATION,
    waypoints: KUNGLE_A_WAYPOINTS,
  },
  {
    padId: "cd4f6dcc-b603-4155-84b2-30d7ee87bbc7",
    canonicalId: "cd4f6dcc-b603-4155-84b2-30d7ee87bbc7",
    legacyId: "ascent--truchan-ne",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "TRUCHAN NE",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 216 → OH-9 → Shepherdstown Rd → Fairpoint Shepherdstown Rd → Sloans Run Rd → OR → OH-9 → Shepherdstown Rd → Fairpoint Shepherdstown Rd → Sloans Run Rd",
    title: "Navigate reviewed route",
    detail: "OH-9 → Shepherdstown → Fairpoint-Shepherdstown → Sloans Run → unapproved GPS handoff",
    routeUrl: TRUCHAN_NE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-9 → Shepherdstown Rd / CR-64 → Fairpoint-Shepherdstown Rd / TR-216 → Sloans Run Rd / TR-704 → unapproved access/GPS handoff → saved pad GPS",
    finalLegNotice: "The first two shaping points reuse the exact Shepherdstown Road / CR-64 and Fairpoint-Shepherdstown Road / TR-216 corridor receipts; the third sits inside the exact Sloans Run Road / TR-704 identity after its verified Fairpoint-Shepherdstown junction. Google reaches TRUCHAN NE from both reviewed origins without backtracking. Movement beyond the last exact public-road geometry to the saved pad GPS remains an unapproved access/GPS handoff; the saved point is not relabeled as a verified entrance, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.146637,
      longitude: -80.931651,
      source: "saved_pad_gps",
    },
    routeDestination: TRUCHAN_NE_ROUTE_DESTINATION,
    waypoints: TRUCHAN_NE_WAYPOINTS,
  },
  {
    padId: "d6d0a0fd-1cd3-48ae-8e41-90d744b9f8f6",
    canonicalId: "d6d0a0fd-1cd3-48ae-8e41-90d744b9f8f6",
    legacyId: "ascent--matusek",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "MATUSEK",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → OH-9 / Shepherdstown Rd → Fairpoint Shepherdstown Rd → Sloans Run Rd → See Dunn Rd → Lease Road → OR → Dunn Rd",
    title: "Navigate reviewed route",
    detail: "OH-9 → Shepherdstown → Fairpoint-Shepherdstown → Sloans Run → unapproved GPS handoff",
    routeUrl: MATUSEK_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-9 → Shepherdstown Rd / CR-64 → Fairpoint-Shepherdstown Rd / TR-216 → Sloans Run Rd / TR-704 → unapproved access/GPS handoff → saved pad GPS",
    finalLegNotice: "The first two shaping points reuse the exact Shepherdstown Road / CR-64 and Fairpoint-Shepherdstown Road / TR-216 corridor receipts; the third sits inside the exact Sloans Run Road / TR-704 identity after its verified Fairpoint-Shepherdstown junction. Google reaches MATUSEK from both reviewed origins without backtracking. Google may render the destination as Dunn Road, but that renderer label is not promoted to exact public-road identity; the post-Sloans movement to the saved pad GPS remains an unapproved access/GPS handoff, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.146555,
      longitude: -80.922785,
      source: "saved_pad_gps",
    },
    routeDestination: MATUSEK_ROUTE_DESTINATION,
    waypoints: MATUSEK_WAYPOINTS,
  },
  {
    padId: "a35f0ea7-13d7-45dd-8fe2-fe73e4964df2",
    canonicalId: "a35f0ea7-13d7-45dd-8fe2-fe73e4964df2",
    legacyId: "ascent--lorraine",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "LORRAINE",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "US-250 → CR-5 / Crescent Rd → CR-10 → CR10 Barton Blaine Rd",
    title: "Navigate reviewed route",
    detail: "US-250 → Crescent Rd / CR-5 → Barton-Blaine Rd / CR-10 → unapproved GPS handoff",
    routeUrl: LORRAINE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → US-250 → CR-5 / Crescent Rd → shared CR-5 / CR-10 pavement → CR-10 / Barton-Blaine Rd → unapproved access/GPS handoff → saved pad GPS",
    finalLegNotice: "The first shaping point sits inside CR-5 after its verified US-250 junction; the second sits inside CR-10 after the verified CR-5/CR-10 shared pavement, and the third keeps the route on CR-10 / Barton-Blaine Road near the final access. Shared pavement is not described as a separate physical turn. Google preserves the reviewed sequence from either US-250 direction without backtracking. Exact CR-10 public-road geometry ends before LORRAINE's saved pad GPS, so the remaining movement is an unapproved access/GPS handoff. The saved point is not relabeled as a verified entrance, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.09955,
      longitude: -80.840213,
      source: "saved_pad_gps",
    },
    routeDestination: LORRAINE_ROUTE_DESTINATION,
    waypoints: LORRAINE_WAYPOINTS,
  },
  {
    padId: "74032b6e-179d-4672-8720-55ac86cab232",
    canonicalId: "74032b6e-179d-4672-8720-55ac86cab232",
    legacyId: "ascent--pang",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "PANG",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "Main St → OH-9 → Shepherdstown Rd → Access Road → OR → Marietta St → Newell Ave → OH-9 → Shepherdstown Rd → Access Road",
    title: "Navigate reviewed route",
    detail: "OH-9 → Shepherdstown Rd / CR-64 → unapproved GPS handoff",
    routeUrl: PANG_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-9 → Shepherdstown Rd / CR-64 → unapproved access/GPS handoff → saved pad GPS",
    finalLegNotice: "The shaping point sits inside PANG's exact Shepherdstown Road / CR-64 identity after the current verified OH-9 shared-pavement boundary and accepts either reviewed state-road approach without backtracking. Google continues forward on Shepherdstown Road before turning onto the final unnamed access to PANG's exact saved GPS. That access and saved-GPS movement remain unapproved; the saved point is not relabeled as a verified entrance, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.147178,
      longitude: -80.948742,
      source: "saved_pad_gps",
    },
    routeDestination: PANG_ROUTE_DESTINATION,
    waypoints: PANG_WAYPOINTS,
  },
  {
    padId: "f2f82142-f6d8-4f8d-b440-2ff86f624158",
    canonicalId: "f2f82142-f6d8-4f8d-b440-2ff86f624158",
    legacyId: "ascent--hastings",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "HASTINGS",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 213 → OH-331 → OH-149 → Chaney Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "OH-149 → Chaney Rd / TR-386 → unapproved GPS handoff",
    routeUrl: HASTINGS_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-149 → Chaney Rd / TR-386 → unapproved access/GPS handoff → saved pad GPS",
    finalLegNotice: "The shaping point sits inside HASTINGS's exact Chaney Road / TR-386 identity after its current verified OH-149 junction. Google reaches that turn from both reviewed origins without backtracking; the upstream state-highway approach remains origin-dependent and is not forced to use OH-331. Google may render Crazy Road and Jockey Hollow Road during the terminal movement, but those labels are not promoted to reviewed identities. Movement beyond the exact Chaney Road approach to the saved pad GPS remains an unapproved access/GPS handoff; the saved point is not relabeled as a verified entrance, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.163138,
      longitude: -81.021428,
      source: "saved_pad_gps",
    },
    routeDestination: HASTINGS_ROUTE_DESTINATION,
    waypoints: HASTINGS_WAYPOINTS,
  },
  {
    padId: "25dc9adf-e09a-4cfa-8900-59492fbad0ec",
    canonicalId: "25dc9adf-e09a-4cfa-8900-59492fbad0ec",
    legacyId: "ascent--wheeling-valley",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "WHEELING VALLEY",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → OH-9 / N Toward Shepherdstown Rd → Fairpoint Shepherdstown Rd → Sloans Run Rd → Dunn Rd → Morgan Rd",
    title: "Navigate reviewed route",
    detail: "Shepherdstown → Fairpoint-Shepherdstown → Sloans Run → Dunn → Morgan → unapproved GPS handoff",
    routeUrl: WHEELING_VALLEY_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-9 → Shepherdstown Rd / CR-64 → Fairpoint-Shepherdstown Rd / TR-216 → Sloans Run Rd / TR-704 → Dunn Rd / TR-424 → Morgan Rd / TR-423 → unapproved GPS handoff → saved pad GPS",
    finalLegNotice: "The three shaping points preserve WHEELING VALLEY's reviewed Fairpoint-Shepherdstown, Dunn, and Morgan road sequence after exact current junction evidence, while Google retains Shepherdstown and Sloans Run in the ordered path. Both reviewed origins reach the saved coordinate without a skipped road, reversal, or backtrack. Google may render street-address labels at the controls, but those labels are context only. The exact destination remains a saved pad reference, not a verified entrance; the terminal GPS movement remains unapproved, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.153061,
      longitude: -80.923517,
      source: "saved_pad_gps",
    },
    routeDestination: WHEELING_VALLEY_ROUTE_DESTINATION,
    waypoints: WHEELING_VALLEY_WAYPOINTS,
  },
  {
    padId: "f80dea77-db11-45f8-b30c-6c6abb85e469",
    canonicalId: "f80dea77-db11-45f8-b30c-6c6abb85e469",
    legacyId: "ascent--jackalope",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "JACKALOPE",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "OH-800 → OH-342 → OH-258 → Martha Rd → Titus Rd → Lodge Rd → Cox → Pad",
    title: "Navigate reviewed route",
    detail: "Martha → Titus → Lodge → Cox → Lodge → unapproved GPS handoff",
    routeUrl: JACKALOPE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-258 → Martha Rd / CR-781 → Titus Rd / CR-878 → Lodge Rd / CR-78 → Cox Rd / TR-8772 → Lodge Rd → unapproved GPS handoff → saved pad GPS",
    finalLegNotice: "The three shaping points preserve the exact Martha, Titus, and Lodge road corridor. Live review from Freeport and Cambridge then kept the owner-written right onto Cox Road and immediate left to stay on Lodge Road, crossed the noted one-lane bridge, and reached JACKALOPE's saved GPS on the right without a loop or backtrack. The Titus/Lodge/Sligo point junction remains held, so this is not approved graph geometry. The saved point is not relabeled as a verified entrance; the final GPS movement remains unapproved, and public-Google authority remains separate.",
    trustedDestination: {
      latitude: 40.164159,
      longitude: -81.356092,
      source: "saved_pad_gps",
    },
    routeDestination: JACKALOPE_ROUTE_DESTINATION,
    waypoints: JACKALOPE_WAYPOINTS,
  },
  {
    padId: "5c4a497e-cf33-48dd-8272-9fd06ebb9e6a",
    canonicalId: "5c4a497e-cf33-48dd-8272-9fd06ebb9e6a",
    legacyId: "ascent--lodge",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "LODGE",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "OH-342 → OH-258 → Martha Rd → Titus Rd → Lodge Rd → Lease Road → OR → Pad",
    title: "Navigate reviewed route",
    detail: "Martha → Titus → Lodge → unapproved wellhead-GPS handoff",
    routeUrl: LODGE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-258 → Martha Rd / CR-781 → Titus Rd / CR-878 → Lodge Rd / CR-78 → unapproved lease/GPS handoff → official wellhead reference",
    finalLegNotice: "The three shaping points preserve the exact Martha, Titus, and Lodge road corridor through the noted one-lane bridge. Live review from Freeport and Cambridge then followed Lodge Road and turned left on Google's McLaughlin Lane renderer label to the exact official wellhead reference, matching the owner-written lease turn across from JACKALOPE without a loop or backtrack. The renderer label is not promoted to a public-road identity, the Titus/Lodge/Sligo point junction remains held, and the final lease movement remains unapproved. This destination is an official wellhead reference, not a verified driver entrance; graph and public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.164138,
      longitude: -81.351162,
      source: "official_wellhead_reference",
    },
    routeDestination: LODGE_ROUTE_DESTINATION,
    waypoints: LODGE_WAYPOINTS,
  },
  {
    padId: "83b27fd3-4615-4ea1-ad36-0b05b359f5d2",
    canonicalId: "83b27fd3-4615-4ea1-ad36-0b05b359f5d2",
    legacyId: "ascent--echo",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "ECHO",
    state: "Ohio",
    county: "Harrison",
    structuredRoadSequence: "OH-519 → Hite Rd → Jokey Hollow Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "OH-519 → Hite Rd / TR-274 → Jockey Hollow Rd / TR-254 → unapproved GPS handoff",
    routeUrl: ECHO_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-519 / Stumptown Rd → Hite Rd / TR-274 → Jockey Hollow Rd / TR-254 → unapproved lease/GPS handoff → saved pad GPS",
    finalLegNotice: "The shaping points sit inside ECHO's exact Hite Road / TR-274 and Jockey Hollow Road / TR-254 identities after their current verified junctions. Exact membership disambiguates the source's Jokey spelling from the different Jockey Hollow Run Road identity. Google currently renders Hite Road as Crazy Road; that label is context only. Live review from New Athens and Freeport preserved OH-519 → Hite → Jockey Hollow without a loop or backtrack, then used an unnamed final lease movement to the exact saved GPS. That final movement remains unapproved; the saved point is not relabeled as a verified entrance, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.179321,
      longitude: -81.026812,
      source: "saved_pad_gps",
    },
    routeDestination: ECHO_ROUTE_DESTINATION,
    waypoints: ECHO_WAYPOINTS,
  },
  {
    padId: "475462f4-7e7a-4432-801c-5e513d5e953f",
    canonicalId: "475462f4-7e7a-4432-801c-5e513d5e953f",
    legacyId: "ascent--north-star",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "NORTH STAR",
    state: "Ohio",
    county: "Noble",
    structuredRoadSequence: "I-77 → Exit 25 → OH-78 → Archer Ridge Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "OH-78 → Archers Ridge Rd / CR-2 → unapproved GPS handoff",
    routeUrl: NORTH_STAR_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-78 → Archers Ridge Rd / CR-2 → unapproved lease/GPS handoff → saved pad GPS",
    finalLegNotice: "The first shaping point sits inside NORTH STAR's exact Archers Ridge Road / CR-2 identity after its current verified OH-78 junction. The second stays on that same exact identity after the verified Hohman Road departure and before the verified Schockling Road re-entry, preventing Google's earlier Hohman/Town Highway 87 shortcut from satisfying the controls. Live review from Cambridge and Caldwell kept the route continuously on Archers Ridge without that shortcut, a loop, or backtracking. The final short movement to the exact saved GPS remains unapproved; the saved point is not relabeled as a verified entrance, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 39.739847,
      longitude: -81.420197,
      source: "saved_pad_gps",
    },
    routeDestination: NORTH_STAR_ROUTE_DESTINATION,
    waypoints: NORTH_STAR_WAYPOINTS,
  },
  {
    padId: "691fb27b-2b35-471d-81fa-9239f6bd4081",
    canonicalId: "691fb27b-2b35-471d-81fa-9239f6bd4081",
    legacyId: "ascent--lodestar",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "LODESTAR",
    state: "Ohio",
    county: "Noble",
    structuredRoadSequence: "I-77 → Exit 25 → OH-78 E → Archer Ridge Rd / CR-2 → Hill Rd / TR-307 → Lease Road",
    title: "Navigate reviewed route",
    detail: "OH-78 → Archers Ridge Rd / CR-2 → Hill Rd / TR-307 → unapproved GPS handoff",
    routeUrl: LODESTAR_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-78 → Archers Ridge Rd / CR-2 → Hill Rd / TR-307 → unapproved lease/GPS handoff → saved pad GPS",
    finalLegNotice: "The shaping points sit inside LODESTAR's exact Archers Ridge Road / CR-2 and Hill Road / TR-307 identities after current verified OH-78/CR-2 and CR-2/TR-307 junctions. Live review from Cambridge and Caldwell preserved OH-78 → Archers Ridge → Hill Road without a shortcut, skipped road, loop, or backtrack. The source occurrence parser did not resolve the action-prefixed Hill token, but the exact current identity membership independently proves the road-to-road junction; this remains a reviewed handoff rather than graph approval. The final short movement to the saved GPS remains unapproved; the saved point is not relabeled as a verified entrance, and public-Google authority remains separate.",
    trustedDestination: {
      latitude: 39.750091,
      longitude: -81.409571,
      source: "saved_pad_gps",
    },
    routeDestination: LODESTAR_ROUTE_DESTINATION,
    waypoints: LODESTAR_WAYPOINTS,
  },
  {
    padId: "0b7ed9a5-7748-4d92-992a-7f2cecf9dd08",
    canonicalId: "0b7ed9a5-7748-4d92-992a-7f2cecf9dd08",
    legacyId: "ascent--winston-smith",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "WINSTON SMITH",
    state: "Ohio",
    county: "Noble",
    structuredRoadSequence: "I-77 → Exit 25 → OH-78 → Archer Ridge Rd → Hill Rd → Keep Left Onto Gurewicz Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "OH-78 → Archers Ridge Rd / CR-2 → Hill Rd / TR-307 → Gurewicz Rd / TR-303A → unapproved GPS handoff",
    routeUrl: WINSTON_SMITH_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-78 → Archers Ridge Rd / CR-2 → Hill Rd / TR-307 → Gurewicz Rd / TR-303A → unapproved lease/GPS handoff → saved pad GPS",
    finalLegNotice: "The three shaping points sit inside WINSTON SMITH's exact Archers Ridge Road / CR-2, Hill Road / TR-307, and Gurewicz Road / TR-303A identities after current verified OH-78/CR-2, CR-2/TR-307, and TR-307/TR-303A junctions. Live review from Cambridge and Caldwell preserved OH-78 → Archers Ridge → Hill → Gurewicz without a shortcut, skipped road, loop, or backtrack. The source occurrence parser did not resolve the action-prefixed Gurewicz token, but the exact current identity membership independently proves the road-to-road junction; this remains a reviewed handoff rather than graph approval. The final movement to the saved GPS remains unapproved; the saved point is not relabeled as a verified entrance, and public-Google authority remains separate.",
    trustedDestination: {
      latitude: 39.752765,
      longitude: -81.396584,
      source: "saved_pad_gps",
    },
    routeDestination: WINSTON_SMITH_ROUTE_DESTINATION,
    waypoints: WINSTON_SMITH_WAYPOINTS,
  },
  {
    padId: "48d810bf-e59f-4314-9efb-8103a818a3bd",
    canonicalId: "48d810bf-e59f-4314-9efb-8103a818a3bd",
    legacyId: "ascent--albatross",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "ALBATROSS",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 202 → OH-800 → Brooks Rd",
    title: "Navigate reviewed route",
    detail: "Brooks Rd → unapproved GPS handoff",
    routeUrl: ALBATROSS_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approach → OH-800 near Brooks Rd → Brooks Rd → unapproved GPS handoff to saved pad GPS",
    finalLegNotice: "The reviewed local approach reaches Brooks Road. Movement from the last reviewed named road to ALBATROSS's exact saved GPS remains an unapproved GPS handoff. The saved point is not relabeled as a verified entrance; exact graph and public Google authority remain separate.",
    trustedDestination: {
      latitude: 40.079353,
      longitude: -81.224381,
      source: "saved_pad_gps",
    },
    routeDestination: ALBATROSS_ROUTE_DESTINATION,
    waypoints: ALBATROSS_WAYPOINTS,
  },
  {
    padId: "8f616827-d7da-4b40-b9c2-49fd5e713822",
    canonicalId: "8f616827-d7da-4b40-b9c2-49fd5e713822",
    legacyId: "ascent--maldon",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "MALDON",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 202 → OH-800 → Shannon Rd → Lowe Rd → Pad",
    title: "Navigate reviewed route",
    detail: "Shannon → Lowe → unapproved GPS handoff",
    routeUrl: MALDON_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approach → Shannon Rd → Lowe Rd → unapproved GPS handoff to saved pad GPS",
    finalLegNotice: "The reviewed local approach follows Shannon Road and Lowe Road. Movement from the last reviewed named road to MALDON's exact saved GPS remains an unapproved GPS handoff. The saved point is not relabeled as a verified entrance; exact graph and public Google authority remain separate.",
    trustedDestination: {
      latitude: 40.010241,
      longitude: -81.197285,
      source: "saved_pad_gps",
    },
    routeDestination: MALDON_ROUTE_DESTINATION,
    waypoints: MALDON_WAYPOINTS,
  },
  {
    padId: "f2df293f-13a2-401e-96b2-21e71ac63e6a",
    canonicalId: "f2df293f-13a2-401e-96b2-21e71ac63e6a",
    legacyId: "ascent--withey",
    recordRevision: "1786246617744175",
    company: "Ascent",
    padName: "WITHEY",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "Exit 202 → I-70 → OH-800 → Gobblers Knob Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "Gobblers Knob Rd → verified entrance",
    routeUrl: WITHEY_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approach → Gobblers Knob Rd → verified driver entrance",
    finalLegNotice: "The reviewed local approach follows Gobblers Knob Road to WITHEY's exact verified driver entrance. Google's upstream route remains origin-dependent; exact graph and public Google authority remain separate.",
    trustedDestination: {
      latitude: 39.962005,
      longitude: -81.216813,
      source: "verified_driver_entrance",
    },
    routeDestination: WITHEY_ROUTE_DESTINATION,
    waypoints: WITHEY_WAYPOINTS,
  },
  {
    padId: "06ac93a2-3b46-44fd-9fa6-2fd29201858a",
    canonicalId: "06ac93a2-3b46-44fd-9fa6-2fd29201858a",
    legacyId: "ascent--skull-fork",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "SKULL FORK",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "I-70 → Exit 202 → OH-800 → US-22 → Repik Ln → Pad",
    title: "Navigate reviewed route",
    detail: "Repik Ln → verified entrance",
    routeUrl: SKULL_FORK_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approach → Repik Ln → verified driver entrance",
    finalLegNotice: "Owner-confirmed live navigation preserves Cadiz Road / US-22 → Repik Lane / TR-9876 → SKULL FORK's exact trusted pin. That named-road-to-pin handoff is sufficient for the driver; it does not invent a pad-deck point, name or approve lease geometry, or create graph/public-Google authority. Google's upstream route remains origin-dependent.",
    trustedDestination: {
      latitude: 40.159734,
      longitude: -81.260675,
      source: "verified_driver_entrance",
    },
    routeDestination: SKULL_FORK_ROUTE_DESTINATION,
    waypoints: SKULL_FORK_WAYPOINTS,
  },
  {
    padId: "351b72fb-eb48-4355-b6fc-d8e9a867f79c",
    canonicalId: "351b72fb-eb48-4355-b6fc-d8e9a867f79c",
    legacyId: "ascent--hoop",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "HOOP",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "I-77 → US-22 → Titus Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "US-22 E → Titus Rd → unapproved GPS/lease handoff",
    routeUrl: HOOP_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approach to reviewed US-22 anchor → US-22 E → Titus Rd → unapproved GPS/lease handoff to saved pad GPS",
    finalLegNotice: "Three ordered shaping points preserve the reviewed US-22 east approach and turn onto Titus Road without the Pennyroyal Road shortcut. The reviewed named-road approach ends on Titus Road. Google may display Hoop Lane during the remaining movement to HOOP's exact saved GPS, but that label is not promoted to reviewed road authority. The entire post-Titus movement remains an unapproved GPS/lease handoff, not approved public-road geometry.",
    trustedDestination: {
      latitude: 40.166384,
      longitude: -81.325728,
      source: "saved_pad_gps",
    },
    routeDestination: HOOP_ROUTE_DESTINATION,
    waypoints: HOOP_WAYPOINTS,
  },
  {
    padId: "4c73e244-6132-4d40-83fc-3fe5e6e65bf6",
    canonicalId: "4c73e244-6132-4d40-83fc-3fe5e6e65bf6",
    legacyId: "ascent--bravo",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "BRAVO",
    state: "Ohio",
    county: "Harrison",
    structuredRoadSequence: "OH-519 → Hite Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "Hite Rd (Google: Crazy Rd) → unapproved GPS handoff",
    routeUrl: BRAVO_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approach → Hite Rd (displayed by Google as Crazy Rd) → unapproved GPS/lease handoff to saved pad GPS",
    finalLegNotice: "The stored reviewed sequence names Hite Road; Google displays the shaped segment as Crazy Road. Google's label is not treated as a new or approved road identity. The final short unnamed movement to BRAVO's exact saved GPS remains an unapproved GPS/lease handoff.",
    trustedDestination: {
      latitude: 40.178556,
      longitude: -81.015064,
      source: "saved_pad_gps",
    },
    routeDestination: BRAVO_ROUTE_DESTINATION,
    waypoints: BRAVO_WAYPOINTS,
  },
  {
    padId: "7dcd1f71-fa32-4edc-ae3d-aa9717d0c72c",
    canonicalId: "7dcd1f71-fa32-4edc-ae3d-aa9717d0c72c",
    legacyId: "ascent--ruth",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "RUTH",
    state: "Ohio",
    county: "Jefferson",
    structuredRoadSequence: "US-250 E → Lease Road",
    title: "Navigate reviewed route",
    detail: "US-250 → unapproved entrance turn → verified entrance",
    routeUrl: RUTH_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approach → US-250 near entrance → unapproved entrance movement → verified driver entrance",
    finalLegNotice: "The reviewed shaping point reaches US-250 near RUTH. The final turn and movement to RUTH's exact verified driver entrance remain an unapproved entrance handoff and are not promoted to approved public-road geometry.",
    trustedDestination: {
      latitude: 40.173626,
      longitude: -80.879115,
      source: "verified_driver_entrance",
    },
    routeDestination: RUTH_ROUTE_DESTINATION,
    waypoints: RUTH_WAYPOINTS,
  },
  {
    // The corrected owner-supplied field screenshot showed that the former
    // control was still on OH-519 east of the pad connector and could make an
    // approach from the other direction pass the turn and double back. This
    // control is the exact physical junction from the later owner screenshot.
    // Google currently labels the connector Georgetown Road, but that
    // renderer label is not promoted to an authoritative driver-facing road
    // identity. The phone remains the origin,
    // so Google can approach the same turn from either state-route direction.
    padId: "75600d0c-17b8-488b-96c9-4b7b8ffc8b1b",
    canonicalId: "75600d0c-17b8-488b-96c9-4b7b8ffc8b1b",
    legacyId: "ascent--pickens",
    recordRevision: "1788117937351112",
    company: "Ascent",
    padName: "PICKENS",
    state: "Ohio",
    county: "Harrison",
    structuredRoadSequence: "OH-9 south → Turn left onto OH-519 east → Turn right onto Lease Road",
    title: "Navigate reviewed route",
    detail: "OH-519 / Stumptown Rd → unapproved access road → verified entrance",
    routeUrl: PICKENS_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-route approach → OH-519 / Stumptown Rd → unapproved access-road handoff → verified driver entrance",
    finalLegNotice: "The corrected shaping point is the owner-confirmed PICKENS pad-connector turn from OH-519 / Stumptown Road. Google currently labels that connector Georgetown Road, but the label is renderer context only. The access-road movement to the verified driver entrance is not approved public-road geometry; exact graph and public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.182544,
      longitude: -80.977135,
      source: "verified_driver_entrance",
    },
    routeDestination: PICKENS_ROUTE_DESTINATION,
    waypoints: PICKENS_WAYPOINTS,
  },
  {
    padId: "3850e94a-826f-4b6b-a54f-d21d482fca46",
    canonicalId: "3850e94a-826f-4b6b-a54f-d21d482fca46",
    legacyId: "ascent--athena",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "ATHENA",
    state: "Ohio",
    county: "Jefferson",
    structuredRoadSequence: "OH-151 → Pad",
    title: "Navigate reviewed route",
    detail: "OH-151 → unapproved GPS handoff",
    routeUrl: ATHENA_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approach → OH-151 near pad → unapproved GPS handoff to saved pad GPS",
    finalLegNotice: "The reviewed shaping point reaches OH-151 near ATHENA. Movement to ATHENA's exact saved GPS remains an unapproved GPS handoff. The saved point is not relabeled as a verified entrance; exact graph and public Google authority remain separate.",
    trustedDestination: {
      latitude: 40.278613,
      longitude: -80.765988,
      source: "saved_pad_gps",
    },
    routeDestination: ATHENA_ROUTE_DESTINATION,
    waypoints: ATHENA_WAYPOINTS,
  },
  {
    padId: "73f48788-9990-435a-adee-999740e958de",
    canonicalId: "73f48788-9990-435a-adee-999740e958de",
    legacyId: "ascent--richland-b",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "RICHLAND B",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 213 → OH-331 → US-40 → Lloydsville Bannock Rd → Lude Rd → OR → OH-149 → US-40 → Lloydsville Bannock Rd → Lude Rd → OR → I-70 → Exit 208 → OH-149 → US-40 → Lloydsville Bannock Rd → Lude Rd",
    title: "Navigate reviewed route",
    detail: "US-40 → Lloydsville-Bannock Rd / CR-80 → Lude Rd / TR-264 → unapproved GPS handoff",
    routeUrl: RICHLAND_B_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approved public-highway approach → US-40 → Lloydsville-Bannock Rd / CR-80 → Lude Rd / TR-264 → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "Both reviewed directions preserve an exact written alternative through US-40, Lloydsville-Bannock Road / CR-80, and Lude Road / TR-264 without a pass-and-return. Satellite confirms the visible connector west of Lude Road as RICHLAND B's pad approach to the saved GPS; it remains an unapproved GPS handoff, not official road or navigation geometry. POGUE RD is graph and renderer context only and is not promoted to a replacement road identity.",
    trustedDestination: {
      latitude: RICHLAND_B_ROUTE_DESTINATION.latitude,
      longitude: RICHLAND_B_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: RICHLAND_B_ROUTE_DESTINATION,
    waypoints: RICHLAND_B_WAYPOINTS,
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
    detail: "OH-265 / Leatherwood Rd → Salem Rd / CR-74 → unapproved lease/GPS handoff",
    routeUrl: LAVADA_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approved public-highway approach → OH-265 / Leatherwood Rd → Salem Rd / CR-74 → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "The two reviewed directions reach the written Salem Road / CR-74 occurrence from approved Ohio routes and continue to LAVADA's saved GPS. Satellite confirms the visible private connector north from Salem Road as this pad's approach; it remains an unapproved GPS handoff, not official road or navigation geometry. Leatherwood Road is renderer context for OH-265 only and is not promoted to a new road identity.",
    trustedDestination: {
      latitude: LAVADA_ROUTE_DESTINATION.latitude,
      longitude: LAVADA_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: LAVADA_ROUTE_DESTINATION,
    waypoints: LAVADA_WAYPOINTS,
  },
  {
    padId: "8e823835-2c10-4275-84e9-4067376fa364",
    canonicalId: "8e823835-2c10-4275-84e9-4067376fa364",
    legacyId: "ascent--wampum",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "WAMPUM",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "I-70 → OH-285 → OH-313 → Salem Rd → Nighthawk Rd → Keep Right Onto Divison Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "Salem Rd / CR-74 → Nighthawk Rd → Division-rendered occurrence → unapproved lease/GPS handoff",
    routeUrl: WAMPUM_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approved public-highway approach → Salem Rd / CR-74 → Nighthawk Rd → keep right onto the Division-rendered occurrence → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "The reviewed controls bind the pre-fork Nighthawk occurrence, the post-fork Division-rendered occurrence, and WAMPUM's saved GPS in that order. Satellite confirms the two occurrences and the continuing approach to the saved pin. Google corrects the written Divison spelling to Division; that renderer label is context only and does not rewrite the exact directory record or create official road geometry.",
    trustedDestination: {
      latitude: WAMPUM_ROUTE_DESTINATION.latitude,
      longitude: WAMPUM_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: WAMPUM_ROUTE_DESTINATION,
    waypoints: WAMPUM_WAYPOINTS,
  },
  {
    padId: "eae4741b-7fb4-4bc3-8b20-26043032acda",
    canonicalId: "eae4741b-7fb4-4bc3-8b20-26043032acda",
    legacyId: "ascent--slabaugh",
    recordRevision: "1786265512886177",
    company: "Ascent",
    padName: "SLABAUGH",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "I-70 → OH-285 → OH-313 → Salem Rd → Nighthawk Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "Salem Rd / CR-74 → Nighthawk Rd → unapproved lease/GPS handoff",
    routeUrl: SLABAUGH_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approved public-highway approach → Salem Rd / CR-74 → Nighthawk Rd → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "Both reviewed directions preserve the written Salem Road / CR-74 then Nighthawk Road order before SLABAUGH's saved GPS. Satellite confirms the visible facility connector beside the saved pin as this pad's approach; it remains an unapproved GPS handoff, not official road or navigation geometry. DIVISION RD is graph and renderer context only and does not replace Nighthawk Road in the exact record.",
    trustedDestination: {
      latitude: SLABAUGH_ROUTE_DESTINATION.latitude,
      longitude: SLABAUGH_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: SLABAUGH_ROUTE_DESTINATION,
    waypoints: SLABAUGH_WAYPOINTS,
  },
  {
    padId: "0a2a4a64-6e64-4b7d-9652-e1a97db4fc4f",
    canonicalId: "0a2a4a64-6e64-4b7d-9652-e1a97db4fc4f",
    legacyId: "ascent--rector-c",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "RECTOR-C",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "OH-285 → OH-313E → Salem Rd → New Gottengen Rd → Meadowlark Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "Salem Rd / CR-74 → New Gottengen Rd → Meadowlark Rd → unapproved lease/GPS handoff",
    routeUrl: RECTOR_C_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approved public-highway approach → Salem Rd / CR-74 → New Gottengen Rd → Meadowlark Rd → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "The passed two-control route preserves the written Salem Road / CR-74, New Gottengen Road, and Meadowlark Road order before RECTOR-C's saved GPS. Satellite confirms the short visible connector beside the pin as this pad's approach; it remains an unapproved GPS handoff, not official road or navigation geometry. Earlier one-control attempts that stayed on OH-313 or rendered Locust Grove are rejected and grant no identity or route authority.",
    trustedDestination: {
      latitude: RECTOR_C_ROUTE_DESTINATION.latitude,
      longitude: RECTOR_C_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: RECTOR_C_ROUTE_DESTINATION,
    waypoints: RECTOR_C_WAYPOINTS,
  },
  {
    padId: "25dc64b5-4a52-4cef-8b2c-62e7e36d64c7",
    canonicalId: "25dc64b5-4a52-4cef-8b2c-62e7e36d64c7",
    legacyId: "ascent--tarpley",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "TARPLEY",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "Route 70 → OH-513 → Bridgewater Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "OH-513 → Bridgewater Rd → Pisgah Rd / CR-94 → unapproved lease/GPS handoff",
    routeUrl: TARPLEY_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected I-70 approach → Exit 193 → OH-513 N → Bridgewater Rd → written Pisgah Rd / CR-94 occurrence → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "Both reviewed directions preserve I-70 Exit 193, OH-513, Bridgewater Road, and the written Pisgah Road / CR-94 occurrence before TARPLEY's saved GPS. Satellite confirms the winding connector from the written corridor to the large pad deck as this pad's approach; it remains an unapproved GPS handoff, not official road or navigation geometry. Google's Morris Ln destination label is renderer context only and is not promoted to a road identity.",
    trustedDestination: {
      latitude: TARPLEY_ROUTE_DESTINATION.latitude,
      longitude: TARPLEY_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: TARPLEY_ROUTE_DESTINATION,
    waypoints: TARPLEY_WAYPOINTS,
  },
  {
    padId: "0f848006-4c09-4c7f-b9f2-4743d5ccd37f",
    canonicalId: "0f848006-4c09-4c7f-b9f2-4743d5ccd37f",
    legacyId: "ascent--alabaster",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "ALABASTER",
    state: "Ohio",
    county: "Noble",
    structuredRoadSequence: "I-77 → Exit 25 → OH-78 → Bean Ridge Rd / CR-54 → Curtis Ridge Rd / TR-233 → Buckingham Rd / TR-232 → Lease Road",
    title: "Navigate reviewed route",
    detail: "I-77 Exit 25 → OH-78 → Bean Ridge Rd / CR-54 → Curtis Ridge Rd / TR-233 → Buckingham Rd / TR-232 → unapproved entrance handoff",
    routeUrl: ALABASTER_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected I-77 approach → Exit 25 → OH-78 → Bean Ridge Rd / CR-54 → Curtis Ridge Rd / TR-233 → Buckingham Rd / TR-232 → unapproved pad-approach handoff → verified driver entrance",
    finalLegNotice: "Both reviewed directions preserve I-77 Exit 25, OH-78, Bean Ridge Road / CR-54, Curtis Ridge Road / TR-233, and Buckingham Road / TR-232 before ALABASTER's verified driver entrance. Google's final movement is about 30 feet, and satellite confirms a continuous connector to the pad; that connector is this pad's approach, not official road or navigation geometry.",
    trustedDestination: {
      latitude: ALABASTER_ROUTE_DESTINATION.latitude,
      longitude: ALABASTER_ROUTE_DESTINATION.longitude,
      source: "verified_driver_entrance",
    },
    routeDestination: ALABASTER_ROUTE_DESTINATION,
    waypoints: ALABASTER_WAYPOINTS,
  },
  {
    padId: "4213711f-0f23-440a-b0ec-42a1f9be4db0",
    canonicalId: "4213711f-0f23-440a-b0ec-42a1f9be4db0",
    legacyId: "ascent--cook",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "COOK",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "St Bellaire Exit On St → OH-149 → Tar Run Rd → Cumberland Run Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "OH-149 → Tar Run Rd → Cumberland Run Rd → unapproved lease/GPS handoff",
    routeUrl: COOK_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approved public-highway approach → OH-149 → Tar Run Rd → Cumberland Run Rd → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "The Bellaire and Belmont proofs both preserve OH-149, Tar Run Road, and Cumberland Run Road before COOK's saved GPS. Google's final movement is about 39 feet, and satellite shows the short visible gravel spur as this pad's approach; it is not official road or navigation geometry.",
    trustedDestination: {
      latitude: COOK_ROUTE_DESTINATION.latitude,
      longitude: COOK_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: COOK_ROUTE_DESTINATION,
    waypoints: COOK_WAYPOINTS,
  },
  {
    padId: "5a0ede1b-4586-4edc-9438-7cb29a24e58e",
    canonicalId: "5a0ede1b-4586-4edc-9438-7cb29a24e58e",
    legacyId: "ascent--sidwell",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "SIDWELL",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "OH-1 → OH-9 → Unity Church Rd → Pad → OR → I-70 → Exit 216 → OH-9 → Newell Ave → OH-9N → Unity Church Rd → OR → OH-1 → OH-331S → OH-149N → OH-9S → Unity Church Rd",
    title: "Navigate reviewed route",
    detail: "OH-9 → Unity Church Rd → unapproved GPS handoff",
    routeUrl: SIDWELL_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approved public-highway approach → intended OH-9 occurrence → Unity Church Rd → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "The Cadiz and St Clairsville proofs both preserve the intended OH-9 occurrence followed by Unity Church Road before SIDWELL's saved GPS. Satellite confirms the short visible site access as this pad's approach; it is not official road or navigation geometry and does not rewrite the exact three-alternative directory record.",
    trustedDestination: {
      latitude: SIDWELL_ROUTE_DESTINATION.latitude,
      longitude: SIDWELL_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: SIDWELL_ROUTE_DESTINATION,
    waypoints: SIDWELL_WAYPOINTS,
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
    detail: "US-22 → Skull Fork Rd → Bond Ln → unapproved GPS handoff",
    routeUrl: DONNA_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approved public-highway approach → US-22 → Skull Fork Rd → Bond Ln → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "The Cambridge and Cadiz proofs both preserve US-22, Skull Fork Road, and Bond Lane before DONNA's saved GPS. Satellite places the saved pin at the site entrance on Bond Lane with the pad visible; any final site movement remains this pad's approach, not official road or navigation geometry.",
    trustedDestination: {
      latitude: DONNA_ROUTE_DESTINATION.latitude,
      longitude: DONNA_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: DONNA_ROUTE_DESTINATION,
    waypoints: DONNA_WAYPOINTS,
  },
  {
    padId: "45b2cfd7-1936-406d-bf6c-de0b8acc8e88",
    canonicalId: "45b2cfd7-1936-406d-bf6c-de0b8acc8e88",
    legacyId: "ascent--cecelia",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "CECELIA",
    state: "Ohio",
    county: "Jefferson",
    structuredRoadSequence: "US-22 → OH-151 → A Left Onto County Rd → CR-25 → Pad",
    title: "Navigate reviewed route",
    detail: "OH-151 → CR-25 → unapproved GPS handoff",
    routeUrl: CECELIA_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected US-22 approach → OH-151 → intended CR-25 occurrence → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "The Hopedale and Smithfield proofs both preserve OH-151 followed by the intended CR-25 occurrence before CECELIA's saved GPS. Google renders the local control as Weems Road / 3990 County Road 25; that label is context only and is not promoted to a new identity. Satellite shows the clear pad deck immediately off CR-25; the final access is not official road or navigation geometry.",
    trustedDestination: {
      latitude: CECELIA_ROUTE_DESTINATION.latitude,
      longitude: CECELIA_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: CECELIA_ROUTE_DESTINATION,
    waypoints: CECELIA_WAYPOINTS,
  },
  {
    padId: "18257dbf-d681-46dd-be38-a8e4a6aab56f",
    canonicalId: "18257dbf-d681-46dd-be38-a8e4a6aab56f",
    legacyId: "ascent--dickson",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "DICKSON",
    state: "Ohio",
    county: "Jefferson",
    structuredRoadSequence: "OH-1 → OH-152 → Steubenville St → Bloomingdale- Smithfield- Chandl/high St → Fernwood Bloomingdale Rd → Dawson Rd → Township Hwy → TR-187",
    title: "Navigate reviewed route",
    detail: "OH-152 → Steubenville St → Bloomingdale-Smithfield-Chandl / High St → Fernwood Bloomingdale Rd → Dawson Rd → TR-187 approach → unapproved GPS handoff",
    routeUrl: DICKSON_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approved public-highway approach → OH-152 → Steubenville St → Bloomingdale-Smithfield-Chandl / High St → Fernwood Bloomingdale Rd → Dawson Rd → toward TR-187 → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "Both reviewed directions preserve the written Steubenville, Bloomingdale-Smithfield-Chandl / High, Fernwood Bloomingdale, and Dawson road order after OH-152, then continue toward TR-187 and DICKSON's saved GPS. Satellite confirms a clear pad deck and continuous approach; the final connector is not official road or navigation geometry.",
    trustedDestination: {
      latitude: DICKSON_ROUTE_DESTINATION.latitude,
      longitude: DICKSON_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: DICKSON_ROUTE_DESTINATION,
    waypoints: DICKSON_WAYPOINTS,
  },
  {
    padId: "69c63442-de05-4d15-95da-07da587bc070",
    canonicalId: "69c63442-de05-4d15-95da-07da587bc070",
    legacyId: "ascent--shutway",
    recordRevision: "1788117937351112",
    company: "Ascent",
    padName: "SHUTWAY",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 208 → OH-149 → Pad",
    title: "Navigate reviewed route",
    detail: "I-70 Exit 208 → OH-149 → unapproved GPS handoff",
    routeUrl: SHUTWAY_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected I-70 approach → Exit 208 → OH-149 N → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "The Cambridge and east-origin proofs explicitly use I-70 Exit 208 in opposite directions and then OH-149 N to SHUTWAY's saved GPS. Satellite centers the pin on the labeled pad deck with a direct driveway off OH-149; that driveway is this pad's approach, not official road or navigation geometry.",
    trustedDestination: {
      latitude: SHUTWAY_ROUTE_DESTINATION.latitude,
      longitude: SHUTWAY_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: SHUTWAY_ROUTE_DESTINATION,
    waypoints: SHUTWAY_WAYPOINTS,
  },
  {
    padId: "b9d1a8de-2ddd-4345-82a1-7e2a1f6ff2cb",
    canonicalId: "b9d1a8de-2ddd-4345-82a1-7e2a1f6ff2cb",
    legacyId: "ascent--carlos",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "CARLOS",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70E → Exit 208 → OH-149 → Elm States Rd → Pad",
    title: "Navigate reviewed route",
    detail: "I-70 Exit 208 → OH-149 → Elm States Rd occurrence → unapproved GPS handoff",
    routeUrl: CARLOS_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected I-70 approach → Exit 208 → OH-149 S and its Belmont continuation → intended Elm States Rd occurrence → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "The west and east-coordinate proofs both explicitly preserve I-70 Exit 208 and OH-149 S. Google renders the short official Belmont continuation as Palmer, John, and East Main before OH-149 E, and renders written Elm States Road as Elm Station Road; those labels are context only and are not promoted to new identities. Satellite shows the saved pin on the road at the driveway into the clear deck; that driveway is not official road or navigation geometry. Earlier rejected waypoint variants remain excluded.",
    trustedDestination: {
      latitude: CARLOS_ROUTE_DESTINATION.latitude,
      longitude: CARLOS_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: CARLOS_ROUTE_DESTINATION,
    waypoints: CARLOS_WAYPOINTS,
  },
  {
    padId: "23053421-06d5-47a2-bf77-5c3fdea4939b",
    canonicalId: "23053421-06d5-47a2-bf77-5c3fdea4939b",
    legacyId: "ascent--cravat-north",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "CRAVAT NORTH",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 216 → OH-9 → Shepherstown Rd → CR-36",
    title: "Navigate reviewed route",
    detail: "I-70 Exit 216 → OH-9 → Shepherstown Rd → CR-36 → unapproved restricted approach/GPS handoff",
    routeUrl: CRAVAT_NORTH_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected I-70 approach → Exit 216 → OH-9 N → Shepherstown Rd → CR-36 → unapproved restricted pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "Both reviewed directions explicitly preserve I-70 Exit 216, OH-9 N, Shepherdstown, and City Road 36 before the restricted approach to CRAVAT NORTH's saved GPS. Google's Shepherdstown spelling and Stiers label are renderer context only and do not rewrite written Shepherstown Road or promote a new identity. Satellite confirms a clear deck and continuous connector; that connector is not official road or navigation geometry. Earlier rejected waypoint variants remain excluded.",
    trustedDestination: {
      latitude: CRAVAT_NORTH_ROUTE_DESTINATION.latitude,
      longitude: CRAVAT_NORTH_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: CRAVAT_NORTH_ROUTE_DESTINATION,
    waypoints: CRAVAT_NORTH_WAYPOINTS,
  },
  {
    padId: "83499ca1-3c45-4502-b7c2-688e88343093",
    canonicalId: "83499ca1-3c45-4502-b7c2-688e88343093",
    legacyId: "ascent--kurth",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "KURTH",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 216 → OH-9 → CR-5 → Methodist Ridge Rd → Campbell-johnson Hill Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "I-70 Exit 216 → OH-9 → CR-5 → Methodist Ridge Rd → Campbell-johnson Hill Rd → unapproved lease/GPS handoff",
    routeUrl: KURTH_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected I-70 approach → Exit 216 → OH-9 S → CR-5 / Glencoe Rd → Methodist Ridge Rd → Campbell-johnson Hill Rd → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "Both reviewed directions preserve I-70 Exit 216 and OH-9 S to the Google-canonical OH-9 / Glencoe Road CR-5 junction, then physical CR-5, Methodist Ridge Road, and Campbell-Johnson Hill Road to KURTH's saved GPS. Satellite confirms the clear entrance split and pad deck; the final connector is not official road or navigation geometry. Glencoe is renderer context for CR-5 only, and earlier rejected waypoint variants remain excluded.",
    trustedDestination: {
      latitude: KURTH_ROUTE_DESTINATION.latitude,
      longitude: KURTH_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: KURTH_ROUTE_DESTINATION,
    waypoints: KURTH_WAYPOINTS,
  },
  {
    padId: "ce1bff99-9c64-435e-a517-e5b8f1a102b7",
    canonicalId: "ce1bff99-9c64-435e-a517-e5b8f1a102b7",
    legacyId: "ascent--puggle",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "PUGGLE",
    state: "Ohio",
    county: "Jefferson",
    structuredRoadSequence: "US-22 → CR-23 → CR-26 → Pad",
    title: "Navigate reviewed route",
    detail: "US-22 → CR-23 → CR-26 → unapproved pad-approach/GPS handoff",
    routeUrl: PUGGLE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected US-22 approach → Bloomingdale / OH-152 exit → CR-23 → CR-26 → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "The Cadiz and Steubenville proofs both preserve US-22, the Bloomingdale / OH-152 exit, CR-23, and CR-26 before PUGGLE's saved GPS. Google renders CR-25 during the final continuation; that label and nearby Boich Mining are context only and are not promoted to the exact record. Satellite confirms the labeled Ascent NAC-B site and visible connector; the final movement is not official road or navigation geometry.",
    trustedDestination: {
      latitude: PUGGLE_ROUTE_DESTINATION.latitude,
      longitude: PUGGLE_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: PUGGLE_ROUTE_DESTINATION,
    waypoints: PUGGLE_WAYPOINTS,
  },
  {
    padId: "b8490b6c-0924-4b1d-a46e-6dc54e7e7267",
    canonicalId: "b8490b6c-0924-4b1d-a46e-6dc54e7e7267",
    legacyId: "ascent--reitz",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "REITZ",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "OH-147 → Old Gas Station Wegee Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "OH-147 → Old Gas Station Wegee Rd → unapproved lease/GPS handoff",
    routeUrl: REITZ_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approved public-highway approach → OH-147 → Old Gas Station Wegee Rd → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "The Bethesda and Bellaire proofs both preserve OH-147 followed by the written Wegee Road occurrence before REITZ's saved GPS. Google renders the last local continuation as Crozier / Crosier / TR-291; that label is context only and is not promoted to the exact directory identity. Satellite confirms the Reitz well pad; the final connector is not official road or navigation geometry.",
    trustedDestination: {
      latitude: REITZ_ROUTE_DESTINATION.latitude,
      longitude: REITZ_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: REITZ_ROUTE_DESTINATION,
    waypoints: REITZ_WAYPOINTS,
  },
  {
    padId: "5484ef9c-cc1f-4eca-9527-63d4a64183fb",
    canonicalId: "5484ef9c-cc1f-4eca-9527-63d4a64183fb",
    legacyId: "ascent--elite",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "ELITE",
    state: "Ohio",
    county: "Jefferson",
    structuredRoadSequence: "OH-150",
    title: "Navigate reviewed route",
    detail: "OH-150 → TR-107A → unapproved access/GPS handoff",
    routeUrl: ELITE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approved public-highway approach → US-250 / OH-150 → TR-107A → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "The Harrisville and Dillonvale proofs both preserve US-250 / OH-150 and TR-107A to ELITE's separate western deck. Google may show nearby Marquad as destination context; that label does not replace ELITE or create a new identity. Satellite confirms the western deck and continuous access; the final movement is not official road or navigation geometry.",
    trustedDestination: {
      latitude: ELITE_ROUTE_DESTINATION.latitude,
      longitude: ELITE_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: ELITE_ROUTE_DESTINATION,
    waypoints: ELITE_WAYPOINTS,
  },
  {
    padId: "638487d0-2ef4-4e5c-8a16-cbb478c490c6",
    canonicalId: "638487d0-2ef4-4e5c-8a16-cbb478c490c6",
    legacyId: "ascent--marquard",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "MARQUARD",
    state: "Ohio",
    county: "Jefferson",
    structuredRoadSequence: "OH-150 → Access Road",
    title: "Navigate reviewed route",
    detail: "OH-150 → TR-107A → unapproved access/GPS handoff",
    routeUrl: MARQUARD_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approved public-highway approach → US-250 / OH-150 → TR-107A → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "The Harrisville and Dillonvale proofs both preserve the shared US-250 / OH-150 and TR-107A corridor, then continue behind ELITE without backtracking to MARQUARD's separate east / northeast deck. Satellite confirms that separate deck and continuous access; the final movement is not official road or navigation geometry.",
    trustedDestination: {
      latitude: MARQUARD_ROUTE_DESTINATION.latitude,
      longitude: MARQUARD_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: MARQUARD_ROUTE_DESTINATION,
    waypoints: MARQUARD_WAYPOINTS,
  },
  {
    padId: "8698112a-c3b4-453e-94d0-bcf4b2476cfb",
    canonicalId: "8698112a-c3b4-453e-94d0-bcf4b2476cfb",
    legacyId: "ascent--j-barr-j",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "J BARR J",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "I-70 → Exit 193 → OH-513 → Oxford Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "I-70 Exit 193 → OH-513 → Oxford Rd → unapproved lease/GPS handoff",
    routeUrl: J_BARR_J_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected I-70 approach → Exit 193 → OH-513 → Oxford Rd → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "Both reviewed directions preserve I-70 Exit 193, OH-513, and Oxford Road before J BARR J's saved GPS. Google's short Pisgah rendering is continuity context only and is not promoted to a new identity. Satellite confirms the pad approach; the final connector is not official road or navigation geometry.",
    trustedDestination: {
      latitude: J_BARR_J_ROUTE_DESTINATION.latitude,
      longitude: J_BARR_J_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: J_BARR_J_ROUTE_DESTINATION,
    waypoints: J_BARR_J_WAYPOINTS,
  },
  {
    padId: "fc8a81c6-ccd5-4d1c-9eb6-507f05317688",
    canonicalId: "fc8a81c6-ccd5-4d1c-9eb6-507f05317688",
    legacyId: "ascent--mohorovich",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "MOHOROVICH",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "I-70 → OH-513 → OH-265 → OH-761 → Sparrow Rd",
    title: "Navigate reviewed route",
    detail: "I-70 → OH-513 → OH-265 → OH-761 → Sparrow Rd → unapproved GPS handoff",
    routeUrl: MOHOROVICH_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected I-70 approach → OH-513 → OH-265 → OH-761 → Sparrow Rd → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "Both reviewed directions preserve the numbered-route order through OH-513, OH-265, and OH-761 before Sparrow Road and MOHOROVICH's saved GPS. Google's OK-761 typo and Mel Frakes / Frankfort labels are renderer context only and do not rewrite the exact record. Satellite confirms the pad approach; the final movement is not official road or navigation geometry.",
    trustedDestination: {
      latitude: MOHOROVICH_ROUTE_DESTINATION.latitude,
      longitude: MOHOROVICH_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: MOHOROVICH_ROUTE_DESTINATION,
    waypoints: MOHOROVICH_WAYPOINTS,
  },
  {
    padId: "88709ded-fda7-42df-ba94-b6bb6c04e45a",
    canonicalId: "88709ded-fda7-42df-ba94-b6bb6c04e45a",
    legacyId: "ascent--watson",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "WATSON",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "Route 70 → Exit 193 → OH-513 → OH-265 → OH-761 → Mel Franks Rd → Pad",
    title: "Navigate reviewed route",
    detail: "I-70 Exit 193 → OH-513 → OH-265 → OH-761 → Mel Franks Rd → unapproved GPS handoff",
    routeUrl: WATSON_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected I-70 approach → Exit 193 → OH-513 → OH-265 → OH-761 → Mel Franks Rd → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "Both reviewed directions preserve I-70 Exit 193, OH-513, OH-265, OH-761, and Mel Franks Road before WATSON's saved GPS. Google's Yeoman Lane label is renderer and final-approach context only and is not promoted to the exact record. Satellite confirms the visible pad approach; the final movement is not official road or navigation geometry.",
    trustedDestination: {
      latitude: WATSON_ROUTE_DESTINATION.latitude,
      longitude: WATSON_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: WATSON_ROUTE_DESTINATION,
    waypoints: WATSON_WAYPOINTS,
  },
  {
    padId: "4b0b99b7-da77-4b27-a2f7-7e8d3a9875d3",
    canonicalId: "4b0b99b7-da77-4b27-a2f7-7e8d3a9875d3",
    legacyId: "ascent--cravat-coal",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "CRAVAT COAL",
    state: "Ohio",
    county: "Harrison",
    structuredRoadSequence: "I-70 → Exit 216 → OH-9 → Shepherdstown Rd → 5. Continue Onto City Rd → OR → OH-9 → Shepherdstown Rd → 3. Continue Onto City Rd → OR → OH-149 → OH-9 → Shepherdstown Rd → 5. Continue Onto City Rd",
    title: "Navigate reviewed route",
    detail: "I-70 Exit 216 → OH-9 → Shepherdstown Rd → City Rd 36 → unapproved GPS handoff",
    routeUrl: CRAVAT_COAL_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected I-70 approach → Exit 216 → OH-9 N → Shepherdstown Rd → City Rd 36 → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "Both reviewed directions preserve I-70 Exit 216, OH-9 N, Shepherdstown Road, and City Road 36 before CRAVAT COAL's saved GPS. Google leaves about 125 feet on the visible pad approach. Satellite confirms the continuous connector; it is not official road or navigation geometry and does not rewrite the exact three-alternative record.",
    trustedDestination: {
      latitude: CRAVAT_COAL_ROUTE_DESTINATION.latitude,
      longitude: CRAVAT_COAL_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: CRAVAT_COAL_ROUTE_DESTINATION,
    waypoints: CRAVAT_COAL_WAYPOINTS,
  },
  {
    padId: "314652b0-0abb-47cb-a263-88ca23582144",
    canonicalId: "314652b0-0abb-47cb-a263-88ca23582144",
    legacyId: "ascent--monroe-north",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "MONROE NORTH",
    state: "Ohio",
    county: "Monroe",
    structuredRoadSequence: "I-70E → I-470 → Exit 6 → OH-7 → Krebbs Hill Rd",
    title: "Navigate reviewed route",
    detail: "I-70 → I-470 Exit 6 → OH-7 → Krebbs Hill Rd → TR-910 → unapproved GPS handoff",
    routeUrl: MONROE_NORTH_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected Interstate approach → I-470 Exit 6 → OH-7 → Krebbs Hill Rd occurrence → TR-910 → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "The north proof preserves I-70 E, I-470 Exit 6, and OH-7 S; the south proof uses the opposite OH-7 N approach. Both then preserve the intended Krebbs Hill occurrence and TR-910 to MONROE NORTH's saved GPS. Google renders Krebs Ridge as alias context only. Satellite confirms the deck and connector; the final movement is not official road or navigation geometry.",
    trustedDestination: {
      latitude: MONROE_NORTH_ROUTE_DESTINATION.latitude,
      longitude: MONROE_NORTH_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: MONROE_NORTH_ROUTE_DESTINATION,
    waypoints: MONROE_NORTH_WAYPOINTS,
  },
  {
    padId: "3e31e56b-6c85-4f0c-9a38-0554b42581a5",
    canonicalId: "3e31e56b-6c85-4f0c-9a38-0554b42581a5",
    legacyId: "ascent--cermak",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "CERMAK",
    state: "Ohio",
    county: "Jefferson",
    structuredRoadSequence: "OH-9 → I-70 → I-470 → Exit 6 → OH-7 → 2nd St → CR-80 → Liberty Ave → OH-150 → OH-152 → CR-11 → Piney Fork Rd → OR → US-22 → OH-151 / Mill St → OH-152 / South/main St → CR-11 → Piney Fork Rd",
    title: "Navigate reviewed route",
    detail: "OH-152 → CR-11 / Piney Fork Rd → unapproved GPS handoff",
    routeUrl: CERMAK_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approved public-highway approach → OH-152 → CR-11 / Piney Fork Rd → unapproved pad-approach/GPS handoff → saved pad GPS",
    finalLegNotice: "The Hopedale and Dillonvale proofs both preserve OH-152 followed by the intended CR-11 / Piney Fork Road occurrence before CERMAK's saved GPS. Satellite confirms the visible final approach and pad deck; that connector is not official road or navigation geometry and the exact two-alternative record remains unchanged.",
    trustedDestination: {
      latitude: CERMAK_ROUTE_DESTINATION.latitude,
      longitude: CERMAK_ROUTE_DESTINATION.longitude,
      source: "saved_pad_gps",
    },
    routeDestination: CERMAK_ROUTE_DESTINATION,
    waypoints: CERMAK_WAYPOINTS,
  },
  ...ascentSavedDirectionExactMatchBatch1Contracts,
] as const;

const bilinovichUnsafeBlazeContract = {
  padId: "59061829-1122-4aae-872d-cf5024310373",
  canonicalId: "59061829-1122-4aae-872d-cf5024310373",
  legacyId: "ascent--bilinovich",
  recordRevision: "1787794115232844",
  company: "Ascent",
  padName: "BILINOVICH",
  state: "Ohio",
  county: "Guernsey",
  structuredRoadSequence: "I-70 W → Exit 193 → OH-513 N → US-22 E → McCoy Rd → Blaze Rd → Logan Rd → Turkle Rd / lease access → BILINOVICH",
} as const;

function matchesBoundPad(
  pad: Pick<PadSummary, "padId" | "canonicalId" | "legacyId" | "recordRevision" | "company" | "padName" | "state" | "county" | "structuredRoadSequence">,
  contract: typeof bilinovichUnsafeBlazeContract,
) {
  return pad.padId === contract.padId
    && pad.canonicalId === contract.canonicalId
    && pad.legacyId === contract.legacyId
    && pad.recordRevision === contract.recordRevision
    && pad.company === contract.company
    && pad.padName === contract.padName
    && pad.state === contract.state
    && pad.county === contract.county
    && pad.structuredRoadSequence === contract.structuredRoadSequence;
}

/** Withdraws a known-unsafe reviewed route without inventing its replacement. */
export function reviewedNavigationSafetyHoldForPad(
  pad: Pick<PadSummary, "padId" | "canonicalId" | "legacyId" | "recordRevision" | "company" | "padName" | "state" | "county" | "structuredRoadSequence">,
): ReviewedNavigationSafetyHold | null {
  if (!matchesBoundPad(pad, bilinovichUnsafeBlazeContract)) return null;
  return {
    padId: bilinovichUnsafeBlazeContract.padId,
    title: "Reviewed route withdrawn",
    detail: "Do not use Blaze Road · corrected route pending",
  };
}

/**
 * Returns a route only when the current directory record is the exact reviewed
 * record. This is intentionally separate from optional State-1 graph/public-
 * Google promotion: it exposes the reviewed mobile handoff without
 * manufacturing route steps, display geometry, or a new public road identity.
 */
export function reviewedNavigationCandidateForPad(
  pad: PadSummary,
): ReviewedNavigationCandidate | null {
  const contract = reviewedNavigationContracts.find((candidate) => candidate.padId === pad.padId);
  if (!contract
    || pad.canonicalId !== contract.canonicalId
    || pad.legacyId !== contract.legacyId
    || pad.recordRevision !== contract.recordRevision
    || pad.company !== contract.company
    || pad.padName !== contract.padName
    || pad.state !== contract.state
    || pad.county !== contract.county
    || pad.structuredRoadSequence !== contract.structuredRoadSequence) return null;

  const destination = trustedPadDestination(pad);
  if (!destination
    || destination.source !== contract.trustedDestination.source
    || Math.abs(destination.latitude - contract.trustedDestination.latitude) > 1e-9
    || Math.abs(destination.longitude - contract.trustedDestination.longitude) > 1e-9) return null;

  const routeDestinationMatchesTrusted = Math.abs(
    contract.routeDestination.latitude - contract.trustedDestination.latitude,
  ) <= 1e-9 && Math.abs(
    contract.routeDestination.longitude - contract.trustedDestination.longitude,
  ) <= 1e-9;
  const isExactBilinovichPadSurfaceOverride = contract.padId === "59061829-1122-4aae-872d-cf5024310373"
    && contract.routeDestinationOverride === "bilinovich_reviewed_odnr_pad_surface";
  if (!routeDestinationMatchesTrusted && !isExactBilinovichPadSurfaceOverride) return null;

  if (!reviewedNavigationUrlMatchesContract(
    contract.routeUrl,
    contract.routeDestination,
    contract.waypoints,
  )) return null;

  const ownerApproval = ownerApprovalPresentationForReceipt(contract);

  return {
    padId: contract.padId,
    title: contract.title,
    detail: contract.detail,
    routeUrl: contract.routeUrl,
    reviewedRoadSequence: contract.reviewedRoadSequence,
    finalLegNotice: contract.finalLegNotice,
    preserveMeasuredApproach: contract.preserveMeasuredApproach,
    ownerApproval,
  };
}

export type OwnerApprovalReceiptInput = Pick<ReviewedNavigationContract,
  | "padId"
  | "canonicalId"
  | "legacyId"
  | "recordRevision"
  | "company"
  | "padName"
  | "state"
  | "county"
  | "structuredRoadSequence"
  | "title"
  | "detail"
  | "routeUrl"
  | "reviewedRoadSequence"
  | "finalLegNotice"
  | "trustedDestination"
  | "routeDestination"
  | "waypoints"
  | "routeDestinationOverride"
>;

/**
 * A stable, fail-closed content fingerprint. This is not a cryptographic
 * authorization primitive; it is an independent frozen receipt that prevents
 * a later route or wording edit from silently inheriting the owner's approval.
 */
export function ownerApprovalContentFingerprint(contract: OwnerApprovalReceiptInput) {
  const canonical = JSON.stringify({
    padId: contract.padId,
    canonicalId: contract.canonicalId,
    legacyId: contract.legacyId,
    recordRevision: contract.recordRevision,
    company: contract.company,
    padName: contract.padName,
    state: contract.state,
    county: contract.county,
    structuredRoadSequence: contract.structuredRoadSequence,
    title: contract.title,
    detail: contract.detail,
    routeUrl: contract.routeUrl,
    reviewedRoadSequence: contract.reviewedRoadSequence || "",
    finalLegNotice: contract.finalLegNotice || "",
    trustedDestination: contract.trustedDestination,
    routeDestination: contract.routeDestination,
    waypoints: contract.waypoints,
    routeDestinationOverride: contract.routeDestinationOverride || "",
  });
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < canonical.length; index += 1) {
    const code = canonical.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x5bd1e995);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export function ownerApprovalPresentationForReceipt(
  contract: OwnerApprovalReceiptInput,
): OwnerApprovedNavigationPresentation | undefined {
  const receipt = ownerApprovedNavigationReceiptByPadId.get(contract.padId);
  if (!receipt || receipt.contentFingerprint !== ownerApprovalContentFingerprint(contract)) return undefined;
  return {
    kind: "owner_approved_directions",
    evidence: receipt.evidence,
    approvedAt: "2026-08-28",
  };
}

export function ownerApprovalReceiptInputForAudit(padId: string): OwnerApprovalReceiptInput | null {
  return reviewedNavigationContracts.find((contract) => contract.padId === padId) || null;
}

export function reviewedNavigationContractRowsForAudit() {
  return reviewedNavigationContracts.map((contract) => ({
    padId: contract.padId,
    canonicalId: contract.canonicalId,
    legacyId: contract.legacyId,
    recordRevision: contract.recordRevision,
    company: contract.company,
    padName: contract.padName,
    state: contract.state,
    county: contract.county,
    structuredRoadSequence: contract.structuredRoadSequence,
    title: contract.title,
    detail: contract.detail,
    routeUrl: contract.routeUrl,
    reviewedRoadSequence: contract.reviewedRoadSequence || "",
    finalLegNotice: contract.finalLegNotice || "",
    preserveMeasuredApproach: contract.preserveMeasuredApproach === true,
    trustedDestination: contract.trustedDestination,
    routeDestination: contract.routeDestination,
    waypoints: contract.waypoints,
    selectedTerminalPublicRoadSequence: contract.selectedTerminalPublicRoadSequence || [],
    ownerApproval: ownerApprovalPresentationForReceipt(contract) || null,
  }));
}

export function ownerApprovalReceiptRowsForAudit() {
  return ownerApprovedNavigationReceiptEntries.map(([padId, evidence, contentFingerprint]) => {
    const contract = reviewedNavigationContracts.find((candidate) => candidate.padId === padId);
    const currentContentFingerprint = contract ? ownerApprovalContentFingerprint(contract) : null;
    return {
      padId,
      evidence,
      contentFingerprint,
      currentContentFingerprint,
      matchesCurrentContent: contentFingerprint === currentContentFingerprint,
    };
  });
}
