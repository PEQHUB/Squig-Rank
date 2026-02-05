#!/usr/bin/env node
/**
 * Squig-Rank Scanner v2
 * 
 * Incremental scanner with unified caching and MessagePack output.
 * 
 * Features:
 * - Incremental scanning: only processes changed domains
 * - Unified cache: consolidated measurement storage
 * - MessagePack output: smaller client payloads
 * - Checkpoint/resume: recovers from interruptions
 */

const config = require('./config.cjs');
const cache = require('./cache.cjs');
const domains = require('./domains.cjs');
const targets = require('./targets.cjs');
const output = require('./output.cjs');

// ============================================================================
// MAIN SCANNER
// ============================================================================

async function main() {
  const startTime = Date.now();
  
  console.log('=== Squig-Rank Scanner v2 ===\n');
  console.log(`Mode: Incremental`);
  console.log(`Domains: ${config.SUBDOMAINS.length}`);
  console.log(`Concurrency: ${config.CONCURRENT_DOMAINS} domains, ${config.CONCURRENT_MEASUREMENTS} measurements\n`);
  
  // 1. Initialize cache
  console.log('--- Loading Cache ---');
  const cacheIndex = cache.loadCacheIndex();
  const domainHashes = cache.loadDomainHashes();
  
  const stats = cache.getCacheStats(cacheIndex);
  console.log(`  Cached entries: ${stats.totalEntries}`);
  console.log(`  IEMs: ${stats.iems}, Headphones: ${stats.headphones}`);
  console.log(`  Last scan: ${stats.lastScan || 'never'}`);
  
  // 2. Check for checkpoint (resume capability)
  const checkpoint = cache.loadCheckpoint();
  let startDomainIndex = 0;
  
  if (checkpoint) {
    console.log(`\nResuming from checkpoint (${checkpoint.completedDomains} domains completed)`);
    startDomainIndex = checkpoint.completedDomains;
  }
  
  // 4. Load targets
  console.log('\n--- Loading Targets ---');
  const targetGroups = targets.loadTargets();
  console.log(`  Loaded ${targetGroups.length} target groups`);
  
  if (targetGroups.length === 0) {
    console.error('No target curves found! Exiting.');
    process.exit(1);
  }
  
  // 5. Scan domains
  console.log('\n--- Scanning Domains ---');
  const domainsToScan = config.SUBDOMAINS.slice(startDomainIndex);
  
  let totalNew = 0;
  let totalCached = 0;
  let totalFailed = 0;
  let unchangedDomains = 0;
  let changedDomains = 0;
  
  const allPhones = [];
  
  const scanResults = await domains.scanDomains(
    domainsToScan, 
    cacheIndex, 
    domainHashes,
    {
      concurrency: config.CONCURRENT_DOMAINS,
      forceRescan: process.argv.includes('--force'),
      onDomainComplete: (result) => {
        if (result.success) {
          if (result.phoneBookChanged) {
            changedDomains++;
            totalNew += result.newMeasurements;
            totalCached += result.cachedMeasurements;
            totalFailed += result.failedMeasurements;
            allPhones.push(...result.phones);
          } else {
            unchangedDomains++;
          }
        }
        
        // Save checkpoint every 10 domains
        if ((changedDomains + unchangedDomains) % 10 === 0) {
          cache.saveCheckpoint({
            completedDomains: startDomainIndex + changedDomains + unchangedDomains,
            totalDomains: config.SUBDOMAINS.length
          });
        }
      }
    }
  );
  
  // 6. Clear checkpoint on successful completion
  cache.clearCheckpoint();
  
  // 7. Load all phones from cache for output generation
  console.log('\n--- Loading Full Dataset ---');
  const allPhonesFromCache = domains.loadPhonesFromCache(cacheIndex);
  console.log(`  Total phones in cache: ${allPhonesFromCache.length}`);
  
  // 8. Generate outputs
  console.log('\n--- Generating Outputs ---');
  
  // Results (JSON)
  output.generateResults(allPhonesFromCache, targetGroups);
  
  // Latest results (merged from all categories)
  output.generateLatestResults(allPhonesFromCache, targetGroups);
  
  // Curves (MessagePack)
  try {
    await output.generateCurves(allPhonesFromCache);
  } catch (e) {
    console.warn('MessagePack generation failed, falling back to JSON:', e.message);
    output.generateCurvesJson(allPhonesFromCache);
  }
  
  // Also generate JSON fallback for development
  output.generateCurvesJson(allPhonesFromCache);
  
  // 9. Save final state
  cache.saveCacheIndex(cacheIndex);
  cache.saveDomainHashes(domainHashes);
  
  // 10. Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n=== Scan Complete ===');
  console.log(`  Time: ${elapsed}s`);
  console.log(`  Domains: ${unchangedDomains} unchanged, ${changedDomains} changed`);
  console.log(`  Measurements: ${totalNew} new, ${totalCached} cached, ${totalFailed} failed`);
  console.log(`  Total in cache: ${Object.keys(cacheIndex.entries).length}`);
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nInterrupted! Saving checkpoint...');
  // Checkpoint is saved periodically during scan
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\nTerminated! Saving checkpoint...');
  process.exit(0);
});

// Run
main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
