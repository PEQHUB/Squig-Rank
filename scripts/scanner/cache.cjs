/**
 * Cache Module
 * Handles unified cache storage with hash-based change detection
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const config = require('./config.cjs');

// ============================================================================
// CACHE INDEX MANAGEMENT
// ============================================================================

/**
 * Cache Index Schema:
 * {
 *   version: 2,
 *   lastScan: ISO timestamp,
 *   entries: {
 *     "subdomain::fileName": {
 *       hash: string,        // SHA-256 of measurement content
 *       name: string,        // Display name
 *       price: number|null,
 *       quality: "high"|"low",
 *       type: "iem"|"headphone",
 *       rig: "711"|"5128",
 *       pinna: string|null,
 *       lastSeen: ISO date
 *     }
 *   }
 * }
 */

function ensureDirs() {
  if (!fs.existsSync(config.CACHE_DIR)) {
    fs.mkdirSync(config.CACHE_DIR, { recursive: true });
  }
  if (!fs.existsSync(config.MEASUREMENTS_DIR)) {
    fs.mkdirSync(config.MEASUREMENTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(config.DATA_DIR)) {
    fs.mkdirSync(config.DATA_DIR, { recursive: true });
  }
}

function loadCacheIndex() {
  ensureDirs();
  try {
    if (fs.existsSync(config.CACHE_INDEX_PATH)) {
      const data = JSON.parse(fs.readFileSync(config.CACHE_INDEX_PATH, 'utf-8'));
      // Migration: ensure version 2 schema
      if (!data.version || data.version < 2) {
        console.log('Migrating cache index to version 2...');
        return { version: 2, lastScan: null, entries: data.entries || {} };
      }
      return data;
    }
  } catch (e) {
    console.warn('Could not load cache index, starting fresh:', e.message);
  }
  return { version: 2, lastScan: null, entries: {} };
}

function saveCacheIndex(index) {
  ensureDirs();
  index.lastScan = new Date().toISOString();
  fs.writeFileSync(config.CACHE_INDEX_PATH, JSON.stringify(index, null, 2));
}

// ============================================================================
// DOMAIN HASH TRACKING
// ============================================================================

/**
 * Domain Hash Schema:
 * {
 *   "subdomain": {
 *     hash: string,           // SHA-256 of normalized phone book data
 *     lastChecked: ISO timestamp,
 *     entryCount: number
 *   }
 * }
 */

function loadDomainHashes() {
  ensureDirs();
  try {
    if (fs.existsSync(config.DOMAINS_HASH_PATH)) {
      return JSON.parse(fs.readFileSync(config.DOMAINS_HASH_PATH, 'utf-8'));
    }
  } catch (e) {
    console.warn('Could not load domain hashes, starting fresh');
  }
  return {};
}

function saveDomainHashes(hashes) {
  ensureDirs();
  fs.writeFileSync(config.DOMAINS_HASH_PATH, JSON.stringify(hashes, null, 2));
}

/**
 * Compute hash of phone book content (normalized to avoid formatting differences)
 * Only hashes the relevant fields to detect actual content changes
 */
function computePhoneBookHash(phoneBook) {
  const normalized = phoneBook.map(brand => ({
    name: brand.name,
    phones: (brand.phones || []).map(p => ({
      name: p.name,
      file: Array.isArray(p.file) ? p.file[0] : p.file,
      price: p.price
    })).sort((a, b) => (a.file || '').localeCompare(b.file || ''))
  })).sort((a, b) => a.name.localeCompare(b.name));
  
  const content = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

// ============================================================================
// MEASUREMENT CACHE
// ============================================================================

function getEntryKey(subdomain, fileName) {
  return `${subdomain}::${fileName}`;
}

function getMeasurementPath(hash) {
  return path.join(config.MEASUREMENTS_DIR, `${hash}.bin`);
}

/**
 * Compute hash of measurement content
 */
function computeMeasurementHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
}

/**
 * Check if measurement exists in cache
 */
function hasMeasurement(hash) {
  return fs.existsSync(getMeasurementPath(hash));
}

/**
 * Save measurement to cache (gzipped)
 */
function saveMeasurement(hash, text) {
  ensureDirs();
  const compressed = zlib.gzipSync(text);
  fs.writeFileSync(getMeasurementPath(hash), compressed);
}

/**
 * Load measurement from cache
 */
function loadMeasurement(hash) {
  const filePath = getMeasurementPath(hash);
  if (!fs.existsSync(filePath)) return null;
  
  try {
    const compressed = fs.readFileSync(filePath);
    return zlib.gunzipSync(compressed).toString('utf-8');
  } catch (e) {
    console.warn(`Failed to load measurement ${hash}:`, e.message);
    return null;
  }
}

/**
 * Get all cached entry keys
 */
function getCachedEntryKeys(index) {
  return new Set(Object.keys(index.entries));
}

/**
 * Update cache entry
 */
function updateCacheEntry(index, key, entryData) {
  index.entries[key] = {
    ...index.entries[key],
    ...entryData,
    lastSeen: new Date().toISOString().split('T')[0]
  };
}

// ============================================================================
// CHECKPOINT MANAGEMENT (for resume capability)
// ============================================================================

function saveCheckpoint(data) {
  ensureDirs();
  fs.writeFileSync(config.CHECKPOINT_PATH, JSON.stringify({
    ...data,
    savedAt: new Date().toISOString()
  }, null, 2));
}

function loadCheckpoint() {
  try {
    if (fs.existsSync(config.CHECKPOINT_PATH)) {
      return JSON.parse(fs.readFileSync(config.CHECKPOINT_PATH, 'utf-8'));
    }
  } catch (e) {
    console.warn('Could not load checkpoint');
  }
  return null;
}

function clearCheckpoint() {
  if (fs.existsSync(config.CHECKPOINT_PATH)) {
    fs.unlinkSync(config.CHECKPOINT_PATH);
  }
}

// ============================================================================
// CACHE STATISTICS
// ============================================================================

function getCacheStats(index) {
  const entries = Object.values(index.entries);
  return {
    totalEntries: entries.length,
    iems: entries.filter(e => e.type === 'iem').length,
    headphones: entries.filter(e => e.type === 'headphone').length,
    highQuality: entries.filter(e => e.quality === 'high').length,
    rig711: entries.filter(e => e.rig === '711').length,
    rig5128: entries.filter(e => e.rig === '5128').length,
    lastScan: index.lastScan
  };
}

// ============================================================================
// LEGACY CACHE MIGRATION
// ============================================================================

/**
 * Migrate old internal cache (public/lib/cache) to new unified cache
 */
function migrateOldCache(index) {
  const oldRegistryPath = path.join(config.ROOT_DIR, 'public', 'lib', 'registry.json');
  const oldCacheDir = path.join(config.ROOT_DIR, 'public', 'lib', 'cache');
  
  if (!fs.existsSync(oldRegistryPath)) {
    return { migrated: 0, skipped: 0 };
  }
  
  console.log('Migrating legacy cache...');
  
  const registry = JSON.parse(fs.readFileSync(oldRegistryPath, 'utf-8'));
  let migrated = 0;
  let skipped = 0;
  
  for (const [oldHash, info] of Object.entries(registry)) {
    const oldBinPath = path.join(oldCacheDir, `${oldHash}.bin`);
    if (!fs.existsSync(oldBinPath)) {
      skipped++;
      continue;
    }
    
    try {
      // Read old bin file (already gzipped)
      const compressed = fs.readFileSync(oldBinPath);
      const text = zlib.gunzipSync(compressed).toString('utf-8');
      
      // Compute new hash
      const newHash = computeMeasurementHash(text);
      const key = getEntryKey(info.s, info.u || oldHash);
      
      // Save to new location if not already there
      if (!hasMeasurement(newHash)) {
        saveMeasurement(newHash, text);
      }
      
      // Update index
      if (!index.entries[key]) {
        index.entries[key] = {
          hash: newHash,
          name: info.n,
          price: null,
          quality: 'high',
          type: info.t === 'hp' ? 'headphone' : 'iem',
          rig: '711',
          pinna: null,
          lastSeen: new Date().toISOString().split('T')[0]
        };
        migrated++;
      } else {
        skipped++;
      }
    } catch (e) {
      console.warn(`Failed to migrate ${oldHash}:`, e.message);
      skipped++;
    }
  }
  
  console.log(`Migration complete: ${migrated} migrated, ${skipped} skipped`);
  return { migrated, skipped };
}

module.exports = {
  // Cache index
  loadCacheIndex,
  saveCacheIndex,
  getCacheStats,
  
  // Domain hashes
  loadDomainHashes,
  saveDomainHashes,
  computePhoneBookHash,
  
  // Measurements
  getEntryKey,
  getMeasurementPath,
  computeMeasurementHash,
  hasMeasurement,
  saveMeasurement,
  loadMeasurement,
  getCachedEntryKeys,
  updateCacheEntry,
  
  // Checkpoint
  saveCheckpoint,
  loadCheckpoint,
  clearCheckpoint,
  
  // Migration
  migrateOldCache,
  
  // Utils
  ensureDirs
};
