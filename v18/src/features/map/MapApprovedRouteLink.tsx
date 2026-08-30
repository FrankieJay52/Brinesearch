import { Icon } from "@/components/Icon";
import type { OwnerApprovedNavigationPresentation } from "@/data/reviewedNavigationCandidates";

export function MapApprovedRouteLink({ routeUrl, padName, detail = "Reviewed named roads to the saved pin", approachLabel = null }: { routeUrl: string; padName: string; detail?: string; approachLabel?: string | null }) {
  const title = "GET DIRECTIONS";
  const ariaLabel = approachLabel
    ? `Get directions to ${padName} via ${approachLabel} in Google Maps; ${detail}; use only its reviewed BrineSearch controls`
    : `Navigate the ${detail.toLowerCase()} to ${padName} in Google Maps`;
  return <a href={routeUrl} target="_blank" rel="noreferrer" aria-label={ariaLabel}>
    <Icon name="google"/><span><strong>{title}</strong></span><b>↗</b>
  </a>;
}

export function MapDestinationPinLink({ pinUrl, padName, sourceLabel = "GPS destination" }: { pinUrl: string; padName: string; sourceLabel?: string }) {
  return <a className="map-destination-pin-link" href={pinUrl} target="_blank" rel="noreferrer" aria-label={`Navigate to the ${sourceLabel.toLowerCase()} for ${padName} in Google Maps; GPS destination only, no reviewed named-road sequence`}>
    <Icon name="location"/><span><strong>GET DIRECTIONS</strong></span><b>↗</b>
  </a>;
}

export function MapReviewedRouteLink({ routeUrl, padName, detail = "Reviewed Google directions", ownerApproval }: { routeUrl: string; padName: string; detail?: string; ownerApproval?: OwnerApprovedNavigationPresentation }) {
  const reviewLabel = ownerApproval
    ? ownerApproval.evidence === "exact_named_road_identities" ? "owner-approved named-road directions" : "owner-approved directions"
    : "reviewed route";
  return <a className="map-reviewed-route-link" href={routeUrl} target="_blank" rel="noreferrer" aria-label={`Open the ${reviewLabel} for ${padName} in Google Maps; ${detail}; display geometry and State-1 authority remain separate`}>
    <Icon name="google"/><span><strong>GET DIRECTIONS</strong></span><b>↗</b>
  </a>;
}

