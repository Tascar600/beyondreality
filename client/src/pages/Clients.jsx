import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, niceDate } from '../api';
import { useLocation } from '../location';

export default function Clients() {
  const { location } = useLocation();
  const [list, setList] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('name');
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', category: '', location: location, stand_no: '', stand_size: '', balance_brought_down: 0 });
  const [msg, setMsg] = useState('');

  const load = () => {
    api(`/clients?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&sort=${sort}&location=${encodeURIComponent(location)}&page=${page}&per=50`)
      .then((d) => {
        setList(d);
        if (d.categories.length && categories.length === 0) setCategories(d.categories);
      })
      .catch((e) => setMsg(e.message));
  };

  useEffect(load, [search, category, sort, page, location]);

  const addClient = async (e) => {
    e.preventDefault();
    try {
      await api('/clients', { method: 'POST', body: JSON.stringify(form) });
      setShowAdd(false);
      setForm({ name: '', category: '', location, stand_no: '', stand_size: '', balance_brought_down: 0 });
      load();
    } catch (err) { setMsg(err.message); }
  };

  const totalPages = list ? Math.ceil(list.total / 50) : 1;

  return (
    <div>
      <div className="page-head">
        <h1>Clients · {location} ({list ? list.total.toLocaleString() : '…'})</h1>
        <div className="toolbar">
          <input placeholder="Search name, surname, or stand…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
            <option value="name">Sort: Full name</option>
            <option value="surname">Sort: Surname</option>
            <option value="stand">Sort: Stand number</option>
          </select>
          <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>+ Add Client</button>
        </div>
      </div>

      {msg && <div className="alert alert-err">{msg}</div>}

      {showAdd && (
        <form className="card form-grid" onSubmit={addClient}>
          <h2>New Client</h2>
          <input placeholder="Full name *" value={form.name} required onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Category (Teachers, ZAOGA…)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <input placeholder="Stand No" value={form.stand_no} onChange={(e) => setForm({ ...form, stand_no: e.target.value })} />
          <input placeholder="Stand size (sqm)" type="number" value={form.stand_size} onChange={(e) => setForm({ ...form, stand_size: e.target.value })} />
          <input placeholder="Balance brought down ($)" type="number" step="0.01" value={form.balance_brought_down} onChange={(e) => setForm({ ...form, balance_brought_down: e.target.value })} />
          <button className="btn btn-primary" type="submit">Save Client</button>
        </form>
      )}

      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Client Name</th><th>Location</th><th>Category</th><th>Stand No</th><th className="num">Size</th>
              <th className="num">Balance B/D</th><th className="num">Total Paid</th>
              <th>Last Paid</th>
            </tr>
          </thead>
          <tbody>
            {list && list.clients.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/clients/${c.id}`}>{c.name}</Link></td>
                <td>{c.location || '—'}</td>
                <td>{c.category || '—'}</td>
                <td>{c.stand_no || '—'}</td>
                <td className="num">{c.stand_size ?? '—'}</td>
                <td className="num">{money(c.balance_brought_down)}</td>
                <td className="num">{money(c.totalPaid)}</td>
                <td>{niceDate(c.lastDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="toolbar">
            <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button className="btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        )}
      </section>
    </div>
  );
}
