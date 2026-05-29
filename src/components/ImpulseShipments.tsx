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
  // Quick date-range presets so Gary can jump to today / this week / this month
  // without fiddling with the Year + Month dropdowns.  Setting one clears the
  // manual Year/Month filters so the two sources of truth don't fight.
  type QuickRange = '' | 'today' | 'thisweek' | 'thismonth';
  const [quickRange, setQuickRange] = useState<QuickRange>('');
  // Custom From/To range (YYYY-MM-DD).  Either bound may be empty (open-
  // ended).  Mutually exclusive with quickRange and the Year/Month dropdowns.
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo,   setDateTo]   = useState<string>('');

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

  // Compute [start, end] millisecond bounds for the active quick range, or
  // null if no quick range is active.  "This Week" = Monday through Sunday
  // of the current calendar week.
  const quickRangeBounds = useMemo<[number, number] | null>(() => {
    if (!quickRange) return null;
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    let start: Date, end: Date;
    if (quickRange === 'today') {
      start = new Date(y, m, d, 0, 0, 0, 0);
      end   = new Date(y, m, d, 23, 59, 59, 999);
    } else if (quickRange === 'thisweek') {
      const daysFromMonday = (now.getDay() + 6) % 7;
      start = new Date(y, m, d - daysFromMonday, 0, 0, 0, 0);
      end   = new Date(y, m, d - daysFromMonday + 6, 23, 59, 59, 999);
    } else {
      start = new Date(y, m, 1, 0, 0, 0, 0);
      end   = new Date(y, m + 1, 0, 23, 59, 59, 999);
    }
    return [start.getTime(), end.getTime()];
  }, [quickRange]);

  // Filtered data
  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return allRows.filter(r => {
      if (filterCompany && r['Company'] !== filterCompany) return false;
      if (filterSO && r['SO No'] !== filterSO) return false;
      if (filterYear && String(r['Ship Year']) !== filterYear) return false;
      if (filterMonth && String(r['Ship Month']) !== filterMonth) return false;
      if (quickRangeBounds) {
        const t = new Date(r['Ship Date'] || 0).getTime();
        if (isNaN(t) || t < quickRangeBounds[0] || t > quickRangeBounds[1]) return false;
      }
      if (dateFrom || dateTo) {
        // String compare on YYYY-MM-DD prefix — locale-independent, no time
        // zone gotchas.  Either bound may be empty (open-ended on that side).
        const shipISO = (r['Ship Date'] || '').substring(0, 10);
        if (!shipISO) return false;
        if (dateFrom && shipISO < dateFrom) return false;
        if (dateTo   && shipISO > dateTo)   return false;
      }
      if (s) {
        const hay = [
          r['Ship No'], r['SO No'], r['Company'], r['Part No'],
          r['Description'], r['Tracking No'], r['Customer Part No'], r['Customer No'],
        ].join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [allRows, search, filterCompany, filterSO, filterYear, filterMonth, quickRangeBounds, dateFrom, dateTo]);

  const customRangeActive = !!(dateFrom || dateTo);

  // Clicking a preset clears the manual Year/Month dropdowns AND the custom
  // From/To range so the different date-filter sources don't fight each other.
  function applyQuickRange(r: QuickRange) {
    setQuickRange(r);
    if (r) { setFilterYear(''); setFilterMonth(''); setDateFrom(''); setDateTo(''); }
  }
  function applyDateFrom(d: string) {
    setDateFrom(d);
    if (d) { setQuickRange(''); setFilterYear(''); setFilterMonth(''); }
  }
  function applyDateTo(d: string) {
    setDateTo(d);
    if (d) { setQuickRange(''); setFilterYear(''); setFilterMonth(''); }
  }
  function clearCustomRange() { setDateFrom(''); setDateTo(''); }

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
            <div className="chart-header">
              <div>
                <div className="chart-eyebrow">Shipments by Month</div>
                <div className="chart-title-2">{chartYear}</div>
              </div>
              <div className="chart-total">
                <div className="chart-total-label">Year total</div>
                <div className="chart-total-value">{fmtCurrency(yearTotal)}</div>
              </div>
            </div>
            <div className="bar-chart">
              {monthlyTotals.map((v, i) => {
                const max = Math.max(...monthlyTotals, 1);
                const h = max > 0 ? (v / max) * 100 : 0;
                const isCurrent = i === new Date().getMonth() && chartYear === new Date().getFullYear();
                return (
                  <div key={i} className="bar-col">
                    <div className="bar-value">{v > 0 ? `${(v / 1_000_000).toFixed(2)}M` : ''}</div>
                    <div className="bar-track">
                      <div className={`bar-fill ${isCurrent ? 'bar-fill-current' : ''}`} style={{ height: `${h}%` }} />
                    </div>
                    <div className="bar-label">{MONTH_NAMES[i]}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="goal-card">
            <div className="chart-eyebrow">Shipping Goal</div>
            <div className="chart-title-2">{chartYear}</div>
            <GoalGauge pct={goalPct} />
            <dl className="goal-dl">
              <div>
                <dt>Achieved</dt>
                <dd>{fmtCurrency(yearTotal)}</dd>
              </div>
              <div>
                <dt>Goal</dt>
                <dd>{fmtCurrency(ANNUAL_GOAL)}</dd>
              </div>
              <div>
                <dt>Remaining</dt>
                <dd>{fmtCurrency(Math.max(0, ANNUAL_GOAL - yearTotal))}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Quick date-range presets */}
        <div className="controls" style={{ paddingBottom: 0, gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: '#64748b', textTransform: 'uppercase', alignSelf: 'center', marginRight: 4 }}>Quick range:</span>
          {([
            { key: 'today',     label: 'Today' },
            { key: 'thisweek',  label: 'This Week' },
            { key: 'thismonth', label: 'This Month' },
            { key: '',          label: 'All Time' },
          ] as { key: QuickRange; label: string }[]).map(opt => {
            const active = !customRangeActive && quickRange === opt.key;
            return (
              <button
                key={opt.label}
                onClick={() => applyQuickRange(opt.key)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: active ? '1px solid #1a365d' : '1px solid #e2e8f0',
                  background: active ? '#1a365d' : '#fff',
                  color: active ? '#fff' : '#475569',
                  transition: 'all 0.15s ease',
                }}
              >{opt.label}</button>
            );
          })}
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: '#64748b', textTransform: 'uppercase', alignSelf: 'center', marginLeft: 12 }}>or custom range:</span>
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => applyDateFrom(e.target.value)}
            title="From (inclusive)"
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              border: dateFrom ? '1px solid #1a365d' : '1px solid #e2e8f0',
              background: dateFrom ? '#1a365d' : '#fff',
              color: dateFrom ? '#fff' : '#475569',
              cursor: 'pointer',
            }}
          />
          <span style={{ alignSelf: 'center', color: '#94a3b8', fontWeight: 700 }}>→</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => applyDateTo(e.target.value)}
            title="To (inclusive)"
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              border: dateTo ? '1px solid #1a365d' : '1px solid #e2e8f0',
              background: dateTo ? '#1a365d' : '#fff',
              color: dateTo ? '#fff' : '#475569',
              cursor: 'pointer',
            }}
          />
          {customRangeActive && (
            <button
              onClick={clearCustomRange}
              title="Clear date range"
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                border: '1px solid #e2e8f0',
                background: '#fff',
                color: '#475569',
                cursor: 'pointer',
              }}
            >×</button>
          )}
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
          <select className="filter" value={filterYear} onChange={(e) => { setFilterYear(e.target.value); if (e.target.value) { setQuickRange(''); clearCustomRange(); } }}>
            <option value="">All Years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="filter" value={filterMonth} onChange={(e) => { setFilterMonth(e.target.value); if (e.target.value) { setQuickRange(''); clearCustomRange(); } }}>
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

function GoalGauge({ pct }: { pct: number }) {
  const radius = 80;
  const circ = Math.PI * radius;
  const dashOffset = circ - (Math.min(100, pct) / 100) * circ;

  return (
    <svg viewBox="0 0 200 120" className="goal-gauge">
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
        x="100" y="92" textAnchor="middle"
        fontSize="26" fontWeight="600" fill="#1e293b"
        style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
      >
        {pct.toFixed(1)}%
      </text>
    </svg>
  );
}

