const sql = require('mssql');

// Pool reused across invocations (same pattern as backorder)
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
// MAC Impulse Shipments SQL
// Pulls header + line + tracking for the past N years (default 3) of shipments.
// ---------------------------------------------------------------------------
const SHIPMENTS_SQL = `
SELECT
  RTRIM(sm.FSHIPNO)                  AS [Ship No],
  RTRIM(sm.FCSONO)                   AS [SO No],
  RTRIM(sm.FCNUMBER)                 AS [Customer No],
  RTRIM(sm.FCCOMPANY)                AS [Company],
  sm.FSHIPDATE                       AS [Ship Date],
  RTRIM(sm.FSHIPVIA)                 AS [Ship Via],
  RTRIM(sm.FENTER)                   AS [Initials],
  RTRIM(sm.FFOB)                     AS [FOB],
  RTRIM(sm.FBL_LADING)               AS [Bill of Lading],
  RTRIM(si.FPARTNO)                  AS [Part No],
  CAST(si.FMDESCRIPT AS NVARCHAR(MAX)) AS [Description],
  RTRIM(si.FMEASURE)                 AS [U/M],
  si.FSHIPQTY                        AS [Ship Qty],
  si.FORDERQTY                       AS [Order Qty],
  RTRIM(si.FCUSTPART)                AS [Customer Part No],
  CAST(smt.fmtrckno AS NVARCHAR(MAX)) AS [Tracking No],
  smt.ffrtamt                        AS [Freight Amount],
  smt.fno_boxes                      AS [No Boxes],
  smt.fshipwght                      AS [Ship Weight],
  sr.FUNETPRICE                      AS [Unit Price],
  (si.FSHIPQTY * COALESCE(sr.FUNETPRICE, 0)) AS [Total Price],
  YEAR(sm.FSHIPDATE)                 AS [Ship Year],
  DATEPART(QUARTER, sm.FSHIPDATE)    AS [Ship Quarter],
  MONTH(sm.FSHIPDATE)                AS [Ship Month]
FROM SHMAST sm
  INNER JOIN SHITEM si ON RTRIM(sm.FSHIPNO) = RTRIM(si.FSHIPNO)
  LEFT JOIN SHMASTTRACKER smt ON RTRIM(sm.FSHIPNO) = RTRIM(smt.fshipno)
  LEFT JOIN SORELS sr ON RTRIM(si.FSONO)    = RTRIM(sr.FSONO)
                     AND RTRIM(si.FINUMBER) = RTRIM(sr.FINUMBER)
                     AND RTRIM(si.FRELEASE) = RTRIM(sr.FRELEASE)
WHERE sm.FTYPE = 'SO'
  AND sm.FSHIPDATE >= DATEADD(year, -3, GETDATE())
  AND si.FSHIPQTY > 0
ORDER BY sm.FSHIPDATE DESC, sm.FSHIPNO DESC, si.FITEMNO
`;

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

module.exports = async function (context, req) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(SHIPMENTS_SQL);

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
    context.log.error('Impulse shipments query error:', err.message);
    context.res = {
      status: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
