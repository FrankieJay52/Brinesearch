import type { StyleSpecification } from "maplibre-gl";

export type OwnerRoadBasemapMode = "road" | "satellite";

export const ownerRoadBasemapLabels: Record<OwnerRoadBasemapMode, string> = {
  road: "Road map",
  satellite: "Satellite imagery",
};

export const ownerRoadMapStyle = import.meta.env.VITE_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty";

export const ownerRoadSatelliteStyle: StyleSpecification = {
  version: 8,
  sources: {
    "brinesearch-usgs-imagery": {
      type: "raster",
      tiles: ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 16,
      attribution: "Map services and data available from <a href=\"https://www.usgs.gov/programs/national-geospatial-program/national-map\">U.S. Geological Survey, National Geospatial Program</a>",
    },
  },
  layers: [
    {
      id: "brinesearch-owner-satellite-background",
      type: "background",
      paint: { "background-color": "#14232b" },
    },
    {
      id: "brinesearch-owner-satellite-imagery",
      type: "raster",
      source: "brinesearch-usgs-imagery",
      minzoom: 0,
      maxzoom: 22,
      paint: {
        "raster-fade-duration": 0,
        "raster-contrast": 0.08,
        "raster-saturation": -0.08,
      },
    },
  ],
};

export const ownerRoadFallbackStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "owner-map-offline-background", type: "background", paint: { "background-color": "#102938" } }],
};

export function ownerRoadBasemapStyle(mode: OwnerRoadBasemapMode): string | StyleSpecification {
  return mode === "satellite" ? ownerRoadSatelliteStyle : ownerRoadMapStyle;
}
