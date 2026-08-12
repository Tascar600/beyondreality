/** Legacy COMBINED file (18 cols, JAN-FEB combined, no Feb 2025) */
const LEGACY_MONTH_BY_COL_INDEX = {
  6: '2025-01',
  7: '2025-03',
  8: '2025-04',
  9: '2025-05',
  10: '2025-06',
  11: '2025-07',
  12: '2025-08',
  13: '2025-09',
  14: '2025-10',
  15: '2025-11',
  16: '2025-12',
  17: '2026-01',
  18: '2026-02',
  19: '2026-03',
  20: '2026-04',
  21: '2026-05',
  22: '2026-06',
  23: '2026-07',
};

/** New export format — each month separate, year in label */
const MONTH_COLUMNS = [
  { ym: '2025-01', label: 'JANUARY 2025' },
  { ym: '2025-02', label: 'FEBRUARY 2025' },
  { ym: '2025-03', label: 'MARCH 2025' },
  { ym: '2025-04', label: 'APRIL 2025' },
  { ym: '2025-05', label: 'MAY 2025' },
  { ym: '2025-06', label: 'JUNE 2025' },
  { ym: '2025-07', label: 'JULY 2025' },
  { ym: '2025-08', label: 'AUGUST 2025' },
  { ym: '2025-09', label: 'SEPTEMBER 2025' },
  { ym: '2025-10', label: 'OCTOBER 2025' },
  { ym: '2025-11', label: 'NOVEMBER 2025' },
  { ym: '2025-12', label: 'DECEMBER 2025' },
  { ym: '2026-01', label: 'JANUARY 2026' },
  { ym: '2026-02', label: 'FEBRUARY 2026' },
  { ym: '2026-03', label: 'MARCH 2026' },
  { ym: '2026-04', label: 'APRIL 2026' },
  { ym: '2026-05', label: 'MAY 2026' },
  { ym: '2026-06', label: 'JUNE 2026' },
  { ym: '2026-07', label: 'JULY 2026' },
];

/** Import header aliases → month_label */
const MONTH_HEADER_ALIASES = {
  'JAN-FEB': '2025-01',
  'JANUARY 2025': '2025-01',
  'JAN 2025': '2025-01',
  'FEBRUARY 2025': '2025-02',
  'FEB 2025': '2025-02',
};

const BASE_HEADERS = ['COUNT', 'CLIENT NAME', 'CATEGORY', 'LOCATION', 'STAND No.', 'SIZE', 'AMOUNT PAID'];

function buildLedgerHeaders() {
  const headers = [...BASE_HEADERS];
  for (const m of MONTH_COLUMNS) {
    headers.push(m.label, `${m.label} Receipt`, `${m.label} Cash Reco`);
  }
  headers.push('TOTAL', 'LAST DATE PAID');
  return headers;
}

const PAYMENTS_HEADERS = [
  'COUNT', 'CLIENT NAME', 'CATEGORY', 'STAND No.', 'SIZE', 'AMOUNT PAID',
  ...MONTH_COLUMNS.map((m) => m.label),
  'TOTAL', 'LAST DATE PAID',
];

const LOCATIONS = ['Harare', 'Kadoma', 'Norton'];

function normalizeLocation(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const hit = LOCATIONS.find((l) => l.toLowerCase() === s.toLowerCase());
  return hit || s;
}

function resolveMonthHeader(header) {
  const up = String(header || '').trim().toUpperCase();
  if (MONTH_HEADER_ALIASES[up]) return MONTH_HEADER_ALIASES[up];
  const hit = MONTH_COLUMNS.find((m) => m.label.toUpperCase() === up);
  return hit ? hit.ym : null;
}

function buildHeaderMap(headerRow) {
  const map = { months: {} };
  headerRow.forEach((h, i) => {
    const up = String(h || '').trim().toUpperCase();
    if (up === 'CLIENT NAME') map.name = i;
    if (up === 'CATEGORY') map.category = i;
    if (up === 'LOCATION') map.location = i;
    if (up.includes('STAND')) map.stand = i;
    if (up === 'SIZE') map.size = i;
    if (up === 'AMOUNT PAID' || up === 'BALANCE BROUGHT DOWN') map.bd = i;
    if (up === 'LAST DATE PAID') map.lastDate = i;
    if (up === 'TOTAL') map.total = i;
  });

  const startCol = (map.bd ?? 5) + 1;
  let col = startCol;

  while (col < headerRow.length) {
    const amtHeader = String(headerRow[col] || '').trim();
    if (!amtHeader) break;
    const upAmt = amtHeader.toUpperCase();
    if (upAmt === 'TOTAL') break;

    const ym = resolveMonthHeader(amtHeader);
    if (!ym) break;

    const nextHeader = String(headerRow[col + 1] || '').trim().toUpperCase();
    const receiptLabel = `${upAmt} RECEIPT`;
    if (nextHeader === receiptLabel || nextHeader.endsWith(' RECEIPT')) {
      map.months[ym] = { amount: col, receipt: col + 1, cash: col + 2 };
      col += 3;
    } else {
      map.months[ym] = { amount: col };
      col += 1;
    }
  }

  if (!Object.keys(map.months).length) {
    Object.entries(LEGACY_MONTH_BY_COL_INDEX).forEach(([idx, ym]) => {
      map.months[ym] = { amount: Number(idx) };
    });
  }
  return map;
}

module.exports = {
  PAYMENTS_HEADERS,
  MONTH_BY_COL_INDEX: LEGACY_MONTH_BY_COL_INDEX,
  LEGACY_MONTH_BY_COL_INDEX,
  MONTH_COLUMNS,
  MONTH_HEADER_ALIASES,
  BASE_HEADERS,
  buildLedgerHeaders,
  LOCATIONS,
  normalizeLocation,
  buildHeaderMap,
  resolveMonthHeader,
};
