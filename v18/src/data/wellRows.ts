import { isSafePublicList } from "./publicFields";
import type { DirectorySourceState, PadSummary, PadWellIdentifierRow } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://wvxzqtoiwhrgovzddtvz.supabase.co";
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_5_sw9B-bcSdWgDzp4Z3pnQ_b-tutvtd";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const responseKeys = new Set(["padId", "recordRevision", "rows"]);
const rowKeys = new Set(["wellName", "apiNumber", "propertyNumber"]);

type IdentifierField = "wellNames" | "apis" | "propertyNumbers";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeNullableIdentifier(value: unknown, field: IdentifierField): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || !isSafePublicList([value], field)) return undefined;
  return value;
}

function normalizeRows(value: unknown): PadWellIdentifierRow[] | null {
  if (!Array.isArray(value) || value.length > 32) return null;
  const rows: PadWellIdentifierRow[] = [];
  for (const raw of value) {
    const row = object(raw);
    if (Object.keys(row).some((key) => !rowKeys.has(key))) return null;
    const wellName = safeNullableIdentifier(row.wellName, "wellNames");
    const apiNumber = safeNullableIdentifier(row.apiNumber, "apis");
    const propertyNumber = safeNullableIdentifier(row.propertyNumber, "propertyNumbers");
    if (wellName === undefined || apiNumber === undefined || propertyNumber === undefined) return null;
    if (wellName === null && apiNumber === null && propertyNumber === null) return null;
    rows.push({ wellName, apiNumber, propertyNumber });
  }
  return rows;
}

export async function loadPadWellRows(
  pad: Pick<PadSummary, "padId" | "canonicalId" | "recordRevision">,
  sourceState?: DirectorySourceState,
): Promise<PadWellIdentifierRow[] | null> {
  if (!pad.canonicalId || !uuidPattern.test(pad.padId) || sourceState === "packaged_fallback" || sourceState === "unavailable") return null;
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/brinesearch_v18_driver_pad_well_rows`, {
      method: "POST",
      headers: { apikey: publishableKey, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ p_pad_id: pad.padId }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const contract = object(Array.isArray(payload) ? payload[0] : payload);
    if (Object.keys(contract).some((key) => !responseKeys.has(key))) return null;
    if (contract.padId !== pad.padId || contract.recordRevision !== pad.recordRevision) return null;
    return normalizeRows(contract.rows);
  } catch {
    return null;
  }
}
