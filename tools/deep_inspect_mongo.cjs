const fs = require('fs');

const envText = fs.readFileSync('E:/AboRaya/TITAN/server/.env', 'utf8');
const match = envText.match(/MONGODB_URI=(.*)/);
const uri = match[1].trim().replace(/^['"]|['"]$/g, '');

const { MongoClient } = require('E:/AboRaya/TITAN/server/node_modules/mongodb');
const client = new MongoClient(uri);

async function run() {
  await client.connect();
  const db = client.db();

  console.log('=== CHECKING ALL COLLECTIONS FOR TRANSACTIONS / PURCHASES ===');
  const collections = await db.listCollections().toArray();
  for (const c of collections) {
    if (c.name.includes('legacy')) continue;
    const count = await db.collection(c.name).countDocuments();
    const doc = await db.collection(c.name).findOne();
    const sampleKeys = doc ? Object.keys(doc).join(', ') : 'empty';
    console.log(`[${c.name}] (${count} docs): keys = ${sampleKeys.slice(0, 80)}`);
  }

  console.log('\n=== CHECKING inventorytransactions.type ===');
  const types = await db.collection('inventorytransactions').distinct('type');
  console.log('Distinct types:', types);
  for (const t of types) {
    const count = await db.collection('inventorytransactions').countDocuments({ type: t });
    const sample = await db.collection('inventorytransactions').findOne({ type: t });
    console.log(`Type: ${t} (${count} docs) | sample:`, {
      num: sample.transactionNumber,
      date: sample.date,
      item: sample.itemCode,
      lot: sample.lotNumber,
      qty: sample.quantity,
      unit: sample.unit,
      notes: sample.notes
    });
  }

  console.log('\n=== CHECKING lots COLLECTION vs inventorytransactions ===');
  const lots = await db.collection('lots').find({}).toArray();
  console.log('Total lots:', lots.length);

  // Group lots by receivedAt year-month
  const lotMonths = {};
  for (const l of lots) {
    const ym = l.receivedAt ? new Date(l.receivedAt).toISOString().slice(0, 7) : 'NO_DATE';
    lotMonths[ym] = (lotMonths[ym] || 0) + 1;
  }
  console.log('Lots receivedAt by month:', lotMonths);

  // How many lots have receivedQuantity > 0?
  const positiveLots = lots.filter(l => (l.receivedQuantity || 0) > 0 || (l.currentQuantity || 0) > 0);
  console.log(`Lots with positive qty: ${positiveLots.length} (out of ${lots.length})`);

  // Let's inspect some lots from outside October
  console.log('\nSample lots received before October 2026:');
  const preOctLots = lots.filter(l => l.receivedAt && new Date(l.receivedAt).toISOString() < '2026-10-01');
  console.log(`Pre-October lots count: ${preOctLots.length}`);
  preOctLots.slice(0, 10).forEach(l => {
    console.log(`  item=${l.itemCode} lot=${l.lotNumber} recQty=${l.receivedQuantity} curQty=${l.currentQuantity} recAt=${l.receivedAt ? new Date(l.receivedAt).toISOString().slice(0, 10) : ''} status=${l.status}`);
  });

  // Let's inspect lots received IN October 2026
  console.log('\nSample lots received in October 2026:');
  const octLots = lots.filter(l => l.receivedAt && new Date(l.receivedAt).toISOString() >= '2026-10-01');
  console.log(`October lots count: ${octLots.length}`);
  octLots.slice(0, 10).forEach(l => {
    console.log(`  item=${l.itemCode} lot=${l.lotNumber} recQty=${l.receivedQuantity} curQty=${l.currentQuantity} recAt=${l.receivedAt ? new Date(l.receivedAt).toISOString().slice(0, 10) : ''} status=${l.status}`);
  });

  await client.close();
}

run().catch(console.error);
