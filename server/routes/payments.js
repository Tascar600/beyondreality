const express = require('express');
const { db } = require('../db');
const { authRequired, rolesAllowed } = require('../auth');
const { round2, sortClients, clientSummary } = require('../lib/stats');
const { normalizeLocation } = require('../lib/excel-config');

const router = express.Router();

router.get('/payments/monthly', authRequired, rolesAllowed('finance', 'admin'), (req, res) => {
  const month = String(req.query.month || '').trim();
  const sortBy = ['stand', 'surname', 'name'].includes(req.query.sort) ? req.query.sort : 'name';
  const location = normalizeLocation(req.query.location) || '';
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Valid month required (YYYY-MM)' });

  let clients = db.prepare('SELECT * FROM clients ORDER BY name COLLATE NOCASE').all();
  if (location) clients = clients.filter((c) => c.location === location);
  const summaries = sortClients(clients.map(clientSummary), sortBy);
  const pays = db.prepare('SELECT * FROM payments WHERE month_label = ? ORDER BY payment_date, id').all(month);
  const byClient = {};
  pays.forEach((p) => {
    if (!byClient[p.client_id]) byClient[p.client_id] = { ...p, amount: 0, receipt_no: '', cash_reco_no: '' };
    const agg = byClient[p.client_id];
    agg.amount = round2(agg.amount + (p.amount || 0));
    if (p.receipt_no) agg.receipt_no = agg.receipt_no ? `${agg.receipt_no}, ${p.receipt_no}` : p.receipt_no;
    if (p.cash_reco_no) agg.cash_reco_no = agg.cash_reco_no ? `${agg.cash_reco_no}, ${p.cash_reco_no}` : p.cash_reco_no;
    agg.offices = [...new Set([...(agg.offices || []), p.office || 'Harare'])].join(', ');
  });

  res.json({
    month,
    sort: sortBy,
    location: location || 'All',
    rows: summaries.map((c) => ({
      client_id: c.id,
      name: c.name,
      surname: c.surname,
      firstName: c.firstName,
      stand_no: c.stand_no,
      location: c.location,
      category: c.category,
      balance_brought_down: c.balance_brought_down,
      total_paid: c.totalPaid,
      last_date_paid: c.lastDate,
      payment: byClient[c.id] || null,
    })),
  });
});

router.post('/payments/monthly/bulk', authRequired, rolesAllowed('finance', 'admin'), (req, res) => {
  const { month, entries } = req.body || {};
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return res.status(400).json({ error: 'Valid month required' });

  const ins = db.prepare(
    'INSERT INTO payments (client_id, payment_date, month_label, amount, receipt_no, cash_reco_no) VALUES (?,?,?,?,?,?)'
  );
  const upd = db.prepare(
    'UPDATE payments SET amount = ?, receipt_no = ?, cash_reco_no = ?, payment_date = ? WHERE id = ?'
  );
  const find = db.prepare('SELECT id FROM payments WHERE client_id = ? AND month_label = ?');
  const findReceipt = db.prepare('SELECT id, client_id FROM payments WHERE receipt_no = ? AND receipt_no IS NOT NULL AND receipt_no != \'\'');

  let saved = 0;
  const tx = db.transaction(() => {
    for (const e of entries || []) {
      const amt = Number(e.amount);
      if (!amt || amt <= 0) continue;
      const clientId = Number(e.client_id);
      const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
      if (!client) continue;

      const receipt = String(e.receipt_no || '').trim();
      const cash = String(e.cash_reco_no || '').trim();
      if (receipt) {
        const dup = findReceipt.get(receipt);
        if (dup && dup.client_id !== clientId) throw new Error(`Receipt ${receipt} already used`);
      }

      const date = e.payment_date?.slice(0, 10) || `${month}-28`;
      const existing = find.get(clientId, month);
      if (existing) {
        upd.run(round2(amt), receipt || null, cash || null, date, existing.id);
      } else {
        ins.run(clientId, date, month, round2(amt), receipt || null, cash || null);
      }

      const lastDate = db.prepare('SELECT MAX(payment_date) AS d FROM payments WHERE client_id = ?').get(clientId).d;
      db.prepare('UPDATE clients SET last_date_paid = ? WHERE id = ?').run(lastDate, clientId);
      saved++;
    }
  });

  try {
    tx();
    res.json({ ok: true, saved });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
