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
  CASE
    WHEN RTRIM(im.FSOURCE) = 'M' THEN 'MAKE'
    WHEN RTRIM(im.FSOURCE) = 'B' THEN 'BUY'
    WHEN RTRIM(im.FSOURCE) = 'S' AND UPPER(RTRIM(im.FCPURCHASE)) = 'Y' THEN 'STOCK (PURCHASE)'
    WHEN RTRIM(im.FSOURCE) = 'S' AND UPPER(RTRIM(im.FCPURCHASE)) = 'N' THEN 'STOCK (MAKE)'
    WHEN RTRIM(im.FSOURCE) = 'S' THEN 'STOCK'
    WHEN RTRIM(im.FSOURCE) = 'P' THEN 'PHANTOM'
    ELSE RTRIM(im.FSOURCE)
  END                     AS [Source],
  RTRIM(im.FPRODCL)       AS [Product Class Code],
  RTRIM(pc.FPC_NAME)      AS [Product Class],
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
  pi.FORDQTY              AS [PO Qty],
  RTRIM(pi.FMEASURE)      AS [U/M],
  RTRIM(pi.FJOKEY)        AS [MAC Order No],
  pi.FRCPQTY              AS [Recv Qty],
  (pi.FORDQTY - pi.FRCPQTY) AS [Backorder Qty],
  oh.TotalOnHand          AS [On Hand Qty],
  oh.Locations            AS [On Hand Locations],
  oh.Bins                 AS [On Hand Bins],
  oh.Lots                 AS [On Hand Lots],
  oh.EarliestExpiration   AS [Earliest Lot Expiration],
  oh.Revisions            AS [On Hand Revisions],
  oh.Facilities           AS [On Hand Facilities],
  oh.OnHandDetail         AS [On Hand Detail]
FROM POITEM pi
  INNER JOIN POMAST pm ON pi.FPONO = pm.FPONO
  LEFT JOIN APVENDX v ON pm.FVENDNO = v.FVENDNO
  LEFT JOIN INMASTX im ON RTRIM(pi.FPARTNO) = RTRIM(im.FPARTNO)
  LEFT JOIN INPROD pc ON RTRIM(im.FPRODCL) = RTRIM(pc.FPC_NUMBER)
  LEFT JOIN (
    SELECT
      p.FPARTNO,
      (SELECT SUM(FONHAND) FROM INONHD WHERE RTRIM(FPARTNO) = p.FPARTNO AND FONHAND <> 0) AS TotalOnHand,
      (SELECT MIN(NULLIF(FEXPDATE, '1900-01-01')) FROM INONHD WHERE RTRIM(FPARTNO) = p.FPARTNO AND FONHAND <> 0) AS EarliestExpiration,
      STUFF((SELECT DISTINCT ', ' + RTRIM(FLOCATION) FROM INONHD WHERE RTRIM(FPARTNO) = p.FPARTNO AND FONHAND <> 0 AND RTRIM(FLOCATION) <> '' FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 2, '') AS Locations,
      STUFF((SELECT DISTINCT ', ' + RTRIM(FBINNO)    FROM INONHD WHERE RTRIM(FPARTNO) = p.FPARTNO AND FONHAND <> 0 AND RTRIM(FBINNO)    <> '' FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 2, '') AS Bins,
      STUFF((SELECT DISTINCT ', ' + RTRIM(FLOT)      FROM INONHD WHERE RTRIM(FPARTNO) = p.FPARTNO AND FONHAND <> 0 AND RTRIM(FLOT)      <> '' FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 2, '') AS Lots,
      STUFF((SELECT DISTINCT ', ' + RTRIM(FPARTREV)  FROM INONHD WHERE RTRIM(FPARTNO) = p.FPARTNO AND FONHAND <> 0 AND RTRIM(FPARTREV)  <> '' FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 2, '') AS Revisions,
      STUFF((SELECT DISTINCT ', ' + RTRIM(FAC)       FROM INONHD WHERE RTRIM(FPARTNO) = p.FPARTNO AND FONHAND <> 0 AND RTRIM(FAC)       <> '' FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 2, '') AS Facilities,
      STUFF((SELECT ' | ' + RTRIM(FLOCATION) + '/' + RTRIM(FBINNO) + ': ' + CAST(FONHAND AS NVARCHAR(20))
             FROM INONHD WHERE RTRIM(FPARTNO) = p.FPARTNO AND FONHAND <> 0
             ORDER BY FLOCATION, FBINNO
             FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 3, '') AS OnHandDetail
    FROM (SELECT DISTINCT RTRIM(FPARTNO) AS FPARTNO FROM INONHD WHERE FONHAND <> 0) p
  ) oh ON RTRIM(pi.FPARTNO) = oh.FPARTNO
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
