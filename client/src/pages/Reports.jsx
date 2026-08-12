import React, { useEffect, useState } from 'react';
import { api, downloadFile, niceDate } from '../api';
import { useLocation } from '../location';

const EXPORTS = [
  ['/reports/ledger/download', 'Download Latest Full Ledger', 'Beyond-Reality-Full-Ledger.xlsx', true],
  ['/reports/receipts/download', 'Receipts Register', 'Beyond-Reality-Receipts.xlsx', false],
  ['/reports/reconciliation/download', 'Monthly Reconciliation', 'Beyond-Reality-Reconciliation.xlsx', false],
  ['/reports/categories/download', 'Category Breakdown', 'Beyond-Reality-Categories.xlsx', false],
];

const GMAIL_DEFAULTS = {
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  user: 'zimhungar@gmail.com',
  pass: '',
  from: 'zimhungar@gmail.com',
};

export default function Reports() {
  const { location } = useLocation();
  const [recipients, setRecipients] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [log, setLog] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState('');
  const [emailOk, setEmailOk] = useState(false);
  const [emailForm, setEmailForm] = useState(GMAIL_DEFAULTS);
  const [testTo, setTestTo] = useState('zimhungar@gmail.com');
  const [emailBusy, setEmailBusy] = useState('');
  const [apiVersion, setApiVersion] = useState('');
  const [apiReady, setApiReady] = useState(false);

  const checkApi = () => {
    fetch('/api/health').then((r) => r.json()).then((d) => {
      setApiVersion(d.version || '');
      setApiReady(true);
      if (d.version && !String(d.version).includes('email')) {
        setErr('API server is outdated. Double-click RESTART-API.bat in the project folder, then refresh this page.');
      }
    }).catch(() => {
      setErr('Cannot reach API on port 4040. Run RESTART-API.bat or START.bat.');
    });
  };

  const loadEmailSettings = () => {
    api('/settings/email').then((d) => {
      setEmailOk(d.configured);
      setEmailForm({
        host: d.host || GMAIL_DEFAULTS.host,
        port: d.port || GMAIL_DEFAULTS.port,
        secure: !!d.secure,
        user: d.user || GMAIL_DEFAULTS.user,
        pass: d.hasPassword ? '********' : '',
        from: d.from || GMAIL_DEFAULTS.from,
      });
    }).catch(() => {
      setEmailForm(GMAIL_DEFAULTS);
    });
  };

  const loadRecipients = () => {
    const q = search.trim();
    api(`/reminders/recipients?location=${encodeURIComponent(location)}${q ? `&search=${encodeURIComponent(q)}` : ''}`)
      .then((d) => {
        setRecipients(d.recipients || []);
        setEmailOk(!!d.emailConfigured);
      })
      .catch((e) => setErr(e.message));
    api('/notifications').then(setLog).catch(() => {});
  };

  useEffect(() => { loadEmailSettings(); checkApi(); }, []);
  useEffect(loadRecipients, [location, search]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === recipients.length) setSelected(new Set());
    else setSelected(new Set(recipients.map((r) => r.client_id)));
  };

  const sendSelected = async () => {
    if (!selected.size) { setErr('Select at least one person to email.'); return; }
    if (!emailOk) { setErr('Save your Gmail App Password in Email Setup first.'); return; }
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      const r = await api('/reminders/send', {
        method: 'POST',
        body: JSON.stringify({ client_ids: [...selected], channel: 'email', location }),
      });
      let text = r.note || `Sent ${r.sent} email(s).`;
      if (r.errors?.length) text += ` Failed: ${r.errors.map((e) => `${e.name}: ${e.error}`).join('; ')}`;
      setMsg(text);
      setSelected(new Set());
      loadRecipients();
    } catch (e) {
      if (e.message.includes('route not found')) {
        setErr('API server is running old code. Close the "Beyond Reality API" window, double-click RESTART-API.bat, then try again.');
      } else {
        setErr(e.message);
      }
    }
    finally { setBusy(false); }
  };

  const saveEmail = async (e) => {
    e.preventDefault();
    setEmailBusy('save');
    setErr('');
    setMsg('');
    try {
      const d = await api('/settings/email', { method: 'PUT', body: JSON.stringify(emailForm) });
      setEmailOk(d.configured);
      setEmailForm((f) => ({ ...f, pass: d.hasPassword ? '********' : '' }));
      setMsg('Email settings saved. Sending from ' + (d.from || d.user) + '.');
    } catch (ex) {
      if (ex.message.includes('route not found')) {
        setErr('API server is running old code. Close the "Beyond Reality API" window, double-click RESTART-API.bat, then try again.');
      } else {
        setErr(ex.message);
      }
    }
    finally { setEmailBusy(''); }
  };

  const testEmail = async () => {
    setEmailBusy('test');
    setErr('');
    setMsg('');
    try {
      const r = await api('/settings/email/test', { method: 'POST', body: JSON.stringify({ to: testTo }) });
      setEmailOk(true);
      setMsg(r.message);
    } catch (ex) {
      if (ex.message.includes('route not found')) {
        setErr('API server is running old code. Close the "Beyond Reality API" window, double-click RESTART-API.bat, then try again.');
      } else {
        setErr(ex.message);
      }
    }
    finally { setEmailBusy(''); }
  };

  const exportExcel = async (path, filename) => {
    setDownloading(path);
    setMsg('');
    setErr('');
    try {
      await downloadFile(`${path}?location=${encodeURIComponent(location)}`, filename);
      setMsg('Download complete — file reflects all payments recorded up to now.');
    } catch (e) { setErr(e.message); }
    finally { setDownloading(''); }
  };

  const withEmail = recipients.length;
  const selectedList = recipients.filter((r) => selected.has(r.client_id));

  return (
    <div>
      <div className="page-head">
        <h1>Reports &amp; Reminders · {location}</h1>
      </div>

      {err && <div className="alert alert-err">{err}</div>}
      {msg && <div className="alert alert-ok">{msg}</div>}
      {!apiReady ? null : !apiVersion.includes('email') && !err ? (
        <div className="alert alert-err">
          API may be outdated. Double-click <strong>RESTART-API.bat</strong> in your project folder, wait for
          {' '}<strong>[api] version 2026-08-12-email-v2</strong> in the API window, then refresh this page.
        </div>
      ) : null}

      <section className="card">
        <h2>Email Setup {emailOk ? <span className="badge badge-ok">Ready</span> : <span className="badge badge-warn">Needs App Password</span>}</h2>
        <p className="hint">
          Reminders are sent from <strong>zimhungar@gmail.com</strong> via Gmail.
          You must use a Gmail <strong>App Password</strong> (not your normal Gmail password):
          Google Account → Security → 2-Step Verification → App passwords → create one for Mail.
        </p>
        <form className="form-grid email-setup-form" onSubmit={saveEmail}>
          <div className="field"><label>SMTP Host</label><input required value={emailForm.host} onChange={(e) => setEmailForm({ ...emailForm, host: e.target.value })} /></div>
          <div className="field"><label>Port</label><input type="number" required value={emailForm.port} onChange={(e) => setEmailForm({ ...emailForm, port: Number(e.target.value) })} /></div>
          <div className="field"><label>Gmail address</label><input required type="email" value={emailForm.user} onChange={(e) => setEmailForm({ ...emailForm, user: e.target.value, from: e.target.value })} /></div>
          <div className="field"><label>Gmail App Password</label><input required={!emailOk} type="password" value={emailForm.pass} onChange={(e) => setEmailForm({ ...emailForm, pass: e.target.value })} placeholder={emailOk ? 'Leave blank to keep current' : '16-character app password'} /></div>
          <div className="field"><label>Send from</label><input value={emailForm.from} onChange={(e) => setEmailForm({ ...emailForm, from: e.target.value })} /></div>
          <div className="field"><label>Test send to</label><input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} /></div>
          <div className="field email-setup-actions">
            <button type="submit" className="btn btn-primary" disabled={emailBusy === 'save'}>{emailBusy === 'save' ? 'Saving…' : 'Save settings'}</button>
            <button type="button" className="btn" disabled={emailBusy === 'test'} onClick={testEmail}>{emailBusy === 'test' ? 'Sending…' : 'Send test email'}</button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>Send Payment Reminders</h2>
        <p className="hint">
          Select one or more clients below, then click <strong>Send Email</strong>.
          Only clients with an email address on their record appear here ({withEmail} in {location}).
        </p>
        <div className="toolbar">
          <input
            type="search"
            placeholder="Search name, stand, or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: 220 }}
          />
          <button type="button" className="btn" onClick={toggleAll}>
            {selected.size === recipients.length && recipients.length ? 'Deselect all' : 'Select all'}
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !selected.size || !emailOk} onClick={sendSelected}>
            {busy ? 'Sending…' : `Send Email (${selected.size} selected)`}
          </button>
        </div>

        {selectedList.length > 0 && (
          <p className="hint">
            Will send to: {selectedList.map((r) => `${r.name} (${r.email})`).join(', ')}
          </p>
        )}

        <div className="recipient-list">
          {recipients.length === 0 && <p className="hint">No clients with email addresses in {location}. Add emails on client records first.</p>}
          {recipients.map((r) => (
            <label className="recipient-row" key={r.client_id}>
              <input type="checkbox" checked={selected.has(r.client_id)} onChange={() => toggle(r.client_id)} />
              <span className="recipient-name">{r.name}</span>
              <span className="recipient-meta">Stand {r.stand_no}</span>
              <span className="recipient-email">{r.email}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Download Reports (Live Excel)</h2>
        <p className="hint">
          All exports are generated from the live database when you click download.
          Recording a payment updates these reports instantly — including receipt and cash reconciliation numbers.
        </p>
        <div className="export-grid">
          {EXPORTS.map(([p, label, fn, primary]) => (
            <button
              key={p}
              className={`btn ${primary ? 'btn-primary' : ''}`}
              disabled={!!downloading}
              onClick={() => exportExcel(p, fn)}
            >
              {downloading === p ? 'Preparing…' : label}
            </button>
          ))}
        </div>
        <p className="hint">Full Ledger uses the COMBINED template format with monthly amounts, receipt numbers, and cash reco numbers per month.</p>
      </section>

      <section className="card">
        <h2>Notification Log</h2>
        {log.length === 0 ? (
          <p className="hint">No reminders sent yet.</p>
        ) : (
          <table className="table">
            <thead><tr><th>Client</th><th>Channel</th><th>Type</th><th>Date</th><th>Message</th></tr></thead>
            <tbody>
              {log.map((n) => (
                <tr key={n.id}>
                  <td>{n.client_name || '—'}</td>
                  <td>{n.channel}</td>
                  <td>{n.type}</td>
                  <td>{niceDate(n.created_at)}</td>
                  <td className="msg-cell">{n.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
