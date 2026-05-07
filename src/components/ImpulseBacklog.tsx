import React, { useEffect, useMemo, useState } from 'react';
import './backorder-report.css';
import './impulse-shipments.css';
import './impulse-backlog.css';

interface Props {
  userEmail: string;
}

interface BacklogRow {
  'SO No': string;
  'Date Entered': string;
  'Due': string;
  'Customer': string;
  'Customer No': string;
  'Part Number': string;
  'Rev': string;
  'Description': string;
  'Qty': number;
  'Stock': number;
  'Unit Cost': number;
  'Unit Price': number;
  'Backlog Value': number;
  'JO / PO': string;
  'Supply Type': string;
  'S': string;
  'Last SO/LINE/REL Comment': string;
  'CR': number;
  'Release Status': string;
  'SO Status': string;
  'Schedule Status': string;
  'Estimator': string;
  'Customer PO': string;
  'Ship Via': string;
  'Backlog Qty': number;
  'Item No': string;
  'Release': string;
}

const API_URL = (import.meta as any).env.VITE_IMPULSE_BACKLOG_API_URL
  || 'https://mac-backorder-hdavg3a7g9gpejdx.eastus-01.azurewebsites.net/api/impulse-backlog';

// Default backlog target — same gauge as the Power BI report (you can configure later)
const BACKLOG_TARGET = 12_970_000;

