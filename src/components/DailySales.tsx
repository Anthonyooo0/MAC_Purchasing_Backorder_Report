import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import './backorder-report.css';

interface Props { userEmail: string; }

interface SalesRow {
  'Company': string;
  'SO No': string;
  'Customer PO': string;
  'Item': string;
  'Qty Ordered': number;
  'Qty Shipped': number;
  'Backordered': number;
  'Item UOM': string;
  'Customer': string;
  'Part Number': string;
  'Description': string;
  'Comment': string;
  'Inventory Location 1': string | null;
  'Inventory Location 2': string | null;
  'Make': string;
  'Purchase': string;
  'Vendor': string | null;
  'Vendor PN': string | null;
  'Vendor Description': string | null;
  'Vendor UOM': string | null;
  'Inventory UOM': string;
  'Unit Quantity': number | null;
  'IM Status': string;
  'Date Entered': string;
  'Due Date': string;
  'Status': string;
}

type QuickRange = '' | 'today' | 'thisweek' | 'thismonth';

const API_URL = (import.meta as any).env.VITE_DAILY_SALES_API_URL
  || 'https://mac-backorder-hdavg3a7g9gpejdx.eastus-01.azurewebsites.net/api/daily-sales';

export const DailySales: React.FC<Props> = ({ userEmail: _userEmail }) => {
  const [allRows, setAllRows] = useState<SalesRow[]>([]);
  const [generatedAt, setGeneratedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [filterCompany, setFilterCompany] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterMakeBuy, setFilterMakeBuy] = useState<'' | 'make' | 'purchase' | 'neither'>('');
  // Default to Today — matches Alan's "daily sales report" use case.
  const [quickRange, setQuickRange] = useState<QuickRange>('today');
  const [sortCol, setSortCol] = useState<string>('Date Entered');
  const [sortAsc, setSortAsc] = useState(false);

  async function loadData() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(API_URL);
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(`HTTP ${res.status}: ${err.error || 'Unknown error'}`); }
      const data = await res.json();
      setAllRows(data.rows || []);
      setGeneratedAt(data.generatedAt);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, []);

  const customers = useMemo(() => [...new Set(allRows.map(r => r['Customer']).filter(Boolean))].sort(), [allRows]);

  // Date bounds for active quick range, or null
  const dateBounds = useMemo<[number, number] | null>(() => {
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

  const filtered = useMemo(() => {
    const s = deferredSearch.toLowerCase();
    return allRows.filter(r => {
      if (filterCompany && r['Company'] !== filterCompany) return false;
      if (filterCustomer && r['Customer'] !== filterCustomer) return false;
      if (filterMakeBuy === 'make' && !r['Make']) return false;
      if (filterMakeBuy === 'purchase' && !r['Purchase']) return false;
      if (filterMakeBuy === 'neither' && (r['Make'] || r['Purchase'])) return false;
      if (dateBounds) {
        const t = new Date(r['Date Entered'] || 0).getTime();
        if (isNaN(t) || t < dateBounds[0] || t > dateBounds[1]) return false;
      }
      if (s) {
        const hay = [r['SO No'], r['Customer PO'], r['Customer'], r['Part Number'], r['Description'], r['Vendor'], r['Vendor PN']].join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [allRows, deferredSearch, filterCompany, filterCustomer, filterMakeBuy, dateBounds]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      let va: any = (a as any)[sortCol], vb: any = (b as any)[sortCol];
      if (va == null) va = ''; if (vb == null) vb = '';
      if (typeof va === 'number' && typeof vb === 'number') return sortAsc ? va - vb : vb - va;
      if (sortCol.includes('Date')) {
        const da = new Date(va || 0).getTime(), db = new Date(vb || 0).getTime();
        return sortAsc ? da - db : db - da;
      }
      return sortAsc ? String(va).toLowerCase().localeCompare(String(vb).toLowerCase()) : String(vb).toLowerCase().localeCompare(String(va).toLowerCase());
    });
    return out;
  }, [filtered, sortCol, sortAsc]);

  // KPIs
  const distinctSOs = useMemo(() => new Set(filtered.map(r => r['SO No'])).size, [filtered]);
  const distinctCustomers = useMemo(() => new Set(filtered.map(r => r['Customer']).filter(Boolean)).size, [filtered]);
  const totalBackorder = useMemo(() => filtered.reduce((s, r) => s + (r['Backordered'] || 0), 0), [filtered]);
  const todayCount = useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const tEnd = t.getTime() + 86_399_999;
    return allRows.filter(r => {
      const e = new Date(r['Date Entered'] || 0).getTime();
      return e >= t.getTime() && e <= tEnd;
    }).length;
  }, [allRows]);

  function toggleSort(col: string) { if (sortCol === col) setSortAsc(!sortAsc); else { setSortCol(col); setSortAsc(true); } }
  function fmtNum(n: number | null | undefined) { if (n == null) return ''; return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function fmtDate(d: string | null | undefined) { if (!d) return ''; const dt = new Date(d); if (isNaN(dt.getTime())) return ''; return dt.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }); }

  function exportCSV() {
    if (sorted.length === 0) return;
    const cols: (keyof SalesRow)[] = ['Company','SO No','Customer PO','Item','Qty Ordered','Qty Shipped','Backordered','Item UOM','Customer','Part Number','Description','Comment','Inventory Location 1','Inventory Location 2','Make','Purchase','Vendor','Vendor PN','Vendor Description','Vendor UOM','Inventory UOM','Unit Quantity','IM Status','Date Entered','Due Date','Status'];
    const dateCols = new Set(['Date Entered', 'Due Date']);
    const esc = (v: any) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s; };
    let csv = cols.join(',') + '\n';
    for (const row of sorted) csv += cols.map(c => esc(dateCols.has(c) ? fmtDate(row[c] as string) : row[c])).join(',') + '\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `MAC_Daily_Sales_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  if (loading) return (
    <div className="app-loading-screen">
      <div className="app-loading-logo"><img src="/mac_logo.png" alt="MAC Logo" /></div>
      <div className="app-loading-text">Loading Daily Sales</div>
      <div className="app-loading-sub">First load may take up to 90 seconds while we hit both DBs...</div>
    </div>
  );

  return (
    <>
      <header className="header">
        <div className="header-left">
          <div className="header-logo"><img src="/mac_logo.png" alt="MAC" /></div>
          <div>
            <div className="header-title">Daily Sales Detail</div>
            <div className="header-sub">Open SO releases enriched with item master, vendor, and inventory info</div>
          </div>
        </div>
        <div className="header-right">
          <div>
            <span className="report-id">DLYSALE</span>
            <span className="header-version">V1.0.0</span>
          </div>
          <div className="report-meta">
            {generatedAt ? `${new Date(generatedAt).toLocaleDateString('en-US')} ${new Date(generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : '—'}
          </div>
        </div>
      </header>

      <div className="view-transition flex-1 overflow-y-auto">
        <div className="summary">
          <div className="card card-accent">
            <div className="card-label">Open Lines (filtered)</div>
            <div className="card-value">{filtered.length.toLocaleString()}</div>
          </div>
          <div className="card card-orange">
            <div className="card-label">Open SOs</div>
            <div className="card-value">{distinctSOs.toLocaleString()}</div>
          </div>
          <div className="card">
            <div className="card-label">Customers</div>
            <div className="card-value">{distinctCustomers.toLocaleString()}</div>
          </div>
          <div className="card card-red">
            <div className="card-label">Total Backorder Qty</div>
            <div className="card-value">{fmtNum(totalBackorder)}</div>
          </div>
          <div className="card card-green">
            <div className="card-label">Entered Today</div>
            <div className="card-value">{todayCount.toLocaleString()}</div>
          </div>
        </div>

        {/* Quick date-range pills */}
        <div className="controls" style={{ paddingBottom: 0, gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: '#64748b', textTransform: 'uppercase', alignSelf: 'center', marginRight: 4 }}>Entered:</span>
          {([
            { key: 'today',     label: 'Today' },
            { key: 'thisweek',  label: 'This Week' },
            { key: 'thismonth', label: 'This Month' },
            { key: '',          label: 'All Open' },
          ] as { key: QuickRange; label: string }[]).map(opt => {
            const active = quickRange === opt.key;
            return (
              <button
                key={opt.label}
                onClick={() => setQuickRange(opt.key)}
                style={{
                  padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: active ? '1px solid #1a365d' : '1px solid #e2e8f0',
                  background: active ? '#1a365d' : '#fff',
                  color: active ? '#fff' : '#475569',
                  transition: 'all 0.15s ease',
                }}
              >{opt.label}</button>
            );
          })}
        </div>

        <div className="controls">
          <input type="text" className="search-box" placeholder="Search SO, PO, customer, part, vendor..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="filter" value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}>
            <option value="">Both Companies</option>
            <option value="MAC Impulse">MAC Impulse</option>
            <option value="MAC Products">MAC Products</option>
          </select>
          <select className="filter" value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)}>
            <option value="">All Customers</option>
            {customers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="filter" value={filterMakeBuy} onChange={(e) => setFilterMakeBuy(e.target.value as any)}>
            <option value="">Make or Buy</option>
            <option value="make">Make only</option>
            <option value="purchase">Purchase only</option>
            <option value="neither">Neither</option>
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

        <div className="row-count">Showing {sorted.length.toLocaleString()} of {allRows.length.toLocaleString()} open SO lines</div>

        {error && <div className="error-box" style={{ margin: '12px 24px' }}>Error loading data: {error}</div>}

        {!error && (
          <div className="table-wrap">
            <div className="table-container">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {['Company','SO No','Cust PO','Item','Qty Ord','Qty Ship','BO','UOM','Customer','Part Number','Description','Comment','Loc 1','Loc 2','Make','Buy','Vendor','Vendor PN','Vendor Desc','V-UOM','Unit Qty','IM Stat','Entered','Due','Status'].map(col => {
                        const dataCol = ({
                          'Cust PO': 'Customer PO', 'Qty Ord': 'Qty Ordered', 'Qty Ship': 'Qty Shipped', 'BO': 'Backordered',
                          'UOM': 'Item UOM', 'Loc 1': 'Inventory Location 1', 'Loc 2': 'Inventory Location 2',
                          'Buy': 'Purchase', 'Vendor Desc': 'Vendor Description', 'V-UOM': 'Vendor UOM',
                          'Unit Qty': 'Unit Quantity', 'IM Stat': 'IM Status',
                          'Entered': 'Date Entered', 'Due': 'Due Date',
                        } as Record<string, string>)[col] || col;
                        return (
                          <th key={col} onClick={() => toggleSort(dataCol)}>
                            {col}<span className="sort-arrow">{sortCol === dataCol ? (sortAsc ? ' ▲' : ' ▼') : ''}</span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.length === 0 ? (
                      <tr><td colSpan={25}><div className="empty-state"><p>No SO lines match your filters</p></div></td></tr>
                    ) : (
                      sorted.map((r, i) => (
                        <tr key={i}>
                          <td><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, background: r.Company === 'MAC Impulse' ? '#dbeafe' : '#fef3c7', color: r.Company === 'MAC Impulse' ? '#1e40af' : '#92400e' }}>{r.Company.replace('MAC ', '')}</span></td>
                          <td className="font-mono" style={{ fontSize: 12, fontWeight: 700 }}>{r['SO No']}</td>
                          <td className="font-mono" style={{ fontSize: 11, color: '#475569' }}>{r['Customer PO']}</td>
                          <td className="font-mono" style={{ fontSize: 11, color: '#64748b' }}>{r['Item']}</td>
                          <td className="num">{fmtNum(r['Qty Ordered'])}</td>
                          <td className="num">{fmtNum(r['Qty Shipped'])}</td>
                          <td className="num-bold" style={{ color: r['Backordered'] > 0 ? '#c2410c' : undefined }}>{fmtNum(r['Backordered'])}</td>
                          <td>{r['Item UOM']}</td>
                          <td className="desc-col" title={r['Customer']}>{r['Customer']}</td>
                          <td className="id-col">{r['Part Number']}</td>
                          <td className="desc-col" title={r['Description']}>{r['Description']}</td>
                          <td className="desc-col" title={r['Comment']} style={{ fontSize: 11, color: '#64748b' }}>{r['Comment']}</td>
                          <td className="font-mono" style={{ fontSize: 12 }}>{r['Inventory Location 1']}</td>
                          <td className="font-mono" style={{ fontSize: 12 }}>{r['Inventory Location 2']}</td>
                          <td style={{ color: r['Make'] ? '#166534' : '#cbd5e1', fontWeight: 700, fontSize: 11 }}>{r['Make'] || '—'}</td>
                          <td style={{ color: r['Purchase'] ? '#1e40af' : '#cbd5e1', fontWeight: 700, fontSize: 11 }}>{r['Purchase'] || '—'}</td>
                          <td className="desc-col" title={r['Vendor'] || ''}>{r['Vendor']}</td>
                          <td className="font-mono" style={{ fontSize: 11 }}>{r['Vendor PN']}</td>
                          <td className="desc-col" title={r['Vendor Description'] || ''}>{r['Vendor Description']}</td>
                          <td>{r['Vendor UOM']}</td>
                          <td className="num">{fmtNum(r['Unit Quantity'])}</td>
                          <td className="font-mono" style={{ fontSize: 11, fontWeight: 700 }}>{r['IM Status']}</td>
                          <td className="date-col">{fmtDate(r['Date Entered'])}</td>
                          <td className="date-col">{fmtDate(r['Due Date'])}</td>
                          <td className="font-mono" style={{ fontSize: 11, fontWeight: 700 }}>{r['Status']}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <div className="footer">MAC Products Internal System · Daily Sales Detail</div>
      </div>
    </>
  );
};
