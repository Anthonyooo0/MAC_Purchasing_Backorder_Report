/**
 * server.js — Local dev server for MAC Purchasing Backorder Report
 *
 * Usage: node server.js
 * Then open http://localhost:3000
 */
require('dotenv').config();
const express = require('express');
const sql = require('mssql');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Parse ADO-style connection string
// ---------------------------------------------------------------------------
function parseConnectionString(connString) {
  const parts = {};
  for (const segment of connString.split(';')) {
    const idx = segment.indexOf('=');
    if (idx === -1) continue;
    const key = segment.substring(0, idx).trim().toLowerCase();
    const val = segment.substring(idx + 1).trim();
    parts[key] = val;
  }
  return {
    server: parts['server'] || parts['data source'] || '',
    database: parts['database'] || parts['initial catalog'] || '',
    user: parts['user id'] || parts['uid'] || '',
    password: parts['password'] || parts['pwd'] || '',
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 60000,
  };
}

// ---------------------------------------------------------------------------
// Connection pool (reused across requests)
// ---------------------------------------------------------------------------
let poolPromise = null;

function getPool() {
  if (!poolPromise) {
    const connString = process.env.M2M_CONNECTION_STRING;
    if (!connString) throw new Error('M2M_CONNECTION_STRING not set');
    const config = parseConnectionString(connString);
    poolPromise = new sql.ConnectionPool(config).connect();
    poolPromise.then(() => console.log(`Connected to ${config.server}/${config.database}`));
    poolPromise.catch(err => { poolPromise = null; console.error('DB connection failed:', err.message); });
  }
  return poolPromise;
}

// ---------------------------------------------------------------------------
// Backorder SQL
// ---------------------------------------------------------------------------
const BACKORDER_SQL = `
SELECT
  RTRIM(pi.FPARTNO)       AS [Part No],
  RTRIM(im.FDESCRIPT)     AS [Description],
  CAST(pi.FDESCRIPT AS NVARCHAR(MAX))  AS [PO Line Description],
  RTRIM(pi.FVPARTNO)      AS [Vendor Part No],
  RTRIM(pi.FPONO)         AS [PO No],
  RTRIM(pm.FVENDNO)       AS [Vendor No],
  RTRIM(v.FCOMPANY)       AS [Vendor Name],
  CASE RTRIM(pm.FSTATUS)
    WHEN 'Open'    THEN 'OPEN'
    WHEN 'On Hold' THEN 'ON HOLD'
    WHEN 'Closed'  THEN 'CLOSED'
    ELSE RTRIM(pm.FSTATUS)
  END                     AS [PO Status],
  RTRIM(pm.FBUYER)        AS [Planner],
  pi.FITEMNO              AS [Item No],
  pm.FORDDATE             AS [PO Date],
  pi.FLSTPDATE            AS [Last Promise Date],
  pi.FORGPDATE            AS [Original Promise Date],
  pi.FREQDATE             AS [Requested Date],
  pi.FORDQTY              AS [PO Qty],
  RTRIM(pi.FMEASURE)      AS [U/M],
  RTRIM(pi.FJOKEY)        AS [MAC Order No],
  RTRIM(pi.FSOKEY)        AS [SO No],
  RTRIM(pi.FSOITM)        AS [SO Item No],
  pi.FRCPQTY              AS [Recv Qty],
  (pi.FORDQTY - pi.FRCPQTY) AS [Backorder Qty],
  pi.FBKORDQTY            AS [M2M Backorder Qty],
  CAST(pi.FCOMMENTS AS NVARCHAR(MAX))  AS [PO Line Comments],
  -- SO Header (SOMAST)
  RTRIM(so.FCUSTNO)       AS [Customer No],
  RTRIM(so.FCOMPANY)      AS [Customer Name],
  RTRIM(so.FCUSTPONO)     AS [Customer PO],
  RTRIM(so.FSHIPVIA)      AS [Ship Via],
  RTRIM(so.FESTIMATOR)    AS [Estimator],
  RTRIM(so.FSTATUS)       AS [SO Status],
  so.FDUEDATE             AS [SO Due Date],
  CAST(so.FACKMEMO AS NVARCHAR(MAX))   AS [SO Ack Memo],
  RTRIM(so.FORDERNAME)    AS [SO Description],
  -- SO Line (SOITEM)
  CAST(si.FDESCMEMO AS NVARCHAR(MAX))  AS [SO Line Notes],
  RTRIM(si.FCUSTPART)     AS [Customer Part No],
  RTRIM(si.FCITEMSTATUS)  AS [SO Line Status],
  si.FQUANTITY            AS [SO Qty]
FROM POITEM pi
  INNER JOIN POMAST pm ON pi.FPONO = pm.FPONO
  LEFT JOIN APVENDX v  ON pm.FVENDNO = v.FVENDNO
  LEFT JOIN INMASTX im ON RTRIM(pi.FPARTNO) = RTRIM(im.FPARTNO)
  LEFT JOIN SOMAST  so ON RTRIM(pi.FSOKEY) = RTRIM(so.FSONO)
  LEFT JOIN SOITEM  si ON RTRIM(pi.FSOKEY) = RTRIM(si.FSONO)
                      AND RTRIM(pi.FSOITM) = RTRIM(si.FENUMBER)
WHERE pm.FSTATUS IN ('Open', 'On Hold')
  AND (pi.FORDQTY - pi.FRCPQTY) > 0
ORDER BY RTRIM(pi.FPARTNO), RTRIM(v.FCOMPANY), RTRIM(pi.FPONO)
`;

// ---------------------------------------------------------------------------
// API endpoint
// ---------------------------------------------------------------------------
app.get('/api/backorder', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(BACKORDER_SQL);
    res.json({
      generatedAt: new Date().toISOString(),
      rowCount: result.recordset.length,
      rows: result.recordset,
    });
  } catch (err) {
    console.error('Query error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Serve the HTML UI
// ---------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`\nMAC Backorder Report server running at http://localhost:${PORT}\n`);
});
