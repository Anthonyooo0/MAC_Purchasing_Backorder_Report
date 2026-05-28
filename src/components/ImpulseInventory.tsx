import React, { useEffect, useMemo, useState } from 'react';
import './backorder-report.css';

interface Props { userEmail: string; }

interface InvRow {
  'Part Number': string; 'Rev': string; 'Description': string;
  'Source': string; 'Purchase': string; 'Location': string;
  'UOM': string; 'Issued': string; 'Received': string;
  'Unexpired': number; 'Total': number;
  'STD Unit': number; 'STD Extended': number; 'Future': number;
}

interface DemandLine {
  DEMAND: string;
  QTYREQD: number;
  DATE: string | null;
  STATUS: string | null;
  FPONO: string | null;
}

const API_URL = (import.meta as any).env.VITE_IMPULSE_INVENTORY_API_URL
  || 'https://mac-backorder-hdavg3a7g9gpejdx.eastus-01.azurewebsites.net/api/impulse-inventory';

export const ImpulseInventory: React.FC<Props> = ({ userEmail: _userEmail }) => {
  const [allRows, setAllRows] = useState<InvRow[]>([]);
  const [demandLinesByPart, setDemandLinesByPart] = useState<Record<string, DemandLine[]>>({});
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterPurchase, setFilterPurchase] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [sortCol, setSortCol] = useState<string>('Part Number');
  const [sortAsc, setSortAsc] = useState(true);

  async function loadData() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(API_URL);
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(`HTTP ${res.status}: ${err.error || 'Unknown error'}`); }
      const data = await res.json();
      setAllRows(data.rows || []);
      setDemandLinesByPart(data.demandLinesByPart || {});
      setGeneratedAt(data.generatedAt);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, []);

  const sources = useMemo(() => [...new Set(allRows.map(r => r['Source']).filter(Boolean))].sort(), [allRows]);
  const locations = useMemo(() => [...new Set(allRows.map(r => r['Location']).filter(Boolean))].sort(), [allRows]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return allRows.filter(r => {
      if (filterSource && r['Source'] !== filterSource) return false;
      if (filterPurchase && r['Purchase'] !== filterPurchase) return false;
      if (filterLocation && r['Location'] !== filterLocation) return false;
      if (s) {
        const hay = [r['Part Number'], r['Description'], r['Location']].join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [allRows, search, filterSource, filterPurchase, filterLocation]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      let va: any = (a as any)[sortCol], vb: any = (b as any)[sortCol];
      if (va == null) va = ''; if (vb == null) vb = '';
      if (typeof va === 'number' && typeof vb === 'number') return sortAsc ? va - vb : vb - va;
      if (sortCol === 'Issued' || sortCol === 'Received') {
        const da = new Date(va || 0).getTime(), db = new Date(vb || 0).getTime();
        return sortAsc ? da - db : db - da;
      }
      return sortAsc ? String(va).toLowerCase().localeCompare(String(vb).toLowerCase()) : String(vb).toLowerCase().localeCompare(String(va).toLowerCase());
    });
    return out;
  }, [filtered, sortCol, sortAsc]);

  const totalValue = useMemo(() => filtered.reduce((s, r) => s + (r['STD Extended'] || 0), 0), [filtered]);
  const totalOnHand = useMemo(() => filtered.reduce((s, r) => s + (r['Total'] || 0), 0), [filtered]);
  // Future is part-level (same value across every location row for a part),
  // so sum it once per unique part number to avoid multi-location inflation.
  const totalFuture = useMemo(() => {
    const seen = new Set<string>();
    let sum = 0;
    for (const r of filtered) {
      const p = r['Part Number'];
      if (!seen.has(p)) { seen.add(p); sum += r['Future'] || 0; }
    }
    return sum;
  }, [filtered]);
  const uniqueParts = useMemo(() => new Set(filtered.map(r => r['Part Number'])).size, [filtered]);

  function toggleSort(col: string) { if (sortCol === col) setSortAsc(!sortAsc); else { setSortCol(col); setSortAsc(true); } }
  function fmtCurrency(n: number | null | undefined) { if (n == null) return ''; return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }); }
  function fmtNum(n: number | null | undefined) { if (n == null) return ''; return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function fmtDate(d: string | null | undefined) { if (!d) return ''; const dt = new Date(d); if (isNaN(dt.getTime())) return ''; return dt.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }); }

  function exportCSV() {
    if (sorted.length === 0) return;
    const cols: (keyof InvRow)[] = ['Part Number','Rev','Description','Source','Purchase','Location','UOM','Issued','Received','Unexpired','Total','STD Unit','STD Extended','Future'];
    const esc = (v: any) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s; };
    let csv = cols.join(',') + '\n';
    for (const row of sorted) csv += cols.map(c => esc(c === 'Issued' || c === 'Received' ? fmtDate(row[c] as string) : row[c])).join(',') + '\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `MAC_Impulse_Inventory_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  if (loading) return (
    <div className="app-loading-screen">
      <div className="app-loading-logo"><img src="/mac_logo.png" alt="MAC Logo" /></div>
      <div className="app-loading-text">Loading Inventory Report</div>
      <div className="app-loading-sub">Querying on-hand and future requirements...</div>
    </div>
  );

  return (
    <>
      <header className="header">
        <div className="header-left">
          <div className="header-logo"><img src="/mac_impulse_logo.png" onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/mac_logo.png'; }} alt="MAC Impulse" /></div>
          <div>
            <div className="header-title">Inventory Report</div>
            <div className="header-sub">On-hand with future requirements</div>
          </div>
        </div>
        <div className="header-right">
          <div>
            <span className="report-id">IMPINV</span>
            <span className="header-version">V1.0.0</span>
          </div>
          <div className="report-meta">
            {generatedAt ? `${fmtDate(generatedAt)} ${new Date(generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : '—'}
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
            <div className="card-value">{totalFuture.toLocaleString()}</div>
          </div>
          <div className="card card-green">
            <div className="card-label">Unique Parts</div>
            <div className="card-value">{uniqueParts.toLocaleString()}</div>
          </div>
        </div>

        <div className="controls">
          <input type="text" className="search-box" placeholder="Search part, description, location..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="filter" value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
            <option value="">All Sources</option>
            {sources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="filter" value={filterPurchase} onChange={(e) => setFilterPurchase(e.target.value)}>
            <option value="">All Purchase</option>
            <option value="Y">Y</option>
            <option value="N">N</option>
          </select>
          <select className="filter" value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)}>
            <option value="">All Locations</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
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

        <div className="row-count">Showing {sorted.length.toLocaleString()} of {allRows.length.toLocaleString()} lines</div>

        {error && <div className="error-box" style={{ margin: '12px 24px' }}>Error loading data: {error}</div>}

        {!error && (
          <div className="table-wrap">
            <div className="table-container">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {['Part Number','Rev','Description','Source','Purchase','Location','UOM','Issued','Received','Unexpired','Total','STD Unit','STD Extended','Future'].map(col => (
                        <th key={col} onClick={() => toggleSort(col)}>
                          {col}<span className="sort-arrow">{sortCol === col ? (sortAsc ? ' ▲' : ' ▼') : ''}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.length === 0 ? (
                      <tr><td colSpan={14}><div className="empty-state"><p>No inventory items match your filters</p></div></td></tr>
                    ) : (
                      sorted.map((r, i) => (
                        <tr key={i}>
                          <td
                            className="id-col"
                            style={{ color: '#2c5aa0', cursor: 'pointer', textDecoration: 'underline' }}
                            title="Click for demand breakdown"
                            onClick={() => setSelectedPart(r['Part Number'])}
                          >{r['Part Number']}</td>
                          <td className="font-mono" style={{ fontSize: 12 }}>{r['Rev']}</td>
                          <td className="desc-col" title={r['Description']}>{r['Description']}</td>
                          <td className="font-mono" style={{ fontSize: 12, fontWeight: 700 }}>{r['Source']}</td>
                          <td className="font-mono" style={{ fontSize: 12, fontWeight: 700 }}>{r['Purchase']}</td>
                          <td className="font-mono" style={{ fontSize: 12 }}>{r['Location']}</td>
                          <td>{r['UOM']}</td>
                          <td className="date-col">{fmtDate(r['Issued'])}</td>
                          <td className="date-col">{fmtDate(r['Received'])}</td>
                          <td className="num">{fmtNum(r['Unexpired'])}</td>
                          <td className="num-bold">{fmtNum(r['Total'])}</td>
                          <td className="num">{fmtCurrency(r['STD Unit'])}</td>
                          <td className="num">{fmtCurrency(r['STD Extended'])}</td>
                          <td className="num-bold" style={{ color: r['Future'] > 0 ? '#c2410c' : undefined }}>{fmtNum(r['Future'])}</td>
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

      {selectedPart && (() => {
        const lines = demandLinesByPart[selectedPart] || [];
        const partRow = allRows.find(r => r['Part Number'] === selectedPart);
        const desc = partRow?.Description || '';
        const totalDemand = lines.reduce((s, l) => s + (l.QTYREQD || 0), 0);
        return (
          <div
            onClick={() => setSelectedPart(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(2px)', zIndex: 50,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#fff', borderRadius: 12, width: '100%', maxWidth: 960,
                maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
                boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
              }}
            >
              <div style={{
                background: '#1a365d', color: '#fff', padding: '16px 24px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Space Mono, monospace' }}>{selectedPart}</div>
                  <div style={{ color: '#b3d4ff', fontSize: 13, marginTop: 2 }}>{desc}</div>
                  <div style={{ color: '#b3d4ff', fontSize: 11, marginTop: 6, fontWeight: 700, letterSpacing: 0.5 }}>
                    DEMAND BREAKDOWN · {lines.length} {lines.length === 1 ? 'LINE' : 'LINES'} · TOTAL QTY {fmtNum(totalDemand)}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPart(null)}
                  style={{
                    background: 'transparent', color: '#fff', border: 'none',
                    fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: '0 4px',
                  }}
                  title="Close"
                >×</button>
              </div>

              <div style={{ overflow: 'auto', flex: 1 }}>
                {lines.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    No open demand lines for this part.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ textAlign: 'left',  padding: '10px 16px', fontWeight: 700, color: '#475569' }}>Demand</th>
                        <th style={{ textAlign: 'right', padding: '10px 16px', fontWeight: 700, color: '#475569' }}>Qty Reqd</th>
                        <th style={{ textAlign: 'left',  padding: '10px 16px', fontWeight: 700, color: '#475569' }}>Date</th>
                        <th style={{ textAlign: 'left',  padding: '10px 16px', fontWeight: 700, color: '#475569' }}>Status</th>
                        <th style={{ textAlign: 'left',  padding: '10px 16px', fontWeight: 700, color: '#475569' }}>PO #</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 16px', fontFamily: 'Space Mono, monospace', fontSize: 12, fontWeight: 700 }}>{l.DEMAND}</td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'Space Mono, monospace', fontWeight: 700 }}>{fmtNum(l.QTYREQD)}</td>
                          <td style={{ padding: '10px 16px', color: '#475569' }}>{fmtDate(l.DATE || '')}</td>
                          <td style={{ padding: '10px 16px' }}>
                            {l.STATUS && (
                              <span style={{
                                padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                                background: l.STATUS === 'RELEASED' ? '#dbeafe' : l.STATUS === 'OPEN' ? '#fef3c7' : '#f1f5f9',
                                color:      l.STATUS === 'RELEASED' ? '#1e40af' : l.STATUS === 'OPEN' ? '#92400e' : '#475569',
                              }}>{l.STATUS}</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 16px', fontFamily: 'Space Mono, monospace', color: '#0f766e', fontWeight: 700 }}>{l.FPONO || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{
                padding: '12px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
                display: 'flex', justifyContent: 'flex-end',
              }}>
                <button
                  onClick={() => setSelectedPart(null)}
                  style={{
                    padding: '8px 16px', background: '#1a365d', color: '#fff', border: 'none',
                    borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}
                >Close</button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
};
