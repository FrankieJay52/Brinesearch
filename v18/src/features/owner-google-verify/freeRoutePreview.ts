import type { OwnerGoogleVerifyPoint } from "@/data/ownerGoogleVerifyDrafts";

export const freeRoutePreviewEndpoint = "https://router.project-osrm.org/route/v1/driving";

export type FreeRoutePreviewLeg = {
  path: [number, number][];
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
  origin: OwnerGoogleVerifyPoint,
  controls: readonly OwnerGoogleVerifyPoint[],
  destination: OwnerGoogleVerifyPoint,
) {
  const coordinates = [origin, ...controls, destination].map(requestPoint).join(";");
  const options = new URLSearchParams({
    alternatives: "false",
    steps: "true",
    geometries: "geojson",
    overview: "false",
    continue_straight: "true",
  });
  return `${freeRoutePreviewEndpoint}/${coordinates}?${options.toString()}`;
}

export async function requestFreeRoutePreview(
  origin: OwnerGoogleVerifyPoint,
  controls: readonly OwnerGoogleVerifyPoint[],
  destination: OwnerGoogleVerifyPoint,
  signal?: AbortSignal,
): Promise<FreeRoutePreviewLeg[]> {
  const response = await fetch(freeRoutePreviewUrl(origin, controls, destination), {
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
  if (!Array.isArray(routes) || !routes.length || !routes[0] || typeof routes[0] !== "object") {
    throw new Error("Free route service returned no route.");
  }
  const legs = (routes[0] as OsrmRoute).legs;
  const expectedLegCount = controls.length + 1;
  if (!Array.isArray(legs) || legs.length !== expectedLegCount) {
    throw new Error("Free route service did not preserve every control point.");
  }
  const parsed = legs.map(legPath);
  if (parsed.some((path) => path.length < 2)) {
    throw new Error("Free route service returned incomplete road geometry.");
  }
  return parsed.map((path) => ({ path }));
}
