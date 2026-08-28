const ownerDestinations = new Set(["/settings/approved-routes", "/control-center", "/settings"]);
const ownerVerifyDestination = /^\/settings\/verify-route\/[A-Za-z0-9][A-Za-z0-9._~-]{0,159}$/;

export function ownerSignInDestination(value: string | null) {
  return value && (ownerDestinations.has(value) || ownerVerifyDestination.test(value)) ? value : "/settings/approved-routes";
}
