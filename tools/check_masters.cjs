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

  // Fetch masters
  const mastersRes = await request(base + '/masters?all=true', { headers: authHeaders });
  const masters = mastersRes.body || [];
  console.log(`Current masters in Titan Inventory: ${masters.length}`);

  const depts = masters.filter(m => m.kind === 'department');
  const emps = masters.filter(m => m.kind === 'employee');
  const supps = masters.filter(m => m.kind === 'supplier');

  console.log(`Departments: ${depts.length}, Employees: ${emps.length}, Suppliers: ${supps.length}`);

  // Check which Mongo recipients/departments/suppliers are missing
  const outTx = await db.collection('inventorytransactions').find({
    type: 'OUT',
    date: { $gte: new Date('2026-10-01T00:00:00.000Z'), $lte: new Date('2026-10-31T23:59:59.999Z') }
  }).toArray();
  const inTx = await db.collection('inventorytransactions').find({ type: 'IN' }).toArray();

  const missingRecipients = new Set();
  const missingDepts = new Set();
  const missingSupps = new Set();

  for (const t of outTx) {
    const rName = (t.recipientName || '').trim();
    if (rName && !emps.some(e => e.name.toLowerCase() === rName.toLowerCase())) {
      missingRecipients.add(rName);
    }
    const dName = (t.departmentName || '').trim();
    if (dName && !depts.some(d => d.name.toLowerCase() === dName.toLowerCase())) {
      missingDepts.add(dName);
    }
  }

  for (const t of inTx) {
    const sName = (t.supplierName || t.supplier || '').trim();
    if (sName && !supps.some(s => s.name.toLowerCase() === sName.toLowerCase())) {
      missingSupps.add(sName);
    }
  }

  console.log('Missing recipients:', Array.from(missingRecipients));
  console.log('Missing departments:', Array.from(missingDepts));
  console.log('Missing suppliers:', Array.from(missingSupps));

  await client.close();
}

run().catch(console.error);
