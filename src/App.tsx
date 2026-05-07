import React, { useState, useEffect, useMemo } from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { ALLOWED_DOMAINS } from './authConfig';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { BackorderReport } from './components/BackorderReport';
import { ImpulseShipments } from './components/ImpulseShipments';
import { reportsForUser } from './reports';

function App() {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [activeReportId, setActiveReportId] = useState<string>('backorder');

  useEffect(() => {
    if (isAuthenticated && accounts.length > 0) {
      const email = accounts[0].username?.toLowerCase() || '';
      if (ALLOWED_DOMAINS.some(domain => email.endsWith(`@${domain}`))) {
        setCurrentUser(email);
      }
    }
  }, [isAuthenticated, accounts]);

  const availableReports = useMemo(() => reportsForUser(currentUser), [currentUser]);

  // If the user's first available report isn't 'backorder', default to whichever they have
  useEffect(() => {
    if (currentUser && availableReports.length > 0) {
      if (!availableReports.some(r => r.id === activeReportId)) {
        setActiveReportId(availableReports[0].id);
      }
    }
  }, [currentUser, availableReports, activeReportId]);

  const handleLogout = () => {
    instance.logoutRedirect();
  };

  // Not authenticated — show login
  if (!isAuthenticated || !currentUser) {
    if (isAuthenticated && accounts.length > 0) {
      const email = accounts[0].username?.toLowerCase() || '';
      if (!ALLOWED_DOMAINS.some(domain => email.endsWith(`@${domain}`))) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-mac-light">
            <div className="text-center bg-white p-8 rounded-2xl shadow-xl border border-slate-200 max-w-md">
              <img src="/mac_logo.png" className="w-12 h-12 mx-auto mb-4 object-contain" />
              <p className="text-red-600 font-bold">Access denied. Only @macproducts.net and @macimpulse.net accounts allowed.</p>
              <button onClick={handleLogout} className="mt-4 px-6 py-2 bg-mac-navy text-white rounded-xl font-semibold">Sign Out</button>
            </div>
          </div>
        );
      }
    }
    return <Login />;
  }

  // No reports available for this user
  if (availableReports.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mac-light">
        <div className="text-center bg-white p-8 rounded-2xl shadow-xl border border-slate-200 max-w-md">
          <img src="/mac_logo.png" className="w-12 h-12 mx-auto mb-4 object-contain" />
          <p className="text-slate-700 font-bold">No reports are available for your account yet.</p>
          <p className="text-slate-500 text-sm mt-2">Contact IT to request access.</p>
          <button onClick={handleLogout} className="mt-4 px-6 py-2 bg-mac-navy text-white rounded-xl font-semibold">Sign Out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-mac-light">
      <Sidebar
        reports={availableReports}
        activeReportId={activeReportId}
        onReportChange={setActiveReportId}
        userEmail={currentUser}
        onSignOut={handleLogout}
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        {activeReportId === 'backorder' && (
          <BackorderReport userEmail={currentUser} onSignOut={handleLogout} />
        )}
        {activeReportId === 'impulse-shipments' && (
          <ImpulseShipments userEmail={currentUser} />
        )}
      </main>
    </div>
  );
}

export default App;
