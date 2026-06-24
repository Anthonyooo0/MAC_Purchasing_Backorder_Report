import React, { useState } from 'react';
import type { ReportDef } from '../reports';

interface SidebarProps {
  reports: ReportDef[];
  activeReportId: string;
  onReportChange: (id: string) => void;
  userEmail: string;
  onSignOut: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  reports,
  activeReportId,
  onReportChange,
  userEmail,
  onSignOut,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className="flex flex-col flex-shrink-0 text-white transition-all duration-300"
      style={{
        width: collapsed ? 64 : 256,
        background: '#1a365d',
      }}
    >
      {/* Logo + user info */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
            <img src="/mac_logo.png" alt="MAC Logo" className="w-full h-full object-contain" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="font-bold text-sm truncate uppercase">MAC Custom Reports</h1>
              <p className="text-blue-200 text-[10px] truncate uppercase font-bold tracking-tighter">
                {userEmail}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Section label */}
      {!collapsed && (
        <div className="px-4 pt-4 pb-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Reports
          </div>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto">
        {reports.map(r => {
          const active = r.id === activeReportId;
          return (
            <button
              key={r.id}
              onClick={() => onReportChange(r.id)}
              title={collapsed ? r.name : undefined}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-all relative ${
                active
                  ? 'text-white bg-white/10 before:content-[""] before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:h-[60%] before:bg-blue-400 before:rounded-r'
                  : 'text-blue-200 hover:text-white hover:bg-white/5'
              }`}
            >
              <ReportIcon code={r.reportCode} />
              {!collapsed && (
                <div className="flex-1 text-left overflow-hidden">
                  <div className="font-medium truncate">{r.shortName}</div>
                  <div className="text-[10px] text-blue-200/70 font-mono">{r.reportCode}</div>
                </div>
              )}
            </button>
          );
        })}
        {reports.length === 0 && !collapsed && (
          <div className="px-4 py-3 text-xs text-blue-200/60">
            No reports available for your account.
          </div>
        )}
      </nav>

      {/* Sign Out */}
      <div className="p-4 border-t border-white/10">
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-blue-200 hover:text-white hover:bg-white/5 rounded-lg transition-all"
          title={collapsed ? 'Sign Out' : undefined}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          {!collapsed && <span className="font-medium">Sign Out</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-white/10">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="w-full flex items-center justify-center px-2 py-2 text-blue-200 hover:text-white hover:bg-white/5 rounded transition-all"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {collapsed
              ? <path d="M9 18l6-6-6-6" />
              : <path d="M15 18l-6-6 6-6" />
            }
          </svg>
        </button>
      </div>
    </aside>
  );
};

function ReportIcon({ code }: { code: string }) {
  // Simple per-report icon based on report code
  if (code === 'IMPSHIP') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
        <path d="M16 16h6M19 13v6M3 17l4-4 4 4M7 13V3M14 7l4-4 4 4M18 7v10" />
      </svg>
    );
  }
  if (code === 'IMPBACK') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
        <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
      </svg>
    );
  }
  if (code === 'IMPINV') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
        <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
        <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" />
      </svg>
    );
  }
  if (code === 'DLYSALE') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
        <path d="M3 3v18h18" />
        <path d="M7 12l4-4 4 4 6-6" />
      </svg>
    );
  }
  if (code === 'ORPHAN') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
      <path d="M9 17v-2a4 4 0 0 1 4-4h6M3 7h18M3 12h18M3 17h6" />
    </svg>
  );
}
