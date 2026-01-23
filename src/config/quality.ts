export const HIGH_QUALITY_DOMAINS = [
  'crinacle.squig.link',
  'earphonesarchive.squig.link',
  'sai.squig.link'
];

export function isHighQualityDomain(domain: string): boolean {
  return HIGH_QUALITY_DOMAINS.includes(domain);
}
