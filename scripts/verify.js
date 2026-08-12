const { db } = require('../server/db');
const { clientSummary } = require('../server/lib/stats');

for (const name of ['CHINODA LORRINE', 'CHRISTOPHER MARANJISI', 'ABIGAIL ZHANJE']) {
  const c = db.prepare('SELECT * FROM clients WHERE name = ?').get(name);
  if (!c) { console.log(name, 'NOT FOUND'); continue; }
  const s = clientSummary(c);
  console.log(`${s.name} | stand ${s.stand_no} | B/D $${s.balance_brought_down} | total paid $${s.totalPaid} | last ${s.lastDate} | receipts: ${s.payments.filter(p=>p.receipt_no).length}`);
}
const st = db.prepare("SELECT id, name, stand_no, file_no, price_per_sqm, purchase_price FROM clients WHERE name LIKE '%EGITA%'").all();
console.log('statements:', JSON.stringify(st));
const withRec = db.prepare("SELECT COUNT(*) AS c FROM payments WHERE receipt_no IS NOT NULL AND receipt_no != ''").get();
console.log('payments with receipt no:', withRec.c);
const stm = db.prepare('SELECT COUNT(*) AS c FROM statement_entries').get();
console.log('statement archive entries:', stm.c);
console.log('distinct month labels:', db.prepare('SELECT DISTINCT month_label FROM payments ORDER BY month_label').all().map(r=>r.month_label).join(', '));