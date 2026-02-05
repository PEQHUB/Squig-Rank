/**
 * Domain Scanner Module
 * Handles phone book fetching and measurement collection for domains
 */

const config = require('./config.cjs');
const network = require('./network.cjs');
const cache = require('./cache.cjs');
const classifier = require('./classifier.cjs');
const frequency = require('./frequency.cjs');

// ============================================================================
// PHONE BOOK FETCHING
// ============================================================================

/**
 * Get the phone book URL for a subdomain
 */
function getPhoneBookUrl(subdomain) {
  if (config.OVERRIDES[subdomain]) {
    return config.OVERRIDES[subdomain];
  }
  return null; // Will need to probe
}

/**
 * Get the base data URL for a subdomain
 */
function getBaseUrl(subdomain, path = '') {
  if (config.OVERRIDES[subdomain]) {
    return config.OVERRIDES[subdomain].replace('phone_book.json', '');
  }
  const p = path ? `${path}/` : '';
  return `https://${subdomain}.squig.link/${p}data/`;
}

/**
 * Probe and fetch phone book for a subdomain
 * Returns { phoneBook, baseUrl } or null if not found
 */
async function fetchPhoneBook(subdomain) {
  // 1. Check Overrides
  if (config.OVERRIDES[subdomain]) {
    const url = config.OVERRIDES[subdomain];
    const phoneBook = await network.fetchJson(url);
    if (phoneBook) {
      return { 
        phoneBook, 
        baseUrl: url.replace('phone_book.json', '') 
      };
    }
  }
  
  // 2. Probe standard paths
  const paths = ["", "iems", "headphones", "earbuds", "5128", "headphones/5128"];
  for (const path of paths) {
    const p = path ? `${path}/` : '';
    const url = `https://${subdomain}.squig.link/${p}data/phone_book.json`;
    
    const phoneBook = await network.fetchJson(url);
    if (phoneBook) {
      return {
        phoneBook,
        baseUrl: `https://${subdomain}.squig.link/${p}data/`
      };
    }
  }
  
  return null;
}

// ============================================================================
// PHONE EXTRACTION
// ============================================================================

/**
 * Extract phone entries from phone book
 */
function extractPhones(phoneBook, subdomain) {
  const phones = [];
  const seenFiles = new Set();
  
  for (const brand of phoneBook) {
    if (!brand.phones) continue;
    
    for (const phone of brand.phones) {
      const fileName = Array.isArray(phone.file) ? phone.file[0] : phone.file;
      if (!fileName) continue;
      
      // Deduplicate by filename within this subdomain
      if (seenFiles.has(fileName)) continue;
      seenFiles.add(fileName);
      
      // Classify the phone
      const classification = classifier.classifyPhone(brand.name, phone.name, subdomain);
      if (!classification.include) continue;
      
      const rig = classifier.detectRig(subdomain, fileName, classification.displayName);
      
      // For headphones: if measured on 5128 rig, pinna should also be 5128
      let pinna = classification.pinna;
      if (classification.type === 'headphone' && rig === '5128') {
        pinna = '5128';
      }
      
      phones.push({
        subdomain,
        brandName: brand.name,
        phoneName: phone.name,
        displayName: classification.displayName,
        fileName,
        price: network.parsePrice(phone.price),
        quality: config.HIGH_QUALITY_DOMAINS.includes(subdomain) ? 'high' : 'low',
        type: classification.type,
        rig,
        pinna
      });
    }
  }
  
  return phones;
}

// ============================================================================
// MEASUREMENT FETCHING
// ============================================================================

/**
 * Average multiple curves together by iteratively averaging pairs
 */
function averageMultipleCurves(curves) {
  if (curves.length === 0) return null;
  if (curves.length === 1) return curves[0];
  let result = curves[0];
  for (let i = 1; i < curves.length; i++) {
    // Weighted running average: weight previous result by i, new curve by 1
    const combined = frequency.averageCurves(result, curves[i]);
    // Correct the simple average to a weighted average
    const weight = i / (i + 1);
    combined.db = combined.db.map((db, j) => {
      return result.db[j] * weight + (db * 2 - result.db[j]) * (1 - weight);
    });
    result = combined;
  }
  return result;
}

