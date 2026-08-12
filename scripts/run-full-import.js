const fs = require('fs');
const path = require('path');
const { importWorkbookBuffer, clearAllData } = require('../server/lib/excel-import');
const { seedUsers } = require('../server/auth');
const { db } = require('../server/db');

const DEFAULT_FILE = path.join(process.env.USERPROFILE || '', 'Desktop', 'COMBINED SCUSTOMER STATEMENTS_042427.xlsx');
const file = process.argv.find((a) => a.endsWith('.xlsx')) || process.env.EXCEL_FILE || DEFAULT_FILE;

if (!fs.existsSync(file)) {
  console.error('File not found:', file);
  console.error('Usage: node run-full-import.js "C:\\path\\to\\COMBINED SCUSTOMER STATEMENTS_042427.xlsx"');
  process.exit(1);
}

console.log('Replacing ALL data from:', file);
clearAllData();

const buffer = fs.readFileSync(file);
const result = importWorkbookBuffer(buffer, { replaceAll: true, location: 'Harare', merge: false });
seedUsers();

console.log('Import complete:');
console.log(JSON.stringify(result, null, 2));
console.log('\nRestart START.bat and log in as finance/finance123');
