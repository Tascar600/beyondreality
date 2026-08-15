const express = require('express');
const { db } = require('../db');
const { authRequired, rolesAllowed } = require('../auth');
const { round2, clientSummary } = require('../lib/stats');

const router = express.Router();

const OFFICES = ['Harare', 'Norton', 'Head Office Kadoma'];

function normalizeOffice(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const hit = OFFICES.find((o) => o.toLowerCase() === s.toLowerCase());
  return hit || '';
}

const PUBLIC_FIELDS = ['id', 'name', 'category', 'location', 'stand_no', 'stand_size', 'file_no',
  'purchase_price', 'balance_brought_down', 'last_date_paid', 'totalPaid', 'monthlySum', 'lastDate',
  'firstName', 'surname'];

function publicAccount(summary) {
  const out = {};
  for (const f of PUBLIC_FIELDS) out[f] = summary[f];
  out.outstanding = summary.purchase_price != null ? round2(summary.purchase_price - summary.totalPaid) : null;
  return out;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

router.get('/bursary/offices', authRequired, rolesAllowed('cashier'), (req, res) => {
  res.json({ offices: OFFICES });
});

router.get('/bursary/search', authRequired, rolesAllowed('cashier'), (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(30, parseInt(req.query.limit, 10) || 20);
  if (!q) return res.json({ q: '', clients: [] });
  const like = `%${q}%`;
  const rows = db.prepare(
    `SELECT id, name, stand_no, location, category FROM clients
     WHERE name LIKE ? OR stand_no LIKE ?
     ORDER BY name COLLATE NOCASE LIMIT ?`
  ).all(like, like, limit);
  res.json({ q, clients: rows });
});

router.get('/bursary/clients/:id', authRequired, rolesAllowed('cashier'), (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(req.params.id));
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const summary = clientSummary(client);
  res.json({
    ...publicAccount(summary),
    payments: summary.payments.map((p) => ({
      id: p.id, amount: p.amount, payment_date: p.payment_date, month_label: p.month_label,
      receipt_no: p.receipt_no, cash_reco_no: p.cash_reco_no, office: p.office || 'Harare',
    })),
  });
});

router.post('/bursary/clients/:id/payments', authRequired, rolesAllowed('cashier'), (req, res) => {
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(Number(req.params.id));
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const { amount, payment_date, month_label, receipt_no, cash_reco_no, office } = req.body || {};
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Amount must be greater than zero' });

  const receipt = String(receipt_no || '').trim();
  if (!receipt) return res.status(400).json({ error: 'Receipt No is required (the number written on the physical receipt)' });
  const cash = String(cash_reco_no || '').trim();
  if (!cash) return res.status(400).json({ error: 'Cash Reco No is required' });

  const off = normalizeOffice(office) || (req.user.role === 'cashier' ? req.user.office || '' : '') || 'Harare';
  if (!OFFICES.includes(off)) {
    return res.status(400).json({ error: `Office must be one of: ${OFFICES.join(', ')}` });
  }

  const date = payment_date && /^\d{4}-\d{2}-\d{2}/.test(payment_date) ? payment_date.slice(0, 10) : todayStr();
  const month = /^\d{4}-\d{2}$/.test(String(month_label || '')) ? month_label : date.slice(0, 7);

  const dup = db.prepare('SELECT id, client_id FROM payments WHERE receipt_no = ?').get(receipt);
  if (dup) {
    return res.status(409).json({ error: `Receipt number ${receipt} already used (payment #${dup.id})` });
  }

  const info = db.prepare(
    'INSERT INTO payments (client_id, payment_date, month_label, amount, receipt_no, cash_reco_no, office) VALUES (?,?,?,?,?,?,?)'
  ).run(client.id, date, month, round2(amt), receipt, cash, off);

  const lastDate = db.prepare('SELECT MAX(payment_date) AS d FROM payments WHERE client_id = ?').get(client.id).d;
  db.prepare('UPDATE clients SET last_date_paid = ? WHERE id = ?').run(lastDate, client.id);

  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(Number(info.lastInsertRowid));
  const summary = clientSummary(db.prepare('SELECT * FROM clients WHERE id = ?').get(client.id));
  res.status(201).json({
    ok: true,
    payment: { ...payment, client_name: summary.name, stand_no: summary.stand_no, location: summary.location },
    client: publicAccount(summary),
  });
});

router.get('/bursary/reconciliation', authRequired, rolesAllowed('cashier'), (req, res) => {
  const date = req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : todayStr();
  const rows = db.prepare(`
    SELECT p.id, p.payment_date, p.amount, p.receipt_no, p.cash_reco_no, p.office, p.created_at,
           c.name AS client_name, c.stand_no, c.location
    FROM payments p JOIN clients c ON c.id = p.client_id
    WHERE p.payment_date = ?
    ORDER BY p.office, p.created_at, p.id
  `).all(date);

  const totals = OFFICES.map((office) => {
    const items = rows.filter((r) => (r.office || 'Harare') === office);
    return {
      office,
      count: items.length,
      amount: round2(items.reduce((s, r) => s + (r.amount || 0), 0)),
    };
  });

  res.json({
    date,
    entries: rows,
    totals,
    grandTotal: round2(rows.reduce((s, r) => s + (r.amount || 0), 0)),
    grandCount: rows.length,
  });
});

module.exports = router;
