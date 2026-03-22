export function createDeterministicPlaceholderSignature(
  buildId: string,
): string {
  return `placeholder-signature-${buildId}`;
}

export function createDeterministicPlaceholderKeyId(buildId: string): string {
  return `placeholder-key-${buildId}`;
}
