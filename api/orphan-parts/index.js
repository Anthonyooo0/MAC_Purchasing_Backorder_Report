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
    poolPromise = new sql.ConnectionPool(parseConnectionString(connString)).connect();
    poolPromise.catch(() => { poolPromise = null; });
  }
  return poolPromise;
}

// ---------------------------------------------------------------------------
// MAC Orphan Parts Audit
// Finds open Sales Order releases that reference a part number which doesn't
// exist in INMASTX (item master).  Catches data-integrity holes — SOs
// created against typo'd or non-existent parts that won't roll into MRP /
// inventory cleanly.
//
// Currently scoped to MAC Impulse only (existing m2m_impulse_reader user
// lacks rights to M2MDATA99).  Once IT grants cross-DB access we'll add a
// MAC Products UNION branch here.
// ---------------------------------------------------------------------------
const ORPHAN_SQL = `
SELECT
    'MAC Impulse'                                   AS Company,
    'SORELS'                                        AS Source,
    RTRIM(sr.FSONO)                                 AS [SO No],
    RTRIM(sr.FENUMBER)                              AS [Item No],
    RTRIM(sr.FRELEASE)                              AS [Release],
    RTRIM(sr.FPARTNO)                               AS [Part Number],
    LEFT(CAST(si.FDESC AS NVARCHAR(MAX)), 250)      AS [Description],
    sr.FORDERQTY - COALESCE(sr.FNINVSHIP, 0)
                 - COALESCE(sr.FINVQTY, 0)          AS [Backlog Qty],
    sr.FORDERQTY                                    AS [Ordered Qty],
    sr.FDUEDATE                                     AS [Due Date],
    sm.FORDERDATE                                   AS [Date Entered],
    RTRIM(sm.FCOMPANY)                              AS [Customer],
    RTRIM(sm.FCUSTPONO)                             AS [Customer PO],
    COALESCE(NULLIF(RTRIM(sr.FCRELSSTATUS), ''),
             RTRIM(sm.FSTATUS))                     AS [Status]
FROM SORELS sr WITH (NOLOCK)
    INNER JOIN SOMAST sm WITH (NOLOCK)
        ON RTRIM(sr.FSONO) = RTRIM(sm.FSONO)
    LEFT  JOIN SOITEM si WITH (NOLOCK)
        ON RTRIM(sr.FSONO)    = RTRIM(si.FSONO)
       AND RTRIM(sr.FINUMBER) = RTRIM(si.FINUMBER)
WHERE sr.FORDERQTY > COALESCE(sr.FNINVSHIP, 0) + COALESCE(sr.FINVQTY, 0)
  AND RTRIM(sm.FSTATUS) NOT IN ('Closed', 'Cancelled')
  AND (RTRIM(sr.FCRELSSTATUS) IS NULL OR RTRIM(sr.FCRELSSTATUS) NOT IN ('Closed', 'Cancelled'))
  AND NOT EXISTS (
      SELECT 1 FROM INMASTX im WITH (NOLOCK)
      WHERE RTRIM(im.FPARTNO) = RTRIM(sr.FPARTNO)
  )
ORDER BY [Due Date], [SO No], [Item No];
`;

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

// 10-minute in-memory cache like the inventory endpoint
const CACHE_TTL_MS = 10 * 60 * 1000;
let cachedBody = null;
let cachedAt = 0;

module.exports = async function (context, req) {
  if (cachedBody && (Date.now() - cachedAt) < CACHE_TTL_MS) {
    const ageSec = Math.round((Date.now() - cachedAt) / 1000);
    context.res = {
      status: 200,
      headers: { ...CORS, 'X-Cache': 'HIT', 'X-Cache-Age-Seconds': String(ageSec) },
      body: cachedBody,
    };
    return;
  }

  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const pool = await getPool();
      const result = await pool.request().query(ORPHAN_SQL);
      const body = JSON.stringify({
        generatedAt: new Date().toISOString(),
        rowCount: result.recordset.length,
        rows: result.recordset,
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
        context.log.warn(`Orphan parts attempt ${attempt} cold-start, retrying:`, msg);
        poolPromise = null;
        await new Promise(r => setTimeout(r, 2000));
      } else {
        context.log.error('Orphan parts query error:', msg);
        break;
      }
    }
  }

  if (cachedBody) {
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
