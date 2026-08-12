import React, { useEffect, useMemo, useState } from 'react';
import { api, money, monthLabel } from '../api';
import { useLocation } from '../location';

export default function Payments() {
  const { location } = useLocation();
  const [month, setMonth] = useState('2026-07');
  const [sort, setSort] = useState('name');
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');

  const load = () => {
    api(`/payments/monthly?month=${month}&sort=${sort}&location=${encodeURIComponent(location)}`)
      .then((d) => {
        setRows(d.rows);
        const init = {};
        d.rows.forEach((r) => {
          init[r.client_id] = {
            amount: r.payment?.amount ?? '',
            receipt_no: r.payment?.receipt_no ?? '',
            cash_reco_no: r.payment?.cash_reco_no ?? '',
          };
        });
        setDrafts(init);
      })
      .catch((e) => setMsg(e.message));
  };

  useEffect(load, [month, sort, location]);

  const visible = useMemo(() => {
    if (!filter.trim()) return rows;
    const q = filter.toLowerCase();
    return rows.filter((r) =>
      r.name.toLowerCase().includes(q) || r.stand_no.toLowerCase().includes(q) || r.surname.toLowerCase().includes(q)
    );
  }, [rows, filter]);

  const setDraft = (id, field, value) => {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [field]: value } }));
  };

  const saveAll = async () => {
    const entries = Object.entries(drafts)
      .filter(([, v]) => Number(v.amount) > 0)
      .map(([client_id, v]) => ({ client_id: Number(client_id), ...v }));
    if (!entries.length) { setMsg('Enter at least one payment amount'); return; }
    setBusy(true);
    setMsg('');
    try {
      const r = await api('/payments/monthly/bulk', { method: 'POST', body: JSON.stringify({ month, entries }) });
      setMsg(`Saved ${r.saved} payment(s) for ${monthLabel(month)}`);
      load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="page-head">
        <h1>Monthly Payments · {location}</h1>
        <div className="toolbar">
          <label>Month</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">Sort: Full name</option>
            <option value="surname">Sort: Surname</option>
            <option value="stand">Sort: Stand number</option>
          </select>
          <input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button className="btn btn-primary" disabled={busy} onClick={saveAll}>Save payments</button>
        </div>
      </div>

      {msg && <div className="alert alert-ok">{msg}</div>}

      <section className="card">
        <p className="hint">Enter July (or any month) payments in bulk. Sort by stand, surname, or name to match your Excel sheet order.</p>
        <table className="table">
          <thead>
            <tr>
              <th>Client</th><th>Stand</th><th>Category</th>
              <th className="num">Total Paid</th><th>Last Paid</th>
              <th className="num">Amount</th><th>Receipt No</th><th>Cash Reco No</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.client_id}>
                <td>{r.name}</td>
                <td>{r.stand_no || '—'}</td>
                <td>{r.category || '—'}</td>
                <td className="num">{money(r.total_paid)}</td>
                <td>{r.last_date_paid || '—'}</td>
                <td className="num">
                  <input type="number" step="0.01" style={{ width: 90 }}
                    value={drafts[r.client_id]?.amount ?? ''}
                    onChange={(e) => setDraft(r.client_id, 'amount', e.target.value)} />
                </td>
                <td>
                  <input style={{ width: 90 }}
                    value={drafts[r.client_id]?.receipt_no ?? ''}
                    onChange={(e) => setDraft(r.client_id, 'receipt_no', e.target.value)} />
                </td>
                <td>
                  <input style={{ width: 90 }}
                    value={drafts[r.client_id]?.cash_reco_no ?? ''}
                    onChange={(e) => setDraft(r.client_id, 'cash_reco_no', e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
