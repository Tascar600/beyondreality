import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { LOCATIONS } from '../location';

export default function Login() {
  const { loginFinance, loginClient } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState('finance');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginName, setLoginName] = useState('');
  const [standPassword, setStandPassword] = useState('');
  const [clientLocation, setClientLocation] = useState('Harare');
  const [needLocation, setNeedLocation] = useState(false);
  const [locationOptions, setLocationOptions] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = mode === 'finance'
        ? await loginFinance(username, password)
        : await loginClient(loginName, standPassword, needLocation ? clientLocation : '');
      setNeedLocation(false);
      nav(u.role === 'client' ? '/my' : '/dashboard');
    } catch (err) {
      if (err.status === 409 && err.data?.needLocation) {
        setNeedLocation(true);
        setLocationOptions(err.data.locations || LOCATIONS);
        setError(err.data.error || 'Select your location below and sign in again.');
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand center">
          <span className="brand-dot" /> Beyond Reality
          <div className="brand-sub">Housing Portal</div>
        </div>

        <div className="login-toggle">
          <button type="button" className={`btn ${mode === 'finance' ? 'btn-primary' : ''}`} onClick={() => setMode('finance')}>Finance</button>
          <button type="button" className={`btn ${mode === 'client' ? 'btn-primary' : ''}`} onClick={() => setMode('client')}>Client</button>
        </div>

        {mode === 'finance' ? (
          <>
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </>
        ) : (
          <>
            <label>First Name or Surname</label>
            <input
              value={loginName}
              onChange={(e) => setLoginName(e.target.value)}
              placeholder="e.g. Abigail or ZHANJE"
              autoFocus
              required
            />
            <label>Stand Number</label>
            <input
              type="password"
              value={standPassword}
              onChange={(e) => setStandPassword(e.target.value)}
              placeholder="Your stand number"
              required
            />
            {(needLocation || locationOptions.length > 0) && (
              <>
                <label>Location</label>
                <select value={clientLocation} onChange={(e) => setClientLocation(e.target.value)} required>
                  {(locationOptions.length ? locationOptions : LOCATIONS).map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </>
            )}
            <p className="hint">Sign in with your first name <em>or</em> surname, plus your stand number. No signup needed.</p>
          </>
        )}

        {error && <div className="alert alert-err">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
