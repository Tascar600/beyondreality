import React, { useEffect, useRef, useState } from 'react';
import { api, money, niceDate, monthLabel } from '../api';
import { useAuth } from '../auth';

const OFFICES = ['Harare', 'Norton', 'Head Office Kadoma'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function timeStr(created) {
  if (!created) return '';
  const t = created.includes('T') ? new Date(created) : new Date(created.replace(' ', 'T'));
  return t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function Bursary() {
  const { user } = useAuth();
  const [tab, setTab] = useState('pay');
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [account, setAccount] = useState(null);
  const [form, setForm] = useState({ payment_date: todayStr(), amount: '', receipt_no: '', cash_reco_no: '', month_label: todayStr().slice(0, 7), office: user?.office || 'Harare' });
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [recDate, setRecDate] = useState(todayStr());
  const [recon, setRecon] = useState(null);
  const [loadingRecon, setLoadingRecon] = useState(false);
  const resultsRef = useRef(null);

  const search = async (e) => {
    if (e) e.preventDefault();
    setErr('');
    if (!q.trim()) return;
    setSearching(true);
    try {
      const r = await api(`/bursary/search?q=${encodeURIComponent(q.trim())}`);
      setResults(r.clients);
      if (!r.clients.length) setErr('No client found. Check the name or stand number and try again.');
    } catch (ex) { setErr(ex.message); }
    finally { setSearching(false); }
  };

  const selectClient = async (id) => {
    setErr(''); setOk('');
    try {
      const a = await api(`/bursary/clients/${id}`);
      setAccount(a);
      setResults(null);
      setQ('');
      if (resultsRef.current) resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (ex) { setErr(ex.message); }
  };

  const resetClient = () => {
    setAccount(null);
    setForm((f) => ({ ...f, amount: '', receipt_no: '', cash_reco_no: '' }));
  };

  const savePayment = async (e) => {
    e.preventDefault();
    setErr(''); setOk(''); setSaving(true);
    try {
      const r = await api(`/bursary/clients/${account.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      });
      const fresh = await api(`/bursary/clients/${account.id}`);
      setAccount(fresh);
      setLastReceipt(r.payment);
      setOk(`Payment of ${money(r.payment.amount)} recorded — account, ledger and reconciliation updated.`);
      setForm((f) => ({ ...f, amount: '', receipt_no: '', cash_reco_no: '' }));
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  };

  const loadRecon = async (date) => {
    setLoadingRecon(true);
    setErr('');
    try {
      const r = await api(`/bursary/reconciliation?date=${date}`);
      setRecon(r);
    } catch (ex) { setErr(ex.message); }
    finally { setLoadingRecon(false); }
  };

  useEffect(() => {
    if (tab === 'recon') loadRecon(recDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const moneyInput = (v) => money(Number(v) || 0);

  return (
    <div>
      <div className="page-head">
        <h1>Cash Office (Bursary)</h1>
        <div className="toolbar">
          <div className="tabs">
            <button className={'tab' + (tab === 'pay' ? ' active' : '')} onClick={() => setTab('pay')}>Record Payment</button>
            <button className={'tab' + (tab === 'recon' ? ' active' : '')} onClick={() => setTab('recon')}>Cash Reconciliation</button>
          </div>
        </div>
      </div>

      {err && <div className="alert alert-err">{err}</div>}
      {ok && <div className="alert alert-ok">{ok}</div>}

      {tab === 'pay' && (
        <div className="stack">
          <section className="card" ref={resultsRef}>
            <h2>{account ? 'Search another client' : 'Find client'}</h2>
            <form className="row-form" onSubmit={search}>
              <input
                placeholder="Search by name or stand number…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button className="btn btn-primary" disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
            </form>

            {results && results.length > 0 && (
              <table className="table">
                <thead><tr><th>Name</th><th>Stand No</th><th>Location</th><th>Category</th><th></th></tr></thead>
                <tbody>
                  {results.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.stand_no || '—'}</td>
                      <td>{c.location}</td>
                      <td>{c.category || '—'}</td>
                      <td><button className="btn btn-sm btn-primary" onClick={() => selectClient(c.id)}>Select</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {account && (
            <>
              <section className="card">
                <div className="page-head">
                  <h2>{account.name}</h2>
                  <div className="toolbar">
                    <button className="btn btn-ghost" onClick={resetClient}>Close account</button>
                  </div>
                </div>
                <div className="stats-grid">
                  <div className="stat"><div className="stat-value">{account.stand_no || '—'}</div><div className="stat-label">Stand No</div></div>
                  <div className="stat green"><div className="stat-value">{account.location || '—'}</div><div className="stat-label">Location</div></div>
                  <div className="stat blue"><div className="stat-value">{money(account.balance_brought_down)}</div><div className="stat-label">Balance Brought Down</div></div>
                  <div className="stat amber"><div className="stat-value">{money(account.totalPaid)}</div><div className="stat-label">Total Paid</div></div>
                  <div className="stat"><div className="stat-value">{money(account.purchase_price)}</div><div className="stat-label">Purchase Price</div></div>
                  <div className="stat red"><div className="stat-value">{money(account.outstanding)}</div><div className="stat-label">Outstanding</div></div>
                </div>
              </section>

              <section className="card">
                <h2>Record this payment</h2>
                <form className="form-grid" onSubmit={savePayment}>
                  <div className="field">
                    <label>Date paid *</label>
                    <input type="date" required value={form.payment_date} onChange={(e) => {
                      const d = e.target.value;
                      setForm((f) => ({ ...f, payment_date: d, month_label: d ? d.slice(0, 7) : f.month_label }));
                    }} />
                  </div>
                  <div className="field">
                    <label>Amount paid ($) *</label>
                    <input type="number" step="0.01" min="0.01" required autoFocus value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Receipt No *</label>
                    <input required placeholder="Number on the receipt" value={form.receipt_no} onChange={(e) => setForm({ ...form, receipt_no: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Cash Reco No *</label>
                    <input required placeholder="Cash reco number on the receipt" value={form.cash_reco_no} onChange={(e) => setForm({ ...form, cash_reco_no: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Office where payment was made *</label>
                    <select value={form.office} onChange={(e) => setForm({ ...form, office: e.target.value })}>
                      {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Applies to month</label>
                    <input type="month" value={form.month_label} onChange={(e) => setForm({ ...form, month_label: e.target.value })} />
                  </div>
                  <div className="field row-form">
                    <button className="btn btn-primary" disabled={saving}>{saving ? 'Recording…' : 'Record payment'}</button>
                    <button type="button" className="btn" disabled={!lastReceipt} onClick={() => setReceipt(lastReceipt)}>Print receipt</button>
                  </div>
                </form>
                <p className="hint">Recording updates the client's account immediately (total paid, outstanding balance and ledger). Click "Print receipt" to print the receipt for the last recorded payment.</p>
              </section>

              <section className="card">
                <h2>Payment history</h2>
                <table className="table">
                  <thead><tr><th>Period</th><th className="num">Amount</th><th>Receipt No</th><th>Cash Reco No</th><th>Office</th><th>Date Paid</th></tr></thead>
                  <tbody>
                    {account.payments.length === 0 && <tr><td colSpan="6" className="hint">No payments recorded yet.</td></tr>}
                    {account.payments.map((p) => (
                      <tr key={p.id}>
                        <td>{monthLabel(p.month_label)}</td>
                        <td className="num">{money(p.amount)}</td>
                        <td>{p.receipt_no || '—'}</td>
                        <td>{p.cash_reco_no || '—'}</td>
                        <td>{p.office}</td>
                        <td>{niceDate(p.payment_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </div>
      )}

      {tab === 'recon' && (
        <div className="stack">
          <section className="card no-print">
            <div className="row-form">
              <input type="date" value={recDate} onChange={(e) => { setRecDate(e.target.value); loadRecon(e.target.value); }} />
              <button className="btn btn-ghost" onClick={() => loadRecon(recDate)} disabled={loadingRecon}>{loadingRecon ? 'Loading…' : 'Refresh'}</button>
              <button className="btn btn-primary" disabled={!recon} onClick={() => window.print()} style={{ marginLeft: 'auto' }}>Print reconciliation</button>
            </div>
          </section>

          {recon && (
            <div id="recon-print">
              <section className="stats-grid">
                {recon.totals.map((t) => (
                  <div key={t.office} className="stat">
                    <div className="stat-value">{money(t.amount)}</div>
                    <div className="stat-label">{t.office} — {t.count} {t.count === 1 ? 'receipt' : 'receipts'}</div>
                  </div>
                ))}
                <div className="stat blue">
                  <div className="stat-value">{money(recon.grandTotal)}</div>
                  <div className="stat-label">TOTAL — {recon.grandCount} {recon.grandCount === 1 ? 'receipt' : 'receipts'}</div>
                </div>
              </section>

              <section className="card">
                <h2>Cash Reconciliation — {niceDate(recon.date)}</h2>
                <table className="table">
                  <thead>
                    <tr><th>#</th><th>Receipt No</th><th>Cash Reco No</th><th>Time</th><th>Client</th><th>Stand</th><th>Office</th><th className="num">Amount</th></tr>
                  </thead>
                  <tbody>
                    {recon.entries.length === 0 && <tr><td colSpan="8" className="hint">No payments recorded on this day.</td></tr>}
                    {recon.entries.map((p, i) => (
                      <tr key={p.id}>
                        <td>{i + 1}</td>
                        <td>{p.receipt_no || '—'}</td>
                        <td>{p.cash_reco_no || '—'}</td>
                        <td>{timeStr(p.created_at)}</td>
                        <td>{p.client_name}</td>
                        <td>{p.stand_no || '—'}</td>
                        <td>{p.office}</td>
                        <td className="num">{money(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="total-row">
                      <td colSpan="7">TOTAL for {niceDate(recon.date)}</td>
                      <td className="num">{money(recon.grandTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </section>
            </div>
          )}
        </div>
      )}

      {receipt && (
        <div className="modal-overlay" onClick={() => setReceipt(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="receipt" id="receipt-print">
              <div className="receipt-head">
                <div className="receipt-brand">BEYOND REALITY HOUSING SCHEME</div>
                <div className="receipt-sub">Cash Office · {receipt.office}</div>
                <div className="receipt-title">CASH RECEIPT</div>
              </div>
              <div className="receipt-grid">
                <div><span>Receipt No:</span> <strong>{receipt.receipt_no}</strong></div>
                <div><span>Cash Reco No:</span> <strong>{receipt.cash_reco_no}</strong></div>
                <div><span>Date:</span> <strong>{niceDate(receipt.payment_date)}</strong></div>
                <div><span>Time:</span> <strong>{timeStr(receipt.created_at)}</strong></div>
              </div>
              <div className="receipt-rule" />
              <div className="receipt-row"><span>Received from</span><strong>{receipt.client_name}</strong></div>
              <div className="receipt-row"><span>Stand No</span><strong>{receipt.stand_no || '—'}</strong></div>
              <div className="receipt-row"><span>Location</span><strong>{receipt.location || '—'}</strong></div>
              <div className="receipt-row"><span>Payment for</span><strong>{monthLabel(receipt.month_label)} instalment</strong></div>
              <div className="receipt-rule" />
              <div className="receipt-amount">
                <span>Amount paid</span>
                <strong>{moneyInput(receipt.amount)}</strong>
              </div>
              <div className="receipt-balance">
                <div><span>Balance brought down</span><span>{money(account?.balance_brought_down ?? 0)}</span></div>
                <div><span>Total paid to date</span><span>{money(account?.totalPaid ?? 0)}</span></div>
                <div className="outstanding"><span>Outstanding balance</span><span>{money(account?.outstanding ?? 0)}</span></div>
              </div>
              <div className="receipt-rule" />
              <div className="receipt-foot">
                <div><span>Cashier:</span> <strong>{user.name}</strong></div>
                <div className="receipt-sign">Signature: _______________</div>
                <div className="receipt-stamp">BEYOND REALITY CASH OFFICE — {receipt.office}</div>
              </div>
              <div className="receipt-thanks">Thank you. This receipt updates the stand account automatically.</div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => window.print()}>Print receipt</button>
              <button className="btn btn-ghost" onClick={() => setReceipt(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
