const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://wvxzqtoiwhrgovzddtvz.supabase.co";
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_5_sw9B-bcSdWgDzp4Z3pnQ_b-tutvtd";
export const ownerSessionStorageKey = "brinesearch.editorSession.v1";

type JsonObject = Record<string, unknown>;

export type StoredEditorSession = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
};

export type OwnerProfile = {
  role: string;
  permissions: string[];
};

export type OwnerAccessResult =
  | { state: "owner"; profile: OwnerProfile }
  | { state: "signed_out" | "denied" | "error"; message: string };

export type OwnerRpcName =
  | "owner_approved_routes_map_viewport"
  | "owner_approved_routes_map_road_detail"
  | "owner_approved_routes_map_pad_options";

export class OwnerSessionError extends Error {
  constructor(
    message: string,
    readonly kind: "signed_out" | "denied" | "request",
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "OwnerSessionError";
  }
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function cleanText(value: unknown, max = 80) {
  return typeof value === "string" && value.trim() && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value)
    ? value.trim()
    : null;
}

export function parseStoredEditorSession(value: unknown): StoredEditorSession | null {
  const row = object(value);
  const accessToken = cleanText(row.access_token, 16_384);
  if (!accessToken) return null;
  const refreshToken = row.refresh_token === undefined || row.refresh_token === null
    ? null
    : cleanText(row.refresh_token, 16_384);
  if (row.refresh_token !== undefined && row.refresh_token !== null && !refreshToken) return null;
  const expiresAt = row.expires_at === undefined || row.expires_at === null
    ? null
    : Number(row.expires_at);
  if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= 0)) return null;
  return { accessToken, refreshToken, expiresAt };
}

export function parseOwnerProfile(value: unknown): OwnerProfile | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  const row = object(candidate);
  const role = cleanText(row.role, 80)?.toLowerCase() || "member";
  const permissions = Array.isArray(row.permissions)
    ? [...new Set(row.permissions.map((entry) => cleanText(entry, 80)?.toLowerCase()).filter((entry): entry is string => Boolean(entry)))]
    : [];
  if (!Object.keys(row).length) return null;
  return { role, permissions };
}

export function profileHasOwnerAccess(profile: OwnerProfile | null) {
  return Boolean(profile && (profile.role === "owner" || profile.permissions.includes("owner")));
}

function readStoredEditorSession() {
  if (typeof window === "undefined") return null;
  try {
    return parseStoredEditorSession(JSON.parse(window.localStorage.getItem(ownerSessionStorageKey) || "null"));
  } catch {
    return null;
  }
}

function persistEditorSession(value: unknown) {
  if (typeof window === "undefined") return;
  const session = parseStoredEditorSession(value);
  try {
    if (session) window.localStorage.setItem(ownerSessionStorageKey, JSON.stringify(value));
    else window.localStorage.removeItem(ownerSessionStorageKey);
  } catch {
    // The server-side owner gate remains authoritative if storage is unavailable.
  }
}

async function responsePayload(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function requestMessage(payload: unknown, status: number) {
  const row = object(payload);
  for (const key of ["message", "error_description", "msg", "hint"]) {
    const message = cleanText(row[key], 500);
    if (message) return message;
  }
  return `Owner request failed (${status})`;
}

async function refreshEditorSession(session: StoredEditorSession, signal?: AbortSignal) {
  if (!session.refreshToken) throw new OwnerSessionError("Sign in to Road Manager again to continue.", "signed_out", 401);
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: publishableKey, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
    cache: "no-store",
    signal,
  });
  const payload = await responsePayload(response);
  const refreshed = parseStoredEditorSession(payload);
  if (!response.ok || !refreshed) {
    persistEditorSession(null);
    throw new OwnerSessionError("Your owner session expired. Sign in to Road Manager again.", "signed_out", response.status);
  }
  persistEditorSession(payload);
  return refreshed;
}

async function currentEditorSession(signal?: AbortSignal) {
  const session = readStoredEditorSession();
  if (!session) throw new OwnerSessionError("Sign in to Road Manager to open owner tools.", "signed_out", 401);
  if (session.expiresAt && session.expiresAt * 1_000 <= Date.now() + 60_000) return refreshEditorSession(session, signal);
  return session;
}

async function authenticatedRequest(path: string, body: JsonObject, signal?: AbortSignal, retry = true): Promise<unknown> {
  const session = await currentEditorSession(signal);
  const response = await fetch(`${supabaseUrl}${path}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${session.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  const payload = await responsePayload(response);
  if (response.ok) return payload;
  if (retry && response.status === 401 && session.refreshToken) {
    await refreshEditorSession(session, signal);
    return authenticatedRequest(path, body, signal, false);
  }
  if (response.status === 401) {
    persistEditorSession(null);
    throw new OwnerSessionError("Your owner session expired. Sign in to Road Manager again.", "signed_out", response.status);
  }
  if (response.status === 403 || /owner access required/i.test(requestMessage(payload, response.status))) {
    throw new OwnerSessionError("This signed-in account does not have Owner access.", "denied", response.status);
  }
  throw new OwnerSessionError(requestMessage(payload, response.status), "request", response.status);
}

export async function checkOwnerAccess(signal?: AbortSignal): Promise<OwnerAccessResult> {
  try {
    const payload = await authenticatedRequest("/rest/v1/rpc/my_editor_status", {}, signal);
    const profile = parseOwnerProfile(payload);
    if (!profileHasOwnerAccess(profile)) return { state: "denied", message: "This signed-in account does not have Owner access." };
    return { state: "owner", profile: profile! };
  } catch (error) {
    if (error instanceof OwnerSessionError && error.kind === "signed_out") return { state: "signed_out", message: error.message };
    if (error instanceof OwnerSessionError && error.kind === "denied") return { state: "denied", message: error.message };
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { state: "error", message: "Owner access could not be verified. No owner road data was loaded." };
  }
}

export function ownerRpc(name: OwnerRpcName, body: JsonObject, signal?: AbortSignal) {
  return authenticatedRequest(`/rest/v1/rpc/${name}`, body, signal);
}
