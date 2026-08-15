import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, niceDate, monthLabel } from '../api';
import { useAuth } from '../auth';

export default function ClientHome() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/dashboard/client')
      .then((d) => (d.noClient ? setErr('No client record linked. Contact the housing office.') : setData(d)))
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="alert alert-err">{err}</div>;
  if (!data) return <div className="page-center">Loading…</div>;

  const { client, payments, uploads, notifications } = data;
  let running = client.balance_brought_down || 0;

  return (
    <div>
      <div className="page-head">
        <h1>My Stand · {client.name}</h1>
        <div className="toolbar">
          <Link to={`/clients/${user.client_id}`} className="btn">View full record</Link>
          <button className="btn no-print" onClick={() => window.print()}>Print my statement</button>
        </div>
      </div>

      <div id="print-statement">
        <div className="print-header">
          <div className="ph-title">BEYOND REALITY HOUSING SCHEME</div>
          <div className="ph-sub">Account Statement — {client.name} · Stand {client.stand_no || '—'} · {client.location || '—'}</div>
        </div>
        <div className="stats-grid">
        <div className="stat green"><div className="stat-value">{client.location || '—'}</div><div className="stat-label">Location</div></div>
        <div className="stat"><div className="stat-value">{client.stand_no || '—'}</div><div className="stat-label">Stand No</div></div>
        <div className="stat blue"><div className="stat-value">{money(client.balance_brought_down)}</div><div className="stat-label">Balance Brought Down</div></div>
        <div className="stat amber"><div className="stat-value">{money(client.totalPaid)}</div><div className="stat-label">Total Paid</div></div>
        {client.outstanding != null && (
          <div className="stat red"><div className="stat-value">{money(client.outstanding)}</div><div className="stat-label">Outstanding</div></div>
        )}
      </div>

      <div className="alert alert-info">
        Category: <strong>{client.category || 'N/A'}</strong>
        · Last payment: <strong>{niceDate(client.lastDatePaid)}</strong>
        · Stand size: <strong>{client.stand_size ? `${client.stand_size} sqm` : '—'}</strong>
        {client.purchasePrice != null && <> · Purchase price: <strong>{money(client.purchasePrice)}</strong></>}
      </div>

      <section className="card">
        <h2>My Payment History</h2>
        <table className="table">
          <thead>
            <tr><th>Period</th><th className="num">Amount</th><th>Receipt No</th><th>Cash Reco No</th><th>Office</th><th className="num">Running Total</th><th>Date Paid</th></tr>
          </thead>
          <tbody>
            <tr className="bd-row">
              <td>Balance brought down</td>
              <td className="num">{money(client.balance_brought_down)}</td>
              <td>—</td><td>—</td><td>—</td>
              <td className="num">{money(client.balance_brought_down)}</td>
              <td>—</td>
            </tr>
            {payments.map((p) => {
              running += p.amount;
              return (
                <tr key={p.id}>
                  <td>{monthLabel(p.month_label)}</td>
                  <td className="num">{money(p.amount)}</td>
                  <td>{p.receipt_no || '—'}</td>
                  <td>{p.cash_reco_no || '—'}</td>
                  <td>{p.office || '—'}</td>
                  <td className="num">{money(running)}</td>
                  <td>{niceDate(p.payment_date)}</td>
                </tr>
              );
            })}
            <tr className="total-row">
              <td>Total paid (incl B/D)</td>
              <td className="num">{money(client.totalPaid)}</td>
              <td colSpan={5}></td>
            </tr>
          </tbody>
        </table>
      </section>

      {uploads?.length > 0 && (
        <section className="card" id="print-uploads">
          <h2>My Documents</h2>
          <table className="table">
            <thead><tr><th>Type</th><th>File</th><th>Uploaded</th></tr></thead>
            <tbody>
              {uploads.map((u) => (
                <tr key={u.id}>
                  <td>{u.kind}</td>
                  <td><a href={`/uploads/${u.filename}`} target="_blank" rel="noreferrer">{u.original_name}</a></td>
                  <td>{niceDate(u.uploaded_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {notifications?.length > 0 && (
        <section className="card" id="print-notifications">
          <h2>Notifications</h2>
          <ul className="notice-list">
            {notifications.map((n) => (
              <li key={n.id}><strong>{n.channel} · {niceDate(n.created_at)}</strong><br />{n.message}</li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </div>
  );
}
