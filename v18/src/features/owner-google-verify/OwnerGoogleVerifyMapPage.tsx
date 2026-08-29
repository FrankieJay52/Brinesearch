import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type MapMouseEvent,
} from "maplibre-gl";
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
import { ownerRoadBasemapStyle, ownerRoadFallbackStyle, type OwnerRoadBasemapMode } from "@/features/owner-roads/ownerRoadBasemap";
import {
  addOwnerGoogleVerifyPoint,
  buildOwnerGoogleVerifySections,
  maximumOwnerGoogleVerifyTurnPins,
  ownerGoogleVerifyNamedRoadRoutes,
  ownerGoogleVerifyDestination,
  ownerGoogleVerifyOutcome,
  type OwnerGoogleVerifyNamedRoadRoute,
} from "./ownerGoogleVerifyModel";
import { requestFreeRoutePreview, type FreeRoutePreviewLeg } from "./freeRoutePreview";
import "./owner-google-verify.css";

type MapState = "loading" | "ready" | "error";
type PreviewState = "waiting_for_anchor" | "routing" | "ready" | "error";
type OwnerRouteControl = { kind: "anchor" } | { kind: "turn"; index: number };

const approvedRoadSourceId = "owner-free-approved-roads";
const approvedRoadCasingLayerId = "owner-free-approved-roads-casing";
const approvedRoadLayerId = "owner-free-approved-roads-line";
const approvedStepSourceId = "owner-free-approved-steps";
const approvedStepCasingLayerId = "owner-free-approved-steps-casing";
const approvedStepLayerId = "owner-free-approved-steps-line";
const previewSourceId = "owner-free-route-preview";
const previewSectionCasingLayerId = "owner-free-route-sections-casing";
const previewSectionLayerId = "owner-free-route-sections";

function emptyCollection() {
  return { type: "FeatureCollection" as const, features: [] };
}

function mapPoint(value: OwnerGoogleVerifyPoint): [number, number] {
  return [value.longitude, value.latitude];
}

function setSourceData(map: MapLibreMap | null, sourceId: string, data: ReturnType<typeof emptyCollection> | Record<string, unknown>) {
  const source = map?.getSource(sourceId);
  if (source) (source as GeoJSONSource).setData(data as never);
}

