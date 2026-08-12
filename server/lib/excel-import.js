const { db, parseMoney, fmtDate } = require('../db');
const { round2 } = require('./stats');
const { buildHeaderMap, normalizeLocation, LOCATIONS } = require('./excel-config');

function normalizeStand(v) {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v).trim();
  if (!s || s === '-' || s === '—') return '';
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return String(Math.trunc(n));
  return s;
}

function clientLocation(c) {
  const loc = String(c?.location || '').trim();
  return loc || 'Harare';
}

function toDateKey(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    const d = new Date(Math.round((raw - 25569) * 86400000));
    if (isNaN(d.getTime())) return null;
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  return fmtDate(raw);
}

function titleCase(s) {
  return String(s || '').trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function findHeaderRowIndex(rows) {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const row = rows[i];
    if (!row) continue;
    if (row.some((c) => String(c || '').trim().toUpperCase() === 'CLIENT NAME')) return i;
  }
  return 0;
}

function parseRow(raw, map, defaultLocation) {
  const name = String(raw[map.name ?? 1] || '').trim();
  if (!name || name.toUpperCase() === 'CLIENT NAME') return null;

  const standNo = normalizeStand(raw[map.stand ?? 3]);
  const location = normalizeLocation(map.location != null ? raw[map.location] : defaultLocation) || defaultLocation || 'Harare';
  const lastCol = map.lastDate ?? 25;

  const client = {
    name,
    category: titleCase(raw[map.category ?? 2] || ''),
    location,
    stand_no: standNo,
    stand_size: parseMoney(raw[map.size ?? 4]) || null,
    balance_brought_down: parseMoney(raw[map.bd ?? 5]),
    last_date_paid: toDateKey(raw[lastCol]),
    payments: [],
  };

  for (const [ym, cols] of Object.entries(map.months)) {
    const amountCol = typeof cols === 'object' ? cols.amount : Number(cols);
    const amt = parseMoney(raw[amountCol]);
    if (!amt || amt <= 0) continue;
    const payment = { month_label: ym, amount: round2(amt) };
    if (typeof cols === 'object') {
      if (cols.receipt != null) payment.receipt_no = String(raw[cols.receipt] || '').trim();
      if (cols.cash != null) payment.cash_reco_no = String(raw[cols.cash] || '').trim();
    }
    client.payments.push(payment);
  }
  return client;
}

function buildClientIndex(defaultLocation) {
  const byStand = new Map();
  const byName = new Map();
  const all = db.prepare('SELECT * FROM clients').all();
  for (const c of all) {
    const loc = clientLocation(c);
    const stand = normalizeStand(c.stand_no);
    if (stand) byStand.set(`${loc}|${stand}`, c);
    byName.set(`${loc}|${c.name.toLowerCase()}`, c);
    if (defaultLocation === 'Harare' && (!c.location || c.location === '')) {
      if (stand) byStand.set(`Harare|${stand}`, c);
      byName.set(`Harare|${c.name.toLowerCase()}`, c);
    }
  }
  return { byStand, byName };
}

function findInIndex(c, index) {
  if (c.stand_no) {
    const hit = index.byStand.get(`${c.location}|${c.stand_no}`);
    if (hit) return hit;
  }
  return index.byName.get(`${c.location}|${c.name.toLowerCase()}`) || null;
}

function clearAllData() {
  db.exec(`
    UPDATE users SET client_id = NULL;
    DELETE FROM payments;
    DELETE FROM uploads;
    DELETE FROM notifications;
    DELETE FROM statement_entries;
    DELETE FROM clients;
  `);
}

