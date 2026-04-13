import React, { useState, useEffect } from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { ALLOWED_DOMAINS } from './authConfig';
import { Login } from './components/Login';
import { BackorderReport } from './components/BackorderReport';

function App() {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && accounts.length > 0) {
      const email = accounts[0].username?.toLowerCase() || '';
      if (ALLOWED_DOMAINS.some(domain => email.endsWith(`@${domain}`))) {
        setCurrentUser(email);
      }
    }
  }, [isAuthenticated, accounts]);

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

  return <BackorderReport userEmail={currentUser} onSignOut={handleLogout} />;
}

export default App;
