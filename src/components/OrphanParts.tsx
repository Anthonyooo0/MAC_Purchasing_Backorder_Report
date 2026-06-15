import React, { useEffect, useMemo, useState } from 'react';
import './backorder-report.css';

interface Props { userEmail: string; }

interface OrphanRow {
  'Company': string;
  'Source': string;
  'SO No': string;
  'Item No': string;
  'Release': string;
  'Part Number': string;
  'Description': string;
  'Backlog Qty': number;
  'Ordered Qty': number;
  'Due Date': string;
  'Date Entered': string;
  'Customer': string;
  'Customer PO': string;
  'Status': string;
}

const API_URL = (import.meta as any).env.VITE_ORPHAN_PARTS_API_URL
  || 'https://mac-backorder-hdavg3a7g9gpejdx.eastus-01.azurewebsites.net/api/orphan-parts';

export const OrphanParts: React.FC<Props> = ({ userEmail: _userEmail }) => {
  const [allRows, setAllRows] = useState<OrphanRow[]>([]);
  const [generatedAt, setGeneratedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [sortCol, setSortCol] = useState<string>('Due Date');
  const [sortAsc, setSortAsc] = useState(true);

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

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return allRows.filter(r => {
      if (filterCustomer && r['Customer'] !== filterCustomer) return false;
      if (s) {
        const hay = [r['SO No'], r['Part Number'], r['Description'], r['Customer'], r['Customer PO']].join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [allRows, search, filterCustomer]);

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

  const distinctParts = useMemo(() => new Set(filtered.map(r => r['Part Number'])).size, [filtered]);
  const distinctSOs = useMemo(() => new Set(filtered.map(r => r['SO No'])).size, [filtered]);
  const distinctCustomers = useMemo(() => new Set(filtered.map(r => r['Customer']).filter(Boolean)).size, [filtered]);
  const totalBacklogQty = useMemo(() => filtered.reduce((s, r) => s + (r['Backlog Qty'] || 0), 0), [filtered]);

  function toggleSort(col: string) { if (sortCol === col) setSortAsc(!sortAsc); else { setSortCol(col); setSortAsc(true); } }
  function fmtNum(n: number | null | undefined) { if (n == null) return ''; return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function fmtDate(d: string | null | undefined) { if (!d) return ''; const dt = new Date(d); if (isNaN(dt.getTime())) return ''; return dt.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }); }

  function exportCSV() {
    if (sorted.length === 0) return;
    const cols: (keyof OrphanRow)[] = ['Company','SO No','Item No','Release','Part Number','Description','Backlog Qty','Ordered Qty','Due Date','Date Entered','Customer','Customer PO','Status'];
    const dateCols = new Set(['Due Date', 'Date Entered']);
    const esc = (v: any) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s; };
    let csv = cols.join(',') + '\n';
    for (const row of sorted) csv += cols.map(c => esc(dateCols.has(c) ? fmtDate(row[c] as string) : row[c])).join(',') + '\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `MAC_Orphan_Parts_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  if (loading) return (
    <div className="app-loading-screen">
      <div className="app-loading-logo"><img src="/mac_logo.png" alt="MAC Logo" /></div>
      <div className="app-loading-text">Loading Orphan Parts Audit</div>
      <div className="app-loading-sub">Scanning open SO releases for parts not in item master...</div>
    </div>
  );

  return (
    <>
      <header className="header">
        <div className="header-left">
          <div className="header-logo"><img src="/mac_logo.png" alt="MAC" /></div>
          <div>
            <div className="header-title">Orphan Parts Audit</div>
            <div className="header-sub">Open SO releases referencing parts not in INMASTX</div>
          </div>
        </div>
        <div className="header-right">
          <div>
            <span className="report-id">ORPHAN</span>
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
            <div className="card-label">Orphan Lines</div>
            <div className="card-value">{filtered.length.toLocaleString()}</div>
          </div>
          <div className="card card-red">
            <div className="card-label">Distinct Parts</div>
            <div className="card-value">{distinctParts.toLocaleString()}</div>
          </div>
          <div className="card card-orange">
            <div className="card-label">Affected SOs</div>
            <div className="card-value">{distinctSOs.toLocaleString()}</div>
          </div>
          <div className="card">
            <div className="card-label">Customers</div>
            <div className="card-value">{distinctCustomers.toLocaleString()}</div>
          </div>
          <div className="card card-green">
            <div className="card-label">Total Backlog Qty</div>
            <div className="card-value">{fmtNum(totalBacklogQty)}</div>
          </div>
        </div>

        <div className="controls">
          <input type="text" className="search-box" placeholder="Search SO, part, description, customer..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="filter" value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)}>
            <option value="">All Customers</option>
            {customers.map(c => <option key={c} value={c}>{c}</option>)}
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

        <div className="row-count">Showing {sorted.length.toLocaleString()} of {allRows.length.toLocaleString()} orphan lines</div>

        {error && <div className="error-box" style={{ margin: '12px 24px' }}>Error loading data: {error}</div>}

        {!error && (
          <div className="table-wrap">
            <div className="table-container">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {['Company','SO No','Item','Rel','Part Number','Description','Backlog Qty','Due Date','Customer','Customer PO','Status'].map(col => {
                        const dataCol = col === 'Item' ? 'Item No' : col === 'Rel' ? 'Release' : col;
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
                      <tr><td colSpan={11}><div className="empty-state"><p>🎉 No orphan parts found — every open SO release maps to a real INMASTX record.</p></div></td></tr>
                    ) : (
                      sorted.map((r, i) => (
                        <tr key={i}>
                          <td><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, background: '#dbeafe', color: '#1e40af' }}>{r['Company']}</span></td>
                          <td className="font-mono" style={{ fontSize: 12, fontWeight: 700 }}>{r['SO No']}</td>
                          <td className="font-mono" style={{ fontSize: 11, color: '#64748b' }}>{r['Item No']}</td>
                          <td className="font-mono" style={{ fontSize: 11, color: '#64748b' }}>{r['Release']}</td>
                          <td className="id-col" style={{ color: '#b91c1c', fontWeight: 700 }} title="This part doesn't exist in INMASTX">{r['Part Number']}</td>
                          <td className="desc-col" title={r['Description']}>{r['Description']}</td>
                          <td className="num-bold">{fmtNum(r['Backlog Qty'])}</td>
                          <td className="date-col">{fmtDate(r['Due Date'])}</td>
                          <td className="desc-col" title={r['Customer']}>{r['Customer']}</td>
                          <td className="font-mono" style={{ fontSize: 12 }}>{r['Customer PO']}</td>
                          <td className="font-mono" style={{ fontSize: 12, fontWeight: 700 }}>{r['Status']}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <div className="footer">MAC Products Internal System · Data Integrity Audit</div>
      </div>
    </>
  );
};
