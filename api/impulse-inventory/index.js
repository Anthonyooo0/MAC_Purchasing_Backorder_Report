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
    connectionTimeout: 30000,
    requestTimeout: 120000,
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

const INVENTORY_SQL = `
WITH OnHand AS (
  SELECT
    RTRIM(FPARTNO) AS FPARTNO,
    RTRIM(FLOCATION) AS Location,
    SUM(FONHAND) AS TotalOnHand,
    SUM(CASE WHEN FEXPDATE IS NULL OR FEXPDATE = '1900-01-01' OR FEXPDATE >= CAST(GETDATE() AS DATE) THEN FONHAND ELSE 0 END) AS UnexpiredQty
  FROM INONHD
  WHERE FONHAND <> 0
  GROUP BY RTRIM(FPARTNO), RTRIM(FLOCATION)
),
LastDates AS (
  SELECT
    RTRIM(FPARTNO) AS FPARTNO,
    MAX(CASE WHEN FTYPE = 'I' THEN FDATE END) AS LastIssued,
    MAX(CASE WHEN FTYPE = 'R' THEN FDATE END) AS LastReceived
  FROM INTRAN
  GROUP BY RTRIM(FPARTNO)
),
JODemand AS (
  SELECT
    RTRIM(jb.FBOMPART) AS FPARTNO,
    SUM(jb.FTOTQTY - COALESCE(jb.FQTY_ISS, 0)) AS JOReqQty
  FROM JODBOM jb
    INNER JOIN JOMAST jm ON RTRIM(jb.FJOBNO) = RTRIM(jm.FJOBNO)
  WHERE RTRIM(jm.FSTATUS) NOT IN ('Closed', 'Cancelled', 'Complete')
    AND (jb.FTOTQTY - COALESCE(jb.FQTY_ISS, 0)) > 0
  GROUP BY RTRIM(jb.FBOMPART)
),
SODemand AS (
  SELECT
    RTRIM(sr.FPARTNO) AS FPARTNO,
    SUM(sr.FORDERQTY - COALESCE(sr.FNINVSHIP, 0) - COALESCE(sr.FINVQTY, 0)) AS SOReqQty
  FROM SORELS sr
    INNER JOIN SOMAST sm ON RTRIM(sr.FSONO) = RTRIM(sm.FSONO)
  WHERE RTRIM(sm.FSTATUS) NOT IN ('Closed', 'Cancelled')
    AND (RTRIM(sr.FCRELSSTATUS) IS NULL OR RTRIM(sr.FCRELSSTATUS) NOT IN ('Closed', 'Cancelled'))
    AND (sr.FORDERQTY - COALESCE(sr.FNINVSHIP, 0) - COALESCE(sr.FINVQTY, 0)) > 0
  GROUP BY RTRIM(sr.FPARTNO)
)
SELECT
  RTRIM(im.FPARTNO)                       AS [Part Number],
  RTRIM(im.FREV)                          AS [Rev],
  COALESCE(NULLIF(RTRIM(CAST(im.FMUSRMEMO1 AS NVARCHAR(MAX))), ''), RTRIM(im.FDESCRIPT)) AS [Description],
  RTRIM(im.FSOURCE)                       AS [Source],
  UPPER(RTRIM(im.FCPURCHASE))             AS [Purchase],
  COALESCE(oh.Location, '')               AS [Location],
  RTRIM(im.FMEASURE)                      AS [UOM],
  ld.LastIssued                            AS [Issued],
  ld.LastReceived                          AS [Received],
  COALESCE(oh.UnexpiredQty, 0)            AS [Unexpired],
  COALESCE(oh.TotalOnHand, 0)             AS [Total],
  im.FSTDCOST                             AS [STD Unit],
  (COALESCE(oh.TotalOnHand, 0) * im.FSTDCOST) AS [STD Extended],
  COALESCE(jd.JOReqQty, 0) + COALESCE(sd.SOReqQty, 0) AS [Future]
FROM INMASTX im
  LEFT JOIN OnHand oh ON RTRIM(im.FPARTNO) = oh.FPARTNO
  LEFT JOIN LastDates ld ON RTRIM(im.FPARTNO) = ld.FPARTNO
  LEFT JOIN JODemand jd ON RTRIM(im.FPARTNO) = jd.FPARTNO
  LEFT JOIN SODemand sd ON RTRIM(im.FPARTNO) = sd.FPARTNO
WHERE COALESCE(oh.TotalOnHand, 0) <> 0
   OR COALESCE(jd.JOReqQty, 0) + COALESCE(sd.SOReqQty, 0) > 0
ORDER BY RTRIM(im.FPARTNO), oh.Location
`;

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

module.exports = async function (context, req) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(INVENTORY_SQL);

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
    context.log.error('Impulse inventory query error:', err.message);
    context.res = {
      status: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
