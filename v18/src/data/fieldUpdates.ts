import { supabasePublishableKey, supabaseUrl } from "./supabaseClient";

type RawRow = Record<string, unknown>;

export type FieldUpdate = {
  id: string;
  category: string;
  body: string;
  companyTag: string | null;
  padId: string | null;
  roadName: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  expiresAt: string | null;
  createdAt: string;
  displayName: string;
  username: string | null;
  profileCompany: string | null;
  jobRole: string | null;
  verifiedCompanyRep: boolean;
  badge: string | null;
  helpfulCount: number;
  confirmCount: number;
  commentCount: number;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const categoryPattern = /^[a-z][a-z0-9_]{0,39}$/;
const statusPattern = /^[a-z][a-z0-9_]{0,39}$/;
const selectedFields = [
  "id", "category", "body", "company_tag", "pad_id", "road_name", "latitude", "longitude",
  "status", "expires_at", "created_at", "display_name", "username", "profile_company", "job_role",
  "verified_company_rep", "badge", "helpful_count", "confirm_count", "comment_count",
] as const;
const selectedFieldSet = new Set<string>(selectedFields);
const unsafeSingleLineControls = /[\u0000-\u001f\u007f]/;
const unsafeMultilineControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function object(value: unknown): RawRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RawRow : {};
}

function text(value: unknown, max: number, multiline = false) {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > max) return null;
  return (multiline ? unsafeMultilineControls : unsafeSingleLineControls).test(value) ? null : value;
}

function optionalText(value: unknown, max: number) {
  return value === null ? null : text(value, max);
}

function date(value: unknown, optional = false) {
  if (optional && value === null) return null;
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

function count(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function coordinate(value: unknown, min: number, max: number) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

export function validateFieldUpdate(value: unknown): FieldUpdate | null {
  const row = object(value);
  if (!Object.keys(row).length || Object.keys(row).some((key) => !selectedFieldSet.has(key))) return null;
  const id = text(row.id, 36);
  const category = text(row.category, 40);
  const body = text(row.body, 1_200, true);
  const companyTag = optionalText(row.company_tag, 80);
  const roadName = optionalText(row.road_name, 100);
  const displayName = text(row.display_name, 80);
  const username = optionalText(row.username, 24);
  const profileCompany = optionalText(row.profile_company, 80);
  const jobRole = optionalText(row.job_role, 80);
  const badge = optionalText(row.badge, 40);
  const expiresAt = date(row.expires_at, true);
  const createdAt = date(row.created_at);
  const latitude = coordinate(row.latitude, -90, 90);
  const longitude = coordinate(row.longitude, -180, 180);
  const helpfulCount = count(row.helpful_count);
  const confirmCount = count(row.confirm_count);
  const commentCount = count(row.comment_count);
  const padId = row.pad_id === null ? null : text(row.pad_id, 36);
  if (!id || !uuidPattern.test(id) || !category || !categoryPattern.test(category) || !body || !displayName) return null;
  if (companyTag === undefined || roadName === undefined || username === undefined || profileCompany === undefined || jobRole === undefined || badge === undefined) return null;
  if (padId !== null && (!padId || !uuidPattern.test(padId))) return null;
  if (typeof row.status !== "string" || !statusPattern.test(row.status)) return null;
  if (expiresAt === undefined || !createdAt || latitude === undefined || longitude === undefined) return null;
  if ((latitude === null) !== (longitude === null)) return null;
  if (typeof row.verified_company_rep !== "boolean" || helpfulCount === null || confirmCount === null || commentCount === null) return null;
  return {
    id, category, body, companyTag, padId, roadName, latitude, longitude, status: row.status,
    expiresAt, createdAt, displayName, username, profileCompany, jobRole,
    verifiedCompanyRep: row.verified_company_rep, badge, helpfulCount, confirmCount, commentCount,
  };
}

export function validateFieldUpdates(value: unknown) {
  if (!Array.isArray(value) || value.length > 40) return null;
  const rows = value.map(validateFieldUpdate);
  return rows.every((row): row is FieldUpdate => row !== null) ? rows : null;
}

export async function loadFieldUpdates(search: string, category: string, signal?: AbortSignal) {
  const normalizedSearch = search.trim().slice(0, 100);
  const normalizedCategory = categoryPattern.test(category) ? category : "";
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/field_feed_list?select=${selectedFields.join(",")}`, {
    method: "POST",
    headers: {
      apikey: supabasePublishableKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_search: normalizedSearch || null,
      p_category: normalizedCategory || null,
      p_limit: 40,
      p_offset: 0,
    }),
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(`Field updates request failed (${response.status})`);
  const rows = validateFieldUpdates(await response.json());
  if (!rows) throw new Error("Field updates response failed the V18 public-field contract");
  return rows;
}
