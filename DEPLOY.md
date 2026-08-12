# Beyond Reality Housing Portal — Deployment

## Quick start (development)

1. Double-click `START.bat` or `C:\Windows\Temp\START-BEYOND-REALITY-PORTAL.bat`
2. Open http://localhost:5180
3. Finance login: `finance` / `finance123`
4. Client login: **SURNAME in CAPS** + **Stand Number** (e.g. `ZHANJE` + `1429`)

## Production build

```bat
cd server
npm install
cd ..\client
npm install
npm run build
cd ..\server
set NODE_ENV=production
set PORT=4040
node index.js
```

Open http://localhost:4040 (API serves the built React app).

Copy `server\.env.example` to `server\.env` and set `JWT_SECRET` before going live.

## Locations

Three locations are supported: **Harare**, **Kadoma**, **Norton**.

- Finance selects location in the sidebar — all pages filter to that location.
- Excel import: choose location before upload. Existing COMBINED file format is supported.
- Each location is managed separately (clients, payments, reports, reminders).

## Excel template

Download from **Excel Import** page. Matches `COMBINED SCUSTOMER STATEMENTS_042427.xlsx`:

| Column | Description |
|--------|-------------|
| COUNT | Row number |
| CLIENT NAME | Full name |
| CATEGORY | Teachers, ZAOGA, etc. |
| STAND No. | Stand number |
| SIZE | Stand size (sqm) |
| AMOUNT PAID | Balance brought down |
| JAN-FEB … JULY | Monthly payments (2025–2026) |
| TOTAL | Total column |
| LAST DATE PAID | Last payment date |

## Data import (first time)

```bat
npm --prefix scripts run import -- --force
```

Uses Excel at Desktop: `COMBINED SCUSTOMER STATEMENTS_042427.xlsx`. All rows default to **Harare**. Reassign location in client records or re-import per location.

## Deploy checklist

- [ ] Set strong `JWT_SECRET` in `.env`
- [ ] Configure SMTP for live email reminders
- [ ] Run `npm run build` in client folder
- [ ] Set `NODE_ENV=production`
- [ ] Back up `server/data/portal.db` regularly
- [ ] Use HTTPS reverse proxy (nginx, Caddy, or cloud host)
