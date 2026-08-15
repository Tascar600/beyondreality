const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'server', 'data', 'portal.db');
const UPLOAD_DIR = path.join(ROOT, 'server', 'uploads');

const db = new DatabaseSync(DB_PATH);
const before = () => ({
  payments: db.prepare('SELECT COUNT(*) c FROM payments').get().c,
  uploads: db.prepare('SELECT COUNT(*) c FROM uploads').get().c,
  notifications: db.prepare('SELECT COUNT(*) c FROM notifications').get().c,
  statementEntries: db.prepare('SELECT COUNT(*) c FROM statement_entries').get().c,
  users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
  clientsWithPersonal: db.prepare('SELECT COUNT(*) c FROM clients WHERE contact IS NOT NULL AND contact != \'\'').get().c,
});

const snap = before();
console.log('BEFORE:', JSON.stringify(snap));

// 1. sample receipts (BR-2026-* pattern used by the seeder)
const delReceipts = db.prepare("DELETE FROM payments WHERE receipt_no LIKE 'BR-2026-%'").run();
console.log(`- removed ${delReceipts.changes} sample receipts`);

// 2. sample upload rows + their files
const ups = db.prepare("SELECT filename FROM uploads WHERE filename LIKE 'sample_%'").all();
const delUploads = db.prepare("DELETE FROM uploads WHERE filename LIKE 'sample_%'").run();
let filesRemoved = 0;
for (const u of ups) {
  const f = path.join(UPLOAD_DIR, u.filename);
  try { if (fs.existsSync(f)) { fs.unlinkSync(f); filesRemoved++; } } catch { /* ignore */ }
}
console.log(`- removed ${delUploads.changes} sample uploads (+${filesRemoved} files from disk)`);

// 3. all notifications (none existed before seeding)
const delNotifs = db.prepare('DELETE FROM notifications').run();
console.log(`- removed ${delNotifs.changes} notifications`);

// 4. sample statement entries (seeder wrote source 'sample' or 'import'; originals have NULL)
const delStm = db.prepare('DELETE FROM statement_entries WHERE source IS NOT NULL').run();
console.log(`- removed ${delStm.changes} sample statement entries`);

// 5. sample personal details (every client had these fields empty before seeding)
const delPersonal = db.prepare(
  "UPDATE clients SET id_number = NULL, dob = NULL, contact = NULL, email = NULL, employment = NULL, next_of_kin = NULL, notes = NULL"
).run();
console.log(`- cleared personal details on ${delPersonal.changes} clients`);

// 6. sample users
for (const u of ['cashier2', 'cashier3']) {
  const delUser = db.prepare('DELETE FROM users WHERE username = ?').run(u);
  if (delUser.changes) console.log(`- removed user ${u}`);
}

// 7. seeder marker
db.prepare("DELETE FROM app_settings WHERE key = 'sample_seeded_at'").run();

const after = before();
console.log('AFTER:', JSON.stringify(after));

db.close();
console.log('\nCleanup complete. Real data kept: all client accounts, payments, offices.');
