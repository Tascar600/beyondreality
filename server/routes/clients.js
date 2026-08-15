const express = require('express');
const { db, CLIENT_FIELDS } = require('../db');
const { authRequired, rolesAllowed } = require('../auth');
const { round2, clientSummary, sortClients } = require('../lib/stats');
const { normalizeLocation } = require('../lib/excel-config');

const router = express.Router();

function fullClientResponse(clientId) {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  if (!client) return null;
  const uploads = db.prepare('SELECT * FROM uploads WHERE client_id = ? ORDER BY uploaded_at DESC').all(client.id);
  const notifications = db.prepare('SELECT * FROM notifications WHERE client_id = ? ORDER BY created_at DESC LIMIT 20').all(client.id);
  return { ...clientSummary(client), uploads, notifications };
}

function pickClient(body) {
  const out = {};
  for (const f of CLIENT_FIELDS) if (body[f] !== undefined) out[f] = body[f];
  if (out.location !== undefined) out.location = normalizeLocation(out.location) || 'Harare';
  if (out.stand_size !== undefined) out.stand_size = out.stand_size === '' ? null : Number(out.stand_size);
  if (out.price_per_sqm !== undefined) out.price_per_sqm = out.price_per_sqm === '' ? null : Number(out.price_per_sqm);
  if (out.purchase_price !== undefined) out.purchase_price = out.purchase_price === '' ? null : Number(out.purchase_price);
  if (out.balance_brought_down !== undefined) out.balance_brought_down = out.balance_brought_down === '' ? 0 : Number(out.balance_brought_down);
  return out;
}

router.get('/clients', authRequired, rolesAllowed('finance', 'admin'), (req, res) => {
  const q = String(req.query.search || '').trim();
  const category = String(req.query.category || '').trim();
  const location = normalizeLocation(req.query.location) || '';
  const sortBy = ['stand', 'surname', 'name'].includes(req.query.sort) ? req.query.sort : 'name';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const per = Math.min(200, parseInt(req.query.per, 10) || 50);

  let rows = db.prepare('SELECT * FROM clients ORDER BY name COLLATE NOCASE').all().map(clientSummary);
  if (location) rows = rows.filter((c) => c.location === location);
  if (q) {
    const lq = q.toLowerCase();
    rows = rows.filter((c) =>
      c.name.toLowerCase().includes(lq)
      || c.stand_no.toLowerCase().includes(lq)
      || c.surname.toLowerCase().includes(lq)
      || c.firstName.toLowerCase().includes(lq)
    );
  }
  if (category) rows = rows.filter((c) => c.category === category);

  rows = sortClients(rows, sortBy);
  const total = rows.length;
  const slice = rows.slice((page - 1) * per, page * per);
  const categories = db.prepare("SELECT DISTINCT category FROM clients WHERE category != '' ORDER BY category").all().map((r) => r.category);
  res.json({ total, page, per, sort: sortBy, location: location || 'All', categories, clients: slice });
});

router.get('/clients/:id', authRequired, (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(req.params.id));
  if (!client) return res.status(404).json({ error: 'Client not found' });
  if (req.user.role === 'client' && req.user.client_id !== client.id) {
    return res.status(403).json({ error: 'Not authorised' });
  }
  res.json(fullClientResponse(client.id));
});

router.post('/clients', authRequired, rolesAllowed('finance', 'admin'), (req, res) => {
  const data = pickClient(req.body || {});
  if (!data.name) return res.status(400).json({ error: 'Client name is required' });
  if (!data.location) data.location = 'Harare';
  if (data.purchase_price == null && data.stand_size) {
    data.purchase_price = round2(data.stand_size * (data.price_per_sqm || 22.5));
  }
  const fields = Object.keys(data);
  const info = db.prepare(
    `INSERT INTO clients (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`
  ).run(...fields.map((f) => data[f]));
  res.status(201).json(clientSummary(db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(info.lastInsertRowid))));
});

router.put('/clients/:id', authRequired, rolesAllowed('finance', 'admin'), (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(req.params.id));
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const data = pickClient(req.body || {});
  const fields = Object.keys(data);
  if (fields.length) {
    db.prepare(`UPDATE clients SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`)
      .run(...fields.map((f) => data[f]), client.id);
  }
  res.json(clientSummary(db.prepare('SELECT * FROM clients WHERE id = ?').get(client.id)));
});

router.delete('/clients/:id', authRequired, rolesAllowed('finance', 'admin'), (req, res) => {
  const info = db.prepare('DELETE FROM clients WHERE id = ?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'Client not found' });
  res.json({ ok: true });
});

router.post('/clients/:id/payments', authRequired, rolesAllowed('finance', 'admin', 'cashier'), (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(req.params.id));
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const { amount, month_label, payment_date, receipt_no, cash_reco_no, office } = req.body || {};
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Amount must be greater than zero' });
  if (!month_label) return res.status(400).json({ error: 'Payment month is required' });

  const receipt = String(receipt_no || '').trim() || `R-${client.id}-${month_label}`;
  const cash = String(cash_reco_no || '').trim() || `CR-${client.id}-${month_label}`;
  const off = String(office || '').trim() || (req.user.role === 'cashier' ? req.user.office || '' : '') || 'Harare';
  const date = payment_date && /^\d{4}-\d{2}-\d{2}/.test(payment_date) ? payment_date.slice(0, 10) : `${month_label}-28`;

  const existingMonth = db.prepare('SELECT id, receipt_no FROM payments WHERE client_id = ? AND month_label = ?').get(client.id, month_label);
  if (existingMonth) {
    db.prepare('UPDATE payments SET amount = ?, payment_date = ?, receipt_no = ?, cash_reco_no = ?, office = ? WHERE id = ?')
      .run(round2(amt), date, receipt, cash, off, existingMonth.id);
  } else {
    const dup = db.prepare('SELECT id FROM payments WHERE receipt_no = ?').get(receipt);
    if (dup) return res.status(409).json({ error: `Receipt number ${receipt} already used (payment #${dup.id})` });
    db.prepare(
      'INSERT INTO payments (client_id, payment_date, month_label, amount, receipt_no, cash_reco_no, office) VALUES (?,?,?,?,?,?,?)'
    ).run(client.id, date, month_label, round2(amt), receipt, cash, off);
  }

  const lastDate = db.prepare('SELECT MAX(payment_date) AS d FROM payments WHERE client_id = ?').get(client.id).d;
  db.prepare('UPDATE clients SET last_date_paid = ? WHERE id = ?').run(lastDate, client.id);

  res.status(201).json({ ok: true, client: fullClientResponse(client.id) });
});

router.delete('/payments/:id', authRequired, rolesAllowed('finance', 'admin'), (req, res) => {
  const p = db.prepare('SELECT * FROM payments WHERE id = ?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Payment not found' });
  db.prepare('DELETE FROM payments WHERE id = ?').run(p.id);
  const lastDate = db.prepare('SELECT MAX(payment_date) AS d FROM payments WHERE client_id = ?').get(p.client_id).d;
  db.prepare('UPDATE clients SET last_date_paid = ? WHERE id = ?').run(lastDate, p.client_id);
  res.json({ ok: true });
});

module.exports = router;
