/**
 * Output Module
 * Generates results and curve files for the frontend
 */

const fs = require('fs');
const config = require('./config.cjs');
const cache = require('./cache.cjs');
const frequency = require('./frequency.cjs');
const targets = require('./targets.cjs');

// ============================================================================
// SCORING
// ============================================================================

/**
 * Score all phones against target curves
 * @param {Array} phones - Array of phone objects with frequency data
 * @param {Array} targetGroups - Array of target groups
 * @param {string} type - 'iem' or 'headphone'
 * @param {string|null} pinnaFilter - For headphones: 'kb5' or '5128' to filter by pinna
 */
function scorePhones(phones, targetGroups, type, pinnaFilter = null) {
  const results = [];
  const desiredType = type;
  
  const label = pinnaFilter ? `${type}s (${pinnaFilter})` : `${type}s`;
  console.log(`\n--- Scoring ${label} (${phones.length}) ---`);
  
  for (const group of targetGroups) {
    if (group.type && group.type !== desiredType) continue;

    // For headphones with pinna filter, only process targets matching the pinna
    if (desiredType === 'headphone' && pinnaFilter) {
      // Check if this target has a variant for the requested pinna
      const targetData = group.variants[pinnaFilter];
      if (!targetData) continue;

      console.log(`  Scoring: ${group.name} [${pinnaFilter}]`);
      
      const scored = phones
        .filter(phone => phone.frequencyData && phone.frequencyData.frequencies.length >= 10)
        .filter(phone => phone.type === 'headphone')
        .filter(phone => phone.pinna === pinnaFilter)
        .map(phone => {
          const ppiResult = frequency.calculatePPI(phone.frequencyData, targetData.curve);
          return {
            id: cache.getEntryKey(phone.subdomain, phone.fileName),
            name: phone.displayName,
            similarity: ppiResult.ppi,
            stdev: ppiResult.stdev,
            slope: ppiResult.slope,
            avgError: ppiResult.avgError,
            price: phone.price,
            quality: phone.quality,
            sourceDomain: `${phone.subdomain}.squig.link`,
            type: phone.type,
            rig: phone.pinna === '5128' ? '5128' : '711',
            targetVariant: pinnaFilter,
            pinna: phone.pinna
          };
        })
        .sort((a, b) => b.similarity - a.similarity);

      results.push({ 
        targetName: group.name,
        targetFiles: { [pinnaFilter]: targetData.fileName },
        scoringMethod: 'ppi', 
        ranked: scored 
      });
      continue;
    }

    // Standard logic for IEMs
    console.log(`  Scoring: ${group.name}`);
    
    const scored = phones
      .filter(phone => phone.frequencyData && phone.frequencyData.frequencies.length >= 10)
      .filter(phone => phone.type === desiredType)
      .map(phone => {
        let targetVariant = 'default';
        let targetData = null;

        if (desiredType === 'iem') {
          const is5128Rig = config.RIG_5128_DOMAINS.includes(phone.subdomain) || 
                            phone.rig === '5128';
          
          if (is5128Rig) {
            targetVariant = '5128';
            targetData = group.variants['5128'];
          } else {
            targetVariant = '711';
            targetData = group.variants['711'];
          }
        } else {
          targetData = group.variants['default'] || Object.values(group.variants)[0];
        }

        if (!targetData) return null;

        const ppiResult = frequency.calculatePPI(phone.frequencyData, targetData.curve);
        
        return {
          id: cache.getEntryKey(phone.subdomain, phone.fileName),
          name: phone.displayName,
          similarity: ppiResult.ppi,
          stdev: ppiResult.stdev,
          slope: ppiResult.slope,
          avgError: ppiResult.avgError,
          price: phone.price,
          quality: phone.quality,
          sourceDomain: `${phone.subdomain}.squig.link`,
          type: phone.type,
          rig: phone.rig,
          targetVariant,
          pinna: phone.pinna
        };
      })
      .filter(item => item !== null)
      .sort((a, b) => b.similarity - a.similarity);

    results.push({ 
      targetName: group.name,
      targetFiles: Object.entries(group.variants).reduce((acc, [k, v]) => {
        acc[k] = v.fileName;
        return acc;
      }, {}),
      scoringMethod: 'ppi', 
      ranked: scored 
    });
  }
  
  return results;
}

// ============================================================================
// RESULTS OUTPUT
// ============================================================================

/**
 * Generate results.json files for IEMs and Headphones (split by pinna)
 */
