import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { LoadingState } from "@/components/LoadingState";
import { useCompanyRoads } from "@/data/CompanyRoadsContext";
import { useDirectory } from "@/data/DirectoryContext";
import { useOwnerAccess } from "@/data/OwnerAccessContext";
import { isInsideCoordinateServiceArea } from "@/data/coordinates";
import { loadPadStatus } from "@/data/status";
import {
  latestOwnerGoogleVerifyDraftForPad,
  ownerGoogleVerifyExportJson,
  ownerGoogleVerifyStorageEvent,
  readOwnerGoogleVerifyDrafts,
  saveOwnerGoogleVerifyDraft,
  type OwnerGoogleVerifyDraft,
  type OwnerGoogleVerifyPoint,
  type OwnerGoogleVerifySectionMark,
  type OwnerGoogleVerifySectionState,
} from "@/data/ownerGoogleVerifyDrafts";
import type {
  GoogleLatLng,
  GoogleMapInstance,
  GoogleMapsApi,
  GooglePolylineInstance,
  GoogleRouteClass,
  GoogleRouteLeg,
} from "./googleMapsLoader";
import {
  addOwnerGoogleVerifyPoint,
  buildOwnerGoogleVerifySections,
  maximumOwnerGoogleVerifyTurnPins,
  ownerGoogleVerifyApprovedStepRoutes,
  ownerGoogleVerifyDestination,
  ownerGoogleVerifyOutcome,
  type OwnerGoogleVerifyApprovedStepRoute,
} from "./ownerGoogleVerifyModel";
import "./owner-google-verify.css";

type MapState = "loading" | "ready" | "not_configured" | "error";
type PreviewState = "waiting_for_phone" | "waiting_for_anchor" | "routing" | "ready" | "error";

function pointFromGoogle(value: GoogleLatLng): OwnerGoogleVerifyPoint {
  return {
    latitude: typeof value.lat === "function" ? value.lat() : value.lat,
    longitude: typeof value.lng === "function" ? value.lng() : value.lng,
  };
}

function googlePoint(value: OwnerGoogleVerifyPoint) {
  return { lat: value.latitude, lng: value.longitude };
}

function validPhonePoint(value: OwnerGoogleVerifyPoint) {
  return Number.isFinite(value.latitude)
    && value.latitude >= -90
    && value.latitude <= 90
    && Number.isFinite(value.longitude)
    && value.longitude >= -180
    && value.longitude <= 180
    && !(value.latitude === 0 && value.longitude === 0);
}

function candidateEntranceFromInput(latitudeText: string, longitudeText: string) {
  const latitudeValue = latitudeText.trim();
  const longitudeValue = longitudeText.trim();
  if (!latitudeValue && !longitudeValue) return { valid: true as const, point: null };
  if (!latitudeValue || !longitudeValue) return { valid: false as const, point: null };
  const point = { latitude: Number(latitudeValue), longitude: Number(longitudeValue) };
  return validPhonePoint(point) && isInsideCoordinateServiceArea(point.latitude, point.longitude)
    ? { valid: true as const, point }
    : { valid: false as const, point: null };
}

function sameDestination(draft: OwnerGoogleVerifyDraft, destination: OwnerGoogleVerifyPoint) {
  return draft.pad.destination.latitude === destination.latitude
    && draft.pad.destination.longitude === destination.longitude;
}

function sectionLabel(ordinal: number, turnPinCount: number) {
  const from = ordinal === 1 ? "Anchor" : `Pin ${ordinal - 1}`;
  const to = ordinal <= turnPinCount ? `Pin ${ordinal}` : "saved pad GPS";
  return `${from} → ${to}`;
}

function readableTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function downloadDrafts() {
  const blob = new Blob([ownerGoogleVerifyExportJson()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `brinesearch-owner-google-verify-drafts-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function OwnerGoogleVerifyMapPage() {
  const { padId = "" } = useParams();
  return <OwnerGoogleVerifyMapSession key={padId} padId={padId}/>;
}

function OwnerGoogleVerifyMapSession({ padId }: { padId: string }) {
  const { access } = useOwnerAccess();
  const { findPad, loading, snapshot } = useDirectory();
  const companyRoads = useCompanyRoads();
  const pad = findPad(decodeURIComponent(padId));
  const destination = useMemo(() => pad ? ownerGoogleVerifyDestination(pad) : null, [pad]);
  const mapHost = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const mapsRef = useRef<GoogleMapsApi | null>(null);
  const routeClassRef = useRef<GoogleRouteClass | null>(null);
  const overlaysRef = useRef<Array<{ setMap(map: GoogleMapInstance | null): void }>>([]);
  const approvedRoadOverlaysRef = useRef<Array<{ setMap(map: GoogleMapInstance | null): void }>>([]);
  const approvedStepOverlaysRef = useRef<Array<{ setMap(map: GoogleMapInstance | null): void }>>([]);
  const companyRoadsRef = useRef(companyRoads);
  const previewRequestRef = useRef(0);
  const suppressMapClickRef = useRef(0);
  const mapClickActionRef = useRef<(point: OwnerGoogleVerifyPoint) => void>(() => undefined);

  const [mapState, setMapState] = useState<MapState>("loading");
  const [mapMessage, setMapMessage] = useState("Loading owner Google map…");
  const [mapType, setMapType] = useState<"roadmap" | "satellite">("satellite");
  const [origin, setOrigin] = useState<OwnerGoogleVerifyPoint | null>(null);
  const [locationState, setLocationState] = useState<"idle" | "locating" | "ready" | "error">("idle");
  const [anchor, setAnchor] = useState<OwnerGoogleVerifyPoint | null>(null);
  const [turnPins, setTurnPins] = useState<OwnerGoogleVerifyPoint[]>([]);
  const [routeLegs, setRouteLegs] = useState<GoogleRouteLeg[]>([]);
  const [sectionMarks, setSectionMarks] = useState<OwnerGoogleVerifySectionMark[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [roadName, setRoadName] = useState("");
  const [previewState, setPreviewState] = useState<PreviewState>("waiting_for_phone");
  const [previewMessage, setPreviewMessage] = useState("Waiting for this phone's GPS.");
  const [notice, setNotice] = useState("First map tap sets the named-public-road anchor.");
  const [previewVersion, setPreviewVersion] = useState(0);
  const [draftId, setDraftId] = useState("");
  const [drafts, setDrafts] = useState<OwnerGoogleVerifyDraft[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [entranceLatitude, setEntranceLatitude] = useState("");
  const [entranceLongitude, setEntranceLongitude] = useState("");
  const [loadedApprovedStepRoutes, setLoadedApprovedStepRoutes] = useState<OwnerGoogleVerifyApprovedStepRoute[]>([]);
  const [loadedApprovedStepRecordKey, setLoadedApprovedStepRecordKey] = useState("");
  const [approvedStepState, setApprovedStepState] = useState<"loading" | "ready" | "unavailable">("loading");
  const approvedStepRecordKey = pad ? `${pad.padId}:${pad.recordRevision}` : "";
  const approvedStepRoutes = loadedApprovedStepRecordKey === approvedStepRecordKey
    ? loadedApprovedStepRoutes
    : [];
  const currentApprovedStepState = loadedApprovedStepRecordKey === approvedStepRecordKey
    ? approvedStepState
    : "loading";
  const verifierRecordKey = pad && destination
    ? `${pad.padId}:${pad.recordRevision}:${destination.latitude}:${destination.longitude}`
    : pad ? `${pad.padId}:${pad.recordRevision}:no-destination` : `missing:${padId}`;
  const verifierSessionKey = `${access.state === "owner" ? "owner" : "gated"}:${verifierRecordKey}`;
  companyRoadsRef.current = companyRoads;
  const parsedCandidateEntrance = useMemo(
    () => candidateEntranceFromInput(entranceLatitude, entranceLongitude),
    [entranceLatitude, entranceLongitude],
  );
  const candidateEntrancePoint = parsedCandidateEntrance.point;

  const clearOverlays = useCallback(() => {
    for (const overlay of overlaysRef.current) overlay.setMap(null);
    overlaysRef.current = [];
  }, []);

  const clearApprovedRoadOverlays = useCallback(() => {
    for (const overlay of approvedRoadOverlaysRef.current) overlay.setMap(null);
    approvedRoadOverlaysRef.current = [];
  }, []);

  const clearApprovedStepOverlays = useCallback(() => {
    for (const overlay of approvedStepOverlaysRef.current) overlay.setMap(null);
    approvedStepOverlaysRef.current = [];
  }, []);

  const invalidatePreview = useCallback(() => {
    previewRequestRef.current += 1;
    clearOverlays();
    setRouteLegs([]);
    setSectionMarks([]);
    setSelectedSectionId("");
    setRoadName("");
  }, [clearOverlays]);

  useEffect(() => {
    invalidatePreview();
    setOrigin(null);
    setLocationState("idle");
    setAnchor(null);
    setTurnPins([]);
    setPreviewState("waiting_for_phone");
    setPreviewMessage("Waiting for this phone's GPS.");
    setNotice("First map tap sets the named-public-road anchor.");
    setPreviewVersion(0);
    setDraftId("");
    setSaveMessage("");
    setEntranceLatitude("");
    setEntranceLongitude("");
  }, [invalidatePreview, verifierSessionKey]);

  mapClickActionRef.current = (point) => {
    if (Date.now() - suppressMapClickRef.current < 180) return;
    const next = addOwnerGoogleVerifyPoint(anchor, turnPins, point);
    if (next.anchor === anchor && next.turnPins.length === turnPins.length) {
      setNotice(next.notice);
      return;
    }
    invalidatePreview();
    setAnchor(next.anchor);
    setTurnPins(next.turnPins);
    setNotice(next.notice);
  };

  const requestPhoneOrigin = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationState("error");
      setPreviewState("error");
      setPreviewMessage("Phone GPS is unavailable. The origin cannot fall back to another place.");
      return;
    }
    invalidatePreview();
    setLocationState("locating");
    setPreviewState("waiting_for_phone");
    setPreviewMessage("Locating this phone…");
    navigator.geolocation.getCurrentPosition((position) => {
      const nextOrigin = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      if (!validPhonePoint(nextOrigin)) {
        setOrigin(null);
        setLocationState("error");
        setPreviewState("error");
        setPreviewMessage("This phone did not return a valid GPS origin. No fallback origin will be used.");
        return;
      }
      setOrigin(nextOrigin);
      setLocationState("ready");
      setPreviewState(anchor ? "routing" : "waiting_for_anchor");
      setPreviewMessage(anchor ? "Updating Google preview…" : "Phone origin ready. Tap a named public road for the anchor.");
    }, () => {
      setOrigin(null);
      setLocationState("error");
      setPreviewState("error");
      setPreviewMessage("Phone GPS permission is required. Cadiz or another fallback origin will never be used.");
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
  }, [anchor, invalidatePreview]);

  useEffect(() => {
    if (access.state !== "owner" || !pad || !destination || !mapHost.current) return;
    let active = true;
    setMapState("loading");
    setMapMessage("Loading owner Google map…");
    import("./googleMapsLoader").then(({ loadOwnerGoogleMaps }) => loadOwnerGoogleMaps()).then(async (maps) => {
      if (!active || !mapHost.current) return;
      const routes = await maps.importLibrary("routes");
      if (!active || !mapHost.current) return;
      const map = new maps.Map(mapHost.current, {
        center: googlePoint(destination),
        zoom: 14,
        mapTypeId: maps.MapTypeId.SATELLITE,
        clickableIcons: false,
        disableDefaultUI: true,
        zoomControl: true,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: "greedy",
      });
      map.addListener("click", (event) => {
        if (event.latLng) mapClickActionRef.current(pointFromGoogle(event.latLng));
      });
      mapsRef.current = maps;
      mapRef.current = map;
      routeClassRef.current = routes.Route;
      setMapState("ready");
      setMapMessage("Owner map ready.");
    }).catch((error) => {
      if (!active) return;
      const notConfigured = error instanceof Error && error.message === "Owner map not configured.";
      setMapState(notConfigured ? "not_configured" : "error");
      setMapMessage(notConfigured ? "Owner map not configured." : "Owner Google map could not start.");
    });
    return () => {
      active = false;
      previewRequestRef.current += 1;
      clearOverlays();
      clearApprovedRoadOverlays();
      clearApprovedStepOverlays();
      mapRef.current = null;
      mapsRef.current = null;
      routeClassRef.current = null;
      if (mapHost.current) mapHost.current.replaceChildren();
    };
  }, [access.state, clearApprovedRoadOverlays, clearApprovedStepOverlays, clearOverlays, destination, pad]);

  useEffect(() => {
    let active = true;
    setLoadedApprovedStepRoutes([]);
    setLoadedApprovedStepRecordKey(approvedStepRecordKey);
    if (access.state !== "owner" || !pad) {
      setApprovedStepState("unavailable");
      return () => { active = false; };
    }
    setApprovedStepState("loading");
    loadPadStatus(pad, snapshot?.sourceState).then((status) => {
      if (!active) return;
      if (status.padId !== pad.padId || status.recordRevision !== pad.recordRevision) {
        setApprovedStepState("unavailable");
        return;
      }
      const routes = ownerGoogleVerifyApprovedStepRoutes(status);
      setLoadedApprovedStepRoutes(routes);
      setApprovedStepState(routes.length ? "ready" : "unavailable");
    }).catch(() => {
      if (active) setApprovedStepState("unavailable");
    });
    return () => { active = false; };
  }, [access.state, approvedStepRecordKey, pad, snapshot?.sourceState]);

  useEffect(() => {
    if (access.state !== "owner") return;
    const previousSelection = companyRoadsRef.current.selection;
    return () => {
      const current = companyRoadsRef.current;
      if (current.selection === "all" && previousSelection !== "all") current.selectRoads(previousSelection);
    };
  }, [access.state]);

  useEffect(() => {
    if (access.state === "owner"
      && mapState === "ready"
      && companyRoads.availability.state === "ready"
      && companyRoads.selection !== "all") companyRoads.selectRoads("all");
  }, [access.state, companyRoads, mapState]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;
    if (!map || !maps) return;
    map.setMapTypeId(mapType === "satellite" ? maps.MapTypeId.SATELLITE : maps.MapTypeId.ROADMAP);
  }, [mapType]);

  useEffect(() => {
    if (access.state !== "owner") return;
    const refresh = () => setDrafts(readOwnerGoogleVerifyDrafts());
    refresh();
    window.addEventListener(ownerGoogleVerifyStorageEvent, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(ownerGoogleVerifyStorageEvent, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [access.state]);

  useEffect(() => {
    const Route = routeClassRef.current;
    if (access.state !== "owner" || mapState !== "ready" || !Route || !origin || !anchor || !destination) {
      if (!origin) {
        setPreviewState("waiting_for_phone");
        setPreviewMessage("Waiting for this phone's GPS.");
      } else if (!anchor) {
        setPreviewState("waiting_for_anchor");
        setPreviewMessage("Tap a named public road to set the anchor.");
      }
      return;
    }
    const requestId = ++previewRequestRef.current;
    setPreviewState("routing");
    setPreviewMessage("Updating Google preview…");
    Route.computeRoutes({
      origin: googlePoint(origin),
      destination: googlePoint(destination),
      intermediates: [anchor, ...turnPins].map((point) => ({
        location: googlePoint(point),
        via: false as const,
        vehicleStopover: false as const,
      })),
      optimizeWaypointOrder: false,
      computeAlternativeRoutes: false,
      travelMode: "DRIVING",
      routingPreference: "TRAFFIC_UNAWARE",
      polylineQuality: "HIGH_QUALITY",
      fields: ["path", "legs", "viewport"],
    }).then(({ routes }) => {
      if (requestId !== previewRequestRef.current) return;
      const route = routes?.[0];
      const legs = route?.legs || [];
      const expectedLegCount = turnPins.length + 2;
      if (!route || legs.length !== expectedLegCount || legs.some((leg) => !Array.isArray(leg.path) || leg.path.length < 2)) {
        throw new Error("Route response did not preserve every owner control point.");
      }
      setRouteLegs(legs);
      setPreviewState("ready");
      setPreviewMessage(`${legs.length - 1} post-anchor ${legs.length - 1 === 1 ? "section" : "sections"} ready. Tap each line to classify it.`);
      setSelectedSectionId("");
      if (route.viewport) mapRef.current?.fitBounds(route.viewport, 54);
    }).catch(() => {
      if (requestId !== previewRequestRef.current) return;
      setRouteLegs([]);
      setPreviewState("error");
      setPreviewMessage("Google could not preview this route. Check Maps JavaScript and Routes API access, then refresh the preview.");
    });
  }, [access.state, anchor, destination, mapState, origin, previewVersion, turnPins]);

  const sections = useMemo(() => anchor && destination
    ? buildOwnerGoogleVerifySections(anchor, turnPins, destination, sectionMarks)
    : [], [anchor, destination, sectionMarks, turnPins]);
  const outcome = ownerGoogleVerifyOutcome(routeLegs.length ? sections : []);
  const selectedSection = sections.find((section) => section.sectionId === selectedSectionId) || null;

  useEffect(() => {
    clearApprovedRoadOverlays();
    const maps = mapsRef.current;
    const map = mapRef.current;
    const overlay = companyRoads.overlay;
    if (!maps || !map || !overlay || overlay.selection !== "all") return;
    for (const row of overlay.rows) {
      const paths = row.geometry.type === "LineString" ? [row.geometry.coordinates] : row.geometry.coordinates;
      for (const path of paths) approvedRoadOverlaysRef.current.push(new maps.Polyline({
        map,
        path: path.map(([longitude, latitude]) => ({ lat: latitude, lng: longitude })),
        strokeColor: "#14b8a6",
        strokeOpacity: .72,
        strokeWeight: 4,
        clickable: false,
        zIndex: 0,
      }));
    }
  }, [clearApprovedRoadOverlays, companyRoads.overlay, mapState]);

  useEffect(() => {
    clearApprovedStepOverlays();
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map) return;
    for (const route of approvedStepRoutes) {
      for (const feature of route.geometry.features) {
        const paths = feature.geometry.type === "LineString"
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates;
        for (const path of paths) approvedStepOverlaysRef.current.push(new maps.Polyline({
          map,
          path: path.map(([longitude, latitude]) => ({ lat: latitude, lng: longitude })),
          strokeColor: "#2dd4bf",
          strokeOpacity: .98,
          strokeWeight: 7,
          clickable: false,
          zIndex: 1,
        }));
      }
    }
  }, [approvedStepRoutes, clearApprovedStepOverlays, mapState]);

  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map || !destination) return;
    clearOverlays();
    const circles = [
      origin && { point: origin, color: "#60a5fa", radius: 12 },
      anchor && { point: anchor, color: "#f59e0b", radius: 14 },
      ...turnPins.map((point) => ({ point, color: "#f8fafc", radius: 11 })),
      candidateEntrancePoint && { point: candidateEntrancePoint, color: "#c084fc", radius: 13 },
      { point: destination, color: "#14b8a6", radius: 16 },
    ].filter((value): value is { point: OwnerGoogleVerifyPoint; color: string; radius: number } => Boolean(value));
    for (const item of circles) overlaysRef.current.push(new maps.Circle({
      map,
      center: googlePoint(item.point),
      radius: item.radius,
      fillColor: item.color,
      fillOpacity: .95,
      strokeColor: "#07131f",
      strokeOpacity: 1,
      strokeWeight: 3,
      clickable: false,
      zIndex: 5,
    }));
    const approachLeg = routeLegs[0];
    if (approachLeg) overlaysRef.current.push(new maps.Polyline({
      map,
      path: approachLeg.path,
      strokeColor: "#64748b",
      strokeOpacity: .55,
      strokeWeight: 5,
      clickable: false,
      zIndex: 1,
    }));
    routeLegs.slice(1).forEach((leg, index) => {
      const section = sections[index];
      if (!section) return;
      const approved = section.mark?.state === "approved_named_road";
      const selected = section.sectionId === selectedSectionId;
      const polyline: GooglePolylineInstance = new maps.Polyline({
        map,
        path: leg.path,
        strokeColor: approved ? "#14b8a6" : "#94a3b8",
        strokeOpacity: approved ? 1 : .9,
        strokeWeight: selected ? 10 : 7,
        clickable: true,
        zIndex: selected ? 4 : 3,
      });
      polyline.addListener("click", () => {
        suppressMapClickRef.current = Date.now();
        setSelectedSectionId(section.sectionId);
        setRoadName(section.mark?.roadName || "");
      });
      overlaysRef.current.push(polyline);
    });
  }, [anchor, candidateEntrancePoint, clearOverlays, destination, origin, routeLegs, sectionMarks, sections, selectedSectionId, turnPins]);

  function fitAll() {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map || !destination) return;
    const bounds = new maps.LatLngBounds();
    [origin, anchor, ...turnPins, candidateEntrancePoint, destination].filter((point): point is OwnerGoogleVerifyPoint => Boolean(point)).forEach((point) => bounds.extend(googlePoint(point)));
    for (const route of approvedStepRoutes) for (const feature of route.geometry.features) {
      const paths = feature.geometry.type === "LineString" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      for (const path of paths) for (const [longitude, latitude] of path) bounds.extend({ lat: latitude, lng: longitude });
    }
    for (const leg of routeLegs) for (const point of leg.path) bounds.extend(point);
    map.fitBounds(bounds, 54);
  }

  function undo() {
    if (!anchor) return;
    invalidatePreview();
    if (turnPins.length) {
      setTurnPins((current) => current.slice(0, -1));
      setNotice("Newest turn pin removed. Preview is updating.");
    } else {
      setAnchor(null);
      setNotice("Anchor removed. Tap a named public road to start again.");
    }
  }

  function clear() {
    invalidatePreview();
    setAnchor(null);
    setTurnPins([]);
    setDraftId("");
    setNotice("Route controls cleared. The saved pad GPS remains locked.");
  }

  function markSelected(state: OwnerGoogleVerifySectionState) {
    if (!selectedSection) return;
    const name = roadName.trim();
    if (state === "approved_named_road" && !name) {
      setNotice("Enter the public road name before marking this section approved.");
      return;
    }
    const mark: OwnerGoogleVerifySectionMark = {
      sectionId: selectedSection.sectionId,
      ordinal: selectedSection.ordinal,
      state,
      roadName: state === "approved_named_road" ? name : null,
      start: selectedSection.start,
      end: selectedSection.end,
    };
    setSectionMarks((current) => [...current.filter((candidate) => candidate.sectionId !== mark.sectionId), mark]);
    setNotice(state === "approved_named_road" ? `${name} marked approved.` : state === "lease_or_unnamed" ? "Section marked unnamed or lease road." : "Section marked off approved road.");
  }

  function saveDraft() {
    if (!pad || !destination || !anchor) {
      setSaveMessage("Set an anchor before saving a draft.");
      return;
    }
    if (!parsedCandidateEntrance.valid) {
      setSaveMessage("Enter both entrance latitude and longitude as valid coordinates, or clear both fields.");
      return;
    }
    const nextDraftId = draftId || `${pad.padId}:${Date.now()}:${window.crypto?.randomUUID?.() || "draft"}`;
    const draft: OwnerGoogleVerifyDraft = {
      schemaVersion: 1,
      draftId: nextDraftId,
      pad: {
        padId: pad.padId,
        padName: pad.padName,
        company: pad.company,
        recordRevision: pad.recordRevision,
        destination: { ...destination },
        candidateEntrance: parsedCandidateEntrance.point,
      },
      anchor,
      turnPins,
      sectionMarks,
      savedAt: new Date().toISOString(),
    };
    try {
      saveOwnerGoogleVerifyDraft(draft);
      setDraftId(nextDraftId);
      setSaveMessage("Draft saved on this device. Driver Navigate is unchanged.");
    } catch {
      setSaveMessage("Draft could not be saved on this device.");
    }
  }

  function resumeDraft(draft: OwnerGoogleVerifyDraft) {
    if (!pad || !destination) return;
    if (draft.pad.recordRevision !== pad.recordRevision || !sameDestination(draft, destination)) {
      setSaveMessage("This draft belongs to an older pad revision or destination and cannot be resumed.");
      return;
    }
    invalidatePreview();
    setAnchor(draft.anchor);
    setTurnPins(draft.turnPins);
    setEntranceLatitude(draft.pad.candidateEntrance ? String(draft.pad.candidateEntrance.latitude) : "");
    setEntranceLongitude(draft.pad.candidateEntrance ? String(draft.pad.candidateEntrance.longitude) : "");
    setDraftId(draft.draftId);
    setNotice("Draft points resumed. Google is recomputing, and every section must be reviewed again.");
    setSaveMessage("");
  }

  if (access.state === "checking") return <LoadingState message="Checking owner access…"/>;
  if (access.state !== "owner") return <section className="page-state owner-google-verify-gate">
    <Icon name="control"/><h1>Owner verification map</h1><p>{access.message}</p>
    <Link className="button-primary" to={`/sign-in?next=${encodeURIComponent(`/settings/verify-route/${padId}`)}`}>Sign in as owner</Link>
  </section>;
  if (loading) return <LoadingState message="Loading pad destination…"/>;
  if (!pad) return <section className="page-state"><h1>Pad not found</h1><p>This owner verification link does not match a current V18 pad.</p><Link to="/?view=roads" className="button-primary">Return to Approved Roads</Link></section>;
  if (!destination) return <section className="page-state"><h1>Saved pad GPS required</h1><p>{pad.padName} has no current record-bound saved pad GPS. No display fallback, address, entrance, or inferred point will be used.</p><Link to={`/pad/${encodeURIComponent(pad.padId)}`} className="button-primary">Return to pad</Link></section>;

  const latestDraft = latestOwnerGoogleVerifyDraftForPad(pad.padId, {
    getItem: (key) => localStorage.getItem(key),
  });
  const revisionMismatch = Boolean(latestDraft && (latestDraft.pad.recordRevision !== pad.recordRevision || !sameDestination(latestDraft, destination)));

  return <section className="owner-google-verify-page" data-map-state={mapState}>
    <div ref={mapHost} className="owner-google-verify-map" aria-label={`Google route verification map for ${pad.padName}`}/>
    {mapState !== "ready" && <div className="owner-google-map-state" role={mapState === "error" ? "alert" : "status"}><Icon name="google"/><strong>{mapMessage}</strong>{mapState === "not_configured" && <small>Add VITE_GOOGLE_MAPS_API_KEY to the V18 environment. Never paste it into this page.</small>}</div>}

    <header className="owner-google-verify-topbar">
      <Link to={`/pad/${encodeURIComponent(pad.padId)}`} className="icon-button" aria-label={`Back to ${pad.padName}`}><Icon name="back"/></Link>
      <div><span className="eyebrow">OWNER · DRAFT ONLY</span><strong>{pad.padName}</strong><small>{pad.company} · revision {pad.recordRevision}</small></div>
      <button type="button" className="owner-map-type" onClick={() => setMapType((value) => value === "satellite" ? "roadmap" : "satellite")} aria-label={`Show ${mapType === "satellite" ? "map" : "satellite"} view`}><Icon name="map"/>{mapType === "satellite" ? "Map" : "Satellite"}</button>
    </header>

    {mapState === "ready" && <aside className="owner-google-verify-guide" aria-live="polite">
      <div className={`owner-verify-outcome is-${outcome.state}`}><span/><strong>{outcome.label}</strong><small>{outcome.detail}</small></div>
      <div className={`owner-approved-road-status${companyRoads.error ? " is-error" : ""}`}><span/><strong>All approved roads</strong><small>{companyRoads.loading ? "Loading exact approved-road overlay…" : companyRoads.error || (companyRoads.overlay?.selection === "all" ? `${companyRoads.overlay.rows.length.toLocaleString()} exact approved road sections highlighted in teal.` : companyRoads.availability.reason || "Approved roads unavailable; nothing was inferred.")}</small></div>
      <div className="owner-approved-road-status owner-approved-step-status"><span/><strong>Approved steps for {pad.padName}</strong><small>{currentApprovedStepState === "loading" ? "Checking this pad's current approved step geometry…" : currentApprovedStepState === "ready" ? `${approvedStepRoutes.reduce((count, route) => count + route.stepCount, 0).toLocaleString()} exact approved route steps highlighted in bright teal. Interstates, U.S. routes, state routes, county, township, and local roads are all included when present.` : "No current exact approved step geometry is available for this pad; no line was inferred."}</small></div>
      <ol>
        <li className={origin ? "done" : "active"}><span>1</span><div><strong>Phone origin</strong><small>{locationState === "ready" ? "Current phone GPS ready · never stored" : locationState === "error" ? previewMessage : "Tap to share this phone's GPS with Google for this preview · never stored or exported"}</small></div>{locationState !== "locating" && <button type="button" onClick={requestPhoneOrigin}>Use phone GPS</button>}</li>
        <li className={anchor ? "done" : origin ? "active" : ""}><span>2</span><div><strong>Anchor</strong><small>{anchor ? "Named public-road anchor set" : "Tap the map on a named public road"}</small></div></li>
        <li className={routeLegs.length ? "done" : anchor ? "active" : ""}><span>3</span><div><strong>Turn pins</strong><small>{turnPins.length} of {maximumOwnerGoogleVerifyTurnPins} · preview updates after every tap</small></div></li>
      </ol>
      <p className="owner-verify-notice" role="status">{notice}</p>
      <p className={`owner-preview-state is-${previewState}`} role="status">{previewMessage}</p>
      <div className="owner-google-verify-actions">
        <button type="button" onClick={undo} disabled={!anchor}>Undo</button>
        <button type="button" onClick={clear} disabled={!anchor}>Clear</button>
        <button type="button" onClick={fitAll}>Fit all</button>
        <button type="button" onClick={() => { invalidatePreview(); setPreviewVersion((value) => value + 1); }} disabled={!origin || !anchor || mapState !== "ready"}>Refresh preview</button>
      </div>
    </aside>}

    {mapState === "ready" && selectedSection && <aside className="owner-google-section-editor" aria-labelledby="owner-section-title">
      <button type="button" className="selection-close" onClick={() => setSelectedSectionId("")} aria-label="Close section editor"><Icon name="close"/></button>
      <span className="eyebrow">SECTION {selectedSection.ordinal}</span>
      <h2 id="owner-section-title">{sectionLabel(selectedSection.ordinal, turnPins.length)}</h2>
      <p>Enter a public road name yourself. Google does not name or approve this section.</p>
      <label><span>Named public road</span><input value={roadName} maxLength={120} onChange={(event) => setRoadName(event.target.value)} placeholder="Example: Repik Ln / CR 9876" autoComplete="off"/></label>
      <div>
        <button type="button" className="section-approved" onClick={() => markSelected("approved_named_road")}>Approved named road</button>
        <button type="button" onClick={() => markSelected("lease_or_unnamed")}>Unnamed / lease</button>
        <button type="button" className="section-not-approved" onClick={() => markSelected("not_approved")}>Not approved</button>
      </div>
    </aside>}

    <aside className="owner-google-draft-panel">
      <div className="owner-draft-banner"><Icon name="control"/><strong>Draft only — driver Navigate unchanged.</strong></div>
      <details>
        <summary>Drafts, entrance GPS, and export <span>{drafts.length}</span></summary>
        <div className="owner-draft-content">
          <fieldset className="owner-entrance-candidate">
            <legend>Candidate entrance coordinates</legend>
            <p>Optional owner-entered draft point. It is shown in purple and never replaces the locked saved pad GPS or driver Navigate.</p>
            <div><label><span>Latitude</span><input type="text" inputMode="decimal" value={entranceLatitude} onChange={(event) => setEntranceLatitude(event.target.value.slice(0, 24))} placeholder="40.159734" aria-label="Candidate entrance latitude"/></label><label><span>Longitude</span><input type="text" inputMode="decimal" value={entranceLongitude} onChange={(event) => setEntranceLongitude(event.target.value.slice(0, 24))} placeholder="-81.260675" aria-label="Candidate entrance longitude"/></label></div>
            {(entranceLatitude || entranceLongitude) && <button type="button" onClick={() => { setEntranceLatitude(""); setEntranceLongitude(""); }}>Clear entrance point</button>}
            {!parsedCandidateEntrance.valid && <small role="alert">Enter both valid coordinates, or clear both fields.</small>}
          </fieldset>
          <div className="owner-draft-buttons"><button type="button" className="button-primary" onClick={saveDraft} disabled={!anchor}>Save draft</button><button type="button" className="button-secondary" onClick={downloadDrafts} disabled={!drafts.length}>Export JSON</button></div>
          {saveMessage && <p className="owner-draft-message" role="status">{saveMessage}</p>}
          {latestDraft && <section className={`owner-latest-draft${revisionMismatch ? " is-stale" : ""}`}><span><strong>Latest for this pad</strong><small>{readableTime(latestDraft.savedAt)} · revision {latestDraft.pad.recordRevision}</small></span><button type="button" onClick={() => resumeDraft(latestDraft)} disabled={revisionMismatch}>{revisionMismatch ? "Revision changed" : "Resume points"}</button></section>}
          <ul className="owner-draft-results">{drafts.slice(0, 12).map((draft) => <li key={draft.draftId}><span><strong>{draft.pad.padName}</strong><small>{draft.sectionMarks.length} section marks · {draft.turnPins.length} turn pins · {draft.pad.candidateEntrance ? "entrance candidate saved" : "no entrance candidate"}</small></span><time dateTime={draft.savedAt}>{readableTime(draft.savedAt)}</time></li>)}</ul>
        </div>
      </details>
    </aside>
  </section>;
}
