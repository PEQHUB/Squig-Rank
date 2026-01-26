/**
 * Classifier Module
 * Handles IEM/Headphone/TWS classification logic
 */

const config = require('./config.cjs');

/**
 * Determine if a phone is a headphone (over-ear) based on name and domain
 * Uses a scoring system to handle ambiguous cases
 */
function isHeadphone(name, subdomain) {
  const upperName = name.toUpperCase();
  const lowerSub = subdomain.toLowerCase();
  
  let score = 0;

  // 1. Explicit OE Tags (+100)
  if (upperName.includes("(OE)") || 
      upperName.includes("(HP)") || 
      upperName.includes("OVER-EAR") || 
      upperName.includes("HEADPHONE") || 
      upperName.includes("CLOSED-BACK") || 
      upperName.includes("OPEN-BACK")) {
    score += 100;
  }

  // 2. OE Model Registry Match (+100)
  for (const model of config.OE_MODEL_REGISTRY) {
    if (upperName.includes(model)) {
      score += 100;
      break;
    }
  }

  // 3. Strictly IE Brands (-200)
  for (const brand of config.STRICTLY_IE_BRANDS) {
    if (upperName.includes(brand)) {
      score -= 200;
      break;
    }
  }

  // 4. IE Force Keywords (-200)
  for (const kw of config.IE_FORCE_KEYWORDS) {
    if (upperName.includes(kw)) {
      score -= 200;
      break;
    }
  }

  // 5. Strictly IE Domains (-150)
  if (config.STRICTLY_IE_DOMAINS.includes(lowerSub)) {
    score -= 150;
  }

  // 6. Domain-specific hints
  if (lowerSub.includes('5128') || lowerSub.includes('headphone') || lowerSub === 'crinaclehp') {
    score += 30;
  }

  return score > 0;
}

/**
 * Check if a phone is a TWS (True Wireless) device
 */
function isTWS(name) {
  const upperName = name.toUpperCase();
  for (const keyword of config.TWS_KEYWORDS) {
    if (upperName.includes(keyword.toUpperCase())) return true;
  }
  return false;
}

/**
 * Determine if a phone should be included in scanning
 */
function shouldInclude(name, subdomain) {
  return !isTWS(name);
}

/**
 * Detect the measurement rig/pinna type
 */
function detectPinna(name, subdomain) {
  const n = name.toLowerCase();
  const s = subdomain.toLowerCase();

  // 1. Explicit Domain Mapping
  if (s.includes('5128')) return '5128';
  if (s === 'sai' || s === 'kuulokenurkka' || s === 'crinaclehp') return 'kb5';
  
  // 2. Keyword Search
  if (n.includes('5128')) return '5128';
  if (n.includes('kb5') || n.includes('kb5000') || n.includes('kb5010') || n.includes('kb5011')) return 'kb5';
  
  // Default for headphones is KB5
  return 'kb5';
}

/**
 * Determine measurement rig type (711 or 5128)
 */
function detectRig(subdomain, fileName, displayName) {
  // Check domain first
  if (config.RIG_5128_DOMAINS.includes(subdomain)) return '5128';
  
  // Check filename/name for explicit markers
  if (fileName.includes('(5128)') || displayName.includes('(5128)')) return '5128';
  
  return '711';
}

/**
 * Classify a phone entry
 */
function classifyPhone(brandName, phoneName, subdomain) {
  const displayName = `${brandName} ${phoneName}`;
  
  // Filter TWS
  if (!shouldInclude(displayName, subdomain)) {
    return { include: false, reason: 'tws' };
  }
  
  const type = isHeadphone(displayName, subdomain) ? 'headphone' : 'iem';
  const pinna = type === 'headphone' ? detectPinna(displayName, subdomain) : null;
  
  return {
    include: true,
    type,
    pinna,
    displayName
  };
}

module.exports = {
  isHeadphone,
  isTWS,
  shouldInclude,
  detectPinna,
  detectRig,
  classifyPhone
};
