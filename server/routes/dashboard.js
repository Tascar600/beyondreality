const express = require('express');
const { db } = require('../db');
const { authRequired, rolesAllowed } = require('../auth');
const { round2, allClientSummaries, needsReminder } = require('../lib/stats');
const { normalizeLocation } = require('../lib/excel-config');

const router = express.Router();

router.get('/dashboard/admin', authRequired, rolesAllowed('finance', 'admin'), (req, res) => {
  const location = normalizeLocation(req.query.location) || '';
  const summaries = allClientSummaries(location || 'All');
  const days = Math.max(30, parseInt(req.query.days, 10) || 90);

  const locSql = location ? ' AND c.location = ?' : '';
  const locParams = location ? [location] : [];

  const standsSold = summaries.length;
  const paymentsReceived = round2(db.prepare(`
    SELECT COALESCE(SUM(p.amount),0) AS s FROM payments p
    JOIN clients c ON c.id = p.client_id WHERE 1=1${locSql}
  `).get(...locParams).s);
  const reminderDue = summaries.filter((s) => needsReminder(s, days));

  const categories = db.prepare(`
    SELECT category, COUNT(*) AS stands FROM clients c WHERE 1=1${locSql}
    GROUP BY category ORDER BY COUNT(*) DESC
  `).all(...locParams).map((r) => ({ category: r.category || 'Uncategorised', count: r.stands }));

  const recent = db.prepare(`
    SELECT p.*, c.name AS client_name, c.stand_no, c.location
    FROM payments p JOIN clients c ON c.id = p.client_id
    WHERE 1=1${locSql}
    ORDER BY p.created_at DESC, p.id DESC LIMIT 10
  `).all(...locParams);

  const monthlyTotals = db.prepare(`
    SELECT p.month_label, SUM(p.amount) AS amount, COUNT(*) AS payments
    FROM payments p JOIN clients c ON c.id = p.client_id
    WHERE 1=1${locSql}
    GROUP BY p.month_label ORDER BY p.month_label
  `).all(...locParams);

  res.json({
    location: location || 'All',
    standsSold,
    paymentsReceived,
    reminderDueCount: reminderDue.length,
    reminderDue: reminderDue.slice(0, 50),
    categories,
    recent,
    monthlyTotals,
    days,
    generatedAt: new Date().toISOString(),
  });
});

router.get('/dashboard/client', authRequired, rolesAllowed('client', 'finance', 'admin'), (req, res) => {
  if (req.user.role === 'client' && !req.user.client_id) {
    return res.json({ error: 'No client linked to this account', noClient: true });
  }
  const id = req.user.role === 'client' ? req.user.client_id : Number(req.query.client_id || 0);
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const payments = db.prepare(
    'SELECT * FROM payments WHERE client_id = ? ORDER BY payment_date, id'
  ).all(client.id);
  const totalPaid = round2((client.balance_brought_down || 0) + payments.reduce((s, p) => s + (p.amount || 0), 0));
  const last = payments.reduce((max, p) => (!max || (p.payment_date && p.payment_date > max) ? p.payment_date : max), null);
  const purchasePrice = client.purchase_price ?? (client.stand_size ? round2(client.stand_size * (client.price_per_sqm || 22.5)) : null);
  const outstanding = purchasePrice != null ? round2(purchasePrice - totalPaid) : null;

  res.json({
    client: {
      ...client,
      totalPaid,
      lastDatePaid: last || client.last_date_paid,
      purchasePrice,
      outstanding,
    },
    payments,
  });
});

module.exports = router;
