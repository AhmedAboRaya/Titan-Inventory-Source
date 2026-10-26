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
  const seedTargetMap = new Map();
  for (const it of seedItems) {
    seedTargetMap.set(it.code.toLowerCase(), it.stockCardQty);
  }

  const opb = await db.collection('inventorytransactions').find({ type: 'OPENING_BALANCE' }).toArray();
  const inTx = await db.collection('inventorytransactions').find({ type: 'IN' }).toArray();
  const outTx = await db.collection('inventorytransactions').find({
    type: 'OUT',
    date: { $gte: new Date('2026-10-01T00:00:00.000Z'), $lte: new Date('2026-10-31T23:59:59.999Z') }
  }).toArray();
  const adjTx = await db.collection('inventorytransactions').find({ type: 'ADJUSTMENT' }).toArray();

  // Calculate net October movements for each item: +IN -OUT +ADJ
  const netMovements = new Map();
  for (const t of inTx) {
    const code = (t.itemCode || '').toLowerCase();
    netMovements.set(code, (netMovements.get(code) || 0) + Number(t.quantity));
  }
  for (const t of outTx) {
    const code = (t.itemCode || '').toLowerCase();
    netMovements.set(code, (netMovements.get(code) || 0) - Number(t.quantity));
  }
  for (const t of adjTx) {
    const code = (t.itemCode || '').toLowerCase();
    netMovements.set(code, (netMovements.get(code) || 0) + Number(t.quantity));
  }

  console.log(`Items with October movements: ${netMovements.size}`);
  
  // What should the starting balance be for each item so that:
  // StartBalance + NetMovements == TargetSeedBalance?
  // Therefore: StartBalance = TargetSeedBalance - NetMovements!
  console.log('\n--- Calculated Oct 1 Start Balance vs Target Final Balance ---');
  let diffCount = 0;
  for (const [code, net] of netMovements.entries()) {
    const target = seedTargetMap.get(code) || 0;
    const requiredStart = target - net;
    console.log(`Item: ${code.padEnd(20)} | TargetFinal=${String(target).padStart(6)} | NetMvt=${String(net).padStart(6)} | RequiredStart=${requiredStart}`);
  }

  await client.close();
}

run().catch(console.error);
