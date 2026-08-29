import type { OwnerGoogleVerifyPoint } from "@/data/ownerGoogleVerifyDrafts";

export const freeRoutePreviewEndpoint = "https://router.project-osrm.org/route/v1/driving";

export type FreeRoutePreviewLeg = {
  path: [number, number][];
  distanceMeters: number;
  routingMode: "road" | "direct_unmapped";
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

function distanceMeters(start: OwnerGoogleVerifyPoint, end: OwnerGoogleVerifyPoint) {
  const radians = Math.PI / 180;
  const startLatitude = start.latitude * radians;
  const endLatitude = end.latitude * radians;
  const latitudeDelta = (end.latitude - start.latitude) * radians;
  const longitudeDelta = (end.longitude - start.longitude) * radians;
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  const boundedValue = Math.min(1, Math.max(0, value));
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(boundedValue), Math.sqrt(1 - boundedValue));
}

function directUnmappedLeg(start: OwnerGoogleVerifyPoint, end: OwnerGoogleVerifyPoint): FreeRoutePreviewLeg {
  return {
    path: [[start.longitude, start.latitude], [end.longitude, end.latitude]],
    distanceMeters: distanceMeters(start, end),
    routingMode: "direct_unmapped",
  };
}

function pathPoint(point: [number, number]): OwnerGoogleVerifyPoint {
  return { longitude: point[0], latitude: point[1] };
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
    const code = body && typeof body === "object" ? (body as { code?: unknown }).code : null;
    if (code === "NoRoute" || code === "NoSegment") return directUnmappedLeg(start, end);
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
    return path.length >= 2 ? [{ path, distanceMeters, routingMode: "road" }] : [];
  });
  if (!candidates.length) {
    throw new Error("Free route service returned incomplete road geometry.");
  }
  const shortest = candidates.reduce((current, candidate) => candidate.distanceMeters < current.distanceMeters ? candidate : current);
  const directDistance = distanceMeters(start, end);
  const snappedStartDistance = distanceMeters(start, pathPoint(shortest.path[0]));
  const snappedEndDistance = distanceMeters(end, pathPoint(shortest.path[shortest.path.length - 1]));
  const leavesControlPoints = snappedStartDistance > 75 || snappedEndDistance > 75;
  const makesLargeLoop = directDistance > 0
    && shortest.distanceMeters > directDistance * 3
    && shortest.distanceMeters - directDistance > 300;
  return leavesControlPoints || makesLargeLoop ? directUnmappedLeg(start, end) : shortest;
}
