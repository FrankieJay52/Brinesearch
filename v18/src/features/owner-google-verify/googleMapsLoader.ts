export interface GoogleLatLngLiteral {
  lat: number;
  lng: number;
}

export interface GoogleLatLng {
  lat: number | (() => number);
  lng: number | (() => number);
}

export interface GoogleMapsListener {
  remove(): void;
}

export interface GoogleMapInstance {
  addListener(eventName: "click", handler: (event: { latLng: GoogleLatLng | null }) => void): GoogleMapsListener;
  fitBounds(bounds: GoogleLatLngBoundsInstance, padding?: number | { top: number; right: number; bottom: number; left: number }): void;
  setCenter(point: GoogleLatLngLiteral): void;
  setMapTypeId(mapTypeId: string): void;
  setZoom(zoom: number): void;
}

export interface GoogleCircleInstance {
  setMap(map: GoogleMapInstance | null): void;
}

export interface GooglePolylineInstance {
  addListener(eventName: "click", handler: () => void): GoogleMapsListener;
  setMap(map: GoogleMapInstance | null): void;
  setOptions(options: Record<string, unknown>): void;
}

export interface GoogleMarkerInstance {
  setMap(map: GoogleMapInstance | null): void;
}

export interface GoogleMarkerClass {
  new (options: Record<string, unknown>): GoogleMarkerInstance;
}

export interface GoogleLatLngBoundsInstance {
  extend(point: GoogleLatLng | GoogleLatLngLiteral): void;
}

export interface GoogleRouteLeg {
  path: GoogleLatLng[];
  startLocation?: GoogleLatLng;
  endLocation?: GoogleLatLng;
}

export interface GoogleRoute {
  path?: GoogleLatLng[];
  legs?: GoogleRouteLeg[];
  viewport?: GoogleLatLngBoundsInstance;
}

export interface GoogleRouteClass {
  computeRoutes(request: {
    origin: GoogleLatLngLiteral;
    destination: GoogleLatLngLiteral;
    intermediates: Array<{
      location: GoogleLatLngLiteral;
      via: false;
      vehicleStopover: false;
    }>;
    optimizeWaypointOrder: false;
    computeAlternativeRoutes: false;
    travelMode: "DRIVING";
    routingPreference: "TRAFFIC_UNAWARE";
    polylineQuality: "HIGH_QUALITY";
    fields: readonly ["path", "legs", "viewport"];
  }): Promise<{ routes?: GoogleRoute[] }>;
}

export interface GoogleRoutesLibrary {
  Route: GoogleRouteClass;
}

export interface GoogleMarkerLibrary {
  Marker: GoogleMarkerClass;
}

export interface GoogleMapsApi {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
  Circle: new (options: Record<string, unknown>) => GoogleCircleInstance;
  Polyline: new (options: Record<string, unknown>) => GooglePolylineInstance;
  LatLngBounds: new () => GoogleLatLngBoundsInstance;
  ControlPosition: { RIGHT_CENTER: number };
  MapTypeId: { ROADMAP: string; SATELLITE: string };
  SymbolPath: { CIRCLE: number };
  importLibrary(name: "routes"): Promise<GoogleRoutesLibrary>;
  importLibrary(name: "marker"): Promise<GoogleMarkerLibrary>;
}

type GoogleMapsWindow = Window & {
  google?: { maps?: GoogleMapsApi };
  __brinesearchOwnerGoogleMapsReady?: () => void;
};

let mapsPromise: Promise<GoogleMapsApi> | null = null;

export function configuredGoogleMapsApiKey() {
  return String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
}

export function loadOwnerGoogleMaps() {
  const apiKey = configuredGoogleMapsApiKey();
  if (!apiKey) return Promise.reject(new Error("Owner map not configured."));
  const existing = (window as GoogleMapsWindow).google?.maps;
  if (existing) return Promise.resolve(existing);
  if (mapsPromise) return mapsPromise;

  mapsPromise = new Promise<GoogleMapsApi>((resolve, reject) => {
    const prior = document.querySelector<HTMLScriptElement>('script[data-brinesearch-owner-google-map="true"]');
    let activeScript = prior;
    let settled = false;
    let timeout = 0;
    const fail = (script?: HTMLScriptElement) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      script?.remove();
      delete (window as GoogleMapsWindow).__brinesearchOwnerGoogleMapsReady;
      reject(new Error("Owner Google map could not start."));
    };
    const finish = () => {
      if (settled) return;
      const maps = (window as GoogleMapsWindow).google?.maps;
      if (!maps) {
        fail(activeScript || undefined);
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      delete (window as GoogleMapsWindow).__brinesearchOwnerGoogleMapsReady;
      resolve(maps);
    };
    timeout = window.setTimeout(() => fail(activeScript || undefined), 15_000);
    if (prior) {
      prior.addEventListener("load", finish, { once: true });
      prior.addEventListener("error", () => fail(prior), { once: true });
      return;
    }
    const script = document.createElement("script");
    activeScript = script;
    (window as GoogleMapsWindow).__brinesearchOwnerGoogleMapsReady = finish;
    const parameters = new URLSearchParams({
      key: apiKey,
      v: "weekly",
      loading: "async",
      callback: "__brinesearchOwnerGoogleMapsReady",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${parameters.toString()}`;
    script.async = true;
    script.defer = true;
    script.dataset.brinesearchOwnerGoogleMap = "true";
    script.addEventListener("error", () => fail(script), { once: true });
    document.head.append(script);
  }).catch((error) => {
    mapsPromise = null;
    throw error;
  });
  return mapsPromise;
}
