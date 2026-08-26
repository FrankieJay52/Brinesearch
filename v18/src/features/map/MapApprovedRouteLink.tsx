import { Icon } from "@/components/Icon";

export function MapApprovedRouteLink({ routeUrl, padName, detail = "Approved route" }: { routeUrl: string; padName: string; detail?: string }) {
  return <a href={routeUrl} target="_blank" rel="noreferrer" aria-label={`Navigate the reviewed ${detail.toLowerCase()} to ${padName} in Google Maps`}>
    <Icon name="google"/><span><strong>Navigate</strong><small>{detail}</small></span><b>↗</b>
  </a>;
}

export function MapDestinationPinLink({ pinUrl, padName, sourceLabel = "GPS destination" }: { pinUrl: string; padName: string; sourceLabel?: string }) {
  return <a className="map-destination-pin-link" href={pinUrl} target="_blank" rel="noreferrer" aria-label={`Navigate to the ${sourceLabel.toLowerCase()} for ${padName} in Google Maps; GPS destination only, not an approved route`}>
    <Icon name="location"/><span>Navigate<small>GPS destination only · {sourceLabel}</small></span><b>↗</b>
  </a>;
}

