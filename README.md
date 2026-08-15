# Beyond Reality Housing Portal

Web portal for the Beyond Reality housing scheme: client records, payment ledger (Balance Brought Down + monthly instalments Jan–Dec), digital receipts (Receipt No + Cash Reco No), admin & client dashboards, overdue notices, and Excel exports.

**Stack:** React (Vite) · Node.js (Express) · SQLite (`node:sqlite` — zero-config, migrate to MySQL/PostgreSQL later by swapping `server/db.js`).

---

## Quick start

```bash
# 1. API server  -> http://localhost:4040
cd server
npm install
npm start

# 2. Frontend    -> http://localhost:5180
cd ../client
npm install
npm run dev
```

Open http://localhost:5180

**Demo logins**
| Role | Username | Password |
|---|---|---|
| Administrator | `admin` | `admin123` |
| Finance | `finance` | `finance123` |
| Cashier (Bursary) | `cashier` | `cashier123` |
| Client | `client` | `client123` |

The `client` account is linked to the first imported client (currently **ABIGAIL ZHANJE**). Change the link in SQL:
```sql
UPDATE users SET client_id = 123 WHERE role = 'client';
```

## Data import (already done for you)

The live Excel workbook (`COMBINED SCUSTOMER STATEMENTS_042427.xlsx`, 3,518 clients / 6,519 payments) was imported into `server/data/portal.db`. Re-run it any time:

```bash
cd scripts
npm install
node import-excel.js "C:\path\to\workbook.xlsx"   # --force to wipe & reimport
```

What the importer does:
- **PAYMENTS sheet** → one `clients` row + monthly `payments` rows per client. Columns mapped positionally: `AMOUNT PAID` = Balance Brought Down, `JAN-FEB`…`JULY` = the 18 month columns (Jan 2025 – Jul 2026), `TOTAL` is recomputed (verified against Excel totals).
- **Statement sheets** (Sheet2–Sheet7) → enrich matching clients (file no, price, purchase price, matched by name or stand no), attach `Receipt No`s to payments in the same month, and archive any unmatched receipt lines in `statement_entries` (shown as historical archive, **not** added to totals to avoid double counting).

## Formulas (auto, single source of truth on the server)

- `Total Paid = Balance Brought Down + Σ monthly payments`
- `Outstanding = Purchase Price − Total Paid` (purchase price defaults to `size × $22.5/sqm` from the statements; editable per client)
- `Running Balance = B/D + cumulative payments`
- Totals recompute automatically whenever a payment is added/deleted. Payment entry **requires** a unique `Receipt No` and `Cash Reco No` (duplicates rejected with 409).

## Features map

- **Client Records** — name, category (Teachers/ZAOGA/Civil Servants…), stand no, size, file no, ID, DOB, contact, employment, next of kin; document uploads (Application Form / Offer Letter / Receipt / Statement).
- **Payment Ledger** — per-client ledger with B/D row, monthly rows, receipt & cash-reco numbers, running balance, last date paid.
- **Receipts & Reconciliation** — receipts register export; reconciliation report flags `MATCH`/`VARIANCE` per client (`B/D + months vs total`).
- **Dashboards** — admin: stands sold, total payments received, total outstanding, overdue accounts (configurable window, default 45 days), category breakdown, payments-by-month chart, recent payments. Client: own payment history, balance, next instalment due.
- **Notifications** — overdue notice drafts include client, stand, totals and last receipt number. `POST /api/notifications/send` logs SMS/email drafts to the notification log (a real provider — Twilio / Africa's Talking / SMTP — plugs into `server/lib/notify.js`; set credentials in `.env`).
- **Reports** — CSV exports (Excel-ready, BOM + UTF-8): full ledger, receipts register, reconciliation, category breakdown; PDF by browser print.

## API overview

```
POST /api/auth/login · GET /api/auth/me
GET    /api/clients?search=&category=&page=      (admin/finance)
POST   /api/clients  PUT /api/clients/:id  DELETE /api/clients/:id
GET    /api/clients/:id          (client role: own record only)
POST   /api/clients/:id/payments (receipt_no + cash_reco_no required, unique)
DELETE /api/payments/:id
POST/DELETE /api/clients/:id/uploads · GET /api/uploads…
GET    /api/dashboard/admin · GET /api/dashboard/client
GET    /api/reports/{ledger,receipts,reconciliation,categories}.csv
GET    /api/notices/overdue?days= · POST /api/notifications/send · GET /api/notifications
```

## Project layout

```
server/   Express API + SQLite (db.js schema, routes/, auth.js, lib/stats.js, lib/notify.js)
client/   React + Vite SPA (pages/, components/, styles.css)
scripts/  import-excel.js (Excel → database)
```

Note: `76626741852980.pdf` (application form) could not be parsed in this environment — the portal accepts uploads of scanned forms instead.
