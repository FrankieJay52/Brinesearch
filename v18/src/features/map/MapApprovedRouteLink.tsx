import { Icon } from "@/components/Icon";

export function MapApprovedRouteLink({ routeUrl, padName }: { routeUrl: string; padName: string }) {
  return <a href={routeUrl} target="_blank" rel="noreferrer" aria-label={`Navigate the approved route to ${padName} in Google Maps`}>
    <Icon name="google"/><span>Navigate approved route</span><b>↗</b>
  </a>;
}

