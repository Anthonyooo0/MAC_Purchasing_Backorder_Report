const sql = require('mssql');

let poolPromise = null;

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

function getPool() {
  if (!poolPromise) {
    const connString = process.env.M2M_IMPULSE_CONNECTION_STRING;
    if (!connString) throw new Error('M2M_IMPULSE_CONNECTION_STRING not configured');
    const config = parseConnectionString(connString);
    poolPromise = new sql.ConnectionPool(config).connect();
    poolPromise.catch(() => { poolPromise = null; });
  }
  return poolPromise;
}

// ---------------------------------------------------------------------------
// MAC Impulse Backlog SQL — replicates the existing Power BI backlog view
// One row per open SO release. Includes linked JO/PO ref so users see the
// downstream supply for each backlog line.
// ---------------------------------------------------------------------------
const BACKLOG_SQL = `
SELECT
  RTRIM(sr.FSONO)                         AS [SO No],
  sm.FORDERDATE                           AS [Date Entered],
  sr.FDUEDATE                             AS [Due],
  RTRIM(sm.FCOMPANY)                      AS [Customer],
  RTRIM(sm.FCUSTNO)                       AS [Customer No],
  RTRIM(sr.FPARTNO)                       AS [Part Number],
  RTRIM(sr.FPARTREV)                      AS [Rev],
  CAST(si.FDESC AS NVARCHAR(MAX))         AS [Description],
  sr.FORDERQTY                            AS [Qty],
  sr.FSTKQTY                              AS [Stock],
  COALESCE(im.FSTDCOST, 0)                AS [Unit Cost],
  sr.FUNETPRICE                           AS [Unit Price],
  ((sr.FORDERQTY - COALESCE(sr.FNINVSHIP, 0) - COALESCE(sr.FINVQTY, 0)) * COALESCE(sr.FUNETPRICE, 0)) AS [Backlog Value],
  -- Linked downstream supply: prefer JO if it exists, else PO
  COALESCE(NULLIF(RTRIM(jm.FJOBNO), ''), NULLIF(RTRIM(pi.FPONO), '')) AS [JO / PO],
  CASE
    WHEN NULLIF(RTRIM(jm.FJOBNO), '') IS NOT NULL THEN 'J'
    WHEN NULLIF(RTRIM(pi.FPONO), '')  IS NOT NULL THEN 'P'
    ELSE ''
  END                                     AS [Supply Type],
  -- Single-letter status: O=Open, R=Released, C=Closed, S=Started, H=Hold
  CASE
    WHEN sr.FAVAILSHIP = 1 THEN 'A'
    WHEN UPPER(LEFT(RTRIM(sr.FCRELSSTATUS), 1)) IN ('O','R','C','S','H') THEN UPPER(LEFT(RTRIM(sr.FCRELSSTATUS), 1))
    WHEN UPPER(LEFT(RTRIM(sm.FSTATUS), 1)) IN ('O','R','C','S','H') THEN UPPER(LEFT(RTRIM(sm.FSTATUS), 1))
    ELSE 'O'
  END                                     AS [S],
  CAST(sr.FDELIVERY AS NVARCHAR(MAX))     AS [Last SO/LINE/REL Comment],
  COALESCE(sr.FPRIORITY, sm.FPRIORITY, 0) AS [CR],
  RTRIM(sr.FCRELSSTATUS)                  AS [Release Status],
  RTRIM(sm.FSTATUS)                       AS [SO Status],
  CASE
    WHEN sr.FDUEDATE IS NULL THEN 'NO DUE DATE'
    WHEN sr.FDUEDATE < CAST(GETDATE() AS DATE) THEN 'LATE'
    WHEN sr.FDUEDATE < DATEADD(day, 30, CAST(GETDATE() AS DATE)) THEN 'DUE SOON'
    ELSE 'ON TIME'
  END                                     AS [Schedule Status],
  RTRIM(sm.FESTIMATOR)                    AS [Estimator],
  RTRIM(sm.FCUSTPONO)                     AS [Customer PO],
  RTRIM(sm.FSHIPVIA)                      AS [Ship Via],
  sr.FORDERQTY - COALESCE(sr.FNINVSHIP, 0) - COALESCE(sr.FINVQTY, 0) AS [Backlog Qty],
  RTRIM(sr.FENUMBER)                      AS [Item No],
  RTRIM(sr.FRELEASE)                      AS [Release]
FROM SORELS sr
  INNER JOIN SOMAST sm ON RTRIM(sr.FSONO) = RTRIM(sm.FSONO)
  LEFT JOIN SOITEM  si ON RTRIM(sr.FSONO) = RTRIM(si.FSONO)
                      AND RTRIM(sr.FINUMBER) = RTRIM(si.FINUMBER)
  LEFT JOIN INMASTX im ON RTRIM(sr.FPARTNO) = RTRIM(im.FPARTNO)
  -- Linked Job Order (most recent for this SO release)
  OUTER APPLY (
    SELECT TOP 1 j.FJOBNO
    FROM JOMAST j
    WHERE RTRIM(j.FSONO) = RTRIM(sr.FSONO)
      AND RTRIM(j.FKEY)  = RTRIM(sr.FINUMBER) + RTRIM(sr.FRELEASE)
      AND RTRIM(j.FSTATUS) NOT IN ('Closed', 'Cancelled')
    ORDER BY j.FOPEN_DT DESC
  ) jm
  -- Linked Purchase Order (most recent open PO line for this SO release)
  OUTER APPLY (
    SELECT TOP 1 p.FPONO
    FROM POITEM p
    WHERE RTRIM(p.FSOKEY) = RTRIM(sr.FSONO)
      AND RTRIM(p.FSOITM) = RTRIM(sr.FINUMBER)
      AND RTRIM(p.FSORLS) = RTRIM(sr.FRELEASE)
    ORDER BY p.FREQDATE DESC
  ) pi
WHERE sr.FORDERQTY > COALESCE(sr.FNINVSHIP, 0) + COALESCE(sr.FINVQTY, 0)
  AND RTRIM(sm.FSTATUS) NOT IN ('Closed', 'Cancelled')
  AND (RTRIM(sr.FCRELSSTATUS) IS NULL OR RTRIM(sr.FCRELSSTATUS) NOT IN ('Closed', 'Cancelled'))
ORDER BY sr.FDUEDATE ASC, sm.FCOMPANY, sr.FSONO
`;

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

module.exports = async function (context, req) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(BACKLOG_SQL);

    context.res = {
      status: 200,
      headers: CORS,
      body: JSON.stringify({
        generatedAt: new Date().toISOString(),
        rowCount: result.recordset.length,
        rows: result.recordset,
      }),
    };
  } catch (err) {
    context.log.error('Impulse backlog query error:', err.message);
    context.res = {
      status: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
