/**
 * Network Module
 * Handles HTTP fetching with timeouts, retries, and rate limiting
 */

const config = require('./config.cjs');

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
  parallelMap,
  parallelMapWithProgress,
  sleep,
  parsePrice
};
