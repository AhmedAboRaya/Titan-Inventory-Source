const fs = require('fs');

const envText = fs.readFileSync('E:/AboRaya/TITAN/server/.env', 'utf8');
const match = envText.match(/MONGODB_URI=(.*)/);
const uri = match[1].trim().replace(/^['"]|['"]$/g, '');

const { MongoClient } = require('E:/AboRaya/TITAN/server/node_modules/mongodb');
const client = new MongoClient(uri);

async function run() {
  await client.connect();
  const db = client.db();

  const opb = await db.collection('inventorytransactions')
    .find({ type: 'OPENING_BALANCE' })
    .toArray();

  console.log(`Total OPENING_BALANCE records in MongoDB: ${opb.length}`);
  
  // Compare each item in opb with medical_warehouse_seed.json
  const seed = JSON.parse(fs.readFileSync('E:/AboRaya/TITAN/medical_warehouse_seed.json', 'utf8'));
  const seedMap = new Map();
  for (const it of seed.warehouse_items) {
    seedMap.set(it.code, it);
  }

  let diffCount = 0;
  for (const o of opb) {
    const s = seedMap.get(o.itemCode);
    const seedQty = s ? s.stockCardQty : 'N/A';
    if (s && s.stockCardQty !== o.quantity) {
      diffCount++;
      console.log(`Diff: ${o.itemCode} | Mongo OPB = ${o.quantity} (lot: ${o.lotNumber}) vs Seed = ${seedQty} (lot: ${s.stockCardLot})`);
    }
  }
  console.log(`Items with difference between Mongo OPB and Seed: ${diffCount}`);

  await client.close();
}

run().catch(console.error);
