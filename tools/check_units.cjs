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

  const itemsRes = await request(base + '/items?limit=500', { headers: authHeaders });
  const titanItems = itemsRes.body || [];
  const titanItemBySku = new Map(titanItems.map(it => [it.sku.toLowerCase(), it]));

  const allTx = await db.collection('inventorytransactions').find({
    type: { $in: ['IN', 'OUT'] },
    date: { $gte: new Date('2026-10-01T00:00:00.000Z'), $lte: new Date('2026-10-31T23:59:59.999Z') }
  }).toArray();

  const unitMismatches = [];
  for (const t of allTx) {
    const it = titanItemBySku.get((t.itemCode || '').trim().toLowerCase());
    if (!it) continue;
    if (t.unit !== it.base_unit) {
      unitMismatches.push({
        itemCode: t.itemCode,
        txUnit: t.unit,
        baseUnit: it.base_unit
      });
    }
  }

  console.log(`Total transactions checked: ${allTx.length}`);
  console.log(`Unit mismatches count: ${unitMismatches.length}`);
  const uniqueMismatches = {};
  for (const m of unitMismatches) {
    const k = `${m.itemCode} | tx=${m.txUnit} vs base=${m.baseUnit}`;
    uniqueMismatches[k] = (uniqueMismatches[k] || 0) + 1;
  }
  console.log('Unique unit mismatches:', uniqueMismatches);

  await client.close();
}

run().catch(console.error);