/**
 * Fetch measurement via encrypted d-c.php proxy (for graph.hangout.audio)
 * Supports single-sample IEMs ({file} L.txt / {file} R.txt) and 
 * multi-sample headphones ({file} L1.txt, {file} L2.txt, ... {file} R1.txt, ...)
 * 
 * @param {string} toolPath - e.g. "iem/5128/" or "headphones/"
 * @param {string} fileName - e.g. "Daybreak" or "K52"
 * @param {number} numSamples - samples per channel (1 for IEMs, 3 for headphones)
 */
async function fetchMeasurementEncrypted(toolPath, fileName, numSamples) {
  const dirPath = `${toolPath}data/`;
  
  if (numSamples > 1) {
    // Multi-sample mode (headphones): fetch {file} L1.txt .. L{n}.txt and R1..R{n}
    const fetches = [];
    for (let s = 1; s <= numSamples; s++) {
      fetches.push(network.fetchEncrypted(`${dirPath}${fileName} L${s}.txt`).catch(() => null));
      fetches.push(network.fetchEncrypted(`${dirPath}${fileName} R${s}.txt`).catch(() => null));
    }
    
    try {
      const results = await Promise.all(fetches);
      const allCurves = [];
      
      for (const text of results) {
        if (text) {
          const curve = frequency.parseFrequencyResponse(text);
          if (curve.frequencies.length > 0) allCurves.push(curve);
        }
      }
      
      if (allCurves.length > 0) {
        const averaged = averageMultipleCurves(allCurves);
        const avgText = averaged.frequencies.map((f, i) => 
          `${f}\t${averaged.db[i]}`
        ).join('\n');
        return { text: avgText, curve: averaged };
      }
    } catch (e) {
      // Fall through to single-file attempt
    }
  } else {
    // Single-sample mode (IEMs): try {file} L.txt + {file} R.txt
    const filePathL = `${dirPath}${fileName} L.txt`;
    const filePathR = `${dirPath}${fileName} R.txt`;
    
    try {
      const [respL, respR] = await Promise.all([
        network.fetchEncrypted(filePathL).catch(() => null),
        network.fetchEncrypted(filePathR).catch(() => null)
      ]);

      if (respL && respR) {
        const curveL = frequency.parseFrequencyResponse(respL);
        const curveR = frequency.parseFrequencyResponse(respR);
        
        if (curveL.frequencies.length > 0 && curveR.frequencies.length > 0) {
          const averaged = frequency.averageCurves(curveL, curveR);
          const avgText = averaged.frequencies.map((f, i) => 
            `${f}\t${averaged.db[i]}`
          ).join('\n');
          return { text: avgText, curve: averaged };
        }
        if (curveL.frequencies.length > 0) return { text: respL, curve: curveL };
        if (curveR.frequencies.length > 0) return { text: respR, curve: curveR };
      }

      if (respL) {
        const curve = frequency.parseFrequencyResponse(respL);
        if (curve.frequencies.length > 0) return { text: respL, curve };
      }
      
      if (respR) {
        const curve = frequency.parseFrequencyResponse(respR);
        if (curve.frequencies.length > 0) return { text: respR, curve };
      }
    } catch (e) {
      // Fall through to single-file attempt
    }
  }
  
  // Fallback: try without channel suffix
  const filePath = `${dirPath}${fileName}.txt`;
  try {
    const text = await network.fetchEncrypted(filePath);
    if (text) {
      const curve = frequency.parseFrequencyResponse(text);
      if (curve.frequencies.length > 0) return { text, curve };
    }
  } catch (e) {}
  
  return null;
}

/**
 * Fetch measurement for a single phone
 * Tries L+R channels, then single file
 */
