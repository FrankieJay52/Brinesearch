import type {
  Map as MapLibreMap,
  RasterLayerSpecification,
  RasterSourceSpecification,
} from "maplibre-gl";

export type MainMapBasemapMode = "street" | "satellite";

export const mainMapSatelliteSourceId = "brinesearch-main-map-usgs-imagery";
export const mainMapSatelliteLayerId = "brinesearch-main-map-usgs-imagery-layer";
export const mainMapSatelliteTileUrl = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}";

export const mainMapSatelliteSource: RasterSourceSpecification = {
  type: "raster",
  tiles: [mainMapSatelliteTileUrl],
  tileSize: 256,
  minzoom: 0,
  maxzoom: 16,
  attribution: "Imagery: <a href=\"https://www.usgs.gov/programs/national-geospatial-program/national-map\">U.S. Geological Survey, The National Map</a> · <a href=\"https://www.fsa.usda.gov/resources/programs/naip-imagery\">USDA NAIP</a>",
};

export const mainMapSatelliteLayer: RasterLayerSpecification = {
  id: mainMapSatelliteLayerId,
  type: "raster",
  source: mainMapSatelliteSourceId,
  minzoom: 0,
  maxzoom: 22,
  paint: {
    "raster-fade-duration": 0,
    "raster-contrast": 0.08,
    "raster-saturation": -0.08,
  },
};

export function mainMapBasemapModeFromParam(value: string | null): MainMapBasemapMode {
  return value === "satellite" ? "satellite" : "street";
}

export function mainMapBasemapSearchParams(
  current: URLSearchParams,
  mode: MainMapBasemapMode,
) {
  const next = new URLSearchParams(current);
  if (mode === "satellite") next.set("basemap", "satellite");
  else next.delete("basemap");
  return next;
}

export function clearMainMapSatelliteBasemap(map: MapLibreMap) {
  try {
    if (map.getLayer(mainMapSatelliteLayerId)) map.removeLayer(mainMapSatelliteLayerId);
  } catch {
    // Style replacement can remove the presentation layer first.
  }
  try {
    if (map.getSource(mainMapSatelliteSourceId)) map.removeSource(mainMapSatelliteSourceId);
  } catch {
    // A failed raster worker must never prevent the street map from remaining usable.
  }
}

export function syncMainMapBasemap(map: MapLibreMap, mode: MainMapBasemapMode) {
  clearMainMapSatelliteBasemap(map);
  if (mode === "street") return true;

  try {
    map.addSource(mainMapSatelliteSourceId, mainMapSatelliteSource);
    const firstLabelLayer = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
    map.addLayer(mainMapSatelliteLayer, firstLabelLayer);
    if (!map.getSource(mainMapSatelliteSourceId) || !map.getLayer(mainMapSatelliteLayerId)) {
      throw new Error("Satellite imagery source or layer was rejected");
    }
    return true;
  } catch {
    clearMainMapSatelliteBasemap(map);
    return false;
  }
}