export const ImpulseBacklog: React.FC<Props> = ({ userEmail: _userEmail }) => {
  const [allRows, setAllRows] = useState<BacklogRow[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterCR, setFilterCR] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [dueFrom, setDueFrom] = useState<string>('');
  const [dueTo, setDueTo] = useState<string>('');
  const [orderedFrom, setOrderedFrom] = useState<string>('');
  const [orderedTo, setOrderedTo] = useState<string>('');

  // Sort
  const [sortCol, setSortCol] = useState<string>('Due');
  const [sortAsc, setSortAsc] = useState(true);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(API_URL);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`HTTP ${res.status}: ${err.error || 'Unknown error'}`);
      }
      const data = await res.json();
      setAllRows(data.rows || []);
      setGeneratedAt(data.generatedAt);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const customers = useMemo(
    () => [...new Set(allRows.map(r => r['Customer']).filter(Boolean))].sort(),
    [allRows]
  );
  const crValues = useMemo(
    () => [...new Set(allRows.map(r => r['CR']).filter(v => v != null))].sort((a, b) => a - b),
    [allRows]
  );
  const statuses = useMemo(
    () => [...new Set(allRows.map(r => r['S']).filter(Boolean))].sort(),
    [allRows]
  );

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    const dueFromTs = dueFrom ? new Date(dueFrom).getTime() : null;
    const dueToTs = dueTo ? new Date(dueTo).getTime() : null;
    const orderFromTs = orderedFrom ? new Date(orderedFrom).getTime() : null;
    const orderToTs = orderedTo ? new Date(orderedTo).getTime() : null;

    return allRows.filter(r => {
      if (filterCustomer && r['Customer'] !== filterCustomer) return false;
      if (filterCR && String(r['CR']) !== filterCR) return false;
      if (filterStatus && r['S'] !== filterStatus) return false;
      if (dueFromTs && r['Due'] && new Date(r['Due']).getTime() < dueFromTs) return false;
      if (dueToTs && r['Due'] && new Date(r['Due']).getTime() > dueToTs) return false;
      if (orderFromTs && r['Date Entered'] && new Date(r['Date Entered']).getTime() < orderFromTs) return false;
      if (orderToTs && r['Date Entered'] && new Date(r['Date Entered']).getTime() > orderToTs) return false;
      if (s) {
        const hay = [
          r['SO No'], r['Customer'], r['Part Number'], r['Description'],
          r['JO / PO'], r['Customer PO'], r['Last SO/LINE/REL Comment'],
        ].join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [allRows, search, filterCustomer, filterCR, filterStatus, dueFrom, dueTo, orderedFrom, orderedTo]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      let va: any = (a as any)[sortCol], vb: any = (b as any)[sortCol];
      if (va == null) va = '';
      if (vb == null) vb = '';
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortAsc ? va - vb : vb - va;
      }
      if (sortCol.includes('Date') || sortCol === 'Due') {
        const da = new Date(va || 0).getTime(), db = new Date(vb || 0).getTime();
        return sortAsc ? da - db : db - da;
      }
      const sa = String(va).toLowerCase(), sb = String(vb).toLowerCase();
      return sortAsc ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return out;
  }, [filtered, sortCol, sortAsc]);

  const totalBacklog = useMemo(() => filtered.reduce((sum, r) => sum + (r['Backlog Value'] || 0), 0), [filtered]);
  const totalLines = filtered.length;
  const lateLines = useMemo(() => filtered.filter(r => r['Schedule Status'] === 'LATE').length, [filtered]);
  const customersCount = useMemo(() => new Set(filtered.map(r => r['Customer'])).size, [filtered]);

  const goalPct = Math.min(100, (totalBacklog / BACKLOG_TARGET) * 100);

  function toggleSort(col: string) {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  }

  function fmtCurrency(n: number | undefined | null) {
    if (n == null) return '';
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  }
  function fmtCompact(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  }
  function fmtDate(d: string | undefined | null) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  }
  function fmtNum(n: number | undefined | null) {
    if (n == null) return '';
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  function exportCSV() {
    if (sorted.length === 0) return;
    const cols: (keyof BacklogRow)[] = [
      'SO No', 'Date Entered', 'Due', 'Customer', 'Part Number', 'Description',
      'Qty', 'Stock', 'Unit Cost', 'Unit Price', 'Backlog Value', 'JO / PO',
      'S', 'Last SO/LINE/REL Comment', 'CR', 'SO Status', 'Release Status',
      'Customer PO', 'Estimator', 'Ship Via',
    ];
    const escape = (v: any) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    let csv = cols.join(',') + '\n';
    for (const row of sorted) {
      csv += cols.map(c => {
        const v = row[c];
        return escape(c.toString().includes('Date') || c === 'Due' ? fmtDate(v as string) : v);
      }).join(',') + '\n';
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MAC_Impulse_Backlog_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="app-loading-screen">
        <div className="app-loading-logo">
          <img src="/mac_logo.png" alt="MAC Logo" />
        </div>
        <div className="app-loading-text">Loading Impulse Backlog</div>
        <div className="app-loading-sub">Querying open SO releases...</div>
      </div>
    );
  }

  return (
    <>
      <header className="header">
        <div className="header-left">
          <div className="header-logo"><img src="/mac_impulse_logo.png" onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/mac_logo.png'; }} alt="MAC Impulse" /></div>
          <div>
            <div className="header-title">Impulse Backlog</div>
            <div className="header-sub">Open Sales Order Releases</div>
          </div>
        </div>
        <div className="header-right">
          <div>
            <span className="report-id">IMPBACK</span>
            <span className="header-version">V1.0.0</span>
          </div>
          <div className="report-meta">
            {generatedAt ? `${fmtDate(generatedAt)} ${new Date(generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : '—'}
          </div>
        </div>
      </header>

      <div className="view-transition flex-1 overflow-y-auto">
        {/* KPI Cards */}
        <div className="summary">
          <div className="card card-accent">
            <div className="card-label">Backlog Value</div>
            <div className="card-value">{fmtCurrency(totalBacklog)}</div>
          </div>
          <div className="card">
            <div className="card-label">Open Lines</div>
            <div className="card-value">{totalLines.toLocaleString()}</div>
          </div>
          <div className="card card-red">
            <div className="card-label">Late Lines</div>
            <div className="card-value">{lateLines.toLocaleString()}</div>
          </div>
          <div className="card card-green">
            <div className="card-label">Customers</div>
            <div className="card-value">{customersCount.toLocaleString()}</div>
          </div>
          <div className="card card-orange">
            <div className="card-label">Avg Backlog / Line</div>
            <div className="card-value">{totalLines > 0 ? fmtCompact(totalBacklog / totalLines) : '—'}</div>
          </div>
        </div>

        {/* Backlog Value gauge + filters row */}
        <div className="chart-row backlog-row">
          <div className="goal-card">
            <div className="chart-eyebrow">Backlog Value</div>
            <BacklogGauge pct={goalPct} value={totalBacklog} target={BACKLOG_TARGET} />
            <div className="backlog-gauge-bounds">
              <span>$0.00M</span>
              <span>{fmtCompact(BACKLOG_TARGET)}</span>
            </div>
          </div>

          <div className="filter-card">
            <div className="filter-grid">
              <div>
                <label className="filter-label">Customer</label>
                <select className="filter w-full" value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)}>
                  <option value="">All</option>
                  {customers.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="filter-label">CR</label>
                <select className="filter w-full" value={filterCR} onChange={(e) => setFilterCR(e.target.value)}>
                  <option value="">All</option>
                  {crValues.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="filter-label">Status</label>
                <select className="filter w-full" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="">All</option>
                  {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="filter-label">Due From</label>
                <input type="date" className="filter w-full" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} />
              </div>
              <div>
                <label className="filter-label">Due To</label>
                <input type="date" className="filter w-full" value={dueTo} onChange={(e) => setDueTo(e.target.value)} />
              </div>
              <div>
                <label className="filter-label">Ordered From</label>
                <input type="date" className="filter w-full" value={orderedFrom} onChange={(e) => setOrderedFrom(e.target.value)} />
              </div>
              <div>
                <label className="filter-label">Ordered To</label>
                <input type="date" className="filter w-full" value={orderedTo} onChange={(e) => setOrderedTo(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* Search + actions */}
        <div className="controls">
          <input
            type="text" className="search-box"
            placeholder="Search SO #, customer, part, description, JO/PO..."
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn btn-primary" onClick={loadData}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" /></svg>
            Refresh
          </button>
          <button className="btn btn-export" onClick={exportCSV}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
            Export CSV
          </button>
        </div>

        <div className="row-count">
          Showing {sorted.length.toLocaleString()} of {allRows.length.toLocaleString()} backlog lines
        </div>

        {error && (
          <div className="error-box" style={{ margin: '12px 24px' }}>
            Error loading data: {error}
          </div>
        )}

        {!error && (
          <div className="table-wrap">
            <div className="table-container">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {['SO No', 'Date Entered', 'Due', 'Customer', 'Part Number', 'Description',
                        'Qty', 'Stock', 'Unit Cost', 'Backlog Value', 'JO / PO', 'S',
                        'Last SO/LINE/REL Comment', 'CR'].map(col => (
                        <th key={col} onClick={() => toggleSort(col)}>
                          {col}
                          <span className="sort-arrow">
                            {sortCol === col ? (sortAsc ? ' ▲' : ' ▼') : ''}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.length === 0 ? (
                      <tr>
                        <td colSpan={14}>
                          <div className="empty-state">
                            <p>No backlog lines match your filters</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      sorted.map((r, i) => (
                        <tr key={i}>
                          <td className="id-col">{r['SO No']}</td>
                          <td className="date-col">{fmtDate(r['Date Entered'])}</td>
                          <td className={`date-col ${r['Schedule Status'] === 'LATE' ? 'overdue-text' : ''}`}>{fmtDate(r['Due'])}</td>
                          <td title={r['Customer']}>{r['Customer']}</td>
                          <td className="id-col">{r['Part Number']}</td>
                          <td className="desc-col" title={r['Description']}>{r['Description']}</td>
                          <td className="num">{fmtNum(r['Qty'])}</td>
                          <td className="num">{r['Stock'] ? fmtNum(r['Stock']) : ''}</td>
                          <td className="num">{r['Unit Cost'] ? fmtNum(r['Unit Cost']) : ''}</td>
                          <td className="num-bold">{fmtCurrency(r['Backlog Value'])}</td>
                          <td className="id-col" style={{ color: r['Supply Type'] === 'P' ? '#2563eb' : r['Supply Type'] === 'J' ? '#16a34a' : undefined }}>
                            {r['JO / PO']}
                          </td>
                          <td><StatusBadge code={r['S']} /></td>
                          <td className="desc-col" title={r['Last SO/LINE/REL Comment']}>{r['Last SO/LINE/REL Comment']}</td>
                          <td><CRBadge value={r['CR']} /></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <div className="footer">MAC Products Internal System · MAC Impulse Database</div>
      </div>
    </>
  );
};

function StatusBadge({ code }: { code: string }) {
  if (!code) return null;
  const tone = statusTone(code);
  return <span className={`status-pill status-${tone}`}>{code}</span>;
}

function statusTone(status: string): string {
  const s = (status || '').toLowerCase();
  if (s.includes('cancel'))  return 'red';
  if (s.includes('hold'))    return 'red';
  if (s.includes('closed'))  return 'green';
  if (s.includes('shipped')) return 'green';
  if (s.includes('release')) return 'blue';
  if (s.includes('avail'))   return 'green';
  if (s.includes('start'))   return 'orange';
  if (s.includes('open'))    return 'blue';
  if (s.includes('pend'))    return 'orange';
  return 'slate';
}

function CRBadge({ value }: { value: number }) {
  if (value == null || value === 0) return <span className="cr-badge cr-none">—</span>;
  return <span className={`cr-badge cr-${value}`}>{value}</span>;
}

function BacklogGauge({ pct }: { pct: number; value: number; target: number }) {
  const radius = 80;
  const circ = Math.PI * radius;
  const dashOffset = circ - (Math.min(100, pct) / 100) * circ;

  return (
    <svg viewBox="0 0 200 130" className="goal-gauge">
      <path
        d={`M 20 100 A ${radius} ${radius} 0 0 1 180 100`}
        stroke="#e2e8f0" strokeWidth="14" fill="none" strokeLinecap="round"
      />
      <path
        d={`M 20 100 A ${radius} ${radius} 0 0 1 180 100`}
        stroke="#1a365d" strokeWidth="14" fill="none" strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={dashOffset}
        style={{ transition: 'stroke-dashoffset 0.4s ease-out' }}
      />
      <text
        x="100" y="90" textAnchor="middle"
        fontSize="26" fontWeight="600" fill="#1e293b"
        style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
      >
        {pct.toFixed(2)}%
      </text>
    </svg>
  );
}
