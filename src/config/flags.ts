/**
 * Parse a feature flag value coming from an env var (always a string) or a
 * boolean. Accepts the usual truthy/falsy spellings; anything unrecognized
 * falls back to the provided default.
 */
export function parseFlag(
  value: string | boolean | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
  if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  return fallback;
}
