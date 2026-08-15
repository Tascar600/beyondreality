import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useLocation, LOCATIONS } from '../location';
import { useTheme, THEMES } from '../theme';

export default function Layout() {
  const { user, logout } = useAuth();
  const { location, setLocation } = useLocation();
  const { theme, setTheme } = useTheme();
  const nav = useNavigate();

  const links = user.role === 'client'
    ? [
        { to: '/my', label: 'My Stand' },
        { to: `/clients/${user.client_id}`, label: 'My Record' },
      ]
    : user.role === 'cashier'
      ? [
          { to: '/bursary', label: 'Cash Office (Bursary)' },
        ]
      : [
          { to: '/dashboard', label: 'Dashboard' },
          { to: '/clients', label: 'Clients' },
          { to: '/payments', label: 'Monthly Payments' },
          { to: '/import', label: 'Excel Import' },
          { to: '/reports', label: 'Reports' },
        ];

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-dot" /> Beyond Reality
          <div className="brand-sub">Housing Portal</div>
        </div>

        {user.role !== 'client' && user.role !== 'cashier' && (
          <div className="location-picker">
            <label>Location</label>
            <select value={location} onChange={(e) => setLocation(e.target.value)}>
              {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        )}

        <div className="theme-picker">
          <label>Theme</label>
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            {THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>

        <nav>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip">
            <strong>{user.name}</strong>
            <span>{user.role === 'client' ? `${user.location || ''} · Stand ${user.stand_no || ''}` : user.role === 'cashier' ? `Cashier · ${user.office || 'Harare'}` : user.role}</span>
          </div>
          <button className="btn btn-ghost btn-block" onClick={() => { logout(); nav('/login'); }}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
