import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { SettingsProvider } from './components/SettingsContext.jsx';
import { ToastProvider } from './components/Toast.jsx';
import Dashboard from './pages/Dashboard.jsx';
import PasswordForge from './pages/PasswordForge.jsx';
import PasswordInspector from './pages/PasswordInspector.jsx';
import EncryptionLab from './pages/EncryptionLab.jsx';
import DecryptionLab from './pages/DecryptionLab.jsx';
import HashLaboratory from './pages/HashLaboratory.jsx';
import KeyForge from './pages/KeyForge.jsx';
import SecurityAudit from './pages/SecurityAudit.jsx';
import EncryptedVault from './pages/EncryptedVault.jsx';
import SecurityAcademy from './pages/SecurityAcademy.jsx';
import Settings from './pages/Settings.jsx';
import Privacy from './pages/Privacy.jsx';

function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-gold/70">404</p>
      <h1 className="mt-3 text-2xl">This workspace does not exist</h1>
      <p className="mt-2 text-[13px] text-muted">The route you requested is not part of Password Forge.</p>
      <Link to="/" className="link-gold mt-6 inline-block text-[13px]">
        Return to the dashboard
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <SettingsProvider>
        <ToastProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="forge" element={<PasswordForge />} />
              <Route path="inspector" element={<PasswordInspector />} />
              <Route path="encrypt" element={<EncryptionLab />} />
              <Route path="decrypt" element={<DecryptionLab />} />
              <Route path="hash" element={<HashLaboratory />} />
              <Route path="keys" element={<KeyForge />} />
              <Route path="audit" element={<SecurityAudit />} />
              <Route path="vault" element={<EncryptedVault />} />
              <Route path="academy" element={<SecurityAcademy />} />
              <Route path="settings" element={<Settings />} />
              <Route path="privacy" element={<Privacy />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </ToastProvider>
      </SettingsProvider>
    </HashRouter>
  );
}
