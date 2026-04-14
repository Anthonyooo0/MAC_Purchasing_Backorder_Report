// @ts-nocheck
// Extracted from public/index.html — vanilla JS report logic
// Called once by BackorderReport.tsx useEffect

export function initBackorderReport() {
  let allData = [];
  let sortCol = 'Part No';
  let sortAsc = true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function fmt(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return '';
    return dt.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  }

  function num(n) {
    if (n == null) return '';
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  function isOverdue(row) {
    if (!row['Last Promise Date']) return false;
    const promise = new Date(row['Last Promise Date']);
    promise.setHours(0, 0, 0, 0);
    return promise < today;
  }

  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function getFilteredData() {
    const search = (document.getElementById('search') as HTMLInputElement).value.toLowerCase();
    const status = (document.getElementById('filter-status') as HTMLSelectElement).value;
    const planner = (document.getElementById('filter-planner') as HTMLSelectElement).value;
    const source = (document.getElementById('filter-source') as HTMLSelectElement).value;
    const overdueOnly = (document.getElementById('filter-overdue') as HTMLSelectElement).value === 'overdue';

    return allData.filter(row => {
      if (status && row['PO Status'] !== status) return false;
      if (planner && row['Planner'] !== planner) return false;
      if (source && row['Source'] !== source) return false;
      if (overdueOnly && !isOverdue(row)) return false;
      if (search) {
        const haystack = [
          row['Part No'], row['Description'], row['Vendor Part No'],
          row['PO No'], row['Vendor Name'], row['Planner'], row['MAC Order No']
        ].join(' ').toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }

  function updateStats() {
    const data = getFilteredData();
    document.getElementById('stat-lines')!.textContent = data.length.toLocaleString();
    document.getElementById('stat-parts')!.textContent = new Set(data.map(r => r['Part No'])).size.toLocaleString();
    document.getElementById('stat-vendors')!.textContent = new Set(data.map(r => r['Vendor No'])).size.toLocaleString();
    document.getElementById('stat-pos')!.textContent = new Set(data.map(r => r['PO No'])).size.toLocaleString();
    document.getElementById('stat-overdue')!.textContent = data.filter(isOverdue).length.toLocaleString();
  }

  function renderTable() {
    const data = getFilteredData();

    data.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (va == null) va = '';
      if (vb == null) vb = '';
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortAsc ? va - vb : vb - va;
      }
      if (sortCol.includes('Date')) {
        const da = new Date(va || 0), db = new Date(vb || 0);
        return sortAsc ? da - db : db - da;
      }
      va = String(va).toLowerCase();
      vb = String(vb).toLowerCase();
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    });

    const tbody = document.getElementById('table-body')!;
    tbody.innerHTML = '';

    if (data.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="16">
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <p>No backorder items match your filters</p>
            <div class="empty-sub">Try adjusting your search or filter criteria</div>
          </div>
        </td></tr>`;
    } else {
      data.forEach(row => {
        const tr = document.createElement('tr');
        const overdue = isOverdue(row);
        if (overdue) tr.className = 'overdue';

        const statusBadge = row['PO Status'] === 'ON HOLD'
          ? '<span class="badge badge-hold">On Hold</span>'
          : '<span class="badge badge-open">Open</span>';

        const promiseClass = overdue ? 'date-col overdue-text' : 'date-col';

        const src = row['Source'];
        const sourceBadge = src
          ? `<span class="badge badge-source badge-source-${String(src).toLowerCase()}">${escHtml(src)}</span>`
          : '';

        tr.innerHTML = `
          <td class="id-col" title="${escHtml(row['Part No'])}">${escHtml(row['Part No'])}</td>
          <td class="desc-col" title="${escHtml(row['Description'])}">${escHtml(row['Description'])}</td>
          <td>${sourceBadge}</td>
          <td class="font-mono" style="font-size:11px" title="${escHtml(row['Vendor Part No'])}">${escHtml(row['Vendor Part No'])}</td>
          <td class="id-col">${escHtml(row['PO No'])}</td>
          <td title="${escHtml(row['Vendor Name'])}">${escHtml(row['Vendor Name'])}</td>
          <td>${statusBadge}</td>
          <td class="font-mono" style="font-size:12px;font-weight:700">${escHtml(row['Planner'])}</td>
          <td class="font-mono" style="font-size:12px">${escHtml(row['Item No'])}</td>
          <td class="date-col">${fmt(row['PO Date'])}</td>
          <td class="${promiseClass}">${fmt(row['Last Promise Date'])}</td>
          <td class="num">${num(row['PO Qty'])}</td>
          <td>${escHtml(row['U/M'])}</td>
          <td class="font-mono" style="font-size:11px">${escHtml(row['MAC Order No'])}</td>
          <td class="num">${num(row['Recv Qty'])}</td>
          <td class="num-bold">${num(row['Backorder Qty'])}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    document.getElementById('row-count')!.textContent =
      `Showing ${data.length.toLocaleString()} of ${allData.length.toLocaleString()} backorder lines`;

    document.querySelectorAll('th').forEach(th => {
      const arrow = th.querySelector('.sort-arrow');
      if (!arrow) return;
      if ((th as HTMLElement).dataset.col === sortCol) {
        arrow.textContent = sortAsc ? ' \u25B2' : ' \u25BC';
      } else {
        arrow.textContent = '';
      }
    });

    updateStats();
  }

  async function loadData() {
    document.getElementById('loading')!.style.display = 'flex';
    document.getElementById('table-scroll')!.style.display = 'none';
    document.getElementById('error')!.style.display = 'none';

    try {
      const API_URL = import.meta.env.VITE_BACKORDER_API_URL || '/api/backorder';
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.json()).error || 'Unknown error'}`);
      const data = await res.json();

      allData = data.rows;
      document.getElementById('report-date')!.textContent =
        fmt(data.generatedAt) + ' ' + new Date(data.generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      const planners = [...new Set(allData.map(r => r['Planner']).filter(Boolean))].sort();
      const plannerSelect = document.getElementById('filter-planner') as HTMLSelectElement;
      plannerSelect.innerHTML = '<option value="">All Planners</option>';
      planners.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p; opt.textContent = p;
        plannerSelect.appendChild(opt);
      });

      updateStats();
      renderTable();

      document.getElementById('loading')!.style.display = 'none';
      document.getElementById('table-scroll')!.style.display = 'block';

      window.dispatchEvent(new CustomEvent('backorder-loaded'));
    } catch (err: any) {
      document.getElementById('loading')!.style.display = 'none';
      document.getElementById('error')!.style.display = 'block';
      document.getElementById('error')!.textContent = 'Error loading data: ' + err.message;
      window.dispatchEvent(new CustomEvent('backorder-loaded', { detail: { error: err.message } }));
    }
  }

  function exportCSV() {
    const data = getFilteredData();
    if (data.length === 0) return;
    const cols = ['Part No','Description','Source','Vendor Part No','PO No','Vendor No','Vendor Name',
                  'PO Status','Planner','Item No','PO Date','Last Promise Date','PO Qty','U/M',
                  'MAC Order No','Recv Qty','Backorder Qty'];
    const escCSV = v => {
      const s = String(v == null ? '' : v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    let csv = cols.join(',') + '\n';
    data.forEach(row => {
      csv += cols.map(c => escCSV(c.includes('Date') ? fmt(row[c]) : row[c])).join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MAC_Backorder_Report_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Wire up event listeners
  document.querySelectorAll('th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      if (sortCol === (th as HTMLElement).dataset.col) {
        sortAsc = !sortAsc;
      } else {
        sortCol = (th as HTMLElement).dataset.col!;
        sortAsc = true;
      }
      renderTable();
    });
  });

  // Click-to-expand modal for long text cells
  function openCellModal(label: string, subtitle: string, content: string) {
    const modal = document.getElementById('cell-modal')!;
    document.getElementById('cell-modal-label')!.textContent = label;
    document.getElementById('cell-modal-sub')!.textContent = subtitle;
    document.getElementById('cell-modal-body')!.textContent = content;
    modal.style.display = 'flex';
  }
  function closeCellModal() {
    document.getElementById('cell-modal')!.style.display = 'none';
  }
  document.getElementById('cell-modal-close')?.addEventListener('click', closeCellModal);
  document.getElementById('cell-modal-x')?.addEventListener('click', closeCellModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCellModal();
  });

  // Delegate clicks on desc-col cells in the table body
  document.getElementById('table-body')!.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const td = target.closest('td.desc-col') as HTMLTableCellElement | null;
    if (!td) return;
    const content = td.getAttribute('title') || td.textContent || '';
    if (!content.trim()) return;
    // Find column header for this cell
    const tr = td.parentElement as HTMLTableRowElement;
    const cellIndex = Array.from(tr.children).indexOf(td);
    const th = document.querySelectorAll('thead th')[cellIndex] as HTMLElement | undefined;
    const label = th?.dataset.col || 'Detail';
    // Subtitle: try to show the Part No + PO No context
    const rowCells = Array.from(tr.children) as HTMLTableCellElement[];
    const partNo = rowCells[0]?.textContent?.trim() || '';
    const poNo = rowCells[4]?.textContent?.trim() || '';
    const subtitle = partNo && poNo ? `${partNo} — PO ${poNo}` : partNo || '';
    openCellModal(label, subtitle, content);
  });

  document.getElementById('search')!.addEventListener('input', renderTable);
  document.getElementById('filter-status')!.addEventListener('change', renderTable);
  document.getElementById('filter-planner')!.addEventListener('change', renderTable);
  document.getElementById('filter-source')!.addEventListener('change', renderTable);
  document.getElementById('filter-overdue')!.addEventListener('change', renderTable);
  document.getElementById('btn-refresh')!.addEventListener('click', loadData);
  document.getElementById('btn-export')!.addEventListener('click', exportCSV);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('search')!.focus();
    }
  });

  // Initial load
  loadData();
}
