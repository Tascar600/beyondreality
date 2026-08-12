import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, money, niceDate, monthLabel } from '../api';
import { useAuth } from '../auth';
import { LOCATIONS } from '../location';

const EMPTY = { name: '', category: '', location: 'Harare', stand_no: '', stand_size: '', file_no: '', price_per_sqm: '', purchase_price: '', balance_brought_down: 0, id_number: '', dob: '', contact: '', email: '', employment: '', next_of_kin: '', notes: '' };

export default function ClientDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [c, setC] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [payForm, setPayForm] = useState({ amount: '', month_label: new Date().toISOString().slice(0, 7), payment_date: '', receipt_no: '', cash_reco_no: '' });
  const [savingPay, setSavingPay] = useState(false);
  const [otherForm, setOtherForm] = useState({ show: false, name: '' });

  const load = () => api(`/clients/${id}`).then((d) => { setC(d); setForm((f) => ({ ...EMPTY, ...d })); }).catch((e) => setErr(e.message));

  useEffect(() => { load(); }, [id]);

  const canEdit = user.role !== 'client';

  const saveInfo = async (e) => {
    e.preventDefault();
    setErr(''); setOk('');
    try {
      await api(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(form) });
      await load();
      setOk('Client record saved');
    } catch (ex) { setErr(ex.message); }
  };

  const addPayment = async (e) => {
    e.preventDefault();
    setErr(''); setOk(''); setSavingPay(true);
    try {
      await api(`/clients/${id}/payments`, { method: 'POST', body: JSON.stringify(payForm) });
      await load();
      setOk(`Payment recorded for ${monthLabel(payForm.month_label)}`);
      setPayForm({ amount: '', month_label: payForm.month_label, payment_date: '', receipt_no: '', cash_reco_no: '' });
    } catch (ex) { setErr(ex.message); }
    finally { setSavingPay(false); }
  };

  const delPayment = async (pid) => {
    if (!window.confirm('Delete this payment entry?')) return;
    try {
      await api(`/payments/${pid}`, { method: 'DELETE' });
      load();
    } catch (ex) { setErr(ex.message); }
  };

  const upload = async (e, kind) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', kind);
    try {
      await api(`/clients/${id}/uploads`, { method: 'POST', body: fd });
      load();
      setOk(`Uploaded ${file.name}`);
    } catch (ex) { setErr(ex.message); }
    e.target.value = '';
  };

  const delUpload = async (uid) => {
    if (!window.confirm('Delete this file?')) return;
    try { await api(`/uploads/${uid}`, { method: 'DELETE' }); load(); } catch (ex) { setErr(ex.message); }
  };

  const sendReminder = async () => {
    if (!c.email) { setErr('Add an email address to this client record first.'); return; }
    setErr(''); setOk('');
    try {
      const r = await api('/reminders/send-one', { method: 'POST', body: JSON.stringify({ client_id: c.id, channel: 'email' }) });
      setOk(`Reminder email sent to ${r.sentTo || c.email}`);
      load();
    } catch (ex) { setErr(ex.message); }
  };

  if (err && !c) return <div className="alert alert-err">{err}</div>;
  if (!c) return <div className="page-center">Loading…</div>;

  let running = c.balance_brought_down || 0;
  const rows = c.payments.map((p) => {
    running += p.amount;
    return { ...p, running };
  });

  const UPLOAD_KINDS = ['Application Form', 'Offer Letter', 'Receipt', 'Statement', 'Affidavit'];

  return (
    <div>
      <div className="page-head">
        <h1>{c.name}</h1>
        <div className="toolbar">
          {canEdit && <Link to="/clients" className="btn">Back to clients</Link>}
          {canEdit && c.email && <button className="btn btn-primary" onClick={sendReminder}>Send email reminder</button>}
        </div>
      </div>

      {err && <div className="alert alert-err">{err}</div>}
      {ok && <div className="alert alert-ok">{ok}</div>}

      <div className="stats-grid">
        <div className="stat green"><div className="stat-value">{c.location || '—'}</div><div className="stat-label">Location</div></div>
        <div className="stat"><div className="stat-value">{c.stand_no || '—'}</div><div className="stat-label">Stand No</div></div>
        <div className="stat blue"><div className="stat-value">{money(c.balance_brought_down)}</div><div className="stat-label">Balance Brought Down</div></div>
        <div className="stat amber"><div className="stat-value">{money(c.totalPaid)}</div><div className="stat-label">Total Paid (incl B/D)</div></div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Client Record</h2>
          <form className="form-grid" onSubmit={saveInfo}>
            {[
              ['name', 'Client Name'], ['category', 'Category (Teachers, ZAOGA…)'], ['location', 'Location (Harare, Kadoma, Norton)'], ['stand_no', 'Stand No'], ['file_no', 'File No (CV…)'],
              ['stand_size', 'Stand Size (sqm)', 'number'], ['price_per_sqm', 'Price per SQM ($)', 'number'],
              ['purchase_price', 'Total Purchase Price ($)', 'number'], ['balance_brought_down', 'Balance Brought Down ($)', 'number'],
              ['id_number', 'National ID'], ['dob', 'Date of Birth'], ['contact', 'Phone Contact'], ['email', 'Email'],
              ['employment', 'Employment'], ['next_of_kin', 'Next of Kin'], ['notes', 'Notes'],
            ].map(([k, label, type]) => (
              <div key={k} className="field">
                <label>{label}</label>
                {k === 'location' ? (
                  <select disabled={!canEdit} value={form[k] ?? 'Harare'} onChange={(e) => setForm({ ...form, [k]: e.target.value })}>
                    {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                ) : (
                <input
                  type={type || 'text'}
                  disabled={!canEdit}
                  value={form[k] ?? ''}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
                )}
              </div>
            ))}
            {canEdit && <button className="btn btn-primary">Save record</button>}
          </form>
        </section>

        <div className="stack">
          <section className="card">
            <h2>Record Payment</h2>
            {canEdit ? (
              <form className="form-grid" onSubmit={addPayment}>
                <div className="field"><label>Month</label><input type="month" required value={payForm.month_label} onChange={(e) => setPayForm({ ...payForm, month_label: e.target.value })} /></div>
                <div className="field"><label>Date paid</label><input type="date" value={payForm.payment_date} onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })} /></div>
                <div className="field"><label>Amount ($) *</label><input type="number" step="0.01" min="0.01" required value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} /></div>
                <div className="field"><label>Receipt No</label><input placeholder="e.g. R0123 (optional)" value={payForm.receipt_no} onChange={(e) => setPayForm({ ...payForm, receipt_no: e.target.value })} /></div>
                <div className="field"><label>Cash Reco No</label><input placeholder="e.g. CR0123 (optional)" value={payForm.cash_reco_no} onChange={(e) => setPayForm({ ...payForm, cash_reco_no: e.target.value })} /></div>
                <button className="btn btn-primary" disabled={savingPay}>{savingPay ? 'Saving…' : 'Record payment'}</button>
              </form>
            ) : (
              <p className="hint">Payments are recorded by the finance office.</p>
            )}
            <p className="hint">Total Paid = Balance B/D + sum of monthly payments.</p>
          </section>

          <section className="card">
            <h2>Documents</h2>
            <div className="upload-buttons">
              {canEdit && UPLOAD_KINDS.map((k) => (
                <label key={k} className="btn btn-ghost upload-btn" title={k === 'Affidavit' ? 'You can upload multiple affidavits' : undefined}>
                  + {k}
                  <input type="file" hidden onChange={(e) => upload(e, k)} />
                </label>
              ))}
              {canEdit && !otherForm.show && (
                <button type="button" className="btn btn-ghost upload-btn" onClick={() => setOtherForm({ show: true, name: '' })}>
                  + Add other form
                </button>
              )}
            </div>
            {canEdit && otherForm.show && (
              <div className="other-form-row">
                <input
                  type="text"
                  placeholder="Form name (e.g. ID Copy, Marriage Certificate)"
                  value={otherForm.name}
                  onChange={(e) => setOtherForm({ ...otherForm, name: e.target.value })}
                  autoFocus
                />
                <label className={`btn btn-ghost upload-btn${otherForm.name.trim() ? '' : ' disabled'}`}>
                  Choose file
                  <input
                    type="file"
                    hidden
                    disabled={!otherForm.name.trim()}
                    onChange={(e) => {
                      upload(e, otherForm.name.trim());
                      setOtherForm({ show: false, name: '' });
                    }}
                  />
                </label>
                <button type="button" className="btn btn-sm" onClick={() => setOtherForm({ show: false, name: '' })}>Cancel</button>
              </div>
            )}
            {c.uploads?.length === 0 ? (
              <p className="hint">No documents uploaded yet.</p>
            ) : (
              <table className="table">
                <thead><tr><th>Type</th><th>File</th><th>Uploaded</th>{canEdit && <th></th>}</tr></thead>
                <tbody>
                  {c.uploads.map((u) => (
                    <tr key={u.id}>
                      <td>{u.kind}</td>
                      <td><a href={`/uploads/${u.filename}`} target="_blank" rel="noreferrer">{u.original_name}</a></td>
                      <td>{niceDate(u.uploaded_at)}</td>
                      {canEdit && <td><button className="btn btn-danger btn-sm" onClick={() => delUpload(u.id)}>Delete</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>

      <section className="card">
        <h2>Payment Ledger</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Period</th><th className="num">Amount</th><th>Receipt No</th><th>Cash Reco No</th>
              <th className="num">Running Balance</th><th>Date Paid</th>{canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            <tr className="bd-row">
              <td>Balance brought down</td>
              <td className="num">{money(c.balance_brought_down)}</td>
              <td>—</td><td>—</td>
              <td className="num">{money(c.balance_brought_down)}</td>
              <td>{c.last_date_paid ? niceDate(c.last_date_paid) : '—'}</td>
              {canEdit && <td></td>}
            </tr>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{monthLabel(p.month_label)}</td>
                <td className="num">{money(p.amount)}</td>
                <td>{p.receipt_no || '—'}</td>
                <td>{p.cash_reco_no || '—'}</td>
                <td className="num">{money(p.running)}</td>
                <td>{niceDate(p.payment_date)}</td>
                {canEdit && <td><button className="btn btn-danger btn-sm" onClick={() => delPayment(p.id)}>✕</button></td>}
              </tr>
            ))}
            <tr className="total-row">
              <td>Total paid (incl B/D)</td>
              <td className="num">{money(c.totalPaid)}</td>
              <td colSpan="4"></td>
              {canEdit && <td></td>}
            </tr>
          </tbody>
        </table>
      </section>

      {c.notifications?.length > 0 && (
        <section className="card">
          <h2>Notifications sent to this client</h2>
          <ul className="notice-list">
            {c.notifications.map((n) => (
              <li key={n.id}><strong>{n.channel} · {niceDate(n.created_at)}</strong><br />{n.message}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}