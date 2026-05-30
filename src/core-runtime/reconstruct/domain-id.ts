export const RECONSTRUCT_DOMAIN_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const RECONSTRUCT_DOMAIN_ID_GRAMMAR_DESCRIPTION =
  "lowercase letters or digits separated by single hyphens";

export function isReconstructDomainId(value: string): boolean {
  return RECONSTRUCT_DOMAIN_ID_PATTERN.test(value);
}

export function assertReconstructDomainId(
  value: string,
  label = "domain",
): void {
  if (isReconstructDomainId(value)) return;
  throw new Error(
    `${label} must use ${RECONSTRUCT_DOMAIN_ID_GRAMMAR_DESCRIPTION}: ${value}`,
  );
}