function upsertClient(c, index) {
  const existing = findInIndex(c, index);
  const purPrice = c.stand_size ? round2(c.stand_size * 22.5) : null;

  if (existing) {
    db.prepare(`
      UPDATE clients SET name = ?, category = ?, location = ?, stand_no = COALESCE(NULLIF(?, ''), stand_no),
      stand_size = COALESCE(?, stand_size), purchase_price = COALESCE(?, purchase_price),
      balance_brought_down = ?, last_date_paid = COALESCE(?, last_date_paid)
      WHERE id = ?
    `).run(c.name, c.category, c.location, c.stand_no, c.stand_size, purPrice, c.balance_brought_down, c.last_date_paid, existing.id);
    const updated = { ...existing, ...c, id: existing.id };
    index.byName.set(`${c.location}|${c.name.toLowerCase()}`, updated);
    if (c.stand_no) index.byStand.set(`${c.location}|${c.stand_no}`, updated);
    return { id: existing.id, created: false };
  }

  const info = db.prepare(`
    INSERT INTO clients (name, category, location, stand_no, stand_size, purchase_price, balance_brought_down, last_date_paid)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(c.name, c.category, c.location, c.stand_no, c.stand_size, purPrice, c.balance_brought_down, c.last_date_paid);
  const id = Number(info.lastInsertRowid);
  const row = { id, ...c };
  index.byName.set(`${c.location}|${c.name.toLowerCase()}`, row);
  if (c.stand_no) index.byStand.set(`${c.location}|${c.stand_no}`, row);
  return { id, created: true };
}

function runInTransaction(fn) {
  if (typeof db.transaction === 'function') {
    db.transaction(fn)();
  } else {
    db.exec('BEGIN');
    try {
      fn();
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch {}
      throw err;
    }
  }
}

function importStatementSheets(buffer, defaultLocation = 'Harare') {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const findByName = db.prepare('SELECT id FROM clients WHERE lower(name) = lower(?)');
  const findByStand = db.prepare("SELECT id FROM clients WHERE stand_no != '' AND stand_no = ? AND location = ?");
  const updClient = db.prepare(`
    UPDATE clients SET
      purchase_price = COALESCE(?, purchase_price),
      file_no = COALESCE(NULLIF(?, ''), file_no),
      price_per_sqm = COALESCE(?, price_per_sqm),
      stand_size = COALESCE(?, stand_size),
      name = COALESCE(NULLIF(?, ''), name),
      stand_no = COALESCE(NULLIF(?, ''), stand_no)
    WHERE id = ?
  `);
  const findPyByMonth = db.prepare('SELECT id FROM payments WHERE client_id = ? AND month_label = ? ORDER BY payment_date');
  let receiptsAttached = 0;
  let statementsArchived = 0;
  let clientsEnriched = 0;

  for (const sheetName of wb.SheetNames) {
    if (sheetName.toUpperCase() === 'PAYMENTS') continue;
    const rows2 = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' });
    let clientName = null;
    let purchase = null;
    let priceSqm = null;
    let standSize = null;
    let standNo = null;
    let fileNo = null;
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
      if (sn) { standNo = normalizeStand(sn[1]); continue; }
      if (/^DATE\s*$/i.test(t)) continue;
      const date = toDateKey(r[0]);
      const rec = String(r[1] || '').trim();
      const cash = String(r[3] || r[4] || '').trim();
      const amt = parseMoney(r[2]);
      if (amt > 0) entries.push({ date, rec, cash, amt });
    }

    if (!clientName) continue;
    const loc = normalizeLocation(defaultLocation) || 'Harare';
    const existingClient = findByName.get(clientName) || (standNo ? findByStand.get(standNo, loc) : null);
    if (!existingClient) continue;
    const cid = existingClient.id;
    updClient.run(purchase, fileNo, priceSqm, standSize, clientName, standNo, cid);
    clientsEnriched++;

    for (const e of entries) {
      const ym = e.date ? e.date.slice(0, 7) : null;
      const candidates = ym ? findPyByMonth.all(cid, ym) : [];
      if (candidates.length > 0) {
        if (e.rec) {
          db.prepare("UPDATE payments SET receipt_no = ? WHERE id = ? AND (receipt_no IS NULL OR receipt_no = '')")
            .run(e.rec, candidates[0].id);
          receiptsAttached++;
        }
        if (e.cash) {
          db.prepare("UPDATE payments SET cash_reco_no = ? WHERE id = ? AND (cash_reco_no IS NULL OR cash_reco_no = '')")
            .run(e.cash, candidates[0].id);
        }
        continue;
      }
      db.prepare('INSERT INTO statement_entries (client_id, entry_date, receipt_no, amount) VALUES (?,?,?,?)')
        .run(cid, e.date || null, e.rec || null, e.amt);
      statementsArchived++;
    }
  }

  return { receiptsAttached, statementsArchived, clientsEnriched };
}

function importWorkbookBuffer(buffer, options = {}) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName = wb.SheetNames.find((s) => s.toUpperCase() === 'PAYMENTS') || wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error('No worksheet found in file');

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
  if (rows.length < 2) throw new Error('Spreadsheet has no data rows');

  const headerIdx = findHeaderRowIndex(rows);
  const map = buildHeaderMap(rows[headerIdx]);
  if (map.name == null) map.name = 1;

  const defaultLocation = normalizeLocation(options.location) || 'Harare';
  const merge = options.merge !== false && !options.wipe && !options.replaceAll;

  db.exec("UPDATE clients SET location = 'Harare' WHERE location IS NULL OR location = ''");

  if (options.replaceAll) {
    clearAllData();
  } else if (options.wipe && options.location) {
    db.prepare('DELETE FROM payments WHERE client_id IN (SELECT id FROM clients WHERE location = ?)').run(defaultLocation);
    db.prepare('DELETE FROM uploads WHERE client_id IN (SELECT id FROM clients WHERE location = ?)').run(defaultLocation);
    db.prepare('DELETE FROM notifications WHERE client_id IN (SELECT id FROM clients WHERE location = ?)').run(defaultLocation);
    db.prepare('DELETE FROM clients WHERE location = ?').run(defaultLocation);
  } else if (options.wipe) {
    clearAllData();
  }

  const index = buildClientIndex(defaultLocation);

  const insPay = db.prepare(
    'INSERT INTO payments (client_id, payment_date, month_label, amount, receipt_no, cash_reco_no) VALUES (?,?,?,?,?,?)'
  );
  const updPay = db.prepare(
    'UPDATE payments SET amount = ?, payment_date = ?, receipt_no = ?, cash_reco_no = ? WHERE id = ?'
  );
  const findPay = db.prepare('SELECT id FROM payments WHERE client_id = ? AND month_label = ?');
  const updLastDate = db.prepare('UPDATE clients SET last_date_paid = ? WHERE id = ?');
  const maxPayDate = db.prepare('SELECT MAX(payment_date) AS d FROM payments WHERE client_id = ?');

  let imported = 0;
  let created = 0;
  let updated = 0;
  let paymentsAdded = 0;
  let paymentsUpdated = 0;
  let skipped = 0;

  const dataRows = rows.slice(headerIdx + 1);

  runInTransaction(() => {
    for (const raw of dataRows) {
      if (!raw || !raw.some((c) => c !== '' && c != null)) continue;
      const c = parseRow(raw, map, defaultLocation);
      if (!c) { skipped++; continue; }

      const { id: clientId, created: isNew } = upsertClient(c, index);
      if (isNew) created++;
      else updated++;
      imported++;

      for (const p of c.payments) {
        const date = c.last_date_paid && c.last_date_paid.slice(0, 7) === p.month_label
          ? c.last_date_paid
          : `${p.month_label}-28`;
        const existingPay = findPay.get(clientId, p.month_label);
        if (existingPay) {
          updPay.run(p.amount, date, p.receipt_no || null, p.cash_reco_no || null, existingPay.id);
          paymentsUpdated++;
        } else {
          insPay.run(clientId, date, p.month_label, p.amount, p.receipt_no || null, p.cash_reco_no || null);
          paymentsAdded++;
        }
      }

      const lastDate = maxPayDate.get(clientId).d;
      if (lastDate) updLastDate.run(lastDate, clientId);
    }
  });

  const statementStats = importStatementSheets(buffer, defaultLocation);

  const counts = {
    clients: db.prepare('SELECT COUNT(*) AS c FROM clients').get().c,
    payments: db.prepare('SELECT COUNT(*) AS c FROM payments').get().c,
  };

  return {
    imported,
    created,
    updated,
    payments: paymentsAdded + paymentsUpdated,
    paymentsAdded,
    paymentsUpdated,
    skipped,
    location: defaultLocation,
    sheet: sheetName,
    mode: options.replaceAll ? 'replace-all' : (options.wipe ? 'replace' : 'merge'),
    locations: LOCATIONS,
    ...statementStats,
    totalClients: counts.clients,
    totalPayments: counts.payments,
  };
}

module.exports = { importWorkbookBuffer, clearAllData, normalizeStand, importStatementSheets };
