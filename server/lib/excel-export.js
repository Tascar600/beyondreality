const XLSX = require('xlsx');
const { db } = require('../db');
const { allClientSummariesForExport, round2 } = require('./stats');
const { normalizeLocation, MONTH_COLUMNS, buildLedgerHeaders } = require('./excel-config');

function toExcelDate(iso) {
  if (!iso) return null;
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  if (isNaN(d.getTime())) return null;
  return d.getTime() / 86400000 + 25569;
}

function buildPayMap(payments) {
  const map = {};
  for (const p of payments || []) {
    const ym = p.month_label;
    if (!ym) continue;
    if (!map[ym]) {
      map[ym] = { ...p };
      continue;
    }
    map[ym].amount = round2((map[ym].amount || 0) + (p.amount || 0));
    const receipts = [map[ym].receipt_no, p.receipt_no].filter((v) => v && String(v).trim());
    map[ym].receipt_no = [...new Set(receipts.map(String))].join(', ');
    const cash = [map[ym].cash_reco_no, p.cash_reco_no].filter((v) => v && String(v).trim());
    map[ym].cash_reco_no = [...new Set(cash.map(String))].join(', ');
    if (p.payment_date && (!map[ym].payment_date || p.payment_date > map[ym].payment_date)) {
      map[ym].payment_date = p.payment_date;
    }
  }
  return map;
}

function maxPaymentDate(payments, fallback) {
  if (!payments?.length) return fallback || null;
  return payments.reduce((max, p) => {
    if (!p.payment_date) return max;
    return !max || p.payment_date > max ? p.payment_date : max;
  }, null);
}

function writeWorkbook(sheets) {
  const wb = XLSX.utils.book_new();
  for (const { name, rows, cols, dateCols } of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    if (cols) ws['!cols'] = cols;
    if (dateCols) {
      for (const { col, startRow } of dateCols) {
        for (let r = startRow; r < rows.length; r++) {
          const addr = XLSX.utils.encode_cell({ r, c: col });
          if (ws[addr] && ws[addr].t === 'n') ws[addr].z = 'dd-mmm-yyyy';
        }
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function clientsForExport(location) {
  const loc = normalizeLocation(location);
  const filterLoc = !loc || loc === 'All' ? '' : loc;
  return allClientSummariesForExport(filterLoc);
}

function buildFullLedgerWorkbook(location) {
  const clients = clientsForExport(location);
  const headers = buildLedgerHeaders();
  const rows = [headers];
  const lastDateCol = headers.indexOf('LAST DATE PAID');

  clients.forEach((c, idx) => {
    const payMap = buildPayMap(c.payments);
    const lastDate = maxPaymentDate(c.payments, c.last_date_paid);

    const row = [
      idx + 1,
      c.name,
      c.category || '',
      c.location || 'Harare',
      c.stand_no || '',
      c.stand_size ?? '',
      c.balance_brought_down ?? 0,
    ];

    for (const m of MONTH_COLUMNS) {
      const p = payMap[m.ym];
      row.push(
        p?.amount != null ? p.amount : '',
        p?.receipt_no ? String(p.receipt_no) : '',
        p?.cash_reco_no ? String(p.cash_reco_no) : '',
      );
    }

    row.push(c.totalPaid ?? 0, toExcelDate(lastDate) ?? '');
    rows.push(row);
  });

  return writeWorkbook([{
    name: 'PAYMENTS',
    rows,
    cols: headers.map((h) => ({ wch: Math.min(18, Math.max(8, String(h).length + 1)) })),
    dateCols: lastDateCol >= 0 ? [{ col: lastDateCol, startRow: 1 }] : [],
  }]);
}

function buildReceiptsWorkbook(location) {
  const loc = normalizeLocation(location);
  const locSql = loc ? ' AND c.location = ?' : '';
  const params = loc ? [loc] : [];
  const all = db.prepare(`
    SELECT p.*, c.name AS client_name, c.stand_no, c.location, c.category
    FROM payments p JOIN clients c ON c.id = p.client_id
    WHERE 1=1${locSql}
    ORDER BY c.location, c.name COLLATE NOCASE, p.payment_date
  `).all(...params);

  const headers = ['Location', 'Client Name', 'Stand No', 'Category', 'Month', 'Date Paid', 'Amount', 'Receipt No', 'Cash Reco No'];
  const rows = [headers];
  for (const p of all) {
    rows.push([
      p.location, p.client_name, p.stand_no, p.category || '',
      p.month_label, toExcelDate(p.payment_date) ?? p.payment_date ?? '',
      p.amount,
      p.receipt_no ? String(p.receipt_no) : '',
      p.cash_reco_no ? String(p.cash_reco_no) : '',
    ]);
  }
  return writeWorkbook([{
    name: 'Receipts Register',
    rows,
    dateCols: [{ col: 5, startRow: 1 }],
  }]);
}

function buildReconciliationWorkbook(location) {
  const clients = clientsForExport(location);
  const headers = ['Location', 'Client Name', 'Stand No', 'Category', 'Balance Brought Down', 'Monthly Payments', 'Total Paid', 'Status'];
  const rows = [headers];
  for (const s of clients) {
    const expected = round2((s.balance_brought_down || 0) + s.monthlySum);
    const status = Math.abs(expected - s.totalPaid) < 0.005 ? 'MATCH' : 'VARIANCE';
    rows.push([
      s.location, s.name, s.stand_no, s.category || '',
      s.balance_brought_down, s.monthlySum, s.totalPaid, status,
    ]);
  }
  return writeWorkbook([{ name: 'Reconciliation', rows }]);
}

function buildCategoriesWorkbook(location) {
  const clients = clientsForExport(location);
  const byCat = {};
  for (const s of clients) {
    const key = `${s.location}::${s.category || 'Uncategorised'}`;
    byCat[key] = byCat[key] || { location: s.location, category: s.category || 'Uncategorised', stands: 0, paid: 0 };
    byCat[key].stands += 1;
    byCat[key].paid = round2(byCat[key].paid + s.totalPaid);
  }
  const headers = ['Location', 'Category', 'Stands', 'Total Paid', 'Average Paid'];
  const rows = [headers];
  for (const v of Object.values(byCat).sort((a, b) => b.paid - a.paid)) {
    rows.push([v.location, v.category, v.stands, v.paid, round2(v.paid / Math.max(1, v.stands))]);
  }
  return writeWorkbook([{ name: 'Category Breakdown', rows }]);
}

function buildTemplateWorkbook() {
  const headers = buildLedgerHeaders();
  return writeWorkbook([{
    name: 'PAYMENTS',
    rows: [headers],
    cols: headers.map((h) => ({ wch: Math.min(18, Math.max(8, String(h).length + 1)) })),
  }]);
}

function exportFilename(kind, location) {
  const loc = normalizeLocation(location) || 'All';
  const date = new Date().toISOString().slice(0, 10);
  return `Beyond-Reality-${kind}-${loc}-${date}.xlsx`;
}

module.exports = {
  buildTemplateWorkbook,
  buildFullLedgerWorkbook,
  buildReceiptsWorkbook,
  buildReconciliationWorkbook,
  buildCategoriesWorkbook,
  exportFilename,
};
