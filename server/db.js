const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const SEED_DIR = path.join(__dirname, 'seed-data');
const SEED_DB = path.join(SEED_DIR, 'portal.db');

function restoreSeed() {
  if (!fs.existsSync(SEED_DB)) return;
  const dataFile = path.join(DATA_DIR, 'portal.db');
  const isEmpty = !fs.existsSync(dataFile) || fs.statSync(dataFile).size === 0;
  if (!isEmpty) {
    try {
      const probe = new DatabaseSync(dataFile);
      const n = probe.prepare('SELECT COUNT(*) AS c FROM clients').get().c;
      probe.close();
      if (n > 0) return;
    } catch { return; }
  }
  fs.copyFileSync(SEED_DB, dataFile);
  const seedUploads = path.join(SEED_DIR, 'uploads');
  if (fs.existsSync(seedUploads) && fs.readdirSync(UPLOAD_DIR).length === 0) {
    for (const f of fs.readdirSync(seedUploads)) {
      fs.copyFileSync(path.join(seedUploads, f), path.join(UPLOAD_DIR, f));
    }
  }
  console.log('[seed] restored populated database');
}

restoreSeed();

const db = new DatabaseSync(path.join(DATA_DIR, 'portal.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','finance','client','cashier')),
    client_id INTEGER REFERENCES clients(id),
    office TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT DEFAULT '',
    location TEXT NOT NULL DEFAULT 'Harare',
    stand_no TEXT DEFAULT '',
    stand_size REAL,
    file_no TEXT DEFAULT '',
    price_per_sqm REAL,
    purchase_price REAL,
    balance_brought_down REAL NOT NULL DEFAULT 0,
    last_date_paid TEXT,
    id_number TEXT DEFAULT '',
    dob TEXT DEFAULT '',
    contact TEXT DEFAULT '',
    email TEXT DEFAULT '',
    employment TEXT DEFAULT '',
    next_of_kin TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    password_hash TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    payment_date TEXT NOT NULL,
    month_label TEXT NOT NULL,
    amount REAL NOT NULL,
    receipt_no TEXT,
    cash_reco_no TEXT,
    office TEXT NOT NULL DEFAULT 'Harare',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_payments_client ON payments(client_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_receipt_unique ON payments(receipt_no) WHERE receipt_no IS NOT NULL AND receipt_no != '';

  CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'Other',
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS statement_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    entry_date TEXT,
    receipt_no TEXT,
    amount REAL NOT NULL,
    source TEXT NOT NULL DEFAULT 'Excel statement archive'
  );
  CREATE INDEX IF NOT EXISTS idx_stm_client ON statement_entries(client_id);

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER REFERENCES clients(id),
    type TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'sms',
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );
`);

try { db.exec('ALTER TABLE clients ADD COLUMN password_hash TEXT DEFAULT \'\''); } catch {}
try { db.exec("ALTER TABLE clients ADD COLUMN location TEXT NOT NULL DEFAULT 'Harare'"); } catch {}
try { db.exec("UPDATE clients SET location = 'Harare' WHERE location IS NULL OR location = ''"); } catch {}

try { db.exec("ALTER TABLE payments ADD COLUMN office TEXT NOT NULL DEFAULT 'Harare'"); } catch {}

const userCols = db.prepare('PRAGMA table_info(users)').all();
if (!userCols.some((c) => c.name === 'office')) {
  db.exec(`
    CREATE TABLE users_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','finance','client','cashier')),
      client_id INTEGER REFERENCES clients(id),
      office TEXT DEFAULT ''
    );
    INSERT INTO users_v2 (id, name, username, password_hash, role, client_id, office)
      SELECT id, name, username, password_hash, role, client_id, '' FROM users;
    DROP TABLE users;
    ALTER TABLE users_v2 RENAME TO users;
  `);
}

function parseMoney(v) {
  if (v === null || v === undefined) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function fmtDate(v) {
  if (!v) return null;
  const m = String(v).match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (m) {
    const months = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
    const mo = months[m[2]];
    if (mo) {
      let yr = parseInt(m[3], 10);
      if (yr < 100) yr += 2000;
      const d = String(m[1]).padStart(2, '0');
      return `${yr}-${String(mo).padStart(2, '0')}-${d}`;
    }
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(String(v))) return String(v).slice(0, 10);
  return String(v).slice(0, 10);
}

function padDate(monthLabel) {
  return `${monthLabel}-28`;
}

const CLIENT_FIELDS = ['name','category','location','stand_no','stand_size','file_no','price_per_sqm','purchase_price','balance_brought_down','last_date_paid','id_number','dob','contact','email','employment','next_of_kin','notes'];

module.exports = { db, parseMoney, fmtDate, padDate, CLIENT_FIELDS, UPLOAD_DIR };