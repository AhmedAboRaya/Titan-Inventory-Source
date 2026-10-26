const fs = require('fs');

const envText = fs.readFileSync('E:/AboRaya/TITAN/server/.env', 'utf8');
const match = envText.match(/MONGODB_URI=(.*)/);
const uri = match[1].trim().replace(/^['"]|['"]$/g, '');

const { MongoClient } = require('E:/AboRaya/TITAN/server/node_modules/mongodb');
const client = new MongoClient(uri);

async function run() {
  await client.connect();
  const db = client.db();

  // 1. Fetch all transactions
  const inTx = await db.collection('inventorytransactions')
    .find({ type: 'IN' })
    .sort({ date: 1 })
    .toArray();

  const outTx = await db.collection('inventorytransactions')
    .find({
      type: 'OUT',
      date: { $gte: new Date('2026-10-01T00:00:00.000Z'), $lte: new Date('2026-10-31T23:59:59.999Z') }
    })
    .sort({ date: 1 })
    .toArray();

  const adjTx = await db.collection('inventorytransactions')
    .find({ type: 'ADJUSTMENT' })
    .sort({ date: 1 })
    .toArray();

  // 2. Fetch all lots
  const lots = await db.collection('lots').find({}).toArray();
  const lotsByItem = new Map();
  for (const l of lots) {
    const code = (l.itemCode || '').trim().toLowerCase();
    if (!lotsByItem.has(code)) lotsByItem.set(code, []);
    lotsByItem.get(code).push(l);
  }

  console.log(`Loaded ${inTx.length} IN, ${outTx.length} OUT, ${adjTx.length} ADJ, ${lots.length} Lots.`);

  // Check lot numbers used in OUT transactions
  let foundInLots = 0;
  let notFoundInLots = 0;
  for (const t of outTx) {
    const code = (t.itemCode || '').trim().toLowerCase();
    const lNum = (t.lotNumber || '').trim();
    const itemLots = lotsByItem.get(code) || [];
    const match = itemLots.find(l => l.lotNumber && l.lotNumber.replace(/[^A-Za-z0-9]/g, '').toLowerCase() === lNum.replace(/[^A-Za-z0-9]/g, '').toLowerCase());
    if (match) {
      foundInLots++;
    } else {
      notFoundInLots++;
    }
  }
  console.log(`OUT lots matched against Mongo lots: ${foundInLots} matched, ${notFoundInLots} not matched.`);

  // Sample not matched
  console.log('Sample not matched lots:');
  for (const t of outTx) {
    const code = (t.itemCode || '').trim().toLowerCase();
    const lNum = (t.lotNumber || '').trim();
    const itemLots = lotsByItem.get(code) || [];
    const match = itemLots.find(l => l.lotNumber && l.lotNumber.replace(/[^A-Za-z0-9]/g, '').toLowerCase() === lNum.replace(/[^A-Za-z0-9]/g, '').toLowerCase());
    if (!match) {
      console.log(`  item=${t.itemCode} txLot="${lNum}" availInLots=${itemLots.map(x => x.lotNumber).join(', ')}`);
    }
  }

  await client.close();
}

run().catch(console.error);
