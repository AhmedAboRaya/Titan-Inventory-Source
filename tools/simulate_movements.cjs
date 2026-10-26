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

  const balancesRes = await request(base + '/reports/balances', { headers: authHeaders });
  const currentBalances = balancesRes.body || [];

  // Fetch all lots from Titan Inventory
  // Query lots per item
  const titanLotsByItem = new Map(); // item_id -> [ { id, code } ]
  for (const it of titanItems) {
    if (!it.track_lot) continue;
    const lRes = await request(base + `/lots?item_id=${it.id}`, { headers: authHeaders });
    if (lRes.body && lRes.body.length > 0) {
      titanLotsByItem.set(it.id, lRes.body);
    }
  }

  // Fetch all transactions from Mongo
  const inTx = await db.collection('inventorytransactions').find({ type: 'IN' }).toArray();
  const outTx = await db.collection('inventorytransactions').find({
    type: 'OUT',
    date: { $gte: new Date('2026-10-01T00:00:00.000Z'), $lte: new Date('2026-10-31T23:59:59.999Z') }
  }).toArray();

  console.log(`Fetched ${inTx.length} IN and ${outTx.length} OUT transactions.`);

  // Combine and sort chronologically
  const allMovements = [
    ...inTx.map(t => ({ ...t, kind: 'IN' })),
    ...outTx.map(t => ({ ...t, kind: 'OUT' }))
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  console.log(`Total movements to simulate: ${allMovements.length}`);

  // Simulate balances
  // simBalances: key (itemId:lotId) -> quantity
  const simBalances = new Map();
  for (const b of currentBalances) {
    const key = `${b.item_id}:${b.lot_id || 'NOLOT'}`;
    simBalances.set(key, (simBalances.get(key) || 0) + Number(b.quantity));
  }

  // Also track total per item
  const itemTotalQty = new Map();
  for (const b of currentBalances) {
    itemTotalQty.set(b.item_id, (itemTotalQty.get(b.item_id) || 0) + Number(b.quantity));
  }

  const failures = [];
  const warnings = [];

  for (let i = 0; i < allMovements.length; i++) {
    const tx = allMovements[i];
    const it = titanItemBySku.get((tx.itemCode || '').trim().toLowerCase());
    if (!it) {
      failures.push(`Step ${i+1}: Item not found for code ${tx.itemCode}`);
      continue;
    }

    const qty = Number(tx.quantity);
    const cleanLot = (tx.lotNumber || '').replace(/[^A-Za-z0-9\-\.\_]/g, '').trim();

    if (tx.kind === 'IN') {
      const curTotal = itemTotalQty.get(it.id) || 0;
      itemTotalQty.set(it.id, curTotal + qty);
      // for simulated lot:
      // find lot or create placeholder
      let existingLots = titanLotsByItem.get(it.id) || [];
      let matchedLot = existingLots.find(l => l.code.toLowerCase() === cleanLot.toLowerCase());
      const lotId = matchedLot ? matchedLot.id : `NEW_LOT_${cleanLot}`;
      const posKey = `${it.id}:${lotId}`;
      simBalances.set(posKey, (simBalances.get(posKey) || 0) + qty);
    } else {
      // OUT
      const curTotal = itemTotalQty.get(it.id) || 0;
      if (curTotal < qty) {
        failures.push(`Step ${i+1}: [INSUFFICIENT TOTAL STOCK] Date=${new Date(tx.date).toISOString().slice(0, 10)} Item=${it.sku} Requested=${qty} TotalAvailable=${curTotal}`);
      }
      itemTotalQty.set(it.id, curTotal - qty);

      // Check lot level
      let existingLots = titanLotsByItem.get(it.id) || [];
      let matchedLot = existingLots.find(l => 
        l.code.toLowerCase() === cleanLot.toLowerCase() ||
        l.code.replace(/[^A-Za-z0-9]/g, '').toLowerCase() === cleanLot.replace(/[^A-Za-z0-9]/g, '').toLowerCase()
      );

      let posKey = matchedLot ? `${it.id}:${matchedLot.id}` : null;
      let lotBalance = posKey ? (simBalances.get(posKey) || 0) : 0;

      if (!matchedLot || lotBalance < qty) {
        // Fallback: check if any other lot of this item has stock
        let candidateLots = [];
        for (const [k, v] of simBalances.entries()) {
          if (k.startsWith(`${it.id}:`) && v >= qty) {
            candidateLots.push({ key: k, qty: v });
          }
        }
        warnings.push(`Step ${i+1}: Date=${new Date(tx.date).toISOString().slice(0, 10)} Item=${it.sku} Lot="${tx.lotNumber}" clean="${cleanLot}" lotBalance=${lotBalance} req=${qty}. Candidates with stock: ${candidateLots.length}`);
        if (candidateLots.length > 0) {
          // deduct from first candidate
          simBalances.set(candidateLots[0].key, candidateLots[0].qty - qty);
        } else {
          failures.push(`Step ${i+1}: [NO LOT HAS ENOUGH STOCK] Item=${it.sku} Req=${qty}`);
        }
      } else {
        simBalances.set(posKey, lotBalance - qty);
      }
    }
  }

  console.log(`\nSimulation complete!`);
  console.log(`Total Failures (Insufficient Total Stock): ${failures.length}`);
  failures.forEach(f => console.log('  FAIL:', f));

  console.log(`\nLot Matching Warnings: ${warnings.length}`);
  warnings.slice(0, 15).forEach(w => console.log('  WARN:', w));

  await client.close();
}

run().catch(console.error);
