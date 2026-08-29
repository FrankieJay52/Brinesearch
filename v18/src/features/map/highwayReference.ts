import type {
  FilterSpecification,
  LineLayerSpecification,
  StyleSpecification,
} from "maplibre-gl";
import type { MultiPolygon } from "geojson";
import padCountyHighwayScope from "./padCountyHighwayScope.json";

export const highwayReferenceCasingLayerId = "brinesearch-highway-reference-casing";
export const highwayReferenceLineLayerId = "brinesearch-highway-reference-line";

// OpenMapTiles route-network identities are structured metadata. They are not
// road names and must never be expanded with text, fuzzy, or nearest matching.
export const highwayReferenceNetworks = ["us-interstate", "us-highway", "us-state"] as const;

// Compact, dissolved U.S. Census Bureau 2025 1:20m cartographic-boundary union
// for the repository's existing 39-county confirmed pad footprint (OH/WV/PA).
// Dissolving shared county borders keeps through-highways connected. This only
// clips presentation; it never supplies, edits, or infers road geometry.
export const highwayReferencePadCountyScope = padCountyHighwayScope as MultiPolygon;

const libertyConnectedRoadLayerIds = [
  "road_motorway",
  "road_trunk_primary",
  "road_secondary_tertiary",
] as const;
const libertyHighwayIdentityLayerIds = [
  "highway-shield-us-interstate",
  "road_shield_us",
] as const;

export const highwayReferenceFilter: FilterSpecification = [
  "all",
  ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
  ["match", ["get", "network"], [...highwayReferenceNetworks], true, false],
  ["within", highwayReferencePadCountyScope],
];

interface HighwayReferenceSource {
  source: string;
  sourceLayer: string;
}

type StyleLayer = StyleSpecification["layers"][number];

function vectorBackedLayer(style: StyleSpecification, id: string) {
  const layer = style.layers.find((candidate) => candidate.id === id);
  if (!layer || !("source" in layer) || typeof layer.source !== "string") return null;
  if (!("source-layer" in layer) || typeof layer["source-layer"] !== "string") return null;
  const source = style.sources[layer.source];
  if (!source || source.type !== "vector") return null;
  return layer as StyleLayer & { source: string; "source-layer": string };
}

/**
 * Fail closed unless the loaded style exposes Liberty's actual connected-road
 * geometry and U.S. highway-identity layers on the same vector source.
 *
 * The returned line geometry and route identity come from Liberty's connected
 * `transportation` source-layer, whose route features expose the structured
 * `network` field. The shield layers are required as same-source identity
 * anchors. No road-name inference occurs.
 */
export function libertyHighwayReferenceSource(style: StyleSpecification): HighwayReferenceSource | null {
  const connectedRoadLayers = libertyConnectedRoadLayerIds.map((id) => vectorBackedLayer(style, id));
  const identityLayers = libertyHighwayIdentityLayerIds.map((id) => vectorBackedLayer(style, id));
  if ([...connectedRoadLayers, ...identityLayers].some((layer) => !layer)) return null;

  const connected = connectedRoadLayers as Array<NonNullable<(typeof connectedRoadLayers)[number]>>;
  const identities = identityLayers as Array<NonNullable<(typeof identityLayers)[number]>>;
  const source = connected[0].source;
  if (![...connected, ...identities].every((layer) => layer.source === source)) return null;
  if (!connected.every((layer) => layer["source-layer"] === "transportation")) return null;
  if (!identities.every((layer) => layer["source-layer"] === "transportation_name")) return null;

  return { source, sourceLayer: connected[0]["source-layer"] };
}

export function firstSymbolLayerAfterLines(style: StyleSpecification) {
  let lastLineIndex = -1;
  for (let index = 0; index < style.layers.length; index += 1) {
    if (style.layers[index].type === "line") lastLineIndex = index;
  }
  return style.layers.slice(lastLineIndex + 1).find((layer) => layer.type === "symbol")?.id;
}

export function highwayReferenceLayerSpecifications(
  source: HighwayReferenceSource,
): [LineLayerSpecification, LineLayerSpecification] {
  const shared = {
    type: "line" as const,
    source: source.source,
    "source-layer": source.sourceLayer,
    minzoom: 5.5,
    filter: highwayReferenceFilter,
    layout: { "line-cap": "round" as const, "line-join": "round" as const },
  };

  return [
    {
      ...shared,
      id: highwayReferenceCasingLayerId,
      paint: {
        "line-color": "rgba(7, 19, 31, .72)",
        "line-opacity": 0.62,
        "line-width": ["interpolate", ["linear"], ["zoom"], 5.5, 3, 7, 4, 9, 5, 13, 6],
      },
    },
    {
      ...shared,
      id: highwayReferenceLineLayerId,
      paint: {
        // On a phone, 1px-ish mid-zoom lines disappear under dense pad dots.
        // This remains below exact approved roads (4px/.86) and the selected
        // pad route (5px/1), while staying legible from regional zoom 7 onward.
        "line-color": "#1aa99b",
        "line-opacity": 0.78,
        "line-width": ["interpolate", ["linear"], ["zoom"], 5.5, 1.2, 7, 1.8, 9, 2.35, 13, 3.1],
      },
    },
  ];
}
