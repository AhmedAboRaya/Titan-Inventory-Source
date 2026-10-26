const fs = require('fs');

const envText = fs.readFileSync('E:/AboRaya/TITAN/server/.env', 'utf8');
const match = envText.match(/MONGODB_URI=(.*)/);
const uri = match[1].trim().replace(/^['"]|['"]$/g, '');

const { MongoClient } = require('E:/AboRaya/TITAN/server/node_modules/mongodb');
const client = new MongoClient(uri);

async function run() {
  await client.connect();
  const db = client.db();

  const opb = await db.collection('inventorytransactions').find({ type: 'OPENING_BALANCE' }).toArray();
  const inTx = await db.collection('inventorytransactions').find({ type: 'IN' }).toArray();
  const outTx = await db.collection('inventorytransactions').find({
    type: 'OUT',
    date: { $gte: new Date('2026-10-01T00:00:00.000Z'), $lte: new Date('2026-10-31T23:59:59.999Z') }
  }).toArray();
  const adjTx = await db.collection('inventorytransactions').find({ type: 'ADJUSTMENT' }).toArray();

  console.log(`Loaded: ${opb.length} OPB, ${inTx.length} IN, ${outTx.length} OUT, ${adjTx.length} ADJ`);

  // Build timeline
  // OPB at 2026-10-01T06:00:00.000Z
  const timeline = [];
  for (const t of opb) {
    timeline.push({ ...t, kind: 'OPB', time: new Date(t.date || '2026-10-01T06:00:00.000Z').getTime() });
  }
  for (const t of inTx) {
    // receipts at start of day 08:00:00 so they happen before issues on the same day
    const dStr = new Date(t.date).toISOString().slice(0, 10);
    timeline.push({ ...t, kind: 'IN', time: new Date(`${dStr}T08:00:00.000Z`).getTime() });
  }
  for (const t of outTx) {
    const dStr = new Date(t.date).toISOString().slice(0, 10);
    timeline.push({ ...t, kind: 'OUT', time: new Date(`${dStr}T14:00:00.000Z`).getTime() });
  }
  for (const t of adjTx) {
    const dStr = new Date(t.date).toISOString().slice(0, 10);
    timeline.push({ ...t, kind: 'ADJ', time: new Date(`${dStr}T18:00:00.000Z`).getTime() });
  }

  timeline.sort((a, b) => a.time - b.time);

  // Track stock per item
  const stock = new Map();
  const lotStock = new Map();
  const errors = [];

  for (let i = 0; i < timeline.length; i++) {
    const tx = timeline[i];
    const code = (tx.itemCode || '').trim();
    const qty = Number(tx.quantity);
    const lot = (tx.lotNumber || 'NOLOT').trim();
    const lotKey = `${code}:::${lot}`;

    if (tx.kind === 'OPB') {
      stock.set(code, (stock.get(code) || 0) + qty);
      lotStock.set(lotKey, (lotStock.get(lotKey) || 0) + qty);
    } else if (tx.kind === 'IN') {
      stock.set(code, (stock.get(code) || 0) + qty);
      lotStock.set(lotKey, (lotStock.get(lotKey) || 0) + qty);
    } else if (tx.kind === 'OUT') {
      const cur = stock.get(code) || 0;
      if (cur < qty) {
        errors.push(`Step ${i+1}: OUT ${code} qty=${qty} but stock=${cur} (date=${new Date(tx.time).toISOString().slice(0, 10)})`);
      }
      stock.set(code, cur - qty);

      const curLot = lotStock.get(lotKey) || 0;
      if (curLot < qty) {
        // Find if other lots have stock
        let otherLotStock = 0;
        for (const [k, v] of lotStock.entries()) {
          if (k.startsWith(`${code}:::`)) otherLotStock += v;
        }
        // console.log(`  Lot deficit for ${code} lot=${lot} (cur=${curLot}, req=${qty}), item total available=${cur}`);
      }
      lotStock.set(lotKey, curLot - qty);
    } else if (tx.kind === 'ADJ') {
      // adjustment qty can be negative or positive
      const cur = stock.get(code) || 0;
      stock.set(code, cur + qty);
    }
  }

  console.log(`\nTimeline replay complete! Total errors: ${errors.length}`);
  errors.forEach(e => console.log('ERROR:', e));

  // Print final balances for key items
  console.log('\nFinal balances after October replay:');
  ['HA37%-PIO', 'Alkaline D F', 'VIAL11841', 'TIG50600', 'ET100%', 'BR5.6000', 'SA98%', 'ADP', 'SBB1007', 'IFU'].forEach(code => {
    console.log(`  ${code}: ${stock.get(code)}`);
  });

  await client.close();
}

run().catch(console.error);
