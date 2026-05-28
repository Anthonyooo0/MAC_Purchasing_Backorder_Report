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
    connectionTimeout: 60000,
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
ORDER BY RTRIM(im.FPARTNO), oh.Location;

-- ===== Second result set: per-demand-line detail used by the part popup =====
-- Mirrors M2M's RPMAVL view.  Unions open JO BOM lines + open SO releases +
-- safety-stock requirements.  Grouped client-side by FPARTNO.
SELECT FPARTNO, Demand, QtyReqd, NeedDate, Status, PONO
FROM (
    -- Job Order BOM demand lines
    SELECT
        RTRIM(jb.FBOMPART)                              AS FPARTNO,
        'JO Bom ' + RTRIM(jb.FJOBNO)                    AS Demand,
        (jb.FTOTQTY - COALESCE(jb.FQTY_ISS, 0))         AS QtyReqd,
        jb.FNEED_DT                                     AS NeedDate,
        RTRIM(jm.FSTATUS)                               AS Status,
        RTRIM(jb.FPONO)                                 AS PONO
    FROM JODBOM jb
        INNER JOIN JOMAST jm ON RTRIM(jb.FJOBNO) = RTRIM(jm.FJOBNO)
    WHERE RTRIM(jm.FSTATUS) NOT IN ('Closed', 'Cancelled', 'Complete')
      AND (jb.FTOTQTY - COALESCE(jb.FQTY_ISS, 0)) > 0

    UNION ALL

    -- Sales Order release demand lines
    SELECT
        RTRIM(sr.FPARTNO),
        'SO ' + RTRIM(sr.FSONO),
        (sr.FORDERQTY - COALESCE(sr.FNINVSHIP, 0) - COALESCE(sr.FINVQTY, 0)),
        sr.FDUEDATE,
        COALESCE(NULLIF(RTRIM(sr.FCRELSSTATUS), ''), RTRIM(sm.FSTATUS)),
        RTRIM(sr.FPOSTATUS)
    FROM SORELS sr
        INNER JOIN SOMAST sm ON RTRIM(sr.FSONO) = RTRIM(sm.FSONO)
    WHERE RTRIM(sm.FSTATUS) NOT IN ('Closed', 'Cancelled')
      AND (RTRIM(sr.FCRELSSTATUS) IS NULL OR RTRIM(sr.FCRELSSTATUS) NOT IN ('Closed', 'Cancelled'))
      AND (sr.FORDERQTY - COALESCE(sr.FNINVSHIP, 0) - COALESCE(sr.FINVQTY, 0)) > 0

    UNION ALL

    -- Safety-stock demand: one synthetic line per part with FSAFETY > 0
    SELECT
        RTRIM(im2.FPARTNO),
        'Safety Stock',
        im2.FSAFETY,
        NULL,
        NULL,
        NULL
    FROM INMASTX im2
    WHERE im2.FSAFETY > 0
) demand
ORDER BY FPARTNO;
`;

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

// In-memory response cache.  Survives between requests on the same worker;
// lost when the worker restarts.  10-minute TTL keeps inventory close to
// real-time while making most requests instant and shielding users from
// transient SQL failures.
const CACHE_TTL_MS = 10 * 60 * 1000;
let cachedBody = null;
let cachedAt = 0;

module.exports = async function (context, req) {
  // Serve from cache if fresh.
  if (cachedBody && (Date.now() - cachedAt) < CACHE_TTL_MS) {
    const ageSec = Math.round((Date.now() - cachedAt) / 1000);
    context.res = {
      status: 200,
      headers: { ...CORS, 'X-Cache': 'HIT', 'X-Cache-Age-Seconds': String(ageSec) },
      body: cachedBody,
    };
    return;
  }

  // Retry once on connection-style failures so the first user after the
  // hybrid connection goes idle doesn't get a hard error during cold-start.
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const pool = await getPool();
      const result = await pool.request().query(INVENTORY_SQL);
      const inventoryRows = result.recordsets[0] || [];
      const demandRows    = result.recordsets[1] || [];
      // Group demand lines by part number for the popup.
      const demandLinesByPart = {};
      for (const d of demandRows) {
        const p = (d.FPARTNO || '').trim();
        if (!p) continue;
        if (!demandLinesByPart[p]) demandLinesByPart[p] = [];
        demandLinesByPart[p].push({
          DEMAND:  d.Demand,
          QTYREQD: d.QtyReqd,
          DATE:    d.NeedDate,
          STATUS:  d.Status,
          FPONO:   d.PONO,
        });
      }
      const body = JSON.stringify({
        generatedAt: new Date().toISOString(),
        rowCount: inventoryRows.length,
        rows: inventoryRows,
        demandLinesByPart,
      });
      cachedBody = body;
      cachedAt = Date.now();
      context.res = {
        status: 200,
        headers: { ...CORS, 'X-Cache': 'MISS' },
        body,
      };
      return;
    } catch (err) {
      lastErr = err;
      const msg = err.message || '';
      const isConnErr = /failed to connect|timeout|ESOCKET|ETIMEOUT|ECONNCLOSED|ConnectionError/i.test(msg);
      if (attempt < 2 && isConnErr) {
        context.log.warn(`Impulse inventory attempt ${attempt} hit cold-start, retrying:`, msg);
        poolPromise = null;
        await new Promise(r => setTimeout(r, 2000));
      } else {
        context.log.error('Impulse inventory query error:', msg);
        break;
      }
    }
  }

  // SQL failed and cache is empty/stale — last-resort: serve stale cache if
  // we have any, so the user gets data instead of a 500.
  if (cachedBody) {
    context.log.warn('Serving stale cache as fallback after SQL failure');
    context.res = {
      status: 200,
      headers: { ...CORS, 'X-Cache': 'STALE' },
      body: cachedBody,
    };
    return;
  }

  context.res = {
    status: 500,
    headers: CORS,
    body: JSON.stringify({ error: lastErr.message }),
  };
};
