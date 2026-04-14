/**
 * test-query.js — Test the backorder SQL query against M2M database
 *
 * Usage: node test-query.js
 *
 * Connects to M2M, runs the backorder query, and prints results to console.
 * This is for validating the SQL before building the full web UI.
 */
require('dotenv').config();
const sql = require('mssql');

// ---------------------------------------------------------------------------
// Parse ADO-style connection string (same pattern as m2m-query)
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
    requestTimeout: 60000, // 60s — backorder report can be large
  };
}

// ---------------------------------------------------------------------------
// Backorder Report SQL — replicates ZPOPH report from M2M
//
// Logic: Find all POITEM lines on OPEN or ON HOLD POs where
//        ordered qty > received qty (i.e., there's a backorder).
//        Join to POMAST for PO header info, APVENDX for vendor name,
//        and INMASTX for part description.
//
// Key columns from the PDF:
//   Part No, Description, Vendor Part No, PO#, Vendor Code, Vendor Name,
//   PO Status, Planner, Item#, PO Date, Last Promise Date, PO Qty, U/M,
//   MAC Order#, Rec'd Qty, Backorder Qty
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
  RTRIM(so.FCUSTNO)       AS [Customer No],
  RTRIM(so.FCOMPANY)      AS [Customer Name],
  RTRIM(so.FCUSTPONO)     AS [Customer PO],
  RTRIM(so.FSHIPVIA)      AS [Ship Via],
  RTRIM(so.FESTIMATOR)    AS [Estimator],
  RTRIM(so.FSTATUS)       AS [SO Status],
  so.FDUEDATE             AS [SO Due Date],
  CAST(so.FACKMEMO AS NVARCHAR(MAX))   AS [SO Ack Memo],
  RTRIM(so.FORDERNAME)    AS [SO Description],
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

async function main() {
  const connString = process.env.M2M_CONNECTION_STRING;
  if (!connString) {
    console.error('ERROR: M2M_CONNECTION_STRING not set. Copy .env.example to .env and fill in your connection string.');
    process.exit(1);
  }

  const config = parseConnectionString(connString);
  console.log(`Connecting to server="${config.server}" database="${config.database}" user="${config.user}"...`);

  let pool;
  try {
    pool = new sql.ConnectionPool(config);
    await pool.connect();
    console.log('Connected successfully.\n');

    console.log('Running backorder query...');
    const start = Date.now();
    const result = await pool.request().query(BACKORDER_SQL);
    const elapsed = Date.now() - start;

    console.log(`\nQuery returned ${result.recordset.length} rows in ${elapsed}ms\n`);

    if (result.recordset.length === 0) {
      console.log('No backorder items found. The query may need adjustment.');
      console.log('\nTrying to check what PO statuses exist...');
      const statusCheck = await pool.request().query(`
        SELECT DISTINCT RTRIM(FSTATUS) AS Status, COUNT(*) AS Cnt
        FROM POMAST
        GROUP BY RTRIM(FSTATUS)
        ORDER BY Cnt DESC
      `);
      console.log('PO Statuses in POMAST:');
      statusCheck.recordset.forEach(r => console.log(`  ${r.Status}: ${r.Cnt}`));
      return;
    }

    // Print first 20 rows as a sample
    console.log('--- First 20 rows ---');
    const sample = result.recordset.slice(0, 20);
    sample.forEach((row, i) => {
      console.log(`\n[${i + 1}] Part: ${row['Part No']} | PO: ${row['PO No']} | Vendor: ${row['Vendor Name']}`);
      console.log(`    Desc: ${row['Description']}`);
      console.log(`    Status: ${row['PO Status']} | Planner: ${row['Planner']} | Item#: ${row['Item No']}`);
      console.log(`    PO Date: ${row['PO Date']} | Promise: ${row['Last Promise Date']}`);
      console.log(`    Qty: ${row['PO Qty']} ${row['U/M']} | Recv: ${row['Recv Qty']} | Backorder: ${row['Backorder Qty']}`);
      console.log(`    MAC Order: ${row['MAC Order No']} | Vendor Part: ${row['Vendor Part No']}`);
    });

    // Summary stats
    const uniqueParts = new Set(result.recordset.map(r => r['Part No'])).size;
    const uniqueVendors = new Set(result.recordset.map(r => r['Vendor No'])).size;
    const uniquePOs = new Set(result.recordset.map(r => r['PO No'])).size;
    const totalBackorder = result.recordset.reduce((sum, r) => sum + (r['Backorder Qty'] || 0), 0);

    console.log('\n--- Summary ---');
    console.log(`Total backorder lines: ${result.recordset.length}`);
    console.log(`Unique parts: ${uniqueParts}`);
    console.log(`Unique vendors: ${uniqueVendors}`);
    console.log(`Unique POs: ${uniquePOs}`);
    console.log(`Total backorder qty: ${totalBackorder.toLocaleString()}`);

  } catch (err) {
    console.error('ERROR:', err.message);
    if (err.message.includes('Invalid object name')) {
      console.log('\nThe table name may be different in your M2M database.');
      console.log('Trying to find PO-related tables...');
      try {
        const tables = await pool.request().query(`
          SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_NAME LIKE '%PO%' OR TABLE_NAME LIKE '%VEND%' OR TABLE_NAME LIKE '%INMAST%'
          ORDER BY TABLE_NAME
        `);
        console.log('Found tables:');
        tables.recordset.forEach(r => console.log(`  ${r.TABLE_NAME}`));
      } catch (e2) {
        console.error('Could not query INFORMATION_SCHEMA:', e2.message);
      }
    }
  } finally {
    if (pool) await pool.close();
    console.log('\nConnection closed.');
  }
}

main();
