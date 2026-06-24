const sql = require('mssql');

let impulsePoolPromise = null;
let productsPoolPromise = null;

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

function getImpulsePool() {
  if (!impulsePoolPromise) {
    const connString = process.env.M2M_IMPULSE_CONNECTION_STRING;
    if (!connString) throw new Error('M2M_IMPULSE_CONNECTION_STRING not configured');
    impulsePoolPromise = new sql.ConnectionPool(parseConnectionString(connString)).connect();
    impulsePoolPromise.catch(() => { impulsePoolPromise = null; });
  }
  return impulsePoolPromise;
}

function getProductsPool() {
  if (!productsPoolPromise) {
    const connString = process.env.M2M_CONNECTION_STRING;
    if (!connString) throw new Error('M2M_CONNECTION_STRING not configured');
    productsPoolPromise = new sql.ConnectionPool(parseConnectionString(connString)).connect();
    productsPoolPromise.catch(() => { productsPoolPromise = null; });
  }
  return productsPoolPromise;
}

// ---------------------------------------------------------------------------
// MAC Daily Sales Detail Report (Phase 1 — per Alan's email 2026-06)
//
// One row per OPEN SO release across both M2M databases.  Replaces / extends
// the basic "daily sales report" with item master, vendor, location, and
// make/buy enrichment.  Frontend filters by Date Entered to surface the
// "today's new orders" view or the "everything on order" view.
//
// Phase 2 (TODO) will add Item Master / BOM / Routing audit info using
// INVSTH (Inv Master Status History) + routing tables.
// ---------------------------------------------------------------------------
const DAILY_SALES_SQL = `
-- Restrict to parts on open SO releases so the rest of the CTEs don't have
-- to scan the whole item/inventory/vendor universe.
WITH OpenSOParts AS (
    SELECT DISTINCT RTRIM(sr.FPARTNO) AS FPARTNO
    FROM SORELS sr WITH (NOLOCK)
    INNER JOIN SOMAST sm WITH (NOLOCK) ON RTRIM(sr.FSONO) = RTRIM(sm.FSONO)
    WHERE sr.FORDERQTY > COALESCE(sr.FNINVSHIP, 0) + COALESCE(sr.FINVQTY, 0)
      AND RTRIM(sm.FSTATUS) NOT IN ('Closed', 'Cancelled')
      AND (RTRIM(sr.FCRELSSTATUS) IS NULL OR RTRIM(sr.FCRELSSTATUS) NOT IN ('Closed', 'Cancelled'))
),
TopLocs AS (
    SELECT FPARTNO,
           MAX(CASE WHEN rn = 1 THEN FLOCATION END) AS Loc1,
           MAX(CASE WHEN rn = 2 THEN FLOCATION END) AS Loc2
    FROM (
        SELECT RTRIM(oh.FPARTNO) AS FPARTNO,
               RTRIM(oh.FLOCATION) AS FLOCATION,
               ROW_NUMBER() OVER (
                   PARTITION BY RTRIM(oh.FPARTNO)
                   ORDER BY SUM(oh.FONHAND) DESC
               ) AS rn
        FROM INONHD oh WITH (NOLOCK)
        INNER JOIN OpenSOParts p ON p.FPARTNO = RTRIM(oh.FPARTNO)
        WHERE oh.FONHAND <> 0
        GROUP BY RTRIM(oh.FPARTNO), RTRIM(oh.FLOCATION)
    ) r
    WHERE rn <= 2
    GROUP BY FPARTNO
),
PrimaryVendor AS (
    -- Pre-aggregate the primary (lowest-priority-value) vendor per part.
    -- Faster than running OUTER APPLY for each SO line.
    SELECT FPARTNO, FVENDNO, FVPARTNO, FVPTDES, FVMEASURE, FVCONVFACT
    FROM (
        SELECT RTRIM(iv.FPARTNO) AS FPARTNO,
               RTRIM(iv.FVENDNO) AS FVENDNO,
               RTRIM(iv.FVPARTNO) AS FVPARTNO,
               RTRIM(iv.FVPTDES)  AS FVPTDES,
               RTRIM(iv.FVMEASURE) AS FVMEASURE,
               iv.FVCONVFACT,
               ROW_NUMBER() OVER (PARTITION BY RTRIM(iv.FPARTNO) ORDER BY iv.FPRIORITY ASC) AS rn
        FROM INVEND iv WITH (NOLOCK)
        INNER JOIN OpenSOParts p ON p.FPARTNO = RTRIM(iv.FPARTNO)
    ) ranked
    WHERE rn = 1
)
SELECT
    RTRIM(sr.FSONO)                                                AS [SO No],
    RTRIM(sm.FCUSTPONO)                                            AS [Customer PO],
    RTRIM(sr.FENUMBER)                                             AS [Item],
    sr.FORDERQTY                                                   AS [Qty Ordered],
    COALESCE(sr.FNINVSHIP, 0) + COALESCE(sr.FINVQTY, 0)            AS [Qty Shipped],
    sr.FORDERQTY - COALESCE(sr.FNINVSHIP, 0)
                 - COALESCE(sr.FINVQTY, 0)                         AS [Backordered],
    RTRIM(im.FMEASURE)                                             AS [Item UOM],
    RTRIM(sm.FCOMPANY)                                             AS [Customer],
    RTRIM(sr.FPARTNO)                                              AS [Part Number],
    -- Prefer the SO-line description (custom-typed), fall back to item master.
    COALESCE(NULLIF(LEFT(CAST(si.FDESC AS NVARCHAR(MAX)), 500), ''),
             NULLIF(RTRIM(CAST(im.FMUSRMEMO1 AS NVARCHAR(MAX))), ''),
             RTRIM(im.FDESCRIPT))                                   AS [Description],
    LEFT(CAST(sr.FDELIVERY AS NVARCHAR(MAX)), 500)                  AS [Comment],
    RTRIM(tl.Loc1)                                                 AS [Inventory Location 1],
    RTRIM(tl.Loc2)                                                 AS [Inventory Location 2],
    CASE WHEN RTRIM(im.FSOURCE) = 'M' THEN 'YES' ELSE '' END        AS [Make],
    CASE WHEN UPPER(RTRIM(im.FCPURCHASE)) = 'Y' THEN 'YES' ELSE '' END AS [Purchase],
    -- Vendor info (primary / highest-priority vendor for this part)
    RTRIM(av.FCOMPANY)                                             AS [Vendor],
    RTRIM(vend.FVPARTNO)                                           AS [Vendor PN],
    RTRIM(vend.FVPTDES)                                            AS [Vendor Description],
    RTRIM(vend.FVMEASURE)                                          AS [Vendor UOM],
    RTRIM(im.FMEASURE)                                             AS [Inventory UOM],
    vend.FVCONVFACT                                                AS [Unit Quantity],
    RTRIM(im.FCSTSCODE)                                            AS [IM Status],
    sm.FORDERDATE                                                  AS [Date Entered],
    sr.FDUEDATE                                                    AS [Due Date],
    COALESCE(NULLIF(RTRIM(sr.FCRELSSTATUS), ''),
             RTRIM(sm.FSTATUS))                                    AS [Status]
FROM SORELS sr WITH (NOLOCK)
    INNER JOIN SOMAST sm WITH (NOLOCK)
        ON RTRIM(sr.FSONO) = RTRIM(sm.FSONO)
    LEFT  JOIN SOITEM si WITH (NOLOCK)
        ON RTRIM(sr.FSONO)    = RTRIM(si.FSONO)
       AND RTRIM(sr.FINUMBER) = RTRIM(si.FINUMBER)
    LEFT  JOIN INMASTX im WITH (NOLOCK)
        ON RTRIM(im.FPARTNO) = RTRIM(sr.FPARTNO)
    LEFT  JOIN TopLocs tl
        ON tl.FPARTNO = RTRIM(sr.FPARTNO)
    LEFT  JOIN PrimaryVendor vend
        ON vend.FPARTNO = RTRIM(sr.FPARTNO)
    LEFT  JOIN APVEND av WITH (NOLOCK)
        ON RTRIM(av.FVENDNO) = vend.FVENDNO
WHERE sr.FORDERQTY > COALESCE(sr.FNINVSHIP, 0) + COALESCE(sr.FINVQTY, 0)
  AND RTRIM(sm.FSTATUS) NOT IN ('Closed', 'Cancelled')
  AND (RTRIM(sr.FCRELSSTATUS) IS NULL OR RTRIM(sr.FCRELSSTATUS) NOT IN ('Closed', 'Cancelled'))
ORDER BY sm.FORDERDATE DESC, sr.FSONO, sr.FENUMBER;
`;

