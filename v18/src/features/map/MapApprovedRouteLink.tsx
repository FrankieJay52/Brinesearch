import { Icon } from "@/components/Icon";

export function MapApprovedRouteLink({ routeUrl, padName, detail = "Approved route", approachLabel = null }: { routeUrl: string; padName: string; detail?: string; approachLabel?: string | null }) {
  const title = approachLabel ? `Navigate ${approachLabel}` : "Navigate";
  const ariaLabel = approachLabel
    ? `${title} to ${padName} in Google Maps using only its reviewed BrineSearch controls`
    : `Navigate the reviewed ${detail.toLowerCase()} to ${padName} in Google Maps`;
  return <a href={routeUrl} target="_blank" rel="noreferrer" aria-label={ariaLabel}>
    <Icon name="google"/><span><strong>{title}</strong><small>{detail}</small></span><b>↗</b>
  </a>;
}

export function MapDestinationPinLink({ pinUrl, padName, sourceLabel = "GPS destination" }: { pinUrl: string; padName: string; sourceLabel?: string }) {
  return <a className="map-destination-pin-link" href={pinUrl} target="_blank" rel="noreferrer" aria-label={`Navigate to the ${sourceLabel.toLowerCase()} for ${padName} in Google Maps; GPS destination only, not an approved route`}>
    <Icon name="location"/><span>Navigate<small>GPS destination only · {sourceLabel}</small></span><b>↗</b>
  </a>;
}

export function MapReviewedRouteLink({ routeUrl, padName, title = "Navigate", detail = "Owner-reviewed Google directions" }: { routeUrl: string; padName: string; title?: string; detail?: string }) {
  return <a className="map-reviewed-route-link" href={routeUrl} target="_blank" rel="noreferrer" aria-label={`Open the reviewed ${padName} route in Google Maps; exact graph and public Google authority remain separate`}>
    <Icon name="google"/><span><strong>{title}</strong><small>{detail}</small></span><b>↗</b>
  </a>;
}

