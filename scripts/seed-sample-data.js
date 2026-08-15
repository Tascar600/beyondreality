const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'server', 'data', 'portal.db');
const UPLOAD_DIR = path.join(ROOT, 'server', 'uploads');

const force = process.argv.includes('--force');
const db = new DatabaseSync(DB_PATH);

const seeded = db.prepare("SELECT value FROM app_settings WHERE key = 'sample_seeded_at'").get();
if (seeded && !force) {
  console.log(`Sample data already seeded at ${seeded.value}. Re-run with --force to re-seed (will skip rows that already exist).`);
  process.exit(0);
}

const now = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};
const ts = now();

const OFFICES = ['Harare', 'Norton', 'Head Office Kadoma'];
const OFFICE_SHORT = { Harare: 'H', Norton: 'N', 'Head Office Kadoma': 'K' };

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function pad(n) { return String(n).padStart(2, '0'); }
function dateStr(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }

const summary = { payments: 0, clientsUpdated: 0, notifications: 0, uploads: 0, statementEntries: 0, users: 0 };

// ---------------------------------------------------------------- payments
const clientIds = db.prepare('SELECT id FROM clients ORDER BY RANDOM() LIMIT 34').all().map(r => r.id);
let receiptSeq = randInt(1001, 1400);
let pstmt = db.prepare('INSERT INTO payments (client_id, payment_date, month_label, amount, receipt_no, cash_reco_no, office, created_at) VALUES (?,?,?,?,?,?,?,?)');
const DAYS = ['2026-08-06', '2026-08-07', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15'];
for (let i = 0; i < 46; i++) {
  const date = DAYS[i < 20 ? randInt(0, 6) : 7];
  const office = i % 5 === 0 ? 'Harare' : i % 5 === 2 ? 'Norton' : i % 5 === 4 ? 'Head Office Kadoma' : pick(['Harare', 'Norton']);
  const amount = pick([150, 200, 250, 300, 400, 500, 550, 600, 750, 850, 1000, 1250, 45.5, 275.75]);
  const receiptNo = `BR-2026-${receiptSeq++}`;
  const cashReco = `CR-2026-${date.replaceAll('-', '').slice(2)}-${OFFICE_SHORT[office]}`;
  pstmt.run(pick(clientIds), date, date.slice(0, 7), amount, receiptNo, cashReco, office, ts);
  summary.payments++;
}
console.log(`+ ${summary.payments} sample receipts (offices: ${OFFICES.join(', ')}, dates: ${DAYS[0]}..${DAYS[7]})`);

// ------------------------------------------------- personal details on sample clients
const sampleClients = db.prepare(
  `SELECT id, name, location FROM clients
   WHERE (id_number IS NULL OR id_number = '') OR (contact IS NULL OR contact = '')
   ORDER BY RANDOM() LIMIT 18`).all();
const ID_PREFIX = ['63-', '63-', '63-', '64-', '75-'];
const CONTACTS = ['+263 77 123 4567', '+263 71 555 9874', '+263 77 666 3421', '+263 78 444 8890', '+263 71 222 5543', '+263 77 333 7789'];
const DOBS = ['1978-04-12', '1985-09-23', '1990-01-30', '1972-11-05', '1988-06-17', '1995-03-08', '1981-12-25', '1992-07-14'];
const EMAILS = ['gmail.com', 'yahoo.com', 'zol.co.zw', 'ecoweb.co.zw'];
const JOBS = ['Teacher — Mhofu Primary School', 'Police Officer — Harare Central', 'Nurse — Parirenyatwa Hospital', 'Farmer — Norton', 'Bank Clerk — CBZ Harare', 'Retired', 'Miner — Kadoma', 'Trader — Mbare Musika', 'Driver — ZUPCO'];
const KIN = ['Spouse — Anna (077 200 1112)', 'Brother — Tinashe (071 300 5567)', 'Sister — Rudo (078 400 9087)', 'Son — Tapiwa (077 500 2234)', 'Mother — Ethel (071 600 4455)', 'Cousin — Farai (078 700 8899)'];
const NOTES = ['Prefers SMS payment reminders', 'Pays at Norton office on the 25th', 'Monthly instalment due first week of month', 'Pays jointly with spouse', 'Bank transfer preferred — old age client', 'Requested statement by email each quarter', 'Pays at Harare office, Mondays', 'Usually pays in two instalments'];
let cstmt = db.prepare(
  `UPDATE clients SET id_number = ?, dob = ?, contact = ?, email = ?, employment = ?, next_of_kin = ?, notes = ? WHERE id = ?`);
for (const c of sampleClients) {
  const firstName = String(c.name).split(' ')[0];
  const emailName = String(c.name).replace(/\s+/g, '.').toLowerCase();
  cstmt.run(
    `${pick(ID_PREFIX)}${randInt(1000000, 9999999)}${pick(['X', 'A', 'M', 'P', 'Z', 'K', 'Q'])}`,
    pick(DOBS),
    pick(CONTACTS),
    `${emailName}@${pick(EMAILS)}`,
    pick(JOBS),
    pick(KIN),
    pick(NOTES),
    c.id
  );
  summary.clientsUpdated++;
}
console.log(`+ ${summary.clientsUpdated} clients now have sample personal details (IDs/DOB/contact/email/employment/next-of-kin/notes)`);

// ------------------------------------------------- notifications
const nTypes = ['payment_reminder', 'receipt_issued', 'statement_ready', 'account_update'];
const nChannels = ['SMS', 'Email', 'WhatsApp', 'Portal'];
const nTemplates = [
  'Your monthly instalment of ${a} is due on ${d}. Pay at any office before the due date to avoid late fees.',
  'Receipt ${r} of ${a} was issued on ${d} at ${o} office. Keep it for your records.',
  'Your statement to ${d} is ready in the client portal.',
  'Balance updated: ${a} was credited to stand ${s} on ${d}.'
];
let nstmt = db.prepare('INSERT INTO notifications (client_id, type, channel, message, created_at) VALUES (?,?,?,?,?)');
for (let i = 0; i < 16; i++) {
  const cid = pick(sampleClients).id;
  const d = DAYS[randInt(0, 7)];
  const msg = pick(nTemplates)
    .replace('${a}', String(pick([150, 200, 250, 300, 400, 500, 750])))
    .replace('${d}', d)
    .replace('${r}', `BR-2026-${randInt(1000, 1500)}`)
    .replace('${o}', pick(OFFICES))
    .replace('${s}', pick(['1429', '1853', '2647', '2544', '1924', '2210', '3333', '4110']));
  nstmt.run(cid, pick(nTypes), pick(nChannels), msg, `${d} ${randInt(8, 17)}:${pad(randInt(0, 59))}:00`);
  summary.notifications++;
}
console.log(`+ ${summary.notifications} notifications (SMS/Email/WhatsApp/Portal)`);

// ------------------------------------------------- uploads (with real files)
const upKinds = ['statement', 'agreement', 'id_copy', 'other'];
const upNames = {
  statement: (c) => `${c.name} statement ${randInt(2019, 2026)}.txt`,
  agreement: (c) => `${c.name} sale agreement.txt`,
  id_copy: (c) => `${c.name} ID copy.txt`,
  other: (c) => `Correspondence ${c.stand_no}.txt`
};
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
let ustmt = db.prepare('INSERT INTO uploads (client_id, kind, filename, original_name, uploaded_at) VALUES (?,?,?,?,?)');
let upSeq = 1;
for (const c of sampleClients.slice(0, 10)) {
  const kind = pick(upKinds);
  const filename = `sample_${c.id}_${upSeq++}.txt`;
  const original = upNames[kind](c);
  const body =
    kind === 'statement'
      ? `SAMPLE STATEMENT\n\nClient: ${c.name}\nStand: ${c.stand_no}  Location: ${c.location}\nGenerated: ${DAYS[7]}\nBalance brought down: $${randInt(400, 2500)}\n\nThis is a sample document created for testing.\n`
      : kind === 'agreement'
        ? `SAMPLE SALE AGREEMENT\n\nClient: ${c.name}\nStand: ${c.stand_no}\nPurchase price: $${randInt(4000, 15000)}\n\nThis is a sample document created for testing.\n`
        : `SAMPLE ${kind.toUpperCase()} DOCUMENT\n\nClient: ${c.name}\nStand: ${c.stand_no}\n\nThis is a sample document created for testing.\n`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), body);
  ustmt.run(c.id, kind, filename, original, `${DAYS[randInt(3, 7)]} ${randInt(8, 16)}:${pad(randInt(0, 59))}:00`);
  summary.uploads++;
}
console.log(`+ ${summary.uploads} sample uploads written to ${UPLOAD_DIR}`);

