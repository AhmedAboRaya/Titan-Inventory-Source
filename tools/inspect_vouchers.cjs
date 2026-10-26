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
  }).sort({ date: 1 }).toArray();

  const numMap = {};
  for (const t of outTx) {
    const num = t.transactionNumber || 'NONE';
    if (!numMap[num]) numMap[num] = [];
    numMap[num].push(t);
  }

  console.log('Total OUT records:', outTx.length);
  console.log('Unique transactionNumbers:', Object.keys(numMap).length);
  const multiLine = Object.entries(numMap).filter(([k, v]) => v.length > 1);
  console.log('Vouchers with multiple lines:', multiLine.length);
  if (multiLine.length > 0) {
    console.log('Sample multi-line voucher:', multiLine[0][0], multiLine[0][1].map(x => x.itemCode));
  }

  // Check unique transactionNumbers for IN
  const inTx = await db.collection('inventorytransactions').find({ type: 'IN' }).toArray();
  const inNumMap = {};
  for (const t of inTx) {
    const num = t.transactionNumber || 'NONE';
    if (!inNumMap[num]) inNumMap[num] = [];
    inNumMap[num].push(t);
  }
  console.log('Total IN records:', inTx.length);
  console.log('Unique IN transactionNumbers:', Object.keys(inNumMap).length);

  // Print first 5 transactionNumbers
  console.log('\nFirst 10 OUT transaction numbers:');
  Object.keys(numMap).slice(0, 10).forEach(num => {
    const list = numMap[num];
    console.log(`  ${num}: date=${new Date(list[0].date).toISOString().slice(0, 10)} lines=${list.length} rec=${list[0].recipientName} dept=${list[0].departmentName}`);
  });

  await client.close();
}

run().catch(console.error);
