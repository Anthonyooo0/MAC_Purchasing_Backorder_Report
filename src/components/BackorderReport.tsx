import React, { useEffect, useRef, useState } from 'react';
import { initBackorderReport } from './backorder-logic';
import './backorder-report.css';

interface BackorderReportProps {
  userEmail: string;
  onSignOut: () => void;
}

export const BackorderReport: React.FC<BackorderReportProps> = ({ userEmail, onSignOut }) => {
  const initialized = useRef(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handler = () => setIsLoading(false);
    window.addEventListener('backorder-loaded', handler);
    if (!initialized.current) {
      initialized.current = true;
      initBackorderReport();
    }
    return () => window.removeEventListener('backorder-loaded', handler);
  }, []);

  return (
    <>
      {isLoading && (
        <div className="app-loading-screen">
          <div className="app-loading-logo">
            <img src="/mac_logo.png" alt="MAC Logo" />
          </div>
          <div className="app-loading-text">Loading Backorder Report</div>
          <div className="app-loading-sub">Querying M2M ERP database...</div>
        </div>
      )}
      <div style={{ visibility: isLoading ? 'hidden' : 'visible' }}>
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="header-logo"><img src="/mac_logo.png" alt="MAC Products" /></div>
          <div>
            <div className="header-title">Purchasing Backorder Report</div>
            <div className="header-sub">Ordered by Part Number, Vendor Name</div>
          </div>
        </div>
        <div className="header-right">
          <div>
            <span className="report-id">ZPOPH</span>
            <span className="header-version">V1.0.0</span>
          </div>
          <div className="report-meta" id="report-date">Loading...</div>
          <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
            <span style={{ fontSize: '10px', color: '#93c5fd' }}>{userEmail}</span>
            <button
              onClick={onSignOut}
              style={{
                fontSize: '10px', color: '#94a3b8', background: 'rgba(255,255,255,0.08)',
                border: 'none', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer',
                fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 700,
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="view-transition">
        {/* KPI Cards */}
        <div className="summary" id="summary">
          <div className="card">
            <div className="card-label">Total Backorder Lines</div>
            <div className="card-value" id="stat-lines">&mdash;</div>
          </div>
          <div className="card card-accent">
            <div className="card-label">Unique Parts</div>
            <div className="card-value" id="stat-parts">&mdash;</div>
          </div>
          <div className="card card-green">
            <div className="card-label">Unique Vendors</div>
            <div className="card-value" id="stat-vendors">&mdash;</div>
          </div>
          <div className="card card-orange">
            <div className="card-label">Unique POs</div>
            <div className="card-value" id="stat-pos">&mdash;</div>
          </div>
          <div className="card card-red">
            <div className="card-label">Overdue Items</div>
            <div className="card-value" id="stat-overdue">&mdash;</div>
          </div>
        </div>

        {/* Controls */}
        <div className="controls">
          <input type="text" className="search-box" id="search" placeholder="Search part, vendor, PO#, description..." />
          <select className="filter" id="filter-status">
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="ON HOLD">On Hold</option>
          </select>
          <select className="filter" id="filter-planner">
            <option value="">All Planners</option>
          </select>
          <select className="filter" id="filter-source">
            <option value="">All Sources</option>
            <option value="MAKE">Make</option>
            <option value="BUY">Buy</option>
            <option value="STOCK (PURCHASE)">Stock (Purchase)</option>
            <option value="STOCK (MAKE)">Stock (Make)</option>
            <option value="STOCK">Stock</option>
            <option value="PHANTOM">Phantom</option>
          </select>
          <select className="filter" id="filter-prodclass">
            <option value="">All Product Classes</option>
          </select>
          <select className="filter" id="filter-overdue">
            <option value="">All Items</option>
            <option value="overdue">Overdue Only</option>
          </select>
          <button className="btn btn-primary" id="btn-refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>
            Refresh
          </button>
          <button className="btn btn-export" id="btn-export">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Export CSV
          </button>
        </div>

        {/* Row count */}
        <div className="row-count" id="row-count"></div>

        {/* Table */}
        <div className="table-wrap">
          <div className="table-container">
            <div id="loading" className="loading-screen">
              <div className="loading-logo"><img src="/mac_logo.png" alt="Loading" /></div>
              <div className="loading-text">Loading backorder data...</div>
              <div className="loading-sub">Querying M2M ERP database</div>
            </div>
            <div id="error" className="error-box" style={{ display: 'none' }}></div>
            <div className="table-scroll" id="table-scroll" style={{ display: 'none' }}>
              <table id="report-table">
                <thead>
                  <tr>
                    <th data-col="Part No">Part No <span className="sort-arrow"></span></th>
                    <th data-col="Description">Description <span className="sort-arrow"></span></th>
                    <th data-col="Source">Source <span className="sort-arrow"></span></th>
                    <th data-col="Product Class">Prod Class <span className="sort-arrow"></span></th>
                    <th data-col="Vendor Part No">Vendor Part <span className="sort-arrow"></span></th>
                    <th data-col="PO No">PO # <span className="sort-arrow"></span></th>
                    <th data-col="Vendor Name">Vendor Name <span className="sort-arrow"></span></th>
                    <th data-col="PO Status">Status <span className="sort-arrow"></span></th>
                    <th data-col="Planner">Planner <span className="sort-arrow"></span></th>
                    <th data-col="Item No">Item # <span className="sort-arrow"></span></th>
                    <th data-col="PO Date">PO Date <span className="sort-arrow"></span></th>
                    <th data-col="Last Promise Date">Promise Date <span className="sort-arrow"></span></th>
                    <th data-col="PO Qty" style={{ textAlign: 'right' }}>PO Qty <span className="sort-arrow"></span></th>
                    <th data-col="U/M">U/M <span className="sort-arrow"></span></th>
                    <th data-col="MAC Order No">MAC Order # <span className="sort-arrow"></span></th>
                    <th data-col="Recv Qty" style={{ textAlign: 'right' }}>Recv Qty <span className="sort-arrow"></span></th>
                    <th data-col="Backorder Qty" style={{ textAlign: 'right' }}>Backorder <span className="sort-arrow"></span></th>
                  </tr>
                </thead>
                <tbody id="table-body"></tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="footer">MAC Products Internal System</div>
      </div>
      </div>

      {/* Cell detail modal — click any long-text cell to see full content */}
      <div id="cell-modal" className="cell-modal" style={{ display: 'none' }}>
        <div className="cell-modal-backdrop" id="cell-modal-close"></div>
        <div className="cell-modal-panel">
          <div className="cell-modal-header">
            <div>
              <div className="cell-modal-label" id="cell-modal-label">Field</div>
              <div className="cell-modal-sub" id="cell-modal-sub"></div>
            </div>
            <button className="cell-modal-x" id="cell-modal-x" aria-label="Close">×</button>
          </div>
          <div className="cell-modal-body" id="cell-modal-body"></div>
        </div>
      </div>
    </>
  );
};