// ------------------------------------------------- statement entries
let sstmt = db.prepare('INSERT INTO statement_entries (client_id, entry_date, receipt_no, amount, source) VALUES (?,?,?,?,?)');
const MONTHS = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
for (let i = 0; i < 15; i++) {
  const m = pick(MONTHS);
  sstmt.run(pick(sampleClients).id, `${m}-${pad(randInt(1, 28))}`, `BR-2026-${randInt(1000, 1500)}`, pick([150, 200, 250, 300, 400, 500]), pick(['import', 'sample']));
  summary.statementEntries++;
}
console.log(`+ ${summary.statementEntries} statement archive entries`);

// ------------------------------------------------- extra users (cashiers in other offices)
function ensureUser(name, username, password, role, office) {
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return false;
  db.prepare('INSERT INTO users (name, username, password_hash, role, client_id, office) VALUES (?,?,?,?,?,?)')
    .run(name, username, hashPassword(password), role, null, office);
  return true;
}
const u1 = ensureUser('Cashier Norton', 'cashier2', 'cashier123', 'cashier', 'Norton');
const u2 = ensureUser('Cashier Head Office', 'cashier3', 'cashier123', 'cashier', 'Head Office Kadoma');
if (u1) { summary.users++; console.log('+ user cashier2 / cashier123 (Norton)'); }
if (u2) { summary.users++; console.log('+ user cashier3 / cashier123 (Head Office Kadoma)'); }

db.prepare("INSERT INTO app_settings (key, value) VALUES ('sample_seeded_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(ts);
db.close();
console.log('\nSeeding complete at', ts);
console.log(JSON.stringify(summary));
