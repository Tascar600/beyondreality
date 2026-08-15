import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, niceDate, monthLabel, downloadFile } from '../api';
import { useLocation } from '../location';

function Stat({ label, value, sub, tone }) {
  return (
    <div className={`stat ${tone || ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export default function AdminDashboard() {
  const { location } = useLocation();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [days, setDays] = useState(90);
  const [dlBusy, setDlBusy] = useState(false);

  useEffect(() => {
    api(`/dashboard/admin?days=${days}&location=${encodeURIComponent(location)}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [days, location]);

  if (error) return <div className="alert alert-err">{error}</div>;
  if (!data) return <div className="page-center">Loading dashboard…</div>;

  const maxMonthly = Math.max(1, ...data.monthlyTotals.map((m) => m.amount));

  return (
    <div>
      <div className="page-head">
        <h1>Finance Dashboard · {location}</h1>
        <div className="toolbar">
          Reminder window
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[60, 90, 120].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
          <Link to="/payments" className="btn">Monthly Payments</Link>
          <Link to="/import" className="btn">Excel Import</Link>
          <Link to="/reports" className="btn">Reports</Link>
          <button type="button" className="btn no-print" onClick={() => window.print()}>Print dashboard</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={dlBusy}
            onClick={async () => {
              setDlBusy(true);
              try {
                await downloadFile(`/reports/ledger/download?location=${encodeURIComponent(location)}`, 'Beyond-Reality-Full-Ledger.xlsx');
              } catch (e) { setError(e.message); }
              finally { setDlBusy(false); }
            }}
          >
            {dlBusy ? 'Preparing…' : 'Download Full Ledger'}
          </button>
        </div>
      </div>

      <div id="print-dashboard">
        <div className="print-header">
          <div className="ph-title">BEYOND REALITY HOUSING SCHEME</div>
          <div className="ph-sub">Finance Dashboard — {location}</div>
        </div>
      <div className="stats-grid">
        <Stat label="Stands Sold" value={data.standsSold.toLocaleString()} tone="green" />
        <Stat label="Total Payments Received" value={money(data.paymentsReceived)} tone="blue" />
        <Stat label="Need Reminder" value={data.reminderDueCount.toLocaleString()} sub="no payment in window" tone="amber" />
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Payments by Month (USD)</h2>
          <div className="bar-chart">
            {data.monthlyTotals.map((m) => (
              <div className="bar-col" key={m.month_label} title={`${monthLabel(m.month_label)}: ${money(m.amount)} (${m.payments} payments)`}>
                <div className="bar" style={{ height: `${Math.max(3, (m.amount / maxMonthly) * 100)}%` }} />
                <div className="bar-label">{monthLabel(m.month_label).split(' ')[0]}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2>Category Breakdown</h2>
          <table className="table">
            <thead>
              <tr><th>Category</th><th className="num">Stands</th><th className="num">Share</th></tr>
            </thead>
            <tbody>
              {data.categories.map((c) => (
                <tr key={c.category}>
                  <td>{c.category}</td>
                  <td className="num">{c.count.toLocaleString()}</td>
                  <td className="num">{((c.count / Math.max(1, data.standsSold)) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card">
        <h2>Clients Needing Reminder ({data.reminderDueCount})</h2>
        {data.reminderDue.length === 0 ? (
          <p className="hint">All clients have paid within the reminder window.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Client</th><th>Stand</th><th>Category</th><th className="num">Total Paid</th><th>Last Paid</th><th></th></tr>
            </thead>
            <tbody>
              {data.reminderDue.map((s) => (
                <tr key={s.id}>
                  <td><Link to={`/clients/${s.id}`}>{s.name}</Link></td>
                  <td>{s.stand_no}</td>
                  <td>{s.category}</td>
                  <td className="num">{money(s.totalPaid)}</td>
                  <td>{niceDate(s.lastDate)}</td>
                  <td><Link to="/reports" className="btn btn-sm">Remind</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Recent Payments</h2>
        <table className="table">
          <thead>
            <tr><th>Client</th><th>Stand</th><th>Period</th><th className="num">Amount</th><th>Receipt No</th><th>Cash Reco No</th><th>Office</th><th>Date</th></tr>
          </thead>
          <tbody>
            {data.recent.map((p) => (
              <tr key={p.id}>
                <td>{p.client_name}</td>
                <td>{p.stand_no}</td>
                <td>{monthLabel(p.month_label)}</td>
                <td className="num">{money(p.amount)}</td>
                <td>{p.receipt_no || '—'}</td>
                <td>{p.cash_reco_no || '—'}</td>
                <td>{p.office || '—'}</td>
                <td>{niceDate(p.payment_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      </div>
    </div>
  );
}
