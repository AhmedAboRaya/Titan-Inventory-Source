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

  const base = 'http://127.0.0.1:19012/inventory/v1';
  const loginRes = await request(base + '/auth/login', { method: 'POST' }, {
    username: 'admin',
    password: 'TEST-only-password-4821'
  });
  const cookie = loginRes.headers['set-cookie'];
  const csrf = loginRes.body.csrf;
  const authHeaders = { 'Cookie': cookie, 'x-csrf-token': csrf };

  const balancesRes = await request(base + '/reports/balances', { headers: authHeaders });
  const currentBalances = balancesRes.body || [];
  const currentStockMap = new Map();
  for (const b of currentBalances) {
    const sku = (b.item_sku || '').toLowerCase();
    currentStockMap.set(sku, (currentStockMap.get(sku) || 0) + Number(b.quantity));
  }

  const inTx = await db.collection('inventorytransactions').find({ type: 'IN' }).toArray();
  const outTx = await db.collection('inventorytransactions').find({
    type: 'OUT',
    date: { $gte: new Date('2026-10-01T00:00:00.000Z'), $lte: new Date('2026-10-31T23:59:59.999Z') }
  }).toArray();

  // Total IN and OUT per item
  const inMap = new Map();
  for (const t of inTx) {
    const s = (t.itemCode || '').toLowerCase();
    inMap.set(s, (inMap.get(s) || 0) + Number(t.quantity));
  }
  const outMap = new Map();
  for (const t of outTx) {
    const s = (t.itemCode || '').toLowerCase();
    outMap.set(s, (outMap.get(s) || 0) + Number(t.quantity));
  }

  console.log('--- RECONCILIATION CALCULATION ---');
  // For each item with movements:
  // If we want CurrentStock to stay as TargetFinalStock after applying +IN and -OUT:
  // StartStock = TargetFinalStock + OUT - IN
  // BufferToAdd = StartStock - CurrentStock = OUT - IN!
  // If (OUT - IN) > 0, we need to add BufferToAdd at start of October!
  // If (OUT - IN) < 0, it means IN > OUT (more was received than issued).
  const bufferToAdd = [];
  for (const [sku, totalOut] of outMap.entries()) {
    const totalIn = inMap.get(sku) || 0;
    const netDeduction = totalOut - totalIn;
    console.log(`Item: ${sku.padEnd(20)} | Current=${(currentStockMap.get(sku) || 0)} | OUT=${totalOut} | IN=${totalIn} | NetDeduction=${netDeduction}`);
    if (netDeduction > 0) {
      bufferToAdd.push({ sku, qty: netDeduction });
    }
  }

  console.log(`\nItems needing startup buffer: ${bufferToAdd.length}`);
  bufferToAdd.forEach(b => console.log(`  ${b.sku}: +${b.qty}`));

  await client.close();
}

run().catch(console.error);
