import { SQUIGLINK_DOMAINS } from '../config/domains';
import { isHighQualityDomain } from '../config/quality';
import type { IEM, ErrorEntry } from '../types';

async function scanAllDomains(): Promise<IEM[]> {
  const allIEMs: IEM[] = [];
  const errorLog: ErrorEntry[] = [];

  const domainPromises = SQUIGLINK_DOMAINS.map(async (domain) => {
    try {
      const domainIEMs = await scanDomain(domain);
      return { success: true, data: domainIEMs, domain };
    } catch (error: any) {
      errorLog.push({
        domain,
        error: error.message || 'Unknown error',
        timestamp: new Date().toISOString()
      });
      return { success: false, data: [], domain };
    }
  });

  const results = await Promise.all(domainPromises);

  results.forEach(result => {
    if (result.success) {
      const quality = isHighQualityDomain(result.domain) ? 'high' : 'low';
      const iemsWithQuality = result.data.map(iem => ({
        ...iem,
        sourceDomain: result.domain,
        quality
      }));
      allIEMs.push(...iemsWithQuality);
    }
  });

  const uniqueIEMs = removeDuplicates(allIEMs);
  await saveErrorLog(errorLog);

  return uniqueIEMs;
}

async function scanDomain(domain: string): Promise<any[]> {
  const response = await fetch(`https://${domain}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${domain}: ${response.status}`);
  }

  const html = await response.text();

  const iems = parseIEMsFromHTML(html, domain);

  return iems;
}

function parseIEMsFromHTML(html: string, domain: string): any[] {
  const iems: any[] = [];

  const regex = /data-iem="([^"]+)"\s*data-frequencies="([^"]+)"/g;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const name = match[1];
    const frequenciesStr = match[2];

    const frequencies: number[] = [];
    const db: number[] = [];

    const freqDbPairs = frequenciesStr.split(',');
    for (const pair of freqDbPairs) {
      const [freq, dbVal] = pair.split(':');
      if (freq && dbVal) {
        frequencies.push(parseFloat(freq));
        db.push(parseFloat(dbVal));
      }
    }

    if (frequencies.length > 0) {
      iems.push({
        id: `${domain}-${name.replace(/\s+/g, '-')}`,
        name,
        frequencyData: { frequencies, db }
      });
    }
  }

  return iems;
}

function removeDuplicates(iems: IEM[]): IEM[] {
  const seen = new Set<string>();
  return iems.filter(iem => {
    const key = iem.name.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function saveErrorLog(errorLog: ErrorEntry[]): Promise<void> {
  try {
    const existingLog = await fetch('/api/errors').then(res => res.json()).catch(() => ({ errors: [] }));

    const updatedLog = {
      errors: [...existingLog.errors, ...errorLog],
      lastUpdated: new Date().toISOString()
    };

    console.log('Error log saved:', updatedLog);
  } catch (error) {
    console.error('Failed to save error log:', error);
  }
}

export { scanAllDomains };
