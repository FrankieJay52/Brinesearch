import type { DriverRouteChoice, PadSummary } from "./types";
import { normalizeDriverRouteProjection } from "./status";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://wvxzqtoiwhrgovzddtvz.supabase.co";
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_5_sw9B-bcSdWgDzp4Z3pnQ_b-tutvtd";
const revisionPattern = /^[0-9a-f]{32,64}$/;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeDriverRouteChoices(value: unknown, expectedPadId: string): DriverRouteChoice[] {
  const payload = object(Array.isArray(value) && value.length === 1 ? value[0] : value);
  if (payload.padId !== expectedPadId || !Array.isArray(payload.choices) || payload.choices.length > 8) return [];
  const choices: DriverRouteChoice[] = [];
  const keys = new Set<string>();
  for (const rawChoice of payload.choices) {
    const choice = object(rawChoice);
    const routeGroup = choice.routeGroup;
    const variantIndex = choice.variantIndex;
    const routeKey = choice.routeKey;
    const lastVerifiedAt = choice.lastVerifiedAt;
    const statusRevision = choice.statusRevision;
    if ((routeGroup !== "primary" && routeGroup !== "alternate")
      || !Number.isInteger(variantIndex) || Number(variantIndex) < 1 || Number(variantIndex) > 8
      || routeGroup === "primary" && variantIndex !== 1
      || routeGroup === "alternate" && Number(variantIndex) < 2
      || routeKey !== `${routeGroup}:${variantIndex}` || keys.has(routeKey as string)
      || typeof lastVerifiedAt !== "string" || Number.isNaN(Date.parse(lastVerifiedAt))
      || typeof statusRevision !== "string" || !revisionPattern.test(statusRevision)) return [];
    const projection = normalizeDriverRouteProjection(choice.steps, choice.geometry);
    if (!projection) return [];
    keys.add(routeKey);
    choices.push({
      routeKey,
      routeGroup,
      variantIndex: Number(variantIndex),
      label: routeGroup === "primary" ? "Route 1" : `Route ${Number(variantIndex)}`,
      steps: projection.steps,
      geometry: projection.geometry,
      lastVerifiedAt,
      statusRevision,
    });
  }
  choices.sort((left, right) => left.variantIndex - right.variantIndex || left.routeKey.localeCompare(right.routeKey));
  return choices;
}

export async function loadDriverRouteChoices(pad: PadSummary): Promise<DriverRouteChoice[]> {
  if (!pad.canonicalId) return [];
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/brinesearch_v18_driver_route_choices`, {
      method: "POST",
      headers: { apikey: publishableKey, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ p_pad_id: pad.canonicalId }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return [];
    return normalizeDriverRouteChoices(await response.json() as unknown, pad.canonicalId);
  } catch {
    return [];
  }
}
