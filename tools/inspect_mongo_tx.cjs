const fs = require('fs');
const path = require('path');

const envText = fs.readFileSync('E:/AboRaya/TITAN/server/.env', 'utf8');
const match = envText.match(/MONGODB_URI=(.*)/);
const uri = match[1].trim().replace(/^['"]|['"]$/g, '');

const { MongoClient } = require('E:/AboRaya/TITAN/server/node_modules/mongodb');
const client = new MongoClient(uri);

async function run() {
  await client.connect();
  const db = client.db();

  console.log('--- Inspecting lots collection ---');
  const lots = await db.collection('lots').find({}).toArray();
  console.log('Total lots:', lots.length);
  if (lots.length > 0) {
    console.log('Sample lot keys:', Object.keys(lots[0]));
    console.log('Sample lot 1:', lots[0]);
    console.log('Sample lot 2:', lots[1]);
  }

  // Check unique date fields on lots
  const lotsSummary = lots.slice(0, 10).map(l => ({
    lotNumber: l.lotNumber || l.number || l.code,
    itemCode: l.itemCode || l.item,
    initialQuantity: l.initialQuantity,
    quantity: l.quantity,
    status: l.status,
    receivedAt: l.receivedAt,
    receiptDate: l.receiptDate,
    createdAt: l.createdAt,
    date: l.date
  }));
  console.log('First 10 lots summary:', lotsSummary);

  // Check if there are receipts or purchases collections
  const collections = await db.listCollections().toArray();
  for (const c of collections) {
    const name = c.name.toLowerCase();
    if (name.includes('purchase') || name.includes('receipt') || name.includes('inbound') || name.includes('order')) {
      const docs = await db.collection(c.name).find({}).toArray();
      console.log(`Found collection ${c.name} with ${docs.length} docs`);
      if (docs.length > 0) console.log('Sample:', docs[0]);
    }
  }

  // Check stocktransactions details
  const stColl = db.collection('stocktransactions');
  const stCount = await stColl.countDocuments();
  if (stCount > 0) {
    const stDocs = await stColl.find({}).toArray();
    console.log('\n--- stocktransactions sample ---');
    console.log(stDocs.slice(0, 5));
  }

  // Check warehouseitems or inventories
  const inventories = await db.collection('inventories').find({}).toArray();
  console.log('\nTotal inventories:', inventories.length);
  if (inventories.length > 0) {
    console.log('Sample inventory:', inventories[0]);
  }

  await client.close();
}

run().catch(console.error);
