import type { OwnerGoogleVerifyPoint } from "@/data/ownerGoogleVerifyDrafts";

export const freeRoutePreviewEndpoint = "https://router.project-osrm.org/route/v1/driving";

export type FreeRoutePreviewLeg = {
  path: [number, number][];
  distanceMeters: number;
};

type OsrmStep = {
  geometry?: {
    type?: unknown;
    coordinates?: unknown;
  };
};

type OsrmLeg = {
  steps?: unknown;
};

type OsrmRoute = {
  legs?: unknown;
  distance?: unknown;
};

function routeCoordinate(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  return [longitude, latitude];
}

function stepPath(step: OsrmStep): [number, number][] {
  if (step.geometry?.type !== "LineString" || !Array.isArray(step.geometry.coordinates)) return [];
  return step.geometry.coordinates.map(routeCoordinate).filter((point): point is [number, number] => Boolean(point));
}

function legPath(value: unknown): [number, number][] {
  if (!value || typeof value !== "object") return [];
  const steps = (value as OsrmLeg).steps;
  if (!Array.isArray(steps)) return [];
  const path: [number, number][] = [];
  for (const value of steps) {
    if (!value || typeof value !== "object") continue;
    for (const point of stepPath(value as OsrmStep)) {
      const previous = path[path.length - 1];
      if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) path.push(point);
    }
  }
  return path;
}

function requestPoint(point: OwnerGoogleVerifyPoint) {
  return `${point.longitude.toFixed(7)},${point.latitude.toFixed(7)}`;
}

export function freeRoutePreviewUrl(
  start: OwnerGoogleVerifyPoint,
  end: OwnerGoogleVerifyPoint,
) {
  const coordinates = [start, end].map(requestPoint).join(";");
  const options = new URLSearchParams({
    alternatives: "3",
    steps: "true",
    geometries: "geojson",
    overview: "false",
    continue_straight: "true",
  });
  return `${freeRoutePreviewEndpoint}/${coordinates}?${options.toString()}`;
}

export async function requestFreeRoutePreview(
  anchor: OwnerGoogleVerifyPoint,
  controls: readonly OwnerGoogleVerifyPoint[],
  destination: OwnerGoogleVerifyPoint,
  signal?: AbortSignal,
): Promise<FreeRoutePreviewLeg[]> {
  const points = [anchor, ...controls, destination];
  return Promise.all(points.slice(0, -1).map((start, index) => requestShortestSegment(start, points[index + 1], signal)));
}

async function requestShortestSegment(
  start: OwnerGoogleVerifyPoint,
  end: OwnerGoogleVerifyPoint,
  signal?: AbortSignal,
): Promise<FreeRoutePreviewLeg> {
  const response = await fetch(freeRoutePreviewUrl(start, end), {
    signal,
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Free route service did not accept the preview request.");
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || (body as { code?: unknown }).code !== "Ok") {
    throw new Error("Free route service did not return a usable route.");
  }
  const routes = (body as { routes?: unknown }).routes;
  if (!Array.isArray(routes) || !routes.length) {
    throw new Error("Free route service returned no route.");
  }
  const candidates = routes.flatMap((value): FreeRoutePreviewLeg[] => {
    if (!value || typeof value !== "object") return [];
    const route = value as OsrmRoute;
    const distanceMeters = Number(route.distance);
    if (!Number.isFinite(distanceMeters) || distanceMeters < 0 || !Array.isArray(route.legs) || route.legs.length !== 1) return [];
    const path = legPath(route.legs[0]);
    return path.length >= 2 ? [{ path, distanceMeters }] : [];
  });
  if (!candidates.length) {
    throw new Error("Free route service returned incomplete road geometry.");
  }
  return candidates.reduce((shortest, candidate) => candidate.distanceMeters < shortest.distanceMeters ? candidate : shortest);
}