function generateResults(phones, targetGroups) {
  cache.ensureDirs();
  
  // Split phones by type
  const iems = phones.filter(p => p.type === 'iem');
  const headphones = phones.filter(p => p.type === 'headphone');
  const hpKb5 = headphones.filter(p => p.pinna === 'kb5');
  const hp5128 = headphones.filter(p => p.pinna === '5128');
  
  // Score IEMs
  const resultsIEM = scorePhones(iems, targetGroups, 'iem');
  
  // Score Headphones - split by pinna type
  const resultsHpKb5 = scorePhones(headphones, targetGroups, 'headphone', 'kb5');
  const resultsHp5128 = scorePhones(headphones, targetGroups, 'headphone', '5128');
  
  // Generate IEM output
  const outputIEM = {
    generatedAt: new Date().toISOString(),
    totalIEMs: iems.length,
    domainsScanned: config.SUBDOMAINS.length,
    results: resultsIEM
  };
  
  // Generate HP KB5 (KEMAR 711) output
  const outputHpKb5 = {
    generatedAt: new Date().toISOString(),
    totalIEMs: hpKb5.length,
    domainsScanned: config.SUBDOMAINS.length,
    rigType: 'kb5',
    results: resultsHpKb5
  };
  
  // Generate HP 5128 (B&K 5128) output
  const outputHp5128 = {
    generatedAt: new Date().toISOString(),
    totalIEMs: hp5128.length,
    domainsScanned: config.SUBDOMAINS.length,
    rigType: '5128',
    results: resultsHp5128
  };
  
  fs.writeFileSync(config.RESULTS_IEM_PATH, JSON.stringify(outputIEM, null, 2));
  fs.writeFileSync(config.RESULTS_HP_KB5_PATH, JSON.stringify(outputHpKb5, null, 2));
  fs.writeFileSync(config.RESULTS_HP_5128_PATH, JSON.stringify(outputHp5128, null, 2));
  
  console.log(`\nResults saved:`);
  console.log(`  IEMs: ${config.RESULTS_IEM_PATH} (${iems.length} entries)`);
  console.log(`  Headphones KB5: ${config.RESULTS_HP_KB5_PATH} (${hpKb5.length} entries)`);
  console.log(`  Headphones 5128: ${config.RESULTS_HP_5128_PATH} (${hp5128.length} entries)`);
  
  return { iems: resultsIEM, headphonesKb5: resultsHpKb5, headphones5128: resultsHp5128 };
}

// ============================================================================
// CURVES OUTPUT (MessagePack)
// ============================================================================

/**
 * Generate curves.msgpack for client-side ranking
 */
async function generateCurves(phones) {
  cache.ensureDirs();
  
  // Dynamic import for ES module
  const { encode } = await import('@msgpack/msgpack');
  
  // Load compensation curves
  const compensation = targets.loadCompensation();
  
  // Build curves data structure
  const entries = [];
  
  for (const phone of phones) {
    if (!phone.frequencyData || phone.frequencyData.frequencies.length < 10) continue;
    
    const aligned = frequency.alignToR40(phone.frequencyData);
    const id = cache.getEntryKey(phone.subdomain, phone.fileName);
    
    entries.push({
      id,
      name: phone.displayName,
      db: aligned.db.map(v => Math.round(v * 100) / 100),
      type: phone.type === 'headphone' ? 1 : 0,
      quality: phone.quality === 'high' ? 1 : 0,
      price: phone.price,
      rig: phone.rig === '5128' ? 1 : 0,
      pinna: phone.pinna
    });
  }
  
  const data = {
    meta: {
      version: 2,
      frequencies: frequency.R40_FREQUENCIES,
      compensation711: compensation['711'],
      compensation5128: compensation['5128']
    },
    entries
  };
  
  // Encode to MessagePack
  const encoded = encode(data);
  fs.writeFileSync(config.CURVES_PATH, Buffer.from(encoded));
  
  const sizeMB = (fs.statSync(config.CURVES_PATH).size / 1024 / 1024).toFixed(2);
  console.log(`\nCurves saved: ${config.CURVES_PATH} (${entries.length} entries, ${sizeMB} MB)`);
  
  return entries.length;
}

/**
 * Generate curves.json as fallback for legacy/development
 */
function generateCurvesJson(phones) {
  cache.ensureDirs();
  
  const compensation = targets.loadCompensation();
  
  const curveData = {
    meta: {
      frequencies: frequency.R40_FREQUENCIES,
      compensation711: compensation['711'],
      compensation5128: compensation['5128']
    },
    curves: {}
  };
  
  for (const phone of phones) {
    if (!phone.frequencyData || phone.frequencyData.frequencies.length < 10) continue;
    
    const aligned = frequency.alignToR40(phone.frequencyData);
    const id = cache.getEntryKey(phone.subdomain, phone.fileName);
    
    curveData.curves[id] = {
      d: aligned.db.map(v => Math.round(v * 100) / 100),
      t: phone.type === 'headphone' ? 1 : 0,
      q: phone.quality === 'high' ? 1 : 0,
      p: phone.price,
      n: phone.pinna
    };
  }
  
  fs.writeFileSync(config.CURVES_JSON_PATH, JSON.stringify(curveData));
  
  const sizeMB = (fs.statSync(config.CURVES_JSON_PATH).size / 1024 / 1024).toFixed(2);
  console.log(`Curves JSON fallback: ${config.CURVES_JSON_PATH} (${sizeMB} MB)`);
  
  return Object.keys(curveData.curves).length;
}

module.exports = {
  scorePhones,
  generateResults,
  generateCurves,
  generateCurvesJson
};
