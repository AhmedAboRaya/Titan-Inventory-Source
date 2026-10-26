const fs = require('fs');

const envText = fs.readFileSync('E:/AboRaya/TITAN/server/.env', 'utf8');
const match = envText.match(/MONGODB_URI=(.*)/);
const uri = match[1].trim().replace(/^['"]|['"]$/g, '');

const { MongoClient } = require('E:/AboRaya/TITAN/server/node_modules/mongodb');
const client = new MongoClient(uri);

async function run() {
  await client.connect();
  const db = client.db();

  const outTx = await db.collection('inventorytransactions').find({
    type: 'OUT',
    date: { $gte: new Date('2026-10-01T00:00:00.000Z'), $lte: new Date('2026-10-31T23:59:59.999Z') }
  }).toArray();

  const grouped = new Map();
  for (const t of outTx) {
    const dStr = new Date(t.date).toISOString().slice(0, 10);
    const rec = (t.recipientName || 'GENERAL').trim();
    const dept = (t.departmentName || 'NONE').trim();
    const key = `${dStr}:::${rec}:::${dept}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(t);
  }

  console.log(`Total 103 OUT transactions grouped by (date, recipient, dept): ${grouped.size} documents.`);

  // Grouped by (date, dept)
  const byDateDept = new Map();
  for (const t of outTx) {
    const dStr = new Date(t.date).toISOString().slice(0, 10);
    const dept = (t.departmentName || 'NONE').trim();
    const key = `${dStr}:::${dept}`;
    if (!byDateDept.has(key)) byDateDept.set(key, []);
    byDateDept.get(key).push(t);
  }
  console.log(`Grouped by (date, dept): ${byDateDept.size} documents.`);

  // Grouped by date only
  const byDate = new Map();
  for (const t of outTx) {
    const dStr = new Date(t.date).toISOString().slice(0, 10);
    if (!byDate.has(dStr)) byDate.set(dStr, []);
    byDate.get(dStr).push(t);
  }
  console.log(`Grouped by date: ${byDate.size} documents (18 days in October).`);

  await client.close();
}

run().catch(console.error);
