import { mapDisplayCoordinate } from "./mapDisplayCoordinates";
import type { PadSummary } from "./types";

/**
 * Opens only the exact verified driver-entrance coordinate. This is display
 * and destination-pin utility, never a BrineSearch route approval.
 */
export function verifiedDriverEntrancePinUrl(pad: PadSummary) {
  const coordinate = mapDisplayCoordinate(pad);
  if (!coordinate || coordinate.role !== "driver_entrance") return null;
  const query = `${coordinate.latitude},${coordinate.longitude}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
