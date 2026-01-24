const fs = require('fs');
const path = require('path');

const ISSUE_BODY = process.env.ISSUE_BODY;
const ISSUE_TITLE = process.env.ISSUE_TITLE;

if (!ISSUE_BODY || !ISSUE_TITLE) {
  console.error('Missing ISSUE_BODY or ISSUE_TITLE env vars');
  process.exit(1);
}

// 1. Sanitize filename from title
// Remove "Add Target:" prefix if present
let targetName = ISSUE_TITLE.replace(/^Add Target:\s*/i, '').trim();
// Replace invalid chars with safe ones
targetName = targetName.replace(/[^a-z0-9\s\-\(\)\.]/gi, '_');

if (!targetName) {
  console.error('Invalid target name derived from title');
  process.exit(1);
}

const fileName = `${targetName}.txt`;
const filePath = path.join(__dirname, '..', 'public', 'targets', fileName);

// 2. Extract content from code block
// Look for ``` or ```text or ```csv code blocks
const codeBlockRegex = /```(?:txt|text|csv)?\s*([\s\S]*?)```/;
const match = ISSUE_BODY.match(codeBlockRegex);

if (!match || !match[1]) {
  console.error('No code block found in issue body. Please wrap target data in ``` code blocks.');
  process.exit(1);
}

let content = match[1].trim();

// 3. Basic Validation
const lines = content.split('\n');
let validPoints = 0;

for (const line of lines) {
  const parts = line.trim().split(/[\s\t;,]+/);
  if (parts.length >= 2) {
    const freq = parseFloat(parts[0]);
    const val = parseFloat(parts[1]);
    if (!isNaN(freq) && !isNaN(val)) {
      validPoints++;
    }
  }
}

if (validPoints < 10) {
  console.error(`Validation failed: Only found ${validPoints} valid data points (minimum 10 required).`);
  process.exit(1);
}

// 4. Save file
// Ensure directory exists
const targetDir = path.dirname(filePath);
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

fs.writeFileSync(filePath, content);
console.log(`Successfully saved target to ${filePath}`);
