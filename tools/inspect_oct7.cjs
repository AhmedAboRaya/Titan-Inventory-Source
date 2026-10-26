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

  // Check what Doc #29 in the timeline was
  const oct7 = await db.collection('inventorytransactions').find({
    type: 'OUT',
    date: { $gte: new Date('2026-10-07T00:00:00.000Z'), $lte: new Date('2026-10-07T23:59:59.999Z') }
  }).toArray();

  const outGrouped = new Map();
  for (const t of oct7) {
    const rec = (t.recipientName || 'فني تشغيل').trim();
    const dept = (t.departmentName || '').trim();
    const key = `${rec}:::${dept}`;
    if (!outGrouped.has(key)) outGrouped.set(key, []);
    outGrouped.get(key).push(t);
  }

  let idx = 25;
  for (const [key, list] of outGrouped.entries()) {
    console.log(`Doc #${idx} [${key}]:`);
    for (const t of list) {
      console.log(`  item=${t.itemCode} qty=${t.quantity} lot=${t.lotNumber}`);
    }
    idx++;
  }

  // Check balances of items in Doc #29
  const balances = (await request(base + '/reports/balances', { headers: authHeaders })).body || [];
  console.log('\nLive Balances in Titan:');
  for (const b of balances) {
    if (['Hassan', 'Mo. Hany', 'Shehata', 'Asmaa Sabry'].some(r => true)) {
      // print if relevant
    }
  }

  await client.close();
}

run().catch(console.error);
