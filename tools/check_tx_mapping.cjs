const fs = require('fs');
const http = require('http');

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const reqOptions = {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: { 'Origin': u.origin, ...options.headers }
    };
    if (body) {
      const data = typeof body === 'string' ? body : JSON.stringify(body);
      reqOptions.headers['Content-Type'] = 'application/json';
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

const envText = fs.readFileSync('E:/AboRaya/TITAN/server/.env', 'utf8');
const match = envText.match(/MONGODB_URI=(.*)/);
const uri = match[1].trim().replace(/^['"]|['"]$/g, '');

const { MongoClient } = require('E:/AboRaya/TITAN/server/node_modules/mongodb');
const client = new MongoClient(uri);

async function run() {
  await client.connect();
  const db = client.db();

  // 1. Fetch current Titan Inventory state
  const base = 'http://127.0.0.1:19012/inventory/v1';
  const loginRes = await request(base + '/auth/login', { method: 'POST' }, {
    username: 'admin',
    password: 'TEST-only-password-4821'
  });
  const cookie = loginRes.headers['set-cookie'];
  const csrf = loginRes.body.csrf;
  const authHeaders = { 'Cookie': cookie, 'x-csrf-token': csrf };

  const itemsRes = await request(base + '/items?limit=500', { headers: authHeaders });
  const titanItems = itemsRes.body || [];
  const titanItemBySku = new Map();
  for (const it of titanItems) {
    titanItemBySku.set(it.sku.toLowerCase(), it);
  }

  const balancesRes = await request(base + '/reports/balances', { headers: authHeaders });
  const currentBalances = balancesRes.body || [];
  console.log(`Current Titan Inventory: ${titanItems.length} items, ${currentBalances.length} stock positions.`);

  // 2. Fetch Mongo transactions
  const outTx = await db.collection('inventorytransactions')
    .find({ type: 'OUT', date: { $gte: new Date('2026-10-01T00:00:00.000Z'), $lte: new Date('2026-10-31T23:59:59.999Z') } })
    .sort({ date: 1 })
    .toArray();

  const inTx = await db.collection('inventorytransactions')
    .find({ type: 'IN' })
    .sort({ date: 1 })
    .toArray();

  console.log(`Mongo OUT (Oct 2026): ${outTx.length}`);
  console.log(`Mongo IN: ${inTx.length}`);

  // 3. Check item mapping for all OUT and IN
  const missingItems = new Set();
  for (const tx of [...inTx, ...outTx]) {
    const code = (tx.itemCode || '').trim();
    if (!titanItemBySku.has(code.toLowerCase())) {
      missingItems.add(code);
    }
  }
  console.log(`Missing items in Titan Inventory:`, Array.from(missingItems));

  // 4. Check lot numbers for OUT vs available lots
  console.log('\n--- Checking Lots & Stock availability ---');
  // Build running stock map: item_id -> total qty
  // and (item_id, lot_id or lot_code) -> qty
  const stockMap = new Map();
  for (const b of currentBalances) {
    const key = `${b.item_id}:${b.lot_id || 'NOLOT'}`;
    stockMap.set(key, (stockMap.get(key) || 0) + Number(b.quantity));
  }

  // Check all IN items & lots
  console.log('\nIN Transactions items & lots:');
  inTx.forEach((tx, idx) => {
    const it = titanItemBySku.get((tx.itemCode || '').toLowerCase());
    console.log(`  [${idx+1}] date=${tx.date ? new Date(tx.date).toISOString().slice(0, 10) : ''} item=${tx.itemCode} (matched=${!!it}) lot=${tx.lotNumber} qty=${tx.quantity} unit=${tx.unit}`);
  });

  // Check OUT transactions items & lots
  console.log('\nOUT Transactions sample (first 10):');
  outTx.slice(0, 10).forEach((tx, idx) => {
    const it = titanItemBySku.get((tx.itemCode || '').toLowerCase());
    console.log(`  [${idx+1}] date=${tx.date ? new Date(tx.date).toISOString().slice(0, 10) : ''} item=${tx.itemCode} (matched=${!!it}) lot=${tx.lotNumber} qty=${tx.quantity} unit=${tx.unit} rec=${tx.recipientName}`);
  });

  // List all distinct recipient names and departments in OUT transactions
  const recipients = new Set();
  const departments = new Set();
  outTx.forEach(tx => {
    if (tx.recipientName) recipients.add(tx.recipientName);
    if (tx.departmentName) departments.add(tx.departmentName);
  });
  console.log('\nDistinct Recipients in OUT:', Array.from(recipients));
  console.log('Distinct Departments in OUT:', Array.from(departments));

  await client.close();
}

run().catch(console.error);
