import { Icon } from "@/components/Icon";

export function MapApprovedRouteLink({ routeUrl, padName }: { routeUrl: string; padName: string }) {
  return <a href={routeUrl} target="_blank" rel="noreferrer" aria-label={`Navigate the approved route to ${padName} in Google Maps`}>
    <Icon name="google"/><span>Navigate approved route</span><b>↗</b>
  </a>;
}

export function MapDestinationPinLink({ pinUrl, padName }: { pinUrl: string; padName: string }) {
  return <a className="map-destination-pin-link" href={pinUrl} target="_blank" rel="noreferrer" aria-label={`Open the verified driver entrance for ${padName} in Google Maps; destination only, not an approved route`}>
    <Icon name="location"/><span>Open GPS pin<small>Not an approved route</small></span><b>↗</b>
  </a>;
}

