/** Quick test: node test-import.js [path-to-xlsx] */
const fs = require('fs');
const path = require('path');
const { importWorkbookBuffer } = require('./lib/excel-import');

const file = process.argv[2] || path.join(process.env.USERPROFILE || '', 'Desktop', 'COMBINED SCUSTOMER STATEMENTS_042427.xlsx');

if (!fs.existsSync(file)) {
  console.error('File not found:', file);
  process.exit(1);
}

const buf = fs.readFileSync(file);
const result = importWorkbookBuffer(buf, { merge: true, location: 'Harare' });
console.log(JSON.stringify(result, null, 2));
