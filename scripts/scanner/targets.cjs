/**
 * Targets Module
 * Handles loading and processing of target curves
 */

const fs = require('fs');
const path = require('path');
const config = require('./config.cjs');
const frequency = require('./frequency.cjs');

// ============================================================================
// TARGET LOADING
// ============================================================================

/**
 * Load all target curves from the targets directory
 * Groups variants (711/5128) under the same target name
 */
function loadTargets() {
  const targetGroups = new Map();
  
  if (!fs.existsSync(config.TARGETS_DIR)) {
    console.warn('Targets directory not found:', config.TARGETS_DIR);
    return [];
  }
  
  const targetFiles = fs.readdirSync(config.TARGETS_DIR)
    .filter(f => f.endsWith('.txt') && !f.includes('comp'));
  
  for (const fileName of targetFiles) {
    const filePath = path.join(config.TARGETS_DIR, fileName);
    
    try {
      const text = fs.readFileSync(filePath, 'utf-8');
      const curve = frequency.parseFrequencyResponse(text);
      
      if (curve.frequencies.length < 10) {
        console.warn(`  Skipping invalid target: ${fileName}`);
        continue;
      }
      
      let baseName = '';
      let variant = '';
      let type = 'iem';

      // Detect HP Targets
      if (fileName.includes('Harman 2018')) {
        baseName = 'Harman 2018';
        variant = 'default';
        type = 'headphone';
      } 
      else if (fileName.startsWith('5128 DF') || fileName.startsWith('KEMAR DF')) {
        baseName = 'Diffuse Field (Tilted)';
        type = 'headphone';
        if (fileName.includes('5128')) variant = '5128';
        else if (fileName.includes('KB50xx')) variant = 'kb5';
        else if (fileName.includes('KB006x')) variant = 'kb6';
        else variant = 'default';
      }
      // Detect IEM Targets
      else {
        type = 'iem';
        const is5128 = fileName.toLowerCase().includes('5128');
        variant = is5128 ? '5128' : '711';
        
        baseName = fileName
          .replace(/\s*\(5128\)/i, '')
          .replace(/\s*\(711\)/i, '')
          .replace('.txt', '')
          .trim();
      }

      if (!targetGroups.has(baseName)) {
        targetGroups.set(baseName, { name: baseName, type, variants: {} });
      }
      
      const group = targetGroups.get(baseName);
      group.variants[variant] = { fileName, curve };
      
      console.log(`  Loaded: ${fileName} -> ${baseName} [${variant}] (${type})`);
      
    } catch (e) {
      console.warn(`  Failed to load target: ${fileName}`, e.message);
    }
  }
  
  return Array.from(targetGroups.values());
}

// ============================================================================
// COMPENSATION CURVES
// ============================================================================

/**
 * Load compensation curves for rig conversion
 */
function loadCompensation() {
  const compensation = {
    '711': null,
    '5128': null
  };
  
  const comp711Path = path.join(config.COMPENSATION_DIR, '711comp.txt');
  const comp5128Path = path.join(config.COMPENSATION_DIR, '5128comp.txt');
  
  if (fs.existsSync(comp711Path)) {
    const text = fs.readFileSync(comp711Path, 'utf-8');
    const curve = frequency.parseFrequencyResponse(text);
    const aligned = frequency.alignToR40(curve);
    compensation['711'] = aligned.db.map(v => Math.round(v * 100) / 100);
    console.log('  Loaded 711 compensation curve');
  }
  
  if (fs.existsSync(comp5128Path)) {
    const text = fs.readFileSync(comp5128Path, 'utf-8');
    const curve = frequency.parseFrequencyResponse(text);
    const aligned = frequency.alignToR40(curve);
    compensation['5128'] = aligned.db.map(v => Math.round(v * 100) / 100);
    console.log('  Loaded 5128 compensation curve');
  }
  
  return compensation;
}

module.exports = {
  loadTargets,
  loadCompensation
};
