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
    requestTimeout: 30000,
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

// Fires every 10 minutes (per function.json schedule "0 */10 * * * *") and
// runs SELECT 1 against the on-prem SQL server.  Keeps the Azure Relay
// hybrid connection tunnel awake so user-facing requests don't pay the
// 15-60s cold-start cost.
module.exports = async function (context, myTimer) {
  const startedAt = Date.now();
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok');
    context.log(`keep-warm OK in ${Date.now() - startedAt}ms`);
  } catch (err) {
    context.log.warn(`keep-warm failed in ${Date.now() - startedAt}ms:`, err.message);
    poolPromise = null;
  }
};
