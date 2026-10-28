/**
 * TITAN INVENTORY — One-Command Database Restore for Production
 * 
 * Usage:
 *   DATABASE_URL="postgres://user:pass@host:5432/dbname" node tools/restore_to_postgres.cjs
 * 
 * Or simply set DATABASE_URL in .env or environment variables.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ Error: DATABASE_URL is not set.');
    console.error('Please specify DATABASE_URL, for example:');
    console.error('  DATABASE_URL="postgres://user:password@localhost:5432/titan_inventory" node tools/restore_to_postgres.cjs\n');
    process.exit(1);
  }

  const sqlFile = path.resolve(__dirname, '../TITAN_DATABASE_FULL_DUMP.sql');
  if (!fs.existsSync(sqlFile)) {
    console.error('❌ Error: Dump file not found at:', sqlFile);
    process.exit(1);
  }

  console.log(`Connecting to PostgreSQL at: ${dbUrl.replace(/:([^:@]+)@/, ':****@')}...`);
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('sslmode=require') || dbUrl.includes('neon.tech') ? { rejectUnauthorized: false } : undefined
  });

  try {
    const client = await pool.connect();
    console.log('✔ Connected to PostgreSQL database successfully.');

    console.log(`Reading SQL dump (${(fs.statSync(sqlFile).size / 1024).toFixed(1)} KB)...`);
    const sql = fs.readFileSync(sqlFile, 'utf8');

    console.log('Executing database restoration script (this may take 5-10 seconds)...');
    await client.query(sql);

    console.log('\n======================================================');
    console.log('✅ DATABASE RESTORATION COMPLETED SUCCESSFULLY!');
    console.log('All tables, items, categories, documents, and balances');
    console.log('have been successfully imported into the PostgreSQL database.');
    console.log('======================================================\n');
    client.release();
  } catch (err) {
    console.error('❌ Restoration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