async function fetchMeasurement(baseUrl, fileName, subdomain) {
  // Use encrypted fetch for domains that require it
  const encryptedConfig = config.ENCRYPTED_DOMAINS[subdomain];
  if (encryptedConfig) {
    return fetchMeasurementEncrypted(encryptedConfig.toolPath, fileName, encryptedConfig.numSamples);
  }

  const encodedFile = encodeURIComponent(fileName);
  
  // Try L and R channels
  const urlL = `${baseUrl}${encodedFile}%20L.txt`;
  const urlR = `${baseUrl}${encodedFile}%20R.txt`;
  
  try {
    const [respL, respR] = await Promise.all([
      network.fetchText(urlL).catch(() => null),
      network.fetchText(urlR).catch(() => null)
    ]);

    // If both exist, average them
    if (respL && respR) {
      const curveL = frequency.parseFrequencyResponse(respL);
      const curveR = frequency.parseFrequencyResponse(respR);
      
      if (curveL.frequencies.length > 0 && curveR.frequencies.length > 0) {
        const averaged = frequency.averageCurves(curveL, curveR);
        // Reconstruct text from averaged curve
        const avgText = averaged.frequencies.map((f, i) => 
          `${f}\t${averaged.db[i]}`
        ).join('\n');
        return { text: avgText, curve: averaged };
      }
      if (curveL.frequencies.length > 0) return { text: respL, curve: curveL };
      if (curveR.frequencies.length > 0) return { text: respR, curve: curveR };
    }

    // If only L exists
    if (respL) {
      const curve = frequency.parseFrequencyResponse(respL);
      if (curve.frequencies.length > 0) return { text: respL, curve };
    }
    
    // If only R exists
    if (respR) {
      const curve = frequency.parseFrequencyResponse(respR);
      if (curve.frequencies.length > 0) return { text: respR, curve };
    }
  } catch (e) {
    // Continue to try without suffix
  }
  
  // Try without suffix
  const url = `${baseUrl}${encodedFile}.txt`;
  try {
    const text = await network.fetchText(url);
    if (text) {
      const curve = frequency.parseFrequencyResponse(text);
      if (curve.frequencies.length > 0) return { text, curve };
    }
  } catch (e) {}
  
  return null;
}

// ============================================================================
// DOMAIN SCANNING
// ============================================================================

/**
 * Scan a single domain for changes
 * Returns scan result with statistics
 */
async function scanDomain(subdomain, cacheIndex, domainHashes, options = {}) {
  const { forceRescan = false, verbose = false } = options;
  const log = verbose ? console.log : () => {};
  
  const result = {
    subdomain,
    success: false,
    phoneBookChanged: false,
    phonesFound: 0,
    newMeasurements: 0,
    cachedMeasurements: 0,
    failedMeasurements: 0,
    phones: [],
    error: null
  };
  
  // 1. Fetch phone book
  const pbResult = await fetchPhoneBook(subdomain);
  if (!pbResult) {
    result.error = 'Failed to fetch phone_book.json';
    return result;
  }
  
  const { phoneBook, baseUrl } = pbResult;
  
  // 2. Check if phone book changed
  const newHash = cache.computePhoneBookHash(phoneBook);
  const oldHashInfo = domainHashes[subdomain];
  
  if (!forceRescan && oldHashInfo && oldHashInfo.hash === newHash) {
    // Phone book unchanged - mark all existing entries as seen
    log(`  ${subdomain}: unchanged (hash: ${newHash.substring(0, 8)})`);
    result.success = true;
    result.phoneBookChanged = false;
    
    // Update lastChecked
    domainHashes[subdomain] = {
      ...oldHashInfo,
      lastChecked: new Date().toISOString()
    };
    
    return result;
  }
  
  log(`  ${subdomain}: scanning (hash: ${newHash.substring(0, 8)})`);
  result.phoneBookChanged = true;
  
  // 3. Extract phones
  const phones = extractPhones(phoneBook, subdomain);
  result.phonesFound = phones.length;
  
  // 4. Fetch measurements for new/changed entries
  for (const phone of phones) {
    const key = cache.getEntryKey(subdomain, phone.fileName);
    const existingEntry = cacheIndex.entries[key];
    
    // Check if we already have this measurement cached
    if (existingEntry && cache.hasMeasurement(existingEntry.hash)) {
      // Load from cache
      const text = cache.loadMeasurement(existingEntry.hash);
      if (text) {
        const curve = frequency.parseFrequencyResponse(text);
        if (curve.frequencies.length >= 10) {
          result.phones.push({
            ...phone,
            hash: existingEntry.hash,
            frequencyData: curve
          });
          result.cachedMeasurements++;
          
          // Update entry metadata (price, quality may have changed)
          cache.updateCacheEntry(cacheIndex, key, {
            hash: existingEntry.hash,
            name: phone.displayName,
            price: phone.price,
            quality: phone.quality,
            type: phone.type,
            rig: phone.rig,
            pinna: phone.pinna
          });
          
          continue;
        }
      }
    }
    
    // Fetch new measurement
    const measurement = await fetchMeasurement(baseUrl, phone.fileName, subdomain);
    if (measurement && measurement.curve.frequencies.length >= 10) {
      const hash = cache.computeMeasurementHash(measurement.text);
      
      // Save to cache
      cache.saveMeasurement(hash, measurement.text);
      
      // Update index
      cache.updateCacheEntry(cacheIndex, key, {
        hash,
        name: phone.displayName,
        price: phone.price,
        quality: phone.quality,
        type: phone.type,
        rig: phone.rig,
        pinna: phone.pinna
      });
      
      result.phones.push({
        ...phone,
        hash,
        frequencyData: measurement.curve
      });
      result.newMeasurements++;
    } else {
      result.failedMeasurements++;
    }
  }
  
  // 5. Update domain hash
  domainHashes[subdomain] = {
    hash: newHash,
    lastChecked: new Date().toISOString(),
    entryCount: phones.length
  };
  
  result.success = true;
  return result;
}

