import type { PadSummary } from "@/data/types";

export interface PadIdentifierGroup {
  key: "well" | "api" | "property";
  label: string;
  values: string[];
}

type PadIdentifierSource = Pick<PadSummary, "wellNames" | "apiNumbers" | "propertyNumbers">;

export function buildPadIdentifierGroups(pad: PadIdentifierSource): PadIdentifierGroup[] {
  return [
    { key: "well", label: "Well name", values: [...pad.wellNames] },
    { key: "api", label: "API number", values: [...pad.apiNumbers] },
    { key: "property", label: "Property number", values: [...pad.propertyNumbers] },
  ];
}

export function padIdentifierSummary(pad: PadIdentifierSource) {
  const wellLabel = pad.wellNames.length === 1 ? "well name" : "well names";
  const propertyLabel = pad.propertyNumbers.length === 1 ? "property number" : "property numbers";
  return `${pad.wellNames.length} ${wellLabel} · ${pad.apiNumbers.length} API numbers · ${pad.propertyNumbers.length} ${propertyLabel}`;
}
