/**
 * TITAN INVENTORY — Full Database Export & Dump Generator
 * 
 * Exports all data from the live running instance into:
 * 1. TITAN_DATABASE_FULL_DUMP.sql (PostgreSQL dump ready for psql/pgAdmin)
 * 2. TITAN_DATABASE_COMPLETE_DATA.json (Structured JSON of all tables)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 19012;
const BASE = `http://127.0.0.1:${PORT}/inventory/v1`;

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const reqOptions = {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: {
        'Origin': u.origin,
        'Content-Type': 'application/json',
        ...options.headers
      }
    };
    if (body) {
      const data = typeof body === 'string' ? body : JSON.stringify(body);
      reqOptions.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request(reqOptions, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch (e) { parsed = raw; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function sqlVal(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (Array.isArray(val)) {
    // Array format for Postgres e.g. ARRAY['a','b'] or '{a,b}'
    const escapedItems = val.map(v => typeof v === 'string' ? `"${v.replace(/"/g, '\\"')}"` : v);
    return `'${"{" + escapedItems.join(",") + "}"}'`;
  }
  if (typeof val === 'object') {
    // JSONB object
    const str = JSON.stringify(val).replace(/'/g, "''");
    return `'${str}'::jsonb`;
  }
  // String
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

async function main() {
  console.log(`[1/4] Connecting to TITAN INVENTORY on ${BASE}...`);
  const loginRes = await request(`${BASE}/auth/login`, { method: 'POST' }, {
    username: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASSWORD || 'TEST-only-password-4821'
  });

  if (loginRes.status !== 200) {
    throw new Error('Authentication failed: ' + JSON.stringify(loginRes.body));
  }

  const cookie = loginRes.headers['set-cookie'];
  const csrf = loginRes.body.csrf;
  const authHeaders = { 'Cookie': cookie, 'x-csrf-token': csrf };
  console.log('✔ Authenticated successfully as admin.');

  // Helper to fetch endpoint
  async function fetchAll(p) {
    const res = await request(`${BASE}/${p}`, { headers: authHeaders });
    if (res.status >= 400) {
      console.warn(`Warning: failed to fetch ${p}:`, res.status);
      return [];
    }
    return res.body || [];
  }

  console.log('\n[2/4] Fetching all tables and entities...');
  const warehouses = await fetchAll('warehouses?all=true');
  console.log(`- Warehouses: ${warehouses.length}`);

  const locations = await fetchAll('locations');
  console.log(`- Locations: ${locations.length}`);

  const categories = await fetchAll('categories');
  console.log(`- Categories: ${categories.length}`);

  const masters = await fetchAll('masters?all=true');
  console.log(`- Masters (Departments, Employees, Suppliers, Machines): ${masters.length}`);

  const items = await fetchAll('items?limit=1000');
  console.log(`- Items (Products): ${items.length}`);

  // Fetch lots for all lot-tracked items
  const allLots = [];
  for (const it of items) {
    if (it.track_lot) {
      const lots = await fetchAll(`lots?item_id=${it.id}`);
      if (Array.isArray(lots)) allLots.push(...lots);
    }
  }
  console.log(`- Lots: ${allLots.length}`);

  const itemLevels = await fetchAll('item-levels');
  console.log(`- Item Levels: ${itemLevels.length}`);

  // Fetch all documents and their line details
  const docsList = await fetchAll('documents');
  console.log(`- Total Documents: ${docsList.length}. Fetching detailed lines...`);
  
  const documents = [];
  const allDocumentLines = [];
  for (let i = 0; i < docsList.length; i++) {
    const docSummary = docsList[i];
    const fullDoc = await fetchAll(`documents/${docSummary.id}`);
    if (fullDoc && fullDoc.id) {
      documents.push(fullDoc);
      for (const line of fullDoc.lines || []) {
        allDocumentLines.push({ ...line, document_id: fullDoc.id });
      }
    }
    if ((i + 1) % 25 === 0 || i === docsList.length - 1) {
      process.stdout.write(`  Loaded ${i + 1}/${docsList.length} documents (${allDocumentLines.length} lines total)...\r`);
    }
  }
  console.log(`\n✔ Fully loaded ${documents.length} documents with ${allDocumentLines.length} lines.`);

  const balances = await fetchAll('reports/balances?limit=2000');
  console.log(`- Balances: ${balances.length}`);

  const ledger = await fetchAll('reports/ledger?limit=10000');
  console.log(`- Ledger entries: ${ledger.length}`);

  const purchaseOrders = await fetchAll('purchase-orders');
  console.log(`- Purchase Orders: ${purchaseOrders.length}`);

  // Compile structured database object
  const fullDatabaseObject = {
    metadata: {
      system: 'TITAN INVENTORY',
      version: '0.1.0',
      exported_at: new Date().toISOString(),
      counts: {
        warehouses: warehouses.length,
        locations: locations.length,
        categories: categories.length,
        masters: masters.length,
        items: items.length,
        lots: allLots.length,
        documents: documents.length,
        document_lines: allDocumentLines.length,
        balances: balances.length,
        ledger: ledger.length,
        purchase_orders: purchaseOrders.length
      }
    },
    tables: {
      warehouses,
      locations,
      categories,
      masters,
      items,
      lots: allLots,
      documents,
      document_lines: allDocumentLines,
      balances,
      ledger,
      purchase_orders: purchaseOrders
    }
  };

  console.log('\n[3/4] Writing TITAN_DATABASE_COMPLETE_DATA.json...');
  const jsonPath = path.resolve(__dirname, '../TITAN_DATABASE_COMPLETE_DATA.json');
  fs.writeFileSync(jsonPath, JSON.stringify(fullDatabaseObject, null, 2), 'utf8');
  console.log(`✔ JSON file generated successfully at:\n  ${jsonPath} (${(fs.statSync(jsonPath).size / 1024).toFixed(1)} KB)`);

  console.log('\n[4/4] Generating standard PostgreSQL SQL Dump (TITAN_DATABASE_FULL_DUMP.sql)...');
  
  // Read base migration schema
  const migrationPath = path.resolve(__dirname, '../migrations/001_inventory.sql');
  const baseSchema = fs.readFileSync(migrationPath, 'utf8');

  let sql = `-- =============================================================================\n`;
  sql += `-- TITAN INVENTORY — COMPLETE DATABASE FULL DUMP & SEED\n`;
  sql += `-- Export Date: ${new Date().toISOString()}\n`;
  sql += `-- Total Items: ${items.length} | Documents: ${documents.length} | Masters: ${masters.length}\n`;
  sql += `-- =============================================================================\n\n`;
  sql += `BEGIN;\n\n`;
  sql += `-- 1. Schema DDL & Extensions\n`;
  sql += baseSchema + `\n\n`;

  sql += `-- =============================================================================\n`;
  sql += `-- 2. DATA INSERTION (In Referential Integrity Order)\n`;
  sql += `-- =============================================================================\n\n`;

  // Helper to generate INSERT statements
  function generateInserts(tableName, rows, columns, onConflict = 'ON CONFLICT DO NOTHING') {
    if (!rows.length) return `-- No rows for ${tableName}\n\n`;
    let out = `-- Table: ${tableName} (${rows.length} rows)\n`;
    for (const r of rows) {
      const vals = columns.map(c => sqlVal(r[c]));
      out += `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${vals.join(', ')}) ${onConflict};\n`;
    }
    out += `\n`;
    return out;
  }

  // 1. Warehouses
  sql += generateInserts('warehouses', warehouses, ['id', 'name', 'site_id', 'active', 'version']);

  // 2. Locations
  sql += generateInserts('locations', locations, ['id', 'warehouse_id', 'name', 'rack', 'shelf', 'bin', 'active']);

  // 3. Categories (Insert parents first, then children)
  const parentCats = categories.filter(c => !c.parent_id);
  const childCats = categories.filter(c => c.parent_id);
  sql += generateInserts('categories', parentCats, ['id', 'name_ar', 'name_en', 'illustration', 'sort', 'active', 'version']);
  sql += generateInserts('categories', childCats, ['id', 'parent_id', 'name_ar', 'name_en', 'illustration', 'sort', 'active', 'version']);

  // 4. Masters (Departments, Employees, Suppliers, Machines)
  sql += generateInserts('masters', masters, ['id', 'kind', 'name', 'data', 'active', 'version']);

  // 5. Items (Products)
  sql += generateInserts('items', items, [
    'id', 'sku', 'name_ar', 'name_en', 'category_id', 'description', 'brand',
    'specification', 'base_unit', 'precision', 'tracking', 'track_lot',
    'track_serial', 'track_expiry', 'data', 'active', 'version'
  ]);

  // 6. Lots
  if (allLots.length) {
    sql += generateInserts('lots', allLots, [
      'id', 'item_id', 'code', 'supplier_id', 'manufactured_on', 'received_on', 'expires_on', 'notes'
    ]);
  }

  // 7. Documents (Sorted chronologically)
  // Ensure we sort documents by document_date and number
  const sortedDocs = [...documents].sort((a, b) => {
    const da = String(a.document_date);
    const db = String(b.document_date);
    if (da !== db) return da.localeCompare(db);
    return Number(a.number) - Number(b.number);
  });

  sql += `-- Overriding IDENTITY for documents to preserve exact voucher numbers\n`;
  for (const d of sortedDocs) {
    const cols = [
      'id', 'type', 'status', 'document_date', 'warehouse_id', 'destination_warehouse_id',
      'department_id', 'recipient_id', 'machine_id', 'supplier_id', 'reference_id',
      'reason', 'notes', 'currency', 'exchange_rate', 'created_by', 'metadata', 'version'
    ];
    const vals = cols.map(c => sqlVal(d[c]));
    sql += `INSERT INTO documents (${cols.join(', ')}) OVERRIDING SYSTEM VALUE VALUES (${vals.join(', ')}) ON CONFLICT (id) DO NOTHING;\n`;
  }
  sql += `\n`;

  // 8. Document Lines
  sql += generateInserts('document_lines', allDocumentLines, [
    'id', 'document_id', 'item_id', 'quantity', 'unit', 'factor', 'base_quantity',
    'location_id', 'destination_location_id', 'lot_id', 'serial_id', 'quality',
    'condition', 'destination_quality', 'unit_cost', 'posted_unit_cost',
    'reference_line_id', 'notes'
  ]);

  // 9. Balances
  sql += generateInserts('balances', balances, [
    'position_key', 'item_id', 'warehouse_id', 'location_id', 'lot_id', 'serial_id',
    'quality', 'condition', 'holder_id', 'transit_id', 'quantity', 'reserved'
  ], 'ON CONFLICT (position_key) DO UPDATE SET quantity=EXCLUDED.quantity, reserved=EXCLUDED.reserved');

  // 10. Costs (calculate or insert from items)
  for (const it of items) {
    if (it.average_cost || it.last_price || it.available) {
      const q = it.available || 0;
      const v = (Number(it.average_cost || it.last_price || 0) * Number(q)).toFixed(9);
      sql += `INSERT INTO costs (item_id, quantity, value, unpriced_quantity, last_price) VALUES (${sqlVal(it.id)}, ${sqlVal(q)}, ${sqlVal(v)}, 0, ${sqlVal(it.last_price || null)}) ON CONFLICT (item_id) DO UPDATE SET quantity=EXCLUDED.quantity, value=EXCLUDED.value, last_price=EXCLUDED.last_price;\n`;
    }
  }
  sql += `\n`;

  // 11. Ledger
  if (ledger.length) {
    sql += `-- Preserving historical ledger transactions\n`;
    for (const l of ledger) {
      if (l.document_id && l.position_key) {
        sql += `INSERT INTO ledger (document_id, position_key, quantity, unit_cost, posted_at) VALUES (${sqlVal(l.document_id)}, ${sqlVal(l.position_key)}, ${sqlVal(l.quantity)}, ${sqlVal(l.unit_cost)}, ${sqlVal(l.posted_at)}) ON CONFLICT DO NOTHING;\n`;
      }
    }
    sql += `\n`;
  }

  // 12. Adjust Identity Sequence for documents
  sql += `-- Reset sequence so new documents start after highest existing number\n`;
  sql += `SELECT setval(pg_get_serial_sequence('documents', 'number'), COALESCE((SELECT max(number) FROM documents), 1));\n\n`;

  sql += `COMMIT;\n`;
  sql += `-- =============================================================================\n`;
  sql += `-- END OF DUMP — TITAN INVENTORY DATABASE READY FOR PRODUCTION\n`;
  sql += `-- =============================================================================\n`;

  const sqlPath = path.resolve(__dirname, '../TITAN_DATABASE_FULL_DUMP.sql');
  fs.writeFileSync(sqlPath, sql, 'utf8');
  console.log(`✔ SQL dump generated successfully at:\n  ${sqlPath} (${(fs.statSync(sqlPath).size / 1024).toFixed(1)} KB)`);

  console.log('\n======================================================');
  console.log('✅ EXPORT COMPLETED SUCCESSFULLY!');
  console.log(`1. SQL Dump: TITAN_DATABASE_FULL_DUMP.sql`);
  console.log(`2. JSON Dump: TITAN_DATABASE_COMPLETE_DATA.json`);
  console.log('======================================================\n');
}

main().catch(err => {
  console.error('Fatal error during database export:', err);
  process.exit(1);
});
