import React, { useEffect, useMemo, useState } from 'react';
import './backorder-report.css';
import './impulse-shipments.css';

interface Props { userEmail: string; }

interface InvRow {
  'Part Number': string; 'Rev': string; 'Description': string;
  'Status': string; 'Source': string;
  'Product Class Code': string; 'Product Class': string;
  'Buyer': string; 'Group Code': string; 'UOM': string;
  'On Hand Qty': number; 'Reorder Qty': number; 'Safety Stock': number;
  'Std Cost Unit': number; 'Std Cost Extended': number; 'Last Actual Cost': number;
  'Locations': string;
  'Usage History 90d': number; 'Future Requirements': number;
  'JO Demand': number; 'SO Demand': number;
  'Usage Annual': number; 'Days of Supply': number; 'Turns': number;
  'Lead Time Days': number;
}

const API_URL = (import.meta as any).env.VITE_IMPULSE_INVENTORY_API_URL
  || 'https://mac-backorder-hdavg3a7g9gpejdx.eastus-01.azurewebsites.net/api/impulse-inventory';

export const ImpulseInventory: React.FC<Props> = ({ userEmail: _userEmail }) => {
  const [allRows, setAllRows] = useState<InvRow[]>([]);
  const [generatedAt, setGeneratedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterPC, setFilterPC] = useState('');
  const [filterBuyer, setFilterBuyer] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortCol, setSortCol] = useState<string>('Part Number');
  const [sortAsc, setSortAsc] = useState(true);

  async function loadData() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(API_URL);
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(`HTTP ${res.status}: ${err.error || 'Unknown error'}`); }
      const data = await res.json();
      setAllRows(data.rows || []); setGeneratedAt(data.generatedAt);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, []);

  const sources = useMemo(() => [...new Set(allRows.map(r => r['Source']).filter(Boolean))].sort(), [allRows]);
  const pcs = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of allRows) { const c = r['Product Class Code']; if (c && !m[c]) m[c] = r['Product Class'] || c; }
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [allRows]);
  const buyers = useMemo(() => [...new Set(allRows.map(r => r['Buyer']).filter(Boolean))].sort(), [allRows]);
  const statuses = useMemo(() => [...new Set(allRows.map(r => r['Status']).filter(Boolean))].sort(), [allRows]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return allRows.filter(r => {
      if (filterSource && r['Source'] !== filterSource) return false;
      if (filterPC && r['Product Class Code'] !== filterPC) return false;
      if (filterBuyer && r['Buyer'] !== filterBuyer) return false;
      if (filterStatus && r['Status'] !== filterStatus) return false;
      if (s) {
        const hay = [r['Part Number'], r['Description'], r['Buyer'], r['Product Class'], r['Locations'], r['Group Code']].join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [allRows, search, filterSource, filterPC, filterBuyer, filterStatus]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      let va: any = (a as any)[sortCol], vb: any = (b as any)[sortCol];
      if (va == null) va = ''; if (vb == null) vb = '';
      if (typeof va === 'number' && typeof vb === 'number') return sortAsc ? va - vb : vb - va;
      const sa = String(va).toLowerCase(), sb = String(vb).toLowerCase();
      return sortAsc ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return out;
  }, [filtered, sortCol, sortAsc]);

  const totalValue = useMemo(() => filtered.reduce((s, r) => s + (r['Std Cost Extended'] || 0), 0), [filtered]);
  const totalOnHand = useMemo(() => filtered.reduce((s, r) => s + (r['On Hand Qty'] || 0), 0), [filtered]);
  const totalFutureReq = useMemo(() => filtered.reduce((s, r) => s + (r['Future Requirements'] || 0), 0), [filtered]);
  const belowSafety = useMemo(() => filtered.filter(r => r['On Hand Qty'] < r['Safety Stock'] && r['Safety Stock'] > 0).length, [filtered]);

  function toggleSort(col: string) { if (sortCol === col) setSortAsc(!sortAsc); else { setSortCol(col); setSortAsc(true); } }
  function fmtCurrency(n: number | null | undefined) { if (n == null) return ''; return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }); }
  function fmtNum(n: number | null | undefined) { if (n == null) return ''; return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }); }

  function exportCSV() {
    if (sorted.length === 0) return;
    const cols: (keyof InvRow)[] = ['Part Number','Rev','Description','Status','Source','Product Class Code','Product Class','Buyer','Group Code','UOM','On Hand Qty','Reorder Qty','Safety Stock','Std Cost Unit','Std Cost Extended','Last Actual Cost','Locations','Usage History 90d','Future Requirements','JO Demand','SO Demand','Usage Annual','Days of Supply','Turns','Lead Time Days'];
    const esc = (v: any) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s; };
    let csv = cols.join(',') + '\n';
    for (const row of sorted) csv += cols.map(c => esc(row[c])).join(',') + '\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `MAC_Impulse_Inventory_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  if (loading) return (
    <div className="app-loading-screen">
      <div className="app-loading-logo"><img src="/mac_logo.png" alt="MAC Logo" /></div>
      <div className="app-loading-text">Loading Inventory Report</div>
      <div className="app-loading-sub">Querying on-hand, demand, and usage...</div>
    </div>
  );

  return (
    <>
      <header className="header">
        <div className="header-left">
          <div className="header-logo"><img src="/mac_impulse_logo.png" onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/mac_logo.png'; }} alt="MAC Impulse" /></div>
          <div>
            <div className="header-title">Inventory & Days of Supply</div>
            <div className="header-sub">On-hand, future requirements, and supply metrics</div>
          </div>
        </div>
        <div className="header-right">
          <div>
            <span className="report-id">IMPINV</span>
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
            <div className="card-label">Total Inventory Value</div>
            <div className="card-value">{fmtCurrency(totalValue)}</div>
          </div>
          <div className="card">
            <div className="card-label">Total On Hand</div>
            <div className="card-value">{totalOnHand.toLocaleString()}</div>
          </div>
          <div className="card card-orange">
            <div className="card-label">Future Requirements</div>
            <div className="card-value">{totalFutureReq.toLocaleString()}</div>
          </div>
          <div className="card card-red">
            <div className="card-label">Below Safety Stock</div>
            <div className="card-value">{belowSafety.toLocaleString()}</div>
          </div>
          <div className="card card-green">
            <div className="card-label">Unique Parts</div>
            <div className="card-value">{filtered.length.toLocaleString()}</div>
          </div>
        </div>

        <div className="controls">
          <input type="text" className="search-box" placeholder="Search part, description, buyer, location..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="filter" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="filter" value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
            <option value="">All Sources</option>
            {sources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="filter" value={filterPC} onChange={(e) => setFilterPC(e.target.value)}>
            <option value="">All Product Classes</option>
            {pcs.map(([c, n]) => <option key={c} value={c}>{n && n !== c ? `${c} — ${n}` : c}</option>)}
          </select>
          <select className="filter" value={filterBuyer} onChange={(e) => setFilterBuyer(e.target.value)}>
            <option value="">All Buyers</option>
            {buyers.map(b => <option key={b} value={b}>{b}</option>)}
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

        <div className="row-count">Showing {sorted.length.toLocaleString()} of {allRows.length.toLocaleString()} parts</div>

        {error && <div className="error-box" style={{ margin: '12px 24px' }}>Error loading data: {error}</div>}

        {!error && (
          <div className="table-wrap">
            <div className="table-container">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {['Part Number','Description','Status','Source','Product Class','Buyer','UOM',
                        'On Hand Qty','Reorder Qty','Safety Stock','Std Cost Unit','Std Cost Ext',
                        'Last Cost','Locations','Usage 90d','Future Req','JO Demand','SO Demand',
                        'Annual','DOS','Turns','Lead Time'].map(col => {
                        const dataCol = col === 'Std Cost Ext' ? 'Std Cost Extended'
                          : col === 'Last Cost' ? 'Last Actual Cost'
                          : col === 'Usage 90d' ? 'Usage History 90d'
                          : col === 'Future Req' ? 'Future Requirements'
                          : col === 'Annual' ? 'Usage Annual'
                          : col === 'DOS' ? 'Days of Supply'
                          : col === 'Lead Time' ? 'Lead Time Days'
                          : col;
                        return (
                          <th key={col} onClick={() => toggleSort(dataCol)}>
                            {col}
                            <span className="sort-arrow">{sortCol === dataCol ? (sortAsc ? ' ▲' : ' ▼') : ''}</span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.length === 0 ? (
                      <tr><td colSpan={22}><div className="empty-state"><p>No inventory items match your filters</p></div></td></tr>
                    ) : (
                      sorted.map((r, i) => {
                        const belowSS = r['Safety Stock'] > 0 && r['On Hand Qty'] < r['Safety Stock'];
                        const srcSlug = String(r['Source'] || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                        return (
                          <tr key={i} className={belowSS ? 'overdue' : ''}>
                            <td className="id-col">{r['Part Number']}</td>
                            <td className="desc-col" title={r['Description']}>{r['Description']}</td>
                            <td>{r['Status']}</td>
                            <td>{r['Source'] && <span className={`badge badge-source badge-source-${srcSlug}`}>{r['Source']}</span>}</td>
                            <td title={r['Product Class']}>{r['Product Class Code']}{r['Product Class'] ? ` · ${r['Product Class']}` : ''}</td>
                            <td className="font-mono" style={{ fontSize: 12, fontWeight: 700 }}>{r['Buyer']}</td>
                            <td>{r['UOM']}</td>
                            <td className="num-bold">{fmtNum(r['On Hand Qty'])}</td>
                            <td className="num">{fmtNum(r['Reorder Qty'])}</td>
                            <td className="num">{fmtNum(r['Safety Stock'])}</td>
                            <td className="num">{fmtCurrency(r['Std Cost Unit'])}</td>
                            <td className="num">{fmtCurrency(r['Std Cost Extended'])}</td>
                            <td className="num">{fmtCurrency(r['Last Actual Cost'])}</td>
                            <td className="desc-col" title={r['Locations']}>{r['Locations']}</td>
                            <td className="num">{fmtNum(r['Usage History 90d'])}</td>
                            <td className="num-bold" style={{ color: r['Future Requirements'] > 0 ? '#c2410c' : undefined }}>{fmtNum(r['Future Requirements'])}</td>
                            <td className="num">{fmtNum(r['JO Demand'])}</td>
                            <td className="num">{fmtNum(r['SO Demand'])}</td>
                            <td className="num">{fmtNum(r['Usage Annual'])}</td>
                            <td className="num">{r['Days of Supply'] === 9999 ? '∞' : fmtNum(r['Days of Supply'])}</td>
                            <td className="num">{fmtNum(r['Turns'])}</td>
                            <td className="num">{fmtNum(r['Lead Time Days'])}</td>
                          </tr>
                        );
                      })
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
