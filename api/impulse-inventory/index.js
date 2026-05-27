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

// ---------------------------------------------------------------------------
// MAC Impulse Inventory & Days of Supply — combined report
//
// One row per part. Aggregates on-hand from INONHD, calculates future
// requirements from actual open JO + SO demand (not averaged usage).
// ---------------------------------------------------------------------------
const INVENTORY_SQL = `
WITH OnHand AS (
  SELECT
    RTRIM(FPARTNO) AS FPARTNO,
    SUM(FONHAND) AS TotalOnHand,
    STUFF((SELECT DISTINCT ', ' + RTRIM(FLOCATION)
           FROM INONHD i2
           WHERE RTRIM(i2.FPARTNO) = RTRIM(oh.FPARTNO)
             AND i2.FONHAND <> 0 AND RTRIM(i2.FLOCATION) <> ''
           FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 2, '') AS Locations
  FROM INONHD oh
  WHERE FONHAND <> 0
  GROUP BY RTRIM(FPARTNO)
),
-- Future requirements: actual demand from open Job Orders (BOM components)
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
-- Future requirements: open SO releases (direct stock shipments)
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
),
-- Usage history: qty issued in last 90 days
UsageHist AS (
  SELECT
    RTRIM(FPARTNO) AS FPARTNO,
    SUM(FQTY) AS IssQty90
  FROM INTRAN
  WHERE FTYPE = 'I'
    AND FDATE >= DATEADD(day, -90, CAST(GETDATE() AS DATE))
  GROUP BY RTRIM(FPARTNO)
)
SELECT
  RTRIM(im.FPARTNO)                       AS [Part Number],
  RTRIM(im.FREV)                          AS [Rev],
  RTRIM(im.FDESCRIPT)                     AS [Description],
  RTRIM(im.FCSTSCODE)                     AS [Status],
  CASE
    WHEN RTRIM(im.FSOURCE) = 'M' THEN 'MAKE'
    WHEN RTRIM(im.FSOURCE) = 'B' THEN 'BUY'
    WHEN RTRIM(im.FSOURCE) = 'S' AND UPPER(RTRIM(im.FCPURCHASE)) = 'Y' THEN 'STOCK (PURCHASE)'
    WHEN RTRIM(im.FSOURCE) = 'S' AND UPPER(RTRIM(im.FCPURCHASE)) = 'N' THEN 'STOCK (MAKE)'
    WHEN RTRIM(im.FSOURCE) = 'S' THEN 'STOCK'
    WHEN RTRIM(im.FSOURCE) = 'P' THEN 'PHANTOM'
    ELSE RTRIM(im.FSOURCE)
  END                                     AS [Source],
  RTRIM(im.FPRODCL)                       AS [Product Class Code],
  RTRIM(pc.FPC_NAME)                      AS [Product Class],
  RTRIM(im.FBUYER)                        AS [Buyer],
  RTRIM(im.FGROUP)                        AS [Group Code],
  RTRIM(im.FMEASURE)                      AS [UOM],
  COALESCE(oh.TotalOnHand, 0)             AS [On Hand Qty],
  im.FREORDQTY                            AS [Reorder Qty],
  im.FSAFETY                              AS [Safety Stock],
  im.FSTDCOST                             AS [Std Cost Unit],
  (COALESCE(oh.TotalOnHand, 0) * im.FSTDCOST) AS [Std Cost Extended],
  im.FLASTCOST                            AS [Last Actual Cost],
  COALESCE(oh.Locations, '')              AS [Locations],
  COALESCE(uh.IssQty90, 0)               AS [Usage History 90d],
  COALESCE(jd.JOReqQty, 0) + COALESCE(sd.SOReqQty, 0) AS [Future Requirements],
  COALESCE(jd.JOReqQty, 0)               AS [JO Demand],
  COALESCE(sd.SOReqQty, 0)               AS [SO Demand],
  -- Annualized: scale 90-day usage to full year
  CASE WHEN COALESCE(uh.IssQty90, 0) > 0
    THEN CAST(ROUND(uh.IssQty90 * (365.0 / 90.0), 0) AS INT)
    ELSE 0
  END                                     AS [Usage Annual],
  -- Days of Supply: on_hand / daily_usage (using future req + history blend)
  CASE
    WHEN (COALESCE(jd.JOReqQty, 0) + COALESCE(sd.SOReqQty, 0) + COALESCE(uh.IssQty90, 0)) = 0 THEN 9999
    WHEN COALESCE(oh.TotalOnHand, 0) = 0 THEN 0
    ELSE CAST(ROUND(
      COALESCE(oh.TotalOnHand, 0) /
      NULLIF((COALESCE(uh.IssQty90, 0) * (365.0 / 90.0) +
              COALESCE(jd.JOReqQty, 0) + COALESCE(sd.SOReqQty, 0)) / 365.0, 0)
    , 0) AS INT)
  END                                     AS [Days of Supply],
  -- Turns: annual usage / on hand
  CASE
    WHEN COALESCE(oh.TotalOnHand, 0) = 0 THEN 0
    WHEN COALESCE(uh.IssQty90, 0) = 0 THEN 0
    ELSE CAST(ROUND(
      (uh.IssQty90 * (365.0 / 90.0)) / NULLIF(oh.TotalOnHand, 0)
    , 2) AS DECIMAL(10,2))
  END                                     AS [Turns],
  im.FLEADTIME                            AS [Lead Time Days]
FROM INMASTX im
  LEFT JOIN INPROD  pc ON RTRIM(im.FPRODCL) = RTRIM(pc.FPC_NUMBER)
  LEFT JOIN OnHand  oh ON RTRIM(im.FPARTNO) = oh.FPARTNO
  LEFT JOIN JODemand jd ON RTRIM(im.FPARTNO) = jd.FPARTNO
  LEFT JOIN SODemand sd ON RTRIM(im.FPARTNO) = sd.FPARTNO
  LEFT JOIN UsageHist uh ON RTRIM(im.FPARTNO) = uh.FPARTNO
WHERE COALESCE(oh.TotalOnHand, 0) <> 0
   OR COALESCE(jd.JOReqQty, 0) + COALESCE(sd.SOReqQty, 0) > 0
ORDER BY RTRIM(im.FPARTNO)
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
