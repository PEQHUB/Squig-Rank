/**
 * Network Module
 * Handles HTTP fetching with timeouts, retries, and rate limiting
 */

const config = require('./config.cjs');
const { decryptAesJson } = require('./crypto.cjs');
const crypto = require('crypto');

// ============================================================================
// FETCH WITH TIMEOUT
// ============================================================================

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'SquigRank-Scanner/2.0',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate'
      }
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ============================================================================
// FETCH WITH RETRY
// ============================================================================

async function fetchWithRetry(url, timeoutMs, maxRetries = config.RETRY_ATTEMPTS) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, timeoutMs);
      return response;
    } catch (error) {
      lastError = error;
      
      // Don't retry on abort (timeout) for measurement fetches
      if (error.name === 'AbortError' && timeoutMs <= config.MEASUREMENT_TIMEOUT) {
        break;
      }
      
      // Wait before retry with exponential backoff
      if (attempt < maxRetries) {
        await sleep(config.RETRY_DELAY * Math.pow(2, attempt));
      }
    }
  }
  
  throw lastError;
}

// ============================================================================
// JSON FETCH
// ============================================================================

async function fetchJson(url, timeoutMs = config.PHONE_BOOK_TIMEOUT) {
  try {
    const response = await fetchWithRetry(url, timeoutMs);
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    return null;
  }
}

// ============================================================================
// TEXT FETCH
// ============================================================================

async function fetchText(url, timeoutMs = config.MEASUREMENT_TIMEOUT) {
  try {
    const response = await fetchWithTimeout(url, timeoutMs);
    if (!response.ok) return null;
    return await response.text();
  } catch (e) {
    return null;
  }
}

// ============================================================================
// ENCRYPTED FETCH (for graph.hangout.audio d-c.php proxy)
// ============================================================================

/**
 * Fetch measurement data via the encrypted d-c.php proxy
 * Used for graph.hangout.audio domains where direct .txt access returns 403
 * 
 * @param {string} filePath - Relative path to measurement, e.g. "iem/5128/data/Daybreak L.txt"
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {string|null} Decrypted measurement text, or null on failure
 */
async function fetchEncrypted(filePath, timeoutMs = config.MEASUREMENT_TIMEOUT) {
  const key = crypto.randomUUID();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch('https://graph.hangout.audio/d-c.php', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Origin': 'https://graph.hangout.audio',
        'Referer': 'https://graph.hangout.audio/iem/5128/'
      },
      body: `f_p=${encodeURIComponent(filePath)}&k=${key}`
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) return null;
    
    const encrypted = await response.text();
    if (!encrypted || encrypted.trim() === '') return null;
    
    const decrypted = decryptAesJson(encrypted, key);
    return decrypted;
  } catch (e) {
    clearTimeout(timeoutId);
    return null;
  }
}

// ============================================================================
// PARALLEL EXECUTION
// ============================================================================

/**
 * Execute async functions in parallel with concurrency limit
 */
async function parallelMap(items, fn, concurrency) {
  const results = [];
  
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Execute async functions in parallel, returning results as they complete
 * Useful for progress tracking
 */
async function parallelMapWithProgress(items, fn, concurrency, onProgress) {
  const results = [];
  let completed = 0;
  
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (item, batchIndex) => {
        const result = await fn(item);
        completed++;
        if (onProgress) {
          onProgress(completed, items.length, item);
        }
        return result;
      })
    );
    results.push(...batchResults);
  }
  
  return results;
}

// ============================================================================
// UTILITIES
// ============================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parsePrice(priceStr) {
  if (!priceStr || priceStr === '$??' || priceStr === 'Free') return null;
  const cleaned = priceStr.replace(/[$,]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

module.exports = {
  fetchWithTimeout,
  fetchWithRetry,
  fetchJson,
  fetchText,
  fetchEncrypted,
  parallelMap,
  parallelMapWithProgress,
  sleep,
  parsePrice
};
