import { useCallback, useEffect, useRef, useState } from "react";
import { isValidSearchOrigin, type SearchOrigin } from "@/data/search";

export type PadSearchLocationState = "idle" | "locating" | "ready" | "denied" | "unavailable";

export interface PadSearchLocationSnapshot {
  state: PadSearchLocationState;
  origin: SearchOrigin | null;
  activeAttempt: number;
}

export type PadSearchLocationEvent =
  | { type: "request"; attempt: number }
  | { type: "success"; attempt: number; origin: SearchOrigin }
  | { type: "failure"; attempt: number; denied: boolean };

export const initialPadSearchLocationSnapshot: PadSearchLocationSnapshot = {
  state: "idle",
  origin: null,
  activeAttempt: 0,
};

/**
 * Keeps asynchronous phone-location attempts deterministic. A new request
 * clears the prior coordinate so a failed refresh can never be presented as
 * the phone's current position, and callbacks from older attempts are ignored.
 */
export function reducePadSearchLocation(
  snapshot: PadSearchLocationSnapshot,
  event: PadSearchLocationEvent,
): PadSearchLocationSnapshot {
  if (event.type === "request") {
    return { state: "locating", origin: null, activeAttempt: event.attempt };
  }
  if (event.attempt !== snapshot.activeAttempt) return snapshot;
  if (event.type === "success" && isValidSearchOrigin(event.origin)) {
    return { state: "ready", origin: event.origin, activeAttempt: event.attempt };
  }
  return {
    state: event.type === "failure" && event.denied ? "denied" : "unavailable",
    origin: null,
    activeAttempt: event.attempt,
  };
}

export function padSearchResultsReady(state: PadSearchLocationState, origin: SearchOrigin | null) {
  return isValidSearchOrigin(origin) || state === "denied" || state === "unavailable";
}

export function padSearchResultsReadyForQuery(
  state: PadSearchLocationState,
  origin: SearchOrigin | null,
  rawQuery: string,
) {
  return rawQuery.trim().length > 0 || padSearchResultsReady(state, origin);
}

export function usePadSearchLocation() {
  const mountedRef = useRef(false);
  const inFlightRef = useRef(false);
  const attemptRef = useRef(0);
  const snapshotRef = useRef(initialPadSearchLocationSnapshot);
  const [snapshot, setSnapshot] = useState(initialPadSearchLocationSnapshot);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      attemptRef.current += 1;
      snapshotRef.current = {
        ...snapshotRef.current,
        activeAttempt: attemptRef.current,
      };
      inFlightRef.current = false;
    };
  }, []);

  const applyEvent = useCallback((event: PadSearchLocationEvent) => {
    const next = reducePadSearchLocation(snapshotRef.current, event);
    snapshotRef.current = next;
    if (mountedRef.current) setSnapshot(next);
  }, []);

  const requestLocation = useCallback((fresh = false) => {
    if (inFlightRef.current || (!fresh && snapshotRef.current.origin)) return;

    const attempt = ++attemptRef.current;
    inFlightRef.current = true;
    applyEvent({ type: "request", attempt });
    const finish = (event: Exclude<PadSearchLocationEvent, { type: "request" }>) => {
      if (!mountedRef.current || attempt !== snapshotRef.current.activeAttempt) return;
      inFlightRef.current = false;
      applyEvent(event);
    };

    if (!navigator.geolocation) {
      finish({ type: "failure", attempt, denied: false });
      return;
    }

    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          finish({
            type: "success",
            attempt,
            origin: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            },
          });
        },
        (error) => {
          finish({ type: "failure", attempt, denied: error.code === error.PERMISSION_DENIED });
        },
        {
          enableHighAccuracy: true,
          timeout: fresh ? 12_000 : 10_000,
          maximumAge: fresh ? 0 : 60_000,
        },
      );
    } catch {
      finish({ type: "failure", attempt, denied: false });
    }
  }, [applyEvent]);

  return {
    origin: snapshot.origin,
    state: snapshot.state,
    requestLocation,
    retryLocation: () => requestLocation(true),
  };
}
