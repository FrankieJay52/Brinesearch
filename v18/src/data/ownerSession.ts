import type { Session } from "@supabase/supabase-js";
import { supabase, supabasePublishableKey, supabaseUrl } from "./supabaseClient";

type JsonObject = Record<string, unknown>;

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

function usableSession(session: Session | null) {
  return Boolean(session?.access_token && session.expires_at && session.expires_at * 1_000 > Date.now() + 60_000);
}

async function refreshCurrentSession() {
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    throw new OwnerSessionError("Your V18 session expired. Sign in again to continue.", "signed_out", 401);
  }
  return data.session;
}

async function currentSession(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
  const { data, error } = await supabase.auth.getSession();
  if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
  if (error) throw new OwnerSessionError("V18 could not read the current session.", "request");
  if (!data.session) throw new OwnerSessionError("Sign in to V18 to open owner tools.", "signed_out", 401);
  return usableSession(data.session) ? data.session : refreshCurrentSession();
}

async function authenticatedRequest(path: string, body: JsonObject, signal?: AbortSignal, retry = true): Promise<unknown> {
  const session = await currentSession(signal);
  const response = await fetch(`${supabaseUrl}${path}`, {
    method: "POST",
    headers: {
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${session.access_token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  const payload = await responsePayload(response);
  if (response.ok) return payload;
  if (retry && response.status === 401 && session.refresh_token) {
    await refreshCurrentSession();
    return authenticatedRequest(path, body, signal, false);
  }
  if (response.status === 401) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    throw new OwnerSessionError("Your V18 session expired. Sign in again to continue.", "signed_out", response.status);
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

export async function signInOwner(email: string, password: string): Promise<OwnerAccessResult> {
  const normalizedEmail = email.trim();
  if (!normalizedEmail || normalizedEmail.length > 254 || !normalizedEmail.includes("@") || !password) {
    return { state: "signed_out", message: "Enter the email and password for your BrineSearch owner account." };
  }
  const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
  if (error) {
    return error.status === 400 || error.status === 401
      ? { state: "signed_out", message: "The email or password was not accepted." }
      : { state: "error", message: "V18 sign-in is unavailable right now. No owner data was loaded." };
  }
  return checkOwnerAccess();
}

export async function signOutOwner() {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw new OwnerSessionError("V18 could not finish signing out. Try again before leaving this device.", "request", error.status || null);
}

export function ownerRpc(name: OwnerRpcName, body: JsonObject, signal?: AbortSignal) {
  return authenticatedRequest(`/rest/v1/rpc/${name}`, body, signal);
}
