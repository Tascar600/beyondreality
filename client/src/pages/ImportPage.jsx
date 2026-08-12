import React, { useEffect, useRef, useState } from 'react';
import { api, downloadFile } from '../api';
import { useLocation, LOCATIONS } from '../location';

const DEFAULT_FILE_HINT = "COMBINED SCUSTOMER STATEMENTS_042427.xlsx";

export default function ImportPage() {
  const { location } = useLocation();
  const [importLocation, setImportLocation] = useState(location);
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('replace-all');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { setImportLocation(location); }, [location]);

  const upload = async (e) => {
    e.preventDefault();
    if (!file) { setErr('Choose an Excel file first'); setMsg(''); return; }
    if (mode === 'replace-all' && !window.confirm('This will DELETE all clients, payments, and uploads in the entire database and replace them with this file. Continue?')) {
      return;
    }
    setBusy(true);
    setMsg('');
    setErr('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('mode', mode);
    fd.append('location', importLocation);
    try {
      const r = await api('/import/excel', { method: 'POST', body: fd });
      setMsg(
        `Import complete (${r.mode}): ${r.totalClients} clients, ${r.totalPayments} payments. `
        + `Processed ${r.imported} rows (${r.created} new, ${r.updated} updated). `
        + `Receipts attached: ${r.receiptsAttached || 0}. Statement archive: ${r.statementsArchived || 0}.`
      );
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (ex) {
      setErr(ex.message);
      setMsg('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <h1>Excel Import / Update</h1>
      </div>

      {err && <div className="alert alert-err">{err}</div>}
      {msg && <div className="alert alert-ok">{msg}</div>}

      <section className="card">
        <h2>Upload COMBINED spreadsheet</h2>
        <p className="hint">
          Upload <strong>{DEFAULT_FILE_HINT}</strong> from your Desktop to replace all client names, payments,
          receipt numbers, and cash reco numbers in the portal.
        </p>
        <div className="toolbar">
          <button type="button" className="btn" onClick={() => downloadFile('/import/template', 'COMBINED-PAYMENTS-TEMPLATE.xlsx').catch((e) => setErr(e.message))}>
            Download template
          </button>
        </div>
        <form onSubmit={upload} className="form-grid">
          <label>Location for new records</label>
          <select value={importLocation} onChange={(e) => setImportLocation(e.target.value)}>
            {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <label>Import mode</label>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="replace-all">Replace ALL — wipe entire database and import fresh (recommended)</option>
            <option value="replace">Replace location only — delete {importLocation} first, then import</option>
            <option value="merge">Merge — update existing clients &amp; payments</option>
          </select>
          <label>Excel file (.xlsx)</label>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => { setFile(e.target.files?.[0] || null); setErr(''); }}
          />
          {file && <p className="hint">Selected: {file.name} ({(file.size / 1024).toFixed(0)} KB)</p>}
          <p className="hint">Large files (3000+ rows) may take 30–90 seconds. Do not close the page.</p>
          <button className="btn btn-primary" type="submit" disabled={busy || !file}>
            {busy ? 'Importing… please wait' : 'Upload & replace all data'}
          </button>
        </form>
      </section>
    </div>
  );
}
