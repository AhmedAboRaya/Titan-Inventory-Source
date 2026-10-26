const fs = require('fs');

const envText = fs.readFileSync('E:/AboRaya/TITAN/server/.env', 'utf8');
const match = envText.match(/MONGODB_URI=(.*)/);
const uri = match[1].trim().replace(/^['"]|['"]$/g, '');

const { MongoClient } = require('E:/AboRaya/TITAN/server/node_modules/mongodb');
const client = new MongoClient(uri);

async function run() {
  await client.connect();
  const db = client.db();

  const seed = JSON.parse(fs.readFileSync('E:/AboRaya/TITAN/medical_warehouse_seed.json', 'utf8'));
  const seedItems = seed.warehouse_items;
  const initialStock = new Map();
  for (const it of seedItems) {
    initialStock.set(it.code.toLowerCase(), it.stockCardQty || 0);
  }

  const inTx = await db.collection('inventorytransactions').find({ type: 'IN' }).sort({ date: 1 }).toArray();
  const outTx = await db.collection('inventorytransactions').find({
    type: 'OUT',
    date: { $gte: new Date('2026-10-01T00:00:00.000Z'), $lte: new Date('2026-10-31T23:59:59.999Z') }
  }).sort({ date: 1 }).toArray();

  const timeline = [];
  for (const t of inTx) {
    const dStr = new Date(t.date).toISOString().slice(0, 10);
    timeline.push({ kind: 'IN', date: dStr, time: new Date(`${dStr}T08:00:00.000Z`).getTime(), tx: t });
  }
  for (const t of outTx) {
    const dStr = new Date(t.date).toISOString().slice(0, 10);
    timeline.push({ kind: 'OUT', date: dStr, time: new Date(`${dStr}T14:00:00.000Z`).getTime(), tx: t });
  }
  timeline.sort((a, b) => a.time - b.time);

  // We want to find the MINIMUM running balance for each item throughout the entire month:
  // If minBalance < 0, then the item needs a buffer of at least Math.abs(minBalance) on Oct 1!
  const running = new Map();
  for (const [k, v] of initialStock.entries()) {
    running.set(k, v);
  }

  const minBalances = new Map();
  for (const [k, v] of initialStock.entries()) {
    minBalances.set(k, v);
  }

  for (const item of timeline) {
    const t = item.tx;
    const sku = (t.itemCode || '').toLowerCase();
    const qty = Number(t.quantity);
    const cur = running.get(sku) || 0;

    let next = cur;
    if (item.kind === 'IN') {
      next = cur + qty;
    } else {
      next = cur - qty;
    }
    running.set(sku, next);

    const prevMin = minBalances.get(sku) !== undefined ? minBalances.get(sku) : 0;
    if (next < prevMin) {
      minBalances.set(sku, next);
    }
  }

  console.log('--- ITEMS THAT GO BELOW ZERO DURING OCTOBER ---');
  const bufferRequirements = [];
  for (const [sku, minBal] of minBalances.entries()) {
    if (minBal < 0) {
      const needed = Math.abs(minBal);
      console.log(`Item: ${sku.padEnd(20)} | MinBalanceDuringMonth = ${minBal} | BufferNeeded = +${needed}`);
      bufferRequirements.push({ sku, qty: needed });
    }
  }

  console.log(`\nTotal items needing buffer: ${bufferRequirements.length}`);
  console.log(JSON.stringify(bufferRequirements, null, 2));

  await client.close();
}

run().catch(console.error);
