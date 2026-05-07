import React, { useEffect, useMemo, useState } from 'react';
import './backorder-report.css';
import './impulse-shipments.css';

interface Props {
  userEmail: string;
}

interface ShipmentRow {
  'Ship No': string;
  'SO No': string;
  'Customer No': string;
  'Company': string;
  'Ship Date': string;
  'Ship Via': string;
  'Initials': string;
  'FOB': string;
  'Bill of Lading': string;
  'Part No': string;
  'Description': string;
  'U/M': string;
  'Ship Qty': number;
  'Order Qty': number;
  'Customer Part No': string;
  'Tracking No': string;
  'Freight Amount': number;
  'No Boxes': number;
  'Ship Weight': number;
  'Unit Price': number;
  'Total Price': number;
  'Ship Year': number;
  'Ship Quarter': number;
  'Ship Month': number;
}

const API_URL = (import.meta as any).env.VITE_IMPULSE_SHIPMENTS_API_URL
  || 'https://mac-backorder-hdavg3a7g9gpejdx.eastus-01.azurewebsites.net/api/impulse-shipments';

const ANNUAL_GOAL = 18_000_000; // $18M default goal
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export const ImpulseShipments: React.FC<Props> = ({ userEmail: _userEmail }) => {
  const [allRows, setAllRows] = useState<ShipmentRow[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterSO, setFilterSO] = useState('');
  const [filterYear, setFilterYear] = useState<string>(String(new Date().getFullYear()));
  const [filterMonth, setFilterMonth] = useState<string>('');

  // Sort
  const [sortCol, setSortCol] = useState<string>('Ship Date');
  const [sortAsc, setSortAsc] = useState(false);

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

  // Distinct filter options
  const companies = useMemo(
    () => [...new Set(allRows.map(r => r['Company']).filter(Boolean))].sort(),
    [allRows]
  );
  const sos = useMemo(
    () => [...new Set(allRows.map(r => r['SO No']).filter(Boolean))].sort(),
    [allRows]
  );
  const years = useMemo(
    () => [...new Set(allRows.map(r => r['Ship Year']).filter(Boolean))].sort((a, b) => b - a),
    [allRows]
  );

  // Filtered data
  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return allRows.filter(r => {
      if (filterCompany && r['Company'] !== filterCompany) return false;
      if (filterSO && r['SO No'] !== filterSO) return false;
      if (filterYear && String(r['Ship Year']) !== filterYear) return false;
      if (filterMonth && String(r['Ship Month']) !== filterMonth) return false;
      if (s) {
        const hay = [
          r['Ship No'], r['SO No'], r['Company'], r['Part No'],
          r['Description'], r['Tracking No'], r['Customer Part No'], r['Customer No'],
        ].join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [allRows, search, filterCompany, filterSO, filterYear, filterMonth]);

  // Sorted data
  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      let va: any = (a as any)[sortCol], vb: any = (b as any)[sortCol];
      if (va == null) va = '';
      if (vb == null) vb = '';
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortAsc ? va - vb : vb - va;
      }
      if (sortCol.includes('Date')) {
        const da = new Date(va || 0).getTime(), db = new Date(vb || 0).getTime();
        return sortAsc ? da - db : db - da;
      }
      const sa = String(va).toLowerCase(), sb = String(vb).toLowerCase();
      return sortAsc ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return out;
  }, [filtered, sortCol, sortAsc]);

  // KPIs
  const totalShipments = useMemo(() => new Set(filtered.map(r => r['Ship No'])).size, [filtered]);
  const totalValue = useMemo(() => filtered.reduce((sum, r) => sum + (r['Total Price'] || 0), 0), [filtered]);
  const totalQty = useMemo(() => filtered.reduce((sum, r) => sum + (r['Ship Qty'] || 0), 0), [filtered]);
  const uniqueCustomers = useMemo(() => new Set(filtered.map(r => r['Company'])).size, [filtered]);

  // Monthly chart for current Year filter (or this year if all)
  const chartYear = filterYear ? Number(filterYear) : new Date().getFullYear();
  const monthlyTotals = useMemo(() => {
    const arr = Array(12).fill(0);
    for (const r of allRows) {
      if (r['Ship Year'] === chartYear) arr[(r['Ship Month'] || 1) - 1] += r['Total Price'] || 0;
    }
    return arr;
  }, [allRows, chartYear]);
  const yearTotal = monthlyTotals.reduce((a, b) => a + b, 0);
  const goalPct = Math.min(100, (yearTotal / ANNUAL_GOAL) * 100);

  function toggleSort(col: string) {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  }

  function fmtCurrency(n: number | undefined | null) {
    if (n == null) return '';
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
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
    const cols: (keyof ShipmentRow)[] = [
      'Ship No', 'SO No', 'Customer No', 'Company', 'Ship Date', 'Ship Via',
      'Part No', 'Description', 'U/M', 'Ship Qty', 'Order Qty', 'Customer Part No',
      'Tracking No', 'Unit Price', 'Total Price', 'Initials', 'FOB', 'Bill of Lading',
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
        return escape(c.toString().includes('Date') ? fmtDate(v as string) : v);
      }).join(',') + '\n';
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MAC_Impulse_Shipments_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="app-loading-screen">
        <div className="app-loading-logo">
          <img src="/mac_logo.png" alt="MAC Logo" />
        </div>
        <div className="app-loading-text">Loading Impulse Shipments</div>
        <div className="app-loading-sub">Querying MAC Impulse database...</div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="header-logo"><img src="/mac_impulse_logo.png" onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/mac_logo.png'; }} alt="MAC Impulse" /></div>
          <div>
            <div className="header-title">Impulse Shipping Report</div>
            <div className="header-sub">By Year, Quarter and Month</div>
          </div>
        </div>
        <div className="header-right">
          <div>
            <span className="report-id">IMPSHIP</span>
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
          <div className="card">
            <div className="card-label">Total Shipments</div>
            <div className="card-value">{totalShipments.toLocaleString()}</div>
          </div>
          <div className="card card-accent">
            <div className="card-label">Total Value</div>
            <div className="card-value">{fmtCurrency(totalValue)}</div>
          </div>
          <div className="card card-green">
            <div className="card-label">Total Qty Shipped</div>
            <div className="card-value">{totalQty.toLocaleString()}</div>
          </div>
          <div className="card card-orange">
            <div className="card-label">Unique Customers</div>
            <div className="card-value">{uniqueCustomers.toLocaleString()}</div>
          </div>
          <div className="card card-red">
            <div className="card-label">Lines Returned</div>
            <div className="card-value">{filtered.length.toLocaleString()}</div>
          </div>
        </div>

        {/* Chart + Goal row */}
        <div className="chart-row">
          <div className="chart-card">
            <div className="chart-title">Shipments by Month — {chartYear}</div>
            <div className="bar-chart">
              {monthlyTotals.map((v, i) => {
                const max = Math.max(...monthlyTotals, 1);
                const h = (v / max) * 100;
                return (
                  <div key={i} className="bar-col">
                    <div className="bar-value">{v > 0 ? `$${(v / 1_000_000).toFixed(2)}M` : ''}</div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ height: `${h}%` }} />
                    </div>
                    <div className="bar-label">{MONTH_NAMES[i]}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="goal-card">
            <div className="goal-title">{chartYear} Shipping Goal</div>
            <GoalGauge pct={goalPct} value={yearTotal} goal={ANNUAL_GOAL} />
            <div className="goal-stats">
              <div>
                <div className="goal-stat-label">Achieved</div>
                <div className="goal-stat-value">{fmtCurrency(yearTotal)}</div>
              </div>
              <div>
                <div className="goal-stat-label">Goal</div>
                <div className="goal-stat-value">{fmtCurrency(ANNUAL_GOAL)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="controls">
          <input
            type="text" className="search-box"
            placeholder="Search ship #, SO, customer, part, tracking..."
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
          <select className="filter" value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}>
            <option value="">All Companies</option>
            {companies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="filter" value={filterSO} onChange={(e) => setFilterSO(e.target.value)}>
            <option value="">All Sales Orders</option>
            {sos.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="filter" value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
            <option value="">All Years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="filter" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
            <option value="">All Months</option>
            {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
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
          Showing {sorted.length.toLocaleString()} of {allRows.length.toLocaleString()} shipment lines
        </div>

        {/* Error */}
        {error && (
          <div className="error-box" style={{ margin: '12px 24px' }}>
            Error loading data: {error}
          </div>
        )}

        {/* Table */}
        {!error && (
          <div className="table-wrap">
            <div className="table-container">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {[
                        'Ship No', 'SO No', 'Company', 'Ship Date', 'Part No',
                        'Description', 'Ship Qty', 'Tracking No', 'Total Price',
                      ].map(col => (
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
                        <td colSpan={9}>
                          <div className="empty-state">
                            <p>No shipments match your filters</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      sorted.map((r, i) => (
                        <tr key={i}>
                          <td className="id-col">{r['Ship No']}</td>
                          <td className="font-mono" style={{ fontSize: 12 }}>{r['SO No']}</td>
                          <td title={r['Company']}>{r['Company']}</td>
                          <td className="date-col">{fmtDate(r['Ship Date'])}</td>
                          <td className="id-col">{r['Part No']}</td>
                          <td className="desc-col" title={r['Description']}>{r['Description']}</td>
                          <td className="num">{fmtNum(r['Ship Qty'])}</td>
                          <td className="font-mono" style={{ fontSize: 11 }}>{r['Tracking No']}</td>
                          <td className="num-bold">{fmtCurrency(r['Total Price'])}</td>
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

function GoalGauge({ pct, value: _value, goal: _goal }: { pct: number; value: number; goal: number }) {
  const radius = 80;
  const circ = Math.PI * radius;
  const dashOffset = circ - (pct / 100) * circ;

  return (
    <svg viewBox="0 0 200 110" className="goal-gauge">
      {/* Background arc */}
      <path
        d={`M 20 100 A ${radius} ${radius} 0 0 1 180 100`}
        stroke="#e2e8f0" strokeWidth="16" fill="none" strokeLinecap="round"
      />
      {/* Progress arc */}
      <path
        d={`M 20 100 A ${radius} ${radius} 0 0 1 180 100`}
        stroke="#3182ce" strokeWidth="16" fill="none" strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={dashOffset}
        style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
      />
      {/* Pct text */}
      <text x="100" y="92" textAnchor="middle" fontSize="22" fontWeight="700" fill="#1e293b" fontFamily="Space Mono, monospace">
        {pct.toFixed(1)}%
      </text>
    </svg>
  );
}
