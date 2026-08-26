import { Icon } from "@/components/Icon";

export function MapApprovedRouteLink({ routeUrl, padName, detail = "Approved route" }: { routeUrl: string; padName: string; detail?: string }) {
  return <a href={routeUrl} target="_blank" rel="noreferrer" aria-label={`Navigate the reviewed ${detail.toLowerCase()} to ${padName} in Google Maps`}>
    <Icon name="google"/><span><strong>Navigate</strong><small>{detail}</small></span><b>↗</b>
  </a>;
}

export function MapDestinationPinLink({ pinUrl, padName }: { pinUrl: string; padName: string }) {
  return <a className="map-destination-pin-link" href={pinUrl} target="_blank" rel="noreferrer" aria-label={`Open the verified driver entrance for ${padName} in Google Maps; destination only, not an approved route`}>
    <Icon name="location"/><span>Open GPS pin<small>Not an approved route</small></span><b>↗</b>
  </a>;
}

