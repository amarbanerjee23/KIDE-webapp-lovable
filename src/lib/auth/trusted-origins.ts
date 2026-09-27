const DEFAULT_LOCAL_ORIGIN = "http://localhost:3000";

function normalizeOrigin(value: string): string {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported authentication origin protocol: ${parsed.protocol}`);
  }
  return parsed.origin;
}

export function resolveTrustedAuthOrigins(
  baseUrl: string,
  configuredOrigins: string | undefined,
  production: boolean,
): string[] {
  const values = [baseUrl];

  if (configuredOrigins?.trim()) {
    values.push(
      ...configuredOrigins
        .split(/[;,\n]/)
        .map((value) => value.trim())
        .filter(Boolean),
    );
  }

  if (!production) values.push(DEFAULT_LOCAL_ORIGIN);

  return [...new Set(values.map(normalizeOrigin))];
}
