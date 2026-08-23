const configuredPrivateVariables = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_JWT_SECRET",
];

function containsServiceRoleJwt(contents) {
  const candidates = contents.matchAll(/\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g);
  for (const candidate of candidates) {
    try {
      const payload = JSON.parse(Buffer.from(candidate[0].split(".")[1], "base64url").toString("utf8"));
      if (payload?.role === "service_role") return true;
    } catch {
      // A JWT-shaped application string is not a credential unless its payload proves it is one.
    }
  }
  return false;
}

export function findPrivateCredentialMarker(contents, environment = process.env) {
  for (const variableName of configuredPrivateVariables) {
    if (contents.includes(variableName)) return `${variableName} environment variable name`;
  }
  if (/\bsb_secret_[A-Za-z0-9_-]{16,}\b/i.test(contents)) return "Supabase secret key";
  if (/\bpostgres(?:ql)?:\/\/[^\s"'`]+/i.test(contents)) return "Postgres connection URL";
  if (containsServiceRoleJwt(contents)) return "legacy service-role JWT";

  for (const variableName of configuredPrivateVariables) {
    const configuredValue = environment[variableName]?.trim();
    if (configuredValue && configuredValue.length >= 12 && contents.includes(configuredValue)) {
      return `${variableName} value`;
    }
  }

  return null;
}
