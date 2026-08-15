import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { LocationProvider } from './location';
import { ThemeProvider } from './theme';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Reports from './pages/Reports';
import ClientHome from './pages/ClientHome';
import Payments from './pages/Payments';
import ImportPage from './pages/ImportPage';
import Bursary from './pages/Bursary';
import Layout from './components/Layout';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireFinance({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'client') return <Navigate to="/my" replace />;
  if (user.role === 'cashier') return <Navigate to="/bursary" replace />;
  return children;
}

function RequireCashier({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'client') return <Navigate to="/my" replace />;
  if (user.role !== 'cashier') return <Navigate to="/dashboard" replace />;
  return children;
}

function Home() {
  const { user } = useAuth();
  if (user.role === 'client') return <Navigate to="/my" replace />;
  if (user.role === 'cashier') return <Navigate to="/bursary" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <LocationProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<Home />} />
              <Route path="dashboard" element={<RequireFinance><AdminDashboard /></RequireFinance>} />
              <Route path="clients" element={<RequireFinance><Clients /></RequireFinance>} />
              <Route path="clients/:id" element={<ClientDetail />} />
              <Route path="payments" element={<RequireFinance><Payments /></RequireFinance>} />
              <Route path="import" element={<RequireFinance><ImportPage /></RequireFinance>} />
              <Route path="reports" element={<RequireFinance><Reports /></RequireFinance>} />
              <Route path="bursary" element={<RequireCashier><Bursary /></RequireCashier>} />
              <Route path="my" element={<ClientHome />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </LocationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
