const XLSX = require('xlsx');
const path = require('path');
const { db, parseMoney, fmtDate } = require('../server/db');
const { seedUsers } = require('../server/auth');

const DEFAULT_PATH = "C:/Users/I'm_Tascar/Desktop/COMBINED SCUSTOMER STATEMENTS_042427.xlsx";
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const file = args.find((a) => !a.startsWith('--')) || process.env.EXCEL_FILE || DEFAULT_PATH;

const existing = db.prepare('SELECT COUNT(*) AS c FROM clients').get().c;
if (existing > 0 && !FORCE) {
  console.error(`Database already has ${existing} clients. Rerun with --force to wipe and reimport.`);
  process.exit(1);
}
if (FORCE) {
  db.exec("UPDATE users SET client_id = NULL; DELETE FROM payments; DELETE FROM uploads; DELETE FROM notifications; DELETE FROM clients;");
}

const wb = XLSX.readFile(file);

const MONTH_COLS = [
  ['2025-01', 6], ['2025-03', 7], ['2025-04', 8], ['2025-05', 9], ['2025-06', 10],
  ['2025-07', 11], ['2025-08', 12], ['2025-09', 13], ['2025-10', 14], ['2025-11', 15],
  ['2025-12', 16], ['2026-01', 17], ['2026-02', 18], ['2026-03', 19], ['2026-04', 20],
  ['2026-05', 21], ['2026-06', 22], ['2026-07', 23],
];
const PAYMENTS_HEADER = ['COUNT', 'CLIENT NAME', 'CATEGORY', 'STAND No.', 'SIZE', 'AMOUNT PAID'];

function toDateKey(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    const d = new Date(Math.round((raw - 25569) * 86400000));
    if (isNaN(d)) return null;
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  return fmtDate(raw);
}

const rows = XLSX.utils.sheet_to_json(wb.Sheets['PAYMENTS'], { header: 1, raw: true, defval: '' });
let importedClients = 0, importedPayments = 0;
let idx = {};

const headerRow = rows[0];
headerRow.forEach((h, i) => {
  const key = String(h || '').trim().toUpperCase();
  if (PAYMENTS_HEADER.includes(key)) idx[key] = i;
});
MONTH_COLS.forEach(([month, pos]) => { idx[month] = pos; });

const insClient = db.prepare(`INSERT INTO clients
  (name, category, location, stand_no, stand_size, purchase_price, balance_brought_down, last_date_paid)
  VALUES (?,?,?,?,?,?,?,?)`);
const insPayment = db.prepare(
  'INSERT INTO payments (client_id, payment_date, month_label, amount, receipt_no, cash_reco_no) VALUES (?,?,?,?,?,?)'
);
const findByName = db.prepare('SELECT id FROM clients WHERE name = ?');
const findByStand = db.prepare("SELECT id FROM clients WHERE stand_no != '' AND stand_no = ? AND location = ?");
const updClient = db.prepare('UPDATE clients SET purchase_price = COALESCE(purchase_price, ?), file_no = COALESCE(NULLIF(file_no,\'\'), ?), price_per_sqm = COALESCE(price_per_sqm, ?), stand_size = COALESCE(stand_size, ?) WHERE id = ?');
const findPyByMonth = (cid, ym) => db.prepare(
  'SELECT id FROM payments WHERE client_id = ? AND month_label = ? AND (receipt_no IS NULL OR receipt_no = \'\') ORDER BY payment_date'
).all(cid, ym);

const importLoc = process.env.IMPORT_LOCATION || 'Harare';

