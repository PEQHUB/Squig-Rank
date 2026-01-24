#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { parseFrequencyResponse, logInterpolate } = require('./utils.cjs');

// Configuration
const TARGETS_DIR = path.join(__dirname, '..', 'public', 'targets');
const COMP_PATH = path.join(__dirname, '..', 'compensation', '711comp.txt');

// Load Compensation
let compensationCurve = null;
if (fs.existsSync(COMP_PATH)) {
  const text = fs.readFileSync(COMP_PATH, 'utf-8');
  compensationCurve = parseFrequencyResponse(text);
  console.log(`Loaded compensation curve from ${COMP_PATH}`);
} else {
  console.error(`Error: Compensation file not found at ${COMP_PATH}`);
  process.exit(1);
}

// Helper to generate 5128 curve
function generate5128(curve711) {
  const newDb = curve711.frequencies.map((f, i) => {
    // 5128 = 711 + Compensation
    const compDb = logInterpolate(compensationCurve.frequencies, compensationCurve.db, f);
    return curve711.db[i] + compDb;
  });
  return { frequencies: [...curve711.frequencies], db: newDb };
}

function saveCurve(filePath, curve) {
  let content = "Frequency\tdB\n";
  for (let i = 0; i < curve.frequencies.length; i++) {
    content += `${curve.frequencies[i].toFixed(2)}\t${curve.db[i].toFixed(2)}\n`;
  }
  fs.writeFileSync(filePath, content);
}

// Main Loop
if (!fs.existsSync(TARGETS_DIR)) {
  console.error(`Targets directory not found: ${TARGETS_DIR}`);
  process.exit(1);
}

console.log(`Scanning targets in ${TARGETS_DIR}...`);
const files = fs.readdirSync(TARGETS_DIR).filter(f => f.endsWith('.txt'));

for (const file of files) {
  // Skip 5128 files (we only process 711 sources)
  if (file.includes('(5128)')) continue;

  // Skip compensation files if they ended up here
  if (file.includes('comp')) continue;

  const filePath = path.join(TARGETS_DIR, file);
  const text = fs.readFileSync(filePath, 'utf-8');
  const curve = parseFrequencyResponse(text);

  if (curve.frequencies.length < 10) {
    console.warn(`Skipping invalid target: ${file}`);
    continue;
  }

  // Determine if this is an explicit 711 file or unlabeled
  const isExplicit711 = file.includes('(711)');
  let baseName = file.replace('.txt', '');
  
  if (isExplicit711) {
    baseName = baseName.replace(/\s*\(711\)/, '').trim();
  }

  // Define paths
  const path711 = path.join(TARGETS_DIR, `${baseName} (711).txt`);
  const path5128 = path.join(TARGETS_DIR, `${baseName} (5128).txt`);

  // 1. Generate 5128 if missing
  if (!fs.existsSync(path5128)) {
    console.log(`Generating 5128 variant for: ${baseName}`);
    const curve5128 = generate5128(curve);
    saveCurve(path5128, curve5128);
  } else {
    console.log(`5128 variant exists for: ${baseName}`);
  }

  // 2. Rename unlabeled to (711)
  if (!isExplicit711) {
    console.log(`Renaming unlabeled target to: ${baseName} (711).txt`);
    // Check if destination exists to avoid overwrite/error
    if (fs.existsSync(path711)) {
       console.warn(`Warning: ${baseName} (711).txt already exists. Deleting original unlabeled file.`);
       fs.unlinkSync(filePath);
    } else {
       fs.renameSync(filePath, path711);
    }
  }
}

console.log('Target preparation complete.');
