function hasTrailingSlash(value: string): boolean {
  return value.endsWith("/");
}

export function normalizeStudioBaseUrl(baseUrl: string): string {
  return hasTrailingSlash(baseUrl) ? baseUrl.slice(0, -1) : baseUrl;
}

export function resolveStudioRelativeUrl(path: string, baseUrl: string): URL {
  const normalizedBaseUrl = `${normalizeStudioBaseUrl(baseUrl)}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;

  return new URL(normalizedPath, normalizedBaseUrl);
}
