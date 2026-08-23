const ownerDestinations = new Set(["/settings/approved-routes", "/control-center", "/settings"]);

export function ownerSignInDestination(value: string | null) {
  return value && ownerDestinations.has(value) ? value : "/settings/approved-routes";
}