function ensureFreeVerifierLayers(map: MapLibreMap) {
  if (!map.getSource(approvedRoadSourceId)) map.addSource(approvedRoadSourceId, { type: "geojson", data: emptyCollection() });
  if (!map.getSource(approvedStepSourceId)) map.addSource(approvedStepSourceId, { type: "geojson", data: emptyCollection() });
  if (!map.getSource(previewSourceId)) map.addSource(previewSourceId, { type: "geojson", data: emptyCollection() });
  const before = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
  if (!map.getLayer(approvedRoadCasingLayerId)) map.addLayer({
    id: approvedRoadCasingLayerId,
    type: "line",
    source: approvedRoadSourceId,
    paint: { "line-color": "#042f2e", "line-opacity": .82, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 10, 18, 14] as never },
    layout: { "line-cap": "round", "line-join": "round" },
  }, before);
  if (!map.getLayer(approvedRoadLayerId)) map.addLayer({
    id: approvedRoadLayerId,
    type: "line",
    source: approvedRoadSourceId,
    paint: { "line-color": "#14b8a6", "line-opacity": .96, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3, 14, 7, 18, 10] as never },
    layout: { "line-cap": "round", "line-join": "round" },
  }, before);
  if (!map.getLayer(approvedStepCasingLayerId)) map.addLayer({
    id: approvedStepCasingLayerId,
    type: "line",
    source: approvedStepSourceId,
    paint: { "line-color": "#07131f", "line-opacity": .94, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 8, 14, 14, 18, 18] as never },
    layout: { "line-cap": "round", "line-join": "round" },
  }, before);
  if (!map.getLayer(approvedStepLayerId)) map.addLayer({
    id: approvedStepLayerId,
    type: "line",
    source: approvedStepSourceId,
    paint: { "line-color": "#2dd4bf", "line-opacity": 1, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 10, 18, 13] as never },
    layout: { "line-cap": "round", "line-join": "round" },
  }, before);
  if (!map.getLayer(previewSectionCasingLayerId)) map.addLayer({
    id: previewSectionCasingLayerId,
    type: "line",
    source: previewSourceId,
    filter: ["==", ["get", "kind"], "section"] as never,
    paint: { "line-color": "#07131f", "line-opacity": .9, "line-width": ["case", ["==", ["get", "selected"], true], 13, 10] as never },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  if (!map.getLayer(previewSectionLayerId)) map.addLayer({
    id: previewSectionLayerId,
    type: "line",
    source: previewSourceId,
    filter: ["==", ["get", "kind"], "section"] as never,
    paint: {
      "line-color": ["case", ["==", ["get", "routingMode"], "direct_unmapped"], "#94a3b8", ["match", ["get", "state"], "approved_named_road", "#14b8a6", "not_approved", "#ef4444", "lease_or_unnamed", "#94a3b8", "#d7dee8"]] as never,
      "line-opacity": 1,
      "line-width": ["case", ["==", ["get", "selected"], true], 9, 6] as never,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
}

function lineCollection(lines: Array<{ coordinates: [number, number][]; properties?: Record<string, unknown> }>) {
  return {
    type: "FeatureCollection" as const,
    features: lines.filter((line) => line.coordinates.length >= 2).map((line) => ({
      type: "Feature" as const,
      properties: line.properties || {},
      geometry: { type: "LineString" as const, coordinates: line.coordinates },
    })),
  };
}

function freeMapMarker(label: string, color: string, title: string) {
  const element = document.createElement("div");
  element.className = "owner-free-map-marker";
  element.textContent = label;
  element.title = title;
  element.style.setProperty("--owner-free-marker-color", color);
  return element;
}

function validCoordinatePoint(value: OwnerGoogleVerifyPoint) {
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
  return validCoordinatePoint(point) && isInsideCoordinateServiceArea(point.latitude, point.longitude)
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

function mapFitPadding() {
  return window.innerWidth <= 760
    ? { top: 180, right: 24, bottom: 136, left: 24 }
    : { top: 104, right: 32, bottom: 104, left: 32 };
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
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const previewAbortRef = useRef<AbortController | null>(null);
  const styleReadyRef = useRef(false);
  const fallbackAppliedRef = useRef(false);
  const appliedMapTypeRef = useRef<OwnerRoadBasemapMode>("road");
  const companyRoadsRef = useRef(companyRoads);
  const previewRequestRef = useRef(0);
  const suppressMapClickRef = useRef(0);
  const mapClickActionRef = useRef<(point: OwnerGoogleVerifyPoint) => void>(() => undefined);
  const sectionClickActionRef = useRef<(sectionId: string) => void>(() => undefined);

  const [mapState, setMapState] = useState<MapState>("loading");
  const [mapMessage, setMapMessage] = useState("Loading free road map…");
  const [mapType, setMapType] = useState<OwnerRoadBasemapMode>("road");
  const [mapRenderRevision, setMapRenderRevision] = useState(0);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [draftPanelOpen, setDraftPanelOpen] = useState(false);
  const [anchor, setAnchor] = useState<OwnerGoogleVerifyPoint | null>(null);
  const [turnPins, setTurnPins] = useState<OwnerGoogleVerifyPoint[]>([]);
  const [routeLegs, setRouteLegs] = useState<FreeRoutePreviewLeg[]>([]);
  const [sectionMarks, setSectionMarks] = useState<OwnerGoogleVerifySectionMark[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [roadName, setRoadName] = useState("");
  const [previewState, setPreviewState] = useState<PreviewState>("waiting_for_anchor");
  const [previewMessage, setPreviewMessage] = useState("Tap a named public road to set the route's starting anchor.");
  const [notice, setNotice] = useState("First map tap sets the named-public-road anchor.");
  const [previewVersion, setPreviewVersion] = useState(0);
  const [draftId, setDraftId] = useState("");
  const [drafts, setDrafts] = useState<OwnerGoogleVerifyDraft[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [entranceLatitude, setEntranceLatitude] = useState("");
  const [entranceLongitude, setEntranceLongitude] = useState("");
  const [loadedApprovedStepRoutes, setLoadedApprovedStepRoutes] = useState<OwnerGoogleVerifyNamedRoadRoute[]>([]);
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
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];
    setSourceData(mapRef.current, previewSourceId, emptyCollection());
  }, []);

  const clearApprovedRoadOverlays = useCallback(() => {
    setSourceData(mapRef.current, approvedRoadSourceId, emptyCollection());
  }, []);

  const clearApprovedStepOverlays = useCallback(() => {
    setSourceData(mapRef.current, approvedStepSourceId, emptyCollection());
  }, []);

  const invalidatePreview = useCallback(() => {
    previewRequestRef.current += 1;
    previewAbortRef.current?.abort();
    previewAbortRef.current = null;
    clearOverlays();
    setRouteLegs([]);
    setSectionMarks([]);
    setSelectedSectionId("");
    setRoadName("");
  }, [clearOverlays]);

  useEffect(() => {
    invalidatePreview();
    setAnchor(null);
    setTurnPins([]);
    setPreviewState("waiting_for_anchor");
    setPreviewMessage("Tap a named public road to set the route's starting anchor.");
    setNotice("First map tap sets the named-public-road anchor.");
    setPreviewVersion(0);
    setDraftId("");
    setSaveMessage("");
    setEntranceLatitude("");
    setEntranceLongitude("");
    setWorkflowOpen(false);
    setDraftPanelOpen(false);
  }, [invalidatePreview, verifierSessionKey]);

  mapClickActionRef.current = (point) => {
    if (Date.now() - suppressMapClickRef.current < 180) return;
    const next = addOwnerGoogleVerifyPoint(anchor, turnPins, point);
    if (next.anchor === anchor && next.turnPins.length === turnPins.length) {
      setNotice(next.notice);
      return;
    }
    dismissPhoneKeyboard();
    setWorkflowOpen(false);
    setDraftPanelOpen(false);
    invalidatePreview();
    setAnchor(next.anchor);
    setTurnPins(next.turnPins);
    setNotice(next.notice);
  };

  const moveControlPoint = useCallback((control: OwnerRouteControl, point: OwnerGoogleVerifyPoint) => {
    invalidatePreview();
    dismissPhoneKeyboard();
    setWorkflowOpen(false);
    setDraftPanelOpen(false);
    if (control.kind === "anchor") {
      setAnchor(point);
      setNotice("Anchor moved. The shortest available road preview is updating from this starting point.");
      return;
    }
    setTurnPins((current) => current.map((candidate, index) => index === control.index ? point : candidate));
    setNotice(`Turn pin ${control.index + 1} moved. The shortest available road preview is updating.`);
  }, [invalidatePreview]);

  useEffect(() => {
    if (access.state !== "owner" || !pad || !destination || !mapHost.current) return;
    let map: MapLibreMap;
    let styleDeadline = 0;
    let resizeFrame: number | null = null;
    setMapState("loading");
    setMapMessage("Loading free road map…");
    try {
      map = new MapLibreMap({
        container: mapHost.current,
        style: ownerRoadBasemapStyle("road"),
        center: mapPoint(destination),
        zoom: 14,
        attributionControl: { compact: true },
        cooperativeGestures: false,
        dragRotate: false,
        touchPitch: false,
        pitchWithRotate: false,
        renderWorldCopies: false,
        fadeDuration: 0,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    } catch {
      setMapState("error");
      setMapMessage("The free map renderer could not start.");
      return;
    }
    styleReadyRef.current = false;
    fallbackAppliedRef.current = false;
    appliedMapTypeRef.current = "road";
    const onStyleLoad = () => {
      window.clearTimeout(styleDeadline);
      styleReadyRef.current = true;
      ensureFreeVerifierLayers(map);
      setMapState("ready");
      setMapMessage(fallbackAppliedRef.current
        ? "Road background unavailable. Saved overlays remain visible on a reference background."
        : appliedMapTypeRef.current === "satellite" ? "Free USGS satellite map ready." : "Free road map ready.");
      setMapRenderRevision((revision) => revision + 1);
    };
    const recoverStyle = () => {
      if (styleReadyRef.current || fallbackAppliedRef.current) return;
      if (appliedMapTypeRef.current === "satellite") {
        appliedMapTypeRef.current = "road";
        setMapType("road");
        setMapMessage("Satellite imagery unavailable. Returning to the free road map…");
        try {
          map.setStyle(ownerRoadBasemapStyle("road"));
        } catch {
          fallbackAppliedRef.current = true;
          try { map.setStyle(ownerRoadFallbackStyle); } catch {
            setMapState("error");
            setMapMessage("The free map background could not start.");
          }
        }
        return;
      }
      fallbackAppliedRef.current = true;
      setMapMessage("Road background unavailable. Loading a reference background for saved overlays…");
      try { map.setStyle(ownerRoadFallbackStyle); } catch {
        setMapState("error");
        setMapMessage("The free map background could not start.");
      }
    };
    const onClick = (event: MapMouseEvent) => {
      const hit = map.getLayer(previewSectionLayerId)
        ? map.queryRenderedFeatures(event.point, { layers: [previewSectionLayerId], validate: false })[0]
        : null;
      const sectionId = typeof hit?.properties?.sectionId === "string" ? hit.properties.sectionId : "";
      if (sectionId) {
        suppressMapClickRef.current = Date.now();
        sectionClickActionRef.current(sectionId);
        return;
      }
      mapClickActionRef.current({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
    };
    map.on("style.load", onStyleLoad);
    map.on("error", recoverStyle);
    map.on("click", onClick);
    const resizeObserver = new ResizeObserver(() => {
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        map.resize();
      });
    });
    resizeObserver.observe(mapHost.current);
    styleDeadline = window.setTimeout(recoverStyle, 8_000);
    mapRef.current = map;
    return () => {
      previewRequestRef.current += 1;
      previewAbortRef.current?.abort();
      previewAbortRef.current = null;
      window.clearTimeout(styleDeadline);
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      clearOverlays();
      clearApprovedRoadOverlays();
      clearApprovedStepOverlays();
      map.off("style.load", onStyleLoad);
      map.off("error", recoverStyle);
      map.off("click", onClick);
      map.remove();
      mapRef.current = null;
      styleReadyRef.current = false;
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
      const routes = ownerGoogleVerifyNamedRoadRoutes(status);
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
    if (!map || appliedMapTypeRef.current === mapType) return;
    appliedMapTypeRef.current = mapType;
    styleReadyRef.current = false;
    fallbackAppliedRef.current = false;
    setMapState("loading");
    setMapMessage(mapType === "satellite" ? "Loading free USGS satellite imagery…" : "Loading free road map…");
    try {
      map.setStyle(ownerRoadBasemapStyle(mapType));
    } catch {
      appliedMapTypeRef.current = "road";
      setMapType("road");
      try { map.setStyle(ownerRoadBasemapStyle("road")); } catch {
        fallbackAppliedRef.current = true;
        try { map.setStyle(ownerRoadFallbackStyle); } catch {
          setMapState("error");
          setMapMessage("The free map background could not start.");
        }
      }
    }
    const timeout = window.setTimeout(() => {
      if (styleReadyRef.current || !mapRef.current) return;
      if (appliedMapTypeRef.current === "satellite") {
        appliedMapTypeRef.current = "road";
        setMapType("road");
        setMapMessage("Satellite imagery timed out. Returning to the free road map…");
        try { map.setStyle(ownerRoadBasemapStyle("road")); } catch {
          fallbackAppliedRef.current = true;
          try { map.setStyle(ownerRoadFallbackStyle); } catch {
            setMapState("error");
            setMapMessage("The free map background could not start.");
          }
        }
        return;
      }
      fallbackAppliedRef.current = true;
      setMapMessage("Road background timed out. Loading a reference background for saved overlays…");
      try { map.setStyle(ownerRoadFallbackStyle); } catch {
        setMapState("error");
        setMapMessage("The free map background could not start.");
      }
    }, 8_000);
    return () => window.clearTimeout(timeout);
  }, [mapState, mapType]);

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
    if (access.state !== "owner" || mapState !== "ready" || !anchor || !destination) {
      if (!anchor) {
        setPreviewState("waiting_for_anchor");
        setPreviewMessage("Tap a named public road to set the route's starting anchor.");
      }
      return;
    }
    const requestId = ++previewRequestRef.current;
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;
    setPreviewState("routing");
    setPreviewMessage("Finding the shortest available road route between each control point…");
    requestFreeRoutePreview(anchor, turnPins, destination, controller.signal).then((legs) => {
      if (requestId !== previewRequestRef.current) return;
      const expectedLegCount = turnPins.length + 1;
      if (legs.length !== expectedLegCount) throw new Error("Route response did not preserve every owner control point.");
      setRouteLegs(legs);
      setPreviewState("ready");
      const directSectionCount = legs.filter((leg) => leg.routingMode === "direct_unmapped").length;
      setPreviewMessage(`${legs.length} route ${legs.length === 1 ? "section" : "sections"} ready from the anchor.${directSectionCount ? ` ${directSectionCount} unmapped or lease-road ${directSectionCount === 1 ? "section follows" : "sections follow"} your pins directly instead of going around.` : " Shortest available mapped roads are shown."} Tap each line to review it.`);
      setSelectedSectionId("");
      const points = legs.flatMap((leg) => leg.path);
      if (points.length) {
        const bounds = points.slice(1).reduce((next, point) => next.extend(point), new LngLatBounds(points[0], points[0]));
        mapRef.current?.fitBounds(bounds, { padding: mapFitPadding(), maxZoom: 16, duration: 260 });
      }
    }).catch(() => {
      if (requestId !== previewRequestRef.current || controller.signal.aborted) return;
      setRouteLegs([]);
      setPreviewState("error");
      setPreviewMessage("The free routing service could not preview this route. Your map and saved controls still work; tap Refresh preview to try again.");
    }).finally(() => {
      if (previewAbortRef.current === controller) previewAbortRef.current = null;
    });
  }, [access.state, anchor, destination, mapState, previewVersion, turnPins]);

  const sections = useMemo(() => anchor && destination
    ? buildOwnerGoogleVerifySections(anchor, turnPins, destination, sectionMarks)
    : [], [anchor, destination, sectionMarks, turnPins]);
  const outcome = ownerGoogleVerifyOutcome(routeLegs.length ? sections : []);
  const selectedSection = sections.find((section) => section.sectionId === selectedSectionId) || null;
  sectionClickActionRef.current = (sectionId) => {
    const section = sections.find((candidate) => candidate.sectionId === sectionId);
    if (!section) return;
    dismissPhoneKeyboard();
    setWorkflowOpen(false);
    setDraftPanelOpen(false);
    setSelectedSectionId(section.sectionId);
    setRoadName(section.mark?.roadName || "");
  };

  useEffect(() => {
    clearApprovedRoadOverlays();
    const map = mapRef.current;
    const overlay = companyRoads.overlay;
    if (!map || !styleReadyRef.current || !overlay || overlay.selection !== "all") return;
    setSourceData(map, approvedRoadSourceId, {
      type: "FeatureCollection",
      features: overlay.rows.map((row) => ({ type: "Feature", properties: {}, geometry: row.geometry })),
    });
  }, [clearApprovedRoadOverlays, companyRoads.overlay, mapRenderRevision, mapState]);

  useEffect(() => {
    clearApprovedStepOverlays();
    const map = mapRef.current;
    if (!map || !styleReadyRef.current) return;
    setSourceData(map, approvedStepSourceId, {
      type: "FeatureCollection",
      features: approvedStepRoutes.flatMap((route) => route.geometry.features.map((feature) => ({ ...feature, properties: feature.properties || {} }))),
    });
  }, [approvedStepRoutes, clearApprovedStepOverlays, mapRenderRevision, mapState]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReadyRef.current || !destination || !pad) return;
    clearOverlays();
    const markers = [
      anchor && { point: anchor, color: "#f59e0b", label: "A", title: "Named-road anchor — drag to move", scale: 17, zIndex: 12, control: { kind: "anchor" } as OwnerRouteControl },
      ...turnPins.map((point, index) => ({ point, color: "#f8fafc", label: String(index + 1), title: `Turn pin ${index + 1} — drag to move`, scale: 15, zIndex: 11, control: { kind: "turn", index } as OwnerRouteControl })),
      candidateEntrancePoint && { point: candidateEntrancePoint, color: "#a855f7", label: "E", title: "Draft entrance candidate", scale: 16, zIndex: 13 },
      { point: destination, color: "#2dd4bf", label: "PAD", title: `${pad.padName} — saved pad GPS`, scale: 19, zIndex: 14 },
    ].filter((value): value is { point: OwnerGoogleVerifyPoint; color: string; label: string; title: string; scale: number; zIndex: number; control?: OwnerRouteControl } => Boolean(value));
    for (const item of markers) {
      const element = freeMapMarker(item.label, item.color, item.title);
      element.style.width = `${item.scale * 2}px`;
      element.style.height = `${item.scale * 2}px`;
      element.style.zIndex = String(item.zIndex);
      if (item.control) element.classList.add("is-draggable");
      const marker = new Marker({ element, anchor: "center", draggable: Boolean(item.control) }).setLngLat(mapPoint(item.point)).addTo(map);
      if (item.control) {
        const control = item.control;
        marker.on("dragstart", () => { suppressMapClickRef.current = Date.now(); });
        marker.on("dragend", () => {
          suppressMapClickRef.current = Date.now();
          const point = marker.getLngLat();
          moveControlPoint(control, { latitude: point.lat, longitude: point.lng });
        });
      }
      markersRef.current.push(marker);
    }
    const previewLines: Array<{ coordinates: [number, number][]; properties: Record<string, unknown> }> = [];
    routeLegs.forEach((leg, index) => {
      const section = sections[index];
      if (!section) return;
      const useDirectPinLine = leg.routingMode === "direct_unmapped" || section.mark?.state === "lease_or_unnamed";
      previewLines.push({
        coordinates: useDirectPinLine ? [mapPoint(section.start), mapPoint(section.end)] : leg.path,
        properties: {
          kind: "section",
          sectionId: section.sectionId,
          state: section.mark?.state || "unreviewed",
          routingMode: useDirectPinLine ? "direct_unmapped" : "road",
          selected: section.sectionId === selectedSectionId,
        },
      });
    });
    setSourceData(map, previewSourceId, lineCollection(previewLines));
  }, [anchor, candidateEntrancePoint, clearOverlays, destination, mapRenderRevision, mapState, moveControlPoint, pad, routeLegs, sectionMarks, sections, selectedSectionId, turnPins]);

  function fitAll() {
    const map = mapRef.current;
    if (!map || !destination) return;
    const bounds = new LngLatBounds(mapPoint(destination), mapPoint(destination));
    [anchor, ...turnPins, candidateEntrancePoint].filter((point): point is OwnerGoogleVerifyPoint => Boolean(point)).forEach((point) => bounds.extend(mapPoint(point)));
    for (const route of approvedStepRoutes) for (const feature of route.geometry.features) {
      const paths = feature.geometry.type === "LineString" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      for (const path of paths) for (const point of path) bounds.extend(point);
    }
    for (const leg of routeLegs) for (const point of leg.path) bounds.extend(point);
    dismissPhoneKeyboard();
    setWorkflowOpen(false);
    setDraftPanelOpen(false);
    setSelectedSectionId("");
    map.fitBounds(bounds, { padding: mapFitPadding(), maxZoom: 16, duration: 260 });
  }

  function focusPad() {
    const map = mapRef.current;
    if (!map || !destination || !pad) return;
    dismissPhoneKeyboard();
    setWorkflowOpen(false);
    setDraftPanelOpen(false);
    setSelectedSectionId("");
    map.easeTo({ center: mapPoint(destination), zoom: 16, duration: 260 });
    setNotice(`${pad.padName} saved pad GPS centered.`);
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

  function dismissPhoneKeyboard() {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) activeElement.blur();
  }

  function toggleWorkflowPanel() {
    dismissPhoneKeyboard();
    setWorkflowOpen((current) => !current);
    setDraftPanelOpen(false);
    setSelectedSectionId("");
  }

  function toggleDraftPanel() {
    dismissPhoneKeyboard();
    setDraftPanelOpen((current) => !current);
    setWorkflowOpen(false);
    setSelectedSectionId("");
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
    setNotice(state === "approved_named_road" ? `${name} approved for this draft section.` : state === "lease_or_unnamed" ? "Section marked lease or unmapped and drawn directly between its control pins." : "Section marked as the wrong road.");
    dismissPhoneKeyboard();
    setRoadName("");
    setSelectedSectionId("");
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
    setNotice("Draft points resumed. The free route preview is recomputing, and every section must be reviewed again.");
    setSaveMessage("");
    setDraftPanelOpen(false);
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
    <div ref={mapHost} className="owner-google-verify-map" aria-label={`Free route verification map for ${pad.padName}`}/>
    {mapState !== "ready" && <div className="owner-google-map-state" role={mapState === "error" ? "alert" : "status"}><Icon name="map"/><strong>{mapMessage}</strong><small>No Google key or paid map account is used here.</small></div>}

    <header className="owner-google-verify-topbar">
      <Link to="/?view=roads" replace className="icon-button" aria-label="Back to Approved Roads map"><Icon name="back"/></Link>
      <div><span className="eyebrow">OWNER · DRAFT ONLY</span><strong>{pad.padName}</strong><small>{pad.company} · revision {pad.recordRevision}</small></div>
      <nav className="owner-map-tools" aria-label="Map controls">
        <button type="button" className="owner-pad-focus" onClick={focusPad} disabled={mapState !== "ready"} aria-label={`Find ${pad.padName} saved pad GPS`}><Icon name="location"/>Pad</button>
        <button type="button" className="owner-map-type" onClick={() => setMapType((value) => value === "satellite" ? "road" : "satellite")} disabled={mapState !== "ready"} aria-label={`Show ${mapType === "satellite" ? "road map" : "satellite"} view`}><Icon name="map"/>{mapType === "satellite" ? "Road map" : "Satellite"}</button>
      </nav>
    </header>

    {mapState === "ready" && <aside className={`owner-google-verify-guide${workflowOpen ? " is-expanded" : ""}`} aria-label="Route setup controls">
      <button type="button" className="owner-workflow-toggle" aria-expanded={workflowOpen} aria-controls="owner-google-workflow-content" onClick={toggleWorkflowPanel}>
        <span className={`owner-workflow-indicator is-${outcome.state}`}/>
        <span><strong>{outcome.label}</strong><small>{workflowOpen ? "Route setup and approved-road references" : anchor ? `${turnPins.length} turn ${turnPins.length === 1 ? "pin" : "pins"} · tap to manage route setup` : "Tap to set the named-road starting anchor"}</small></span>
        <span className="owner-panel-toggle-action"><Icon name={workflowOpen ? "close" : "control"}/>{workflowOpen ? "Hide" : "Setup"}</span>
      </button>
      {workflowOpen && <div id="owner-google-workflow-content" className="owner-google-workflow-content" aria-live="polite">
        <div className={`owner-verify-outcome is-${outcome.state}`}><span/><strong>{outcome.label}</strong><small>{outcome.detail}</small></div>
        <div className="owner-approved-road-status owner-free-map-status"><span/><strong>Free map and shortest available road preview</strong><small>The anchor is the starting point. This owner map never requests or uses phone GPS. It compares mapped-road alternatives for every section. If a lease road is not in the free router, the gray line follows your pins directly instead of going around. Drag A or any numbered pin to shape it. Driver Navigate stays unchanged.</small></div>
        <div className={`owner-approved-road-status${companyRoads.error ? " is-error" : ""}`}><span/><strong>Public road reference overlay</strong><small>{companyRoads.loading ? "Loading reviewed public-road references…" : companyRoads.error || (companyRoads.overlay?.selection === "all" ? `${companyRoads.overlay.rows.length.toLocaleString()} reviewed public-road sections shown as references.` : companyRoads.availability.reason || "Public-road references unavailable; nothing was inferred.")}</small></div>
        <div className="owner-approved-road-status owner-approved-step-status"><span/><strong>Named-road display for {pad.padName}</strong><small>{currentApprovedStepState === "loading" ? "Checking this pad's reviewed named-road display geometry…" : currentApprovedStepState === "ready" ? `${approvedStepRoutes.reduce((count, route) => count + route.stepCount, 0).toLocaleString()} reviewed named-road steps highlighted in bright teal. Teal is display only; State-1 graph/public-Google authority is separate.` : "No reviewed named-road display geometry is available for this pad; no line was inferred."}</small></div>
        <ol>
          <li className={anchor ? "done" : "active"}><span>1</span><div><strong>Starting anchor</strong><small>{anchor ? "Named public-road start set · press and drag A to move it" : "Tap the map on the named public road where this route starts"}</small></div></li>
          <li className={routeLegs.length ? "done" : anchor ? "active" : ""}><span>2</span><div><strong>Turn pins</strong><small>{turnPins.length} of {maximumOwnerGoogleVerifyTurnPins} · tap to add, press and drag a numbered pin to move it</small></div></li>
          <li className={outcome.state === "success" ? "done" : routeLegs.length ? "active" : ""}><span>3</span><div><strong>Review and approve</strong><small>{outcome.state === "success" ? "Every route section is approved for this draft" : "Tap each preview line, then approve the named road or mark it wrong / unnamed"}</small></div></li>
        </ol>
        <p className="owner-verify-notice" role="status">{notice}</p>
        <p className={`owner-preview-state is-${previewState}`} role="status">{previewMessage}</p>
        <div className="owner-google-verify-actions">
          <button type="button" onClick={undo} disabled={!anchor}>Undo</button>
          <button type="button" onClick={clear} disabled={!anchor}>Clear</button>
          <button type="button" onClick={fitAll}>Fit all</button>
          <button type="button" onClick={() => { invalidatePreview(); setPreviewVersion((value) => value + 1); }} disabled={!anchor || mapState !== "ready"}>Refresh preview</button>
        </div>
      </div>}
    </aside>}

    {mapState === "ready" && selectedSection && <aside className="owner-google-section-editor" aria-labelledby="owner-section-title">
      <button type="button" className="selection-close" onClick={() => setSelectedSectionId("")} aria-label="Close section editor"><Icon name="close"/></button>
      <span className="eyebrow">SECTION {selectedSection.ordinal}</span>
      <h2 id="owner-section-title">{sectionLabel(selectedSection.ordinal, turnPins.length)}</h2>
      <p>Enter the public road name yourself. If the free router goes around an unmapped lease road, choose the lease option to draw this section directly between its control pins. Nothing is auto-named or auto-approved.</p>
      <label><span>Named public road</span><input value={roadName} maxLength={120} onChange={(event) => setRoadName(event.target.value)} placeholder="Example: Repik Ln / CR 9876" autoComplete="off"/></label>
      <div>
        <button type="button" className="section-approved" onClick={() => markSelected("approved_named_road")}>Approve named road</button>
        <button type="button" onClick={() => markSelected("lease_or_unnamed")}>Lease / unmapped — use pin line</button>
        <button type="button" className="section-not-approved" onClick={() => markSelected("not_approved")}>Wrong road</button>
      </div>
    </aside>}

    <aside className={`owner-google-draft-panel${draftPanelOpen ? " is-expanded" : ""}`}>
      <button type="button" className="owner-draft-toggle" aria-expanded={draftPanelOpen} aria-controls="owner-google-draft-content" onClick={toggleDraftPanel}>
        <Icon name="control"/>
        <span><strong>Draft only — driver Navigate unchanged.</strong><small>{draftPanelOpen ? "Entrance GPS, saved drafts, and export" : `${drafts.length} saved ${drafts.length === 1 ? "draft" : "drafts"} · optional tools`}</small></span>
        <span className="owner-panel-toggle-action"><Icon name={draftPanelOpen ? "close" : "expand"}/>{draftPanelOpen ? "Close" : "Open"}</span>
      </button>
      {draftPanelOpen && <div id="owner-google-draft-content" className="owner-draft-content">
          <fieldset className="owner-entrance-candidate">
            <legend>Candidate entrance coordinates</legend>
            <p>Optional owner-entered draft point. It is shown in purple and never replaces the locked saved pad GPS or driver Navigate.</p>
            <div><label><span>Latitude</span><input type="text" inputMode="decimal" value={entranceLatitude} onChange={(event) => setEntranceLatitude(event.target.value.slice(0, 24))} placeholder="40.159734" aria-label="Candidate entrance latitude"/></label><label><span>Longitude</span><input type="text" inputMode="decimal" value={entranceLongitude} onChange={(event) => setEntranceLongitude(event.target.value.slice(0, 24))} placeholder="-81.260675" aria-label="Candidate entrance longitude"/></label></div>
            {(entranceLatitude || entranceLongitude) && <button type="button" onClick={() => { setEntranceLatitude(""); setEntranceLongitude(""); }}>Clear entrance point</button>}
            {!parsedCandidateEntrance.valid && <small role="alert">Enter both valid coordinates, or clear both fields.</small>}
          </fieldset>
          <div className="owner-draft-buttons"><button type="button" className="button-primary" onClick={saveDraft} disabled={!anchor}>Save review draft</button><button type="button" className="button-secondary" onClick={downloadDrafts} disabled={!drafts.length}>Export JSON</button></div>
          {saveMessage && <p className="owner-draft-message" role="status">{saveMessage}</p>}
          {latestDraft && <section className={`owner-latest-draft${revisionMismatch ? " is-stale" : ""}`}><span><strong>Latest for this pad</strong><small>{readableTime(latestDraft.savedAt)} · revision {latestDraft.pad.recordRevision}</small></span><button type="button" onClick={() => resumeDraft(latestDraft)} disabled={revisionMismatch}>{revisionMismatch ? "Revision changed" : "Resume points"}</button></section>}
          <ul className="owner-draft-results">{drafts.slice(0, 12).map((draft) => <li key={draft.draftId}><span><strong>{draft.pad.padName}</strong><small>{draft.sectionMarks.length} section marks · {draft.turnPins.length} turn pins · {draft.pad.candidateEntrance ? "entrance candidate saved" : "no entrance candidate"}</small></span><time dateTime={draft.savedAt}>{readableTime(draft.savedAt)}</time></li>)}</ul>
      </div>}
    </aside>
  </section>;
}