async function queryDailySales(pool, companyLabel) {
  const result = await pool.request().query(DAILY_SALES_SQL);
  return result.recordset.map(row => ({ Company: companyLabel, ...row }));
}

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

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
      const [impulsePool, productsPool] = await Promise.all([
        getImpulsePool(),
        getProductsPool(),
      ]);
      const [impulseRows, productsRows] = await Promise.all([
        queryDailySales(impulsePool,  'MAC Impulse'),
        queryDailySales(productsPool, 'MAC Products'),
      ]);
      const rows = [...impulseRows, ...productsRows].sort((a, b) => {
        const ad = new Date(a['Date Entered'] || 0).getTime();
        const bd = new Date(b['Date Entered'] || 0).getTime();
        if (ad !== bd) return bd - ad; // most recent first
        if (a.Company !== b.Company) return a.Company.localeCompare(b.Company);
        return (a['SO No'] || '').localeCompare(b['SO No'] || '');
      });
      const body = JSON.stringify({
        generatedAt: new Date().toISOString(),
        rowCount: rows.length,
        rows,
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
        context.log.warn(`Daily sales attempt ${attempt} cold-start, retrying:`, msg);
        impulsePoolPromise = null;
        productsPoolPromise = null;
        await new Promise(r => setTimeout(r, 2000));
      } else {
        context.log.error('Daily sales query error:', msg);
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