/**
 * Scan multiple domains in parallel batches
 */
async function scanDomains(subdomains, cacheIndex, domainHashes, options = {}) {
  const { 
    concurrency = config.CONCURRENT_DOMAINS, 
    forceRescan = false,
    onProgress = null,
    onDomainComplete = null
  } = options;
  
  const results = [];
  let completed = 0;
  
  for (let i = 0; i < subdomains.length; i += concurrency) {
    const batch = subdomains.slice(i, i + concurrency);
    const batchNum = Math.floor(i / concurrency) + 1;
    const totalBatches = Math.ceil(subdomains.length / concurrency);
    
    console.log(`\n--- Batch ${batchNum}/${totalBatches} (${batch.length} domains) ---`);
    
    const batchResults = await Promise.all(
      batch.map(async (subdomain) => {
        const result = await scanDomain(subdomain, cacheIndex, domainHashes, { 
          forceRescan, 
          verbose: true 
        });
        
        completed++;
        if (onProgress) {
          onProgress(completed, subdomains.length, subdomain);
        }
        if (onDomainComplete) {
          onDomainComplete(result);
        }
        
        return result;
      })
    );
    
    results.push(...batchResults);
    
    // Save progress after each batch
    cache.saveCacheIndex(cacheIndex);
    cache.saveDomainHashes(domainHashes);
  }
  
  return results;
}

/**
 * Get all phones from cache index
 * Used for output generation without re-scanning
 */
function loadPhonesFromCache(cacheIndex) {
  const phones = [];
  
  for (const [key, entry] of Object.entries(cacheIndex.entries)) {
    const text = cache.loadMeasurement(entry.hash);
    if (!text) continue;
    
    const curve = frequency.parseFrequencyResponse(text);
    if (curve.frequencies.length < 10) continue;
    
    const [subdomain, fileName] = key.split('::');
    
    // Recompute pinna for headphones to ensure correct assignment
    // (handles migration from old cache entries with incorrect pinna values)
    let pinna = entry.pinna;
    if (entry.type === 'headphone') {
      // If measured on 5128 rig, pinna should be 5128
      if (entry.rig === '5128') {
        pinna = '5128';
      } else if (!pinna) {
        // Fallback to detectPinna for headphones with null pinna
        pinna = classifier.detectPinna(entry.name, subdomain);
      }
    }
    
    phones.push({
      subdomain,
      fileName,
      displayName: entry.name,
      price: entry.price,
      quality: entry.quality,
      type: entry.type,
      rig: entry.rig,
      pinna,
      hash: entry.hash,
      firstSeen: entry.firstSeen,
      lastSeen: entry.lastSeen,
      frequencyData: curve
    });
  }
  
  return phones;
}

module.exports = {
  fetchPhoneBook,
  extractPhones,
  fetchMeasurement,
  scanDomain,
  scanDomains,
  loadPhonesFromCache
};
