import { parseCoordinatePair } from "./coordinates";
import type { PadSummary } from "./types";

export type PadDestinationSource =
  | "verified_driver_entrance"
  | "saved_pad_gps"
  | "official_pad_reference"
  | "official_wellhead_reference";

export interface TrustedPadDestination {
  latitude: number;
  longitude: number;
  source: PadDestinationSource;
  label: string;
}

/**
 * Returns only an explicitly sourced coordinate from the live directory or
 * its reviewed reference projection. Packaged display fallback points are not
 * navigation inputs because they cannot carry a current source label.
 */
export function trustedPadDestination(pad: PadSummary): TrustedPadDestination | null {
  if (pad.coordinate) {
    const coordinate = parseCoordinatePair(
      pad.coordinate.latitude,
      pad.coordinate.longitude,
      pad.coordinate.role,
    );
    if (coordinate.ok && pad.coordinate.role === "driver_entrance") return {
      latitude: coordinate.value.latitude,
      longitude: coordinate.value.longitude,
      source: "verified_driver_entrance",
      label: "Verified driver entrance",
    };
  }

  if (!pad.mapReference) return null;
  const reference = parseCoordinatePair(
    pad.mapReference.latitude,
    pad.mapReference.longitude,
    "reference",
  );
  if (!reference.ok) return null;
  if (pad.mapReference.kind === "official_pad_reference") return {
    latitude: reference.value.latitude,
    longitude: reference.value.longitude,
    source: "official_pad_reference",
    label: "ODNR official pad GPS · not an entrance",
  };
  if (pad.mapReference.kind === "official_wellhead_reference") return {
    latitude: reference.value.latitude,
    longitude: reference.value.longitude,
    source: "official_wellhead_reference",
    label: "ODNR official wellhead GPS · not an entrance",
  };
  if (pad.mapReference.kind === "saved_pad_reference") return {
    latitude: reference.value.latitude,
    longitude: reference.value.longitude,
    source: "saved_pad_gps",
    label: "Saved pad GPS",
  };
  return null;
}

function googleCoordinate(destination: TrustedPadDestination) {
  return `${destination.latitude},${destination.longitude}`;
}

export function padDestinationPinUrl(pad: PadSummary) {
  const destination = trustedPadDestination(pad);
  if (!destination) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(googleCoordinate(destination))}`;
}

/**
 * Opens Google driving directions from the phone's current location to the
 * exact sourced GPS. This URL is destination utility only; it carries no
 * BrineSearch road approval and Google may choose its own path.
 */
export function padDestinationNavigationUrl(pad: PadSummary) {
  const destination = trustedPadDestination(pad);
  if (!destination) return null;
  const parameters = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    dir_action: "navigate",
    destination: googleCoordinate(destination),
  });
  return `https://www.google.com/maps/dir/?${parameters.toString()}`;
}

/**
 * Opens only the exact verified driver-entrance coordinate. This is display
 * and destination-pin utility, never a BrineSearch route approval.
 */
export function verifiedDriverEntrancePinUrl(pad: PadSummary) {
  const destination = trustedPadDestination(pad);
  return destination?.source === "verified_driver_entrance" ? padDestinationPinUrl(pad) : null;
}
