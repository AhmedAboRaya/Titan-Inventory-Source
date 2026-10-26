const fs = require('fs');

const envText = fs.readFileSync('E:/AboRaya/TITAN/server/.env', 'utf8');
const match = envText.match(/MONGODB_URI=(.*)/);
const uri = match[1].trim().replace(/^['"]|['"]$/g, '');

const { MongoClient } = require('E:/AboRaya/TITAN/server/node_modules/mongodb');
const client = new MongoClient(uri);

async function run() {
  await client.connect();
  const db = client.db();

  for (const itemCode of ['HA37%-PIO', 'Alkaline D F', 'VIAL11841']) {
    console.log(`\n================= ${itemCode} =================`);
    const txs = await db.collection('inventorytransactions')
      .find({ itemCode })
      .sort({ date: 1 })
      .toArray();

    console.log(`Total transactions in MongoDB: ${txs.length}`);
    let balance = 0;
    for (const t of txs) {
      const d = t.date ? new Date(t.date).toISOString().slice(0, 10) : 'NO_DATE';
      const qty = Number(t.quantity);
      if (t.type === 'OPENING_BALANCE') {
        balance = qty;
        console.log(`  [${t.type}] date=${d} num=${t.transactionNumber} lot=${t.lotNumber} qty=${qty} => BALANCE=${balance}`);
      } else if (t.type === 'IN') {
        balance += qty;
        console.log(`  [${t.type}] date=${d} num=${t.transactionNumber} lot=${t.lotNumber} qty=+${qty} => BALANCE=${balance}`);
      } else if (t.type === 'OUT') {
        balance -= qty;
        console.log(`  [${t.type}] date=${d} num=${t.transactionNumber} lot=${t.lotNumber} qty=-${qty} => BALANCE=${balance}`);
      } else {
        balance += qty;
        console.log(`  [${t.type}] date=${d} num=${t.transactionNumber} qty=${qty} => BALANCE=${balance}`);
      }
    }

    // Check lots in MongoDB for this item
    const lots = await db.collection('lots').find({ itemCode }).toArray();
    console.log(`Lots in MongoDB (${lots.length}):`);
    lots.forEach(l => {
      console.log(`  lotNumber="${l.lotNumber}" recQty=${l.receivedQuantity} curQty=${l.currentQuantity} recAt=${l.receivedAt ? new Date(l.receivedAt).toISOString().slice(0, 10) : ''} status=${l.status}`);
    });
  }

  await client.close();
}

run().catch(console.error);
