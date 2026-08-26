import type { GraphState, PublicGoogleState, RouteState } from "@/data/types";

type Status = RouteState | GraphState | PublicGoogleState | "live" | "cached" | "fallback";

const labels: Record<Status, string> = {
  ready: "Ready",
  written_only: "Written directions",
  held: "Held",
  stale: "Stale",
  unavailable: "Unavailable",
  active_current: "Active & current",
  verified_release: "Approved release",
  not_published: "Not published",
  live: "Live",
  cached: "Cached",
  fallback: "Fallback",
};

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  return <span className={`status-badge status-${status}`}>{label || labels[status]}</span>;
}
