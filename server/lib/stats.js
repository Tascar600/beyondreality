const { db } = require('../db');
const { normalizeLocation } = require('./excel-config');

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function parseName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    surname: parts.length > 1 ? parts[parts.length - 1] : parts[0] || '',
  };
}

function maxPaymentDate(payments, fallback) {
  if (!payments?.length) return fallback || null;
  return payments.reduce((max, p) => {
    if (!p.payment_date) return max;
    return !max || p.payment_date > max ? p.payment_date : max;
  }, fallback || null);
}

function clientSummary(client) {
  const payments = db.prepare(
    'SELECT id, amount, payment_date, receipt_no, cash_reco_no, month_label FROM payments WHERE client_id = ? ORDER BY payment_date, id'
  ).all(client.id);
  const monthlySum = round2(payments.reduce((s, p) => s + (p.amount || 0), 0));
  const totalPaid = round2((client.balance_brought_down || 0) + monthlySum);
  const lastDate = maxPaymentDate(payments, client.last_date_paid);
  const { firstName, surname } = parseName(client.name);
  return { ...client, payments, monthlySum, totalPaid, lastDate, firstName, surname };
}

function locationFilter(location) {
  const loc = normalizeLocation(location);
  if (!loc || loc === 'All') return { sql: '', params: [] };
  return { sql: ' AND location = ?', params: [loc] };
}

function allClientSummaries(location) {
  const { sql, params } = locationFilter(location);
  return db.prepare(`SELECT * FROM clients WHERE 1=1${sql} ORDER BY name COLLATE NOCASE`).all(...params).map(clientSummary);
}

/** Single-query payments load — used for large Excel exports */
function allClientSummariesForExport(location) {
  const loc = normalizeLocation(location);
  const filterAll = !loc || loc === 'All';
  const { sql, params } = filterAll ? { sql: '', params: [] } : locationFilter(loc);
  const clients = db.prepare(`SELECT * FROM clients WHERE 1=1${sql} ORDER BY name COLLATE NOCASE`).all(...params);
  if (!clients.length) return [];

  const locSql = filterAll ? '' : ' AND c.location = ?';
  const payParams = filterAll ? [] : [loc];
  const allPayments = db.prepare(`
    SELECT p.id, p.client_id, p.amount, p.payment_date, p.receipt_no, p.cash_reco_no, p.month_label
    FROM payments p JOIN clients c ON c.id = p.client_id
    WHERE 1=1${locSql}
    ORDER BY p.client_id, p.payment_date, p.id
  `).all(...payParams);

  const payByClient = new Map();
  for (const p of allPayments) {
    if (!payByClient.has(p.client_id)) payByClient.set(p.client_id, []);
    payByClient.get(p.client_id).push(p);
  }

  return clients.map((client) => {
    const payments = payByClient.get(client.id) || [];
    const monthlySum = round2(payments.reduce((s, p) => s + (p.amount || 0), 0));
    const totalPaid = round2((client.balance_brought_down || 0) + monthlySum);
    const lastDate = maxPaymentDate(payments, client.last_date_paid);
    const { firstName, surname } = parseName(client.name);
    return { ...client, payments, monthlySum, totalPaid, lastDate, firstName, surname };
  });
}

function needsReminder(summary, days = 90) {
  if (!summary.lastDate) return true;
  const last = new Date(summary.lastDate + 'T00:00:00').getTime();
  return (Date.now() - last) / 86400000 > days;
}

function sortClients(clients, sortBy = 'name') {
  const list = [...clients];
  const cmp = (a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
  if (sortBy === 'stand') list.sort((a, b) => cmp(a.stand_no || '99999', b.stand_no || '99999'));
  else if (sortBy === 'surname') list.sort((a, b) => cmp(a.surname, b.surname) || cmp(a.name, b.name));
  else list.sort((a, b) => cmp(a.name, b.name));
  return list;
}

function normalizeStand(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : s.toUpperCase();
}

function loginNameMatches(name, input) {
  const q = String(input || '').trim().toUpperCase();
  if (!q) return false;
  const { firstName, surname } = parseName(name);
  const full = String(name || '').trim().toUpperCase();
  return firstName.toUpperCase() === q
    || surname.toUpperCase() === q
    || full === q
    || full.startsWith(q + ' ')
    || full.endsWith(' ' + q);
}

function findClientByLogin(loginName, standNo, location = '') {
  const stand = normalizeStand(standNo);
  if (!stand || !String(loginName || '').trim()) return null;

  const all = db.prepare('SELECT * FROM clients').all();
  let matches = all.filter((c) => normalizeStand(c.stand_no) === stand && loginNameMatches(c.name, loginName));

  if (location) {
    const loc = normalizeLocation(location);
    if (loc) matches = matches.filter((c) => c.location === loc);
  }

  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const err = new Error(`Multiple accounts for stand ${stand}. Select your location (${matches.map((m) => m.location).join(', ')})`);
    err.code = 'MULTIPLE_MATCH';
    err.locations = [...new Set(matches.map((m) => m.location))];
    throw err;
  }
  return null;
}

module.exports = {
  round2, parseName, clientSummary, allClientSummaries, allClientSummariesForExport,
  needsReminder, sortClients, findClientByLogin, locationFilter,
};
