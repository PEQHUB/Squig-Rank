// Squig.link domain configuration
// Each domain hosts phone_book.json and data/{filename} L.txt files

export interface DomainConfig {
  domain: string;
  quality: 'high' | 'low';
  // Some domains may have different data directory structures
  dataDir?: string;
}

export const SQUIGLINK_DOMAINS: DomainConfig[] = [
  // High quality sources - trusted measurement rigs and methodology
  { domain: 'crinacle.squig.link', quality: 'high' },
  { domain: 'earphonesarchive.squig.link', quality: 'high' },
  { domain: 'sai.squig.link', quality: 'high' },
  
  // Standard quality sources
  { domain: 'squig.link', quality: 'low' },
  { domain: 'superreview.squig.link', quality: 'low' },
  { domain: 'bryaudio.squig.link', quality: 'low' },
  { domain: 'afteraudio.squig.link', quality: 'low' },
  { domain: 'bedrockreviews.squig.link', quality: 'low' },
  { domain: 'bregar.squig.link', quality: 'low' },
  { domain: 'eliseaudio.squig.link', quality: 'low' },
  { domain: 'eplv.squig.link', quality: 'low' },
  { domain: 'hiendportable.squig.link', quality: 'low' },
  { domain: 'paulwasabi.squig.link', quality: 'low' },
  { domain: 'precogvision.squig.link', quality: 'low' },
  { domain: 'recode.squig.link', quality: 'low' },
  { domain: 'rikudougoku.squig.link', quality: 'low' },
  { domain: 'tgx78.squig.link', quality: 'low' },
  { domain: 'vortexreviews.squig.link', quality: 'low' },
  { domain: 'vsg.squig.link', quality: 'low' },
];

export function isHighQualityDomain(domain: string): boolean {
  const config = SQUIGLINK_DOMAINS.find(d => d.domain === domain);
  return config?.quality === 'high';
}
