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
