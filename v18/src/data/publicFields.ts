const publicStates = new Set(["OH", "WV", "PA", "Ohio", "West Virginia", "Pennsylvania"]);
const publicLabelPattern = /^[\p{L}\p{N} .,'’&()/#-]+$/u;
const publicIdentifierPattern = /^[\p{L}\p{N} .,'’&()/#_—-]+$/u;
const legacyIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*$/;
const placeholderPattern = /^(?:unknown|idk|n\/?a|none|null|undefined|[?.]+|y{3,})$/i;
const directionProsePattern = /\b(?:approximately|continue|head|left|miles?|onto|outside|right|road|turn)\b/i;
const identifierAnnotationPattern = /\b(?:correct(?:ed)?|note|updated?|verified)\b/i;
const unsafeSingleLineControlPattern = /[\u0000-\u001f\u007f]/;
const unsafeMultilineControlPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const apiPattern = /^\d{2}-\d{3}-(?:\d-\d{4}-\d{2}-\d{2}|\d{5})$/;

type TextPolicy = {
  maxLength: number;
  minLength?: number;
  pattern?: RegExp;
  allowed?: Set<string>;
  rejectIdentifierProse?: boolean;
  multiline?: boolean;
};

export type PublicTextField =
  | "legacyId"
  | "company"
  | "padName"
  | "state"
  | "county"
  | "township"
  | "address"
  | "structuredRoadSequence"
  | "writtenDirections"
  | "verificationState"
  | "operatingState";

export type PublicListField = "aliases" | "wellNames" | "apis" | "propertyNumbers" | "safeRoadTerms";

const textPolicies: Record<PublicTextField, TextPolicy> = {
  legacyId: { maxLength: 128, pattern: legacyIdPattern },
  company: { maxLength: 64, pattern: publicLabelPattern },
  padName: { maxLength: 128, pattern: publicLabelPattern },
  state: { maxLength: 13, allowed: publicStates },
  county: { minLength: 3, maxLength: 64, pattern: publicLabelPattern },
  township: { minLength: 3, maxLength: 64, pattern: publicLabelPattern },
  address: { minLength: 3, maxLength: 256 },
  structuredRoadSequence: { minLength: 3, maxLength: 512 },
  writtenDirections: { maxLength: 16_384, multiline: true },
  verificationState: { minLength: 3, maxLength: 128 },
  operatingState: { minLength: 3, maxLength: 128 },
};

const identifierPolicy: TextPolicy = {
  maxLength: 64,
  pattern: publicIdentifierPattern,
  rejectIdentifierProse: true,
};

const listPolicies: Record<PublicListField, { maxItems: number; policy: TextPolicy }> = {
  aliases: { maxItems: 3, policy: identifierPolicy },
  wellNames: { maxItems: 32, policy: identifierPolicy },
  apis: { maxItems: 32, policy: { maxLength: 32, pattern: apiPattern } },
  propertyNumbers: { maxItems: 32, policy: identifierPolicy },
  safeRoadTerms: { maxItems: 8, policy: { maxLength: 128, pattern: publicIdentifierPattern } },
};

function safeText(value: unknown, policy: TextPolicy) {
  if (typeof value !== "string" || value !== value.trim() || !value) return false;
  if (value.length < (policy.minLength ?? 1) || value.length > policy.maxLength) return false;
  if ((policy.multiline ? unsafeMultilineControlPattern : unsafeSingleLineControlPattern).test(value)) return false;
  if (placeholderPattern.test(value)) return false;
  if (policy.allowed && !policy.allowed.has(value)) return false;
  if (policy.pattern && !policy.pattern.test(value)) return false;
  if (policy.rejectIdentifierProse && (identifierAnnotationPattern.test(value) || directionProsePattern.test(value))) return false;
  return true;
}

export function isSafePublicText(value: unknown, field: PublicTextField, optional = false) {
  return optional && (value === null || value === "") ? true : safeText(value, textPolicies[field]);
}

export function isSafePublicList(value: unknown, field: PublicListField) {
  if (!Array.isArray(value) || value.length > listPolicies[field].maxItems || !value.every((item) => typeof item === "string")) return false;
  const entries = value as string[];
  return new Set(entries).size === entries.length && entries.every((entry) => safeText(entry, listPolicies[field].policy));
}
