import type { PadSummary, SearchFilters } from "./types";

export function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compact(value: unknown) {
  return normalizeSearchText(value).replace(/[^a-z0-9]/g, "");
}

function exactAny(query: string, values: string[]) {
  return values.some((value) => normalizeSearchText(value) === query || compact(value) === compact(query));
}

function searchTier(pad: PadSummary, query: string, tokens: string[]) {
  const padName = normalizeSearchText(pad.padName);
  const company = normalizeSearchText(pad.company);
  const high = [pad.padName, pad.company, ...pad.aliases, ...pad.wellNames, ...pad.apiNumbers, ...pad.propertyNumbers];
  const location = [pad.state, pad.county, pad.township, pad.address, ...pad.safeRoadTerms];
  const highText = normalizeSearchText(high.join(" "));
  const locationText = normalizeSearchText(location.join(" "));

  if (compact(query) === compact(pad.canonicalId) && pad.canonicalId) return 0;
  if (compact(query) === compact(pad.legacyId) && pad.legacyId) return 1;
  if (exactAny(query, pad.apiNumbers)) return 2;
  if (exactAny(query, pad.propertyNumbers)) return 3;
  if (exactAny(query, [...pad.aliases, ...pad.wellNames])) return 4;
  if (padName === query || `${company} ${padName}` === query) return 5;
  if (tokens.every((token) => highText.split(" ").some((word) => word === token || word.startsWith(token)))) return 6;
  if (tokens.every((token) => highText.includes(token))) return 7;
  if (tokens.every((token) => locationText.includes(token))) return 8;
  return Number.POSITIVE_INFINITY;
}

export function searchDirectory(rows: PadSummary[], rawQuery: string, filters: SearchFilters, limit = 100) {
  const query = normalizeSearchText(rawQuery);
  const hadInput = String(rawQuery ?? "").trim().length > 0;
  const tokens = query.split(" ").filter(Boolean);
  if (!query && (filters.type === "road" || filters.type === "company")) return [];
  const filtered = rows.filter((row) => {
    if (filters.type === "pad" && row.recordType !== "pad") return false;
    if (filters.type === "disposal" && row.recordType !== "disposal") return false;
    if (filters.type === "company" && query && !normalizeSearchText(row.company).includes(query)) return false;
    if (filters.type === "road" && query && !normalizeSearchText(row.safeRoadTerms.join(" ")).includes(query)) return false;
    return true;
  });
  if (!query && hadInput) return [];
  if (!query) {
    return filtered
      .slice()
      .sort((a, b) => a.padName.localeCompare(b.padName) || a.company.localeCompare(b.company) || a.padId.localeCompare(b.padId))
      .slice(0, limit);
  }
  if (compact(query).length < 2) return [];

  return filtered
    .map((row) => ({ row, tier: searchTier(row, query, tokens) }))
    .filter((item) => Number.isFinite(item.tier))
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        a.row.padName.localeCompare(b.row.padName) ||
        a.row.company.localeCompare(b.row.company) ||
        a.row.state.localeCompare(b.row.state) ||
        a.row.county.localeCompare(b.row.county) ||
        a.row.padId.localeCompare(b.row.padId),
    )
    .slice(0, limit)
    .map((item) => item.row);
}
