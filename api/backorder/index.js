const sql = require('mssql');

// ---------------------------------------------------------------------------
// Connection pool — reused across invocations
// ---------------------------------------------------------------------------
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
    const connString = process.env.M2M_CONNECTION_STRING;
    if (!connString) throw new Error('M2M_CONNECTION_STRING not configured');
    const config = parseConnectionString(connString);
    poolPromise = new sql.ConnectionPool(config).connect();
    poolPromise.catch(() => { poolPromise = null; });
  }
  return poolPromise;
}

// ---------------------------------------------------------------------------
// Backorder SQL — replicates ZPOPH report
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
      RTRIM(FPARTNO) AS FPARTNO,
      SUM(FONHAND)   AS TotalOnHand,
      STRING_AGG(NULLIF(RTRIM(FLOCATION), ''), ', ')   WITHIN GROUP (ORDER BY FLOCATION) AS Locations,
      STRING_AGG(NULLIF(RTRIM(FBINNO), ''),    ', ')   WITHIN GROUP (ORDER BY FBINNO)    AS Bins,
      STRING_AGG(NULLIF(RTRIM(FLOT), ''),      ', ')   WITHIN GROUP (ORDER BY FLOT)      AS Lots,
      MIN(NULLIF(FEXPDATE, '1900-01-01'))              AS EarliestExpiration,
      STRING_AGG(NULLIF(RTRIM(FPARTREV), ''),  ', ')   WITHIN GROUP (ORDER BY FPARTREV)  AS Revisions,
      STRING_AGG(NULLIF(RTRIM(FAC), ''),       ', ')   WITHIN GROUP (ORDER BY FAC)       AS Facilities,
      STRING_AGG(
        RTRIM(FLOCATION) + '/' + RTRIM(FBINNO) + ': ' + CAST(FONHAND AS NVARCHAR(20)),
        ' | '
      ) WITHIN GROUP (ORDER BY FLOCATION, FBINNO) AS OnHandDetail
    FROM INONHD
    WHERE FONHAND <> 0
    GROUP BY RTRIM(FPARTNO)
  ) oh ON RTRIM(pi.FPARTNO) = oh.FPARTNO
WHERE pm.FSTATUS IN ('Open', 'On Hold')
  AND (pi.FORDQTY - pi.FRCPQTY) > 0
ORDER BY RTRIM(pi.FPARTNO), RTRIM(v.FCOMPANY), RTRIM(pi.FPONO)
`;

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

module.exports = async function (context, req) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(BACKORDER_SQL);

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
    context.log.error('Backorder query error:', err.message);
    context.res = {
      status: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