for (const raw of rows.slice(1)) {
  const name = String(raw[idx['CLIENT NAME'] ?? 1] || '').trim();
  if (!name) continue;
  const category = String(raw[idx['CATEGORY'] ?? 2] || '').trim();
  const standNo = String(raw[idx['STAND No.'] ?? 3] || '').trim();
  const size = parseMoney(raw[idx['SIZE'] ?? 4]) || null;
  const bd = parseMoney(raw[idx['AMOUNT PAID'] ?? 5]);
  const lastDate = toDateKey(raw[idx['LAST DATE PAID']]);

  const purPrice = size ? Math.round(size * 22.5 * 100) / 100 : null;
  const info = insClient.run(name, category, importLoc, standNo, size, purPrice, bd, lastDate);
  const clientId = Number(info.lastInsertRowid);
  importedClients++;

  for (const [month] of MONTH_COLS) {
    const amt = parseMoney(raw[idx[month]]);
    if (!amt || amt <= 0) continue;
    const date = lastDate && lastDate.slice(0, 7) === month ? lastDate : `${month}-28`;
    insPayment.run(clientId, date, month, amt, null, null);
    importedPayments++;
  }
}

for (const sheetName of wb.SheetNames) {
  if (sheetName === 'PAYMENTS') continue;
  const rows2 = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' });
  let clientName = null, purchase = null, priceSqm = null, standSize = null, standNo = null, fileNo = null;
  const entries = [];
  for (const r of rows2) {
    const t = String(r[0] || '').trim();
    if (!t) continue;
    const cm = t.match(/^CLIENT NAME:\s*(.+)$/i);
    if (cm) { clientName = cm[1].trim(); continue; }
    const fm = t.match(/^FILE No\s*:\s*(.+)$/i);
    if (fm) { fileNo = fm[1].trim(); continue; }
    const sm = t.match(/^STAND SIZE\s*:\s*([\d.]+)/i);
    if (sm) { standSize = parseFloat(sm[1]); continue; }
    const pm = t.match(/^PRICE\s*:\s*\$?([\d.]+)\s*\/\s*SQM/i);
    if (pm) { priceSqm = parseFloat(pm[1]); continue; }
    const tm = t.match(/^TOTAL PURCHASE PRICE:\s*\$?([\d,]+)/i);
    if (tm) { purchase = parseMoney(tm[1]); continue; }
    const sn = t.match(/^STAND NUMBER:\s*(.+)$/i);
    if (sn) { standNo = sn[1].trim(); continue; }
    if (/^DATE\s*$/i.test(t)) continue;
    const date = toDateKey(r[0]);
    const rec = String(r[1] || '').trim();
    const amt = parseMoney(r[2]);
    if (amt > 0) entries.push({ date, rec, amt });
  }
  if (!clientName) continue;

  const existingClient = findByName.get(clientName) || (standNo ? findByStand.get(standNo, importLoc) : null);
  let cid;
  if (existingClient) {
    cid = existingClient.id;
    updClient.run(purchase, fileNo, priceSqm, standSize, cid);
  } else {
    const info = insClient.run(clientName, '', importLoc, standNo || '', standSize, purchase, 0, null);
    cid = Number(info.lastInsertRowid);
    importedClients++;
  }
  for (const e of entries) {
    const ym = e.date ? e.date.slice(0, 7) : null;
    const candidates = ym ? findPyByMonth(cid, ym) : [];
    if (e.rec && candidates.length > 0) {
      db.prepare('UPDATE payments SET receipt_no = ? WHERE id = ?').run(e.rec, candidates[0].id);
      continue;
    }
    db.prepare('INSERT INTO statement_entries (client_id, entry_date, receipt_no, amount) VALUES (?,?,?,?)')
      .run(cid, e.date || null, e.rec || null, e.amt);
  }
}

seedUsers();
const first = db.prepare('SELECT id FROM clients ORDER BY id LIMIT 1').get();
if (first) db.prepare("UPDATE users SET client_id = ? WHERE role = 'client'").run(first.id);

const t = db.prepare('SELECT COUNT(*) AS c FROM clients').get();
console.log(`[import] ${importedClients} clients and ${importedPayments} payments imported from ${path.basename(file)} (total clients now ${t.c})`);
console.log('[import] login: finance/finance123 · clients: SURNAME (CAPS) + stand number');