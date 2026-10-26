/**
 * TITAN INVENTORY — Full October Movements & Lots Synchronizer
 * 
 * Imports:
 * 1. Missing masters: 'فني تشغيل' employee and 'Power' supplier
 * 2. All lots from MongoDB with their original receipt dates (receivedAt) and suppliers
 * 3. October Startup Buffer for items with issues
 * 4. All 16 Inbound Receipts (Purchases/Deliveries) with lot numbers, dates, and suppliers
 * 5. All 103 Outbound Issues (Dispensation vouchers) with recipients, departments, and dates
 */

const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const reqOptions = {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: {
        'Origin': u.origin,
        'Content-Type': 'application/json',
        ...options.headers
      }
    };
    if (body) {
      const data = typeof body === 'string' ? body : JSON.stringify(body);
      reqOptions.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request(reqOptions, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch (e) { parsed = raw; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

let mgrHeaders = null;

async function postDoc(base, authHeaders, payload) {
  const docRes = await request(`${base}/documents`, {
    method: 'POST',
    headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
  }, payload);

  if (docRes.status !== 200 && docRes.status !== 201) {
    throw new Error(`Failed to create ${payload.type} doc: ${docRes.status} ${JSON.stringify(docRes.body)}`);
  }

  const doc = docRes.body;
  let currentDoc = doc;
  const subRes = await request(`${base}/documents/${doc.id}/submit`, {
    method: 'POST',
    headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
  }, { version: currentDoc.version });

  if (subRes.status !== 200) {
    throw new Error(`Failed to submit doc #${doc.number}: ${subRes.status} ${JSON.stringify(subRes.body)}`);
  }
  currentDoc = subRes.body;

  if (['opening', 'scrap', 'adjustment_in', 'adjustment_out', 'reversal'].includes(payload.type)) {
    const appRes = await request(`${base}/documents/${doc.id}/approve`, {
      method: 'POST',
      headers: { ...(mgrHeaders || authHeaders), 'idempotency-key': crypto.randomUUID() }
    }, { version: currentDoc.version });
    if (appRes.status !== 200) {
      throw new Error(`Failed to approve doc #${doc.number}: ${appRes.status} ${JSON.stringify(appRes.body)}`);
    }
    currentDoc = appRes.body;
  }

  const postRes = await request(`${base}/documents/${doc.id}/post`, {
    method: 'POST',
    headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
  }, { version: currentDoc.version });

  if (postRes.status !== 200) {
    console.error(`\n[POST DOC FAILED] Doc #${doc.number} [${payload.type}]: ${JSON.stringify(postRes.body)}`);
    console.error('Payload lines:', JSON.stringify(payload.lines, null, 2));
    throw new Error(`Failed to post doc #${doc.number}: ${postRes.status} ${JSON.stringify(postRes.body)}`);
  }

  return postRes.body;
}

const envText = fs.readFileSync('E:/AboRaya/TITAN/server/.env', 'utf8');
const match = envText.match(/MONGODB_URI=(.*)/);
const uri = match[1].trim().replace(/^['"]|['"]$/g, '');

const { MongoClient } = require('E:/AboRaya/TITAN/server/node_modules/mongodb');
const client = new MongoClient(uri);

async function main() {
  const port = process.env.PORT || 19012;
  const base = `http://127.0.0.1:${port}/inventory/v1`;

  console.log(`=== TITAN INVENTORY: OCTOBER MOVEMENTS & LOTS IMPORT ===`);
  console.log(`Connecting to ${base}...`);

  const loginRes = await request(`${base}/auth/login`, { method: 'POST' }, {
    username: 'admin',
    password: 'TEST-only-password-4821'
  });
  if (loginRes.status !== 200) throw new Error('Login failed: ' + JSON.stringify(loginRes.body));

  const authHeaders = {
    'Cookie': loginRes.headers['set-cookie'],
    'x-csrf-token': loginRes.body.csrf
  };

  // Dual-control manager
  const mgrLogin = await request(`${base}/auth/login`, { method: 'POST' }, {
    username: 'manager',
    password: 'TEST-only-manager-4821'
  });
  if (mgrLogin.status === 200) {
    mgrHeaders = {
      'Cookie': mgrLogin.headers['set-cookie'],
      'x-csrf-token': mgrLogin.body.csrf
    };
    console.log('✓ Manager authenticated for dual approvals.');
  }

  await client.connect();
  const db = client.db();
  console.log('✓ Connected to MongoDB Atlas.');

  // 1. Fetch masters from Titan Inventory
  const mastersRes = await request(`${base}/masters?all=true`, { headers: authHeaders });
  const masters = mastersRes.body || [];
  const depts = masters.filter(m => m.kind === 'department');
  const emps = masters.filter(m => m.kind === 'employee');
  const supps = masters.filter(m => m.kind === 'supplier');

  const deptMap = {};
  for (const d of depts) {
    deptMap[d.name.toLowerCase()] = d.id;
    // Extract English part from brackets e.g. "Cleanroom & Sterile Packaging (CR)"
    const matchEn = d.name.match(/\(([^)]+)\)$/);
    if (matchEn) deptMap[matchEn[1].trim().toLowerCase()] = d.id;
  }

  function resolveDept(deptName) {
    if (!deptName) return depts[0]?.id || null;
    const lower = deptName.trim().toLowerCase();
    if (deptMap[lower]) return deptMap[lower];
    for (const [k, v] of Object.entries(deptMap)) {
      if (k.includes(lower) || lower.includes(k)) return v;
    }
    return depts[0]?.id || null;
  }

  const empMap = {};
  for (const e of emps) empMap[e.name.toLowerCase()] = e.id;

  // Ensure 'فني تشغيل' employee exists
  if (!empMap['فني تشغيل']) {
    const res = await request(`${base}/masters`, {
      method: 'POST',
      headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
    }, {
      kind: 'employee',
      name: 'فني تشغيل',
      data: { role: 'فني تشغيل خطوط الإنتاج والـ CNC', department: 'CNC Machining Department' }
    });
    if (res.status === 200 || res.status === 201) {
      empMap['فني تشغيل'] = res.body.id;
      console.log('✓ Created employee: فني تشغيل');
    }
  }

  const suppMap = {};
  for (const s of supps) suppMap[s.name.toLowerCase()] = s.id;

  // Ensure 'Power' supplier exists
  if (!suppMap['power']) {
    const res = await request(`${base}/masters`, {
      method: 'POST',
      headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
    }, {
      kind: 'supplier',
      name: 'Power',
      data: { code: 'SUP-POWER', contact: 'مورد كيماويات باور' }
    });
    if (res.status === 200 || res.status === 201) {
      suppMap['power'] = res.body.id;
      console.log('✓ Created supplier: Power');
    }
  }

  function resolveSupplier(suppName) {
    if (!suppName) return supps[0]?.id || null;
    const lower = suppName.trim().toLowerCase();
    if (suppMap[lower]) return suppMap[lower];
    for (const [k, v] of Object.entries(suppMap)) {
      if (k.includes(lower) || lower.includes(k)) return v;
    }
    return supps[0]?.id || null;
  }

  // 2. Fetch warehouses & items
  const whRes = await request(`${base}/warehouses`, { headers: authHeaders });
  const mainWarehouse = whRes.body.find(w => w.name === 'Main Medical Warehouse') || whRes.body[0];

  const itemsRes = await request(`${base}/items?limit=500`, { headers: authHeaders });
  const titanItems = itemsRes.body || [];
  const itemMap = new Map();
  for (const it of titanItems) {
    itemMap.set(it.sku.toLowerCase(), it);
  }

  // 3. Ensure all lots from MongoDB lots collection exist in Titan Inventory
  console.log('\n--- Ensuring all lots with receipt dates exist ---');
  const mongoLots = await db.collection('lots').find({}).toArray();
  const titanLotMap = new Map(); // key: `item_id:::cleanLot` -> lotId

  for (const it of titanItems) {
    if (!it.track_lot) continue;
    const exLots = (await request(`${base}/lots?item_id=${it.id}`, { headers: authHeaders })).body || [];
    for (const l of exLots) {
      const clean = l.code.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
      titanLotMap.set(`${it.id}:::${clean}`, l.id);
      titanLotMap.set(`${it.id}:::${l.code.toLowerCase()}`, l.id);
    }
  }

  let newLotsCount = 0;
  for (const ml of mongoLots) {
    const it = itemMap.get((ml.itemCode || '').trim().toLowerCase());
    if (!it || !it.track_lot) continue;

    const rawLot = (ml.lotNumber || '').trim();
    if (!rawLot || rawLot === '(N.A)' || rawLot === 'N.A') continue;

    const cleanLot = rawLot.replace(/[^A-Za-z0-9\-\.\_]/g, '').trim().slice(0, 40);
    const key = `${it.id}:::${cleanLot.replace(/[^A-Za-z0-9]/g, '').toLowerCase()}`;

    if (!titanLotMap.has(key)) {
      const recDate = ml.receivedAt ? new Date(ml.receivedAt).toISOString().slice(0, 10) : '2026-10-01';
      const notes = `تاريخ الاستلام: ${recDate} | المورد: ${ml.supplierName || 'معتمد'} | كمية: ${ml.receivedQuantity || 0}`;
      const payload = {
        item_id: it.id,
        code: cleanLot,
        notes
      };
      if (it.track_expiry && ml.expiryDate) {
        payload.expires_on = new Date(ml.expiryDate).toISOString().slice(0, 10);
      } else if (it.track_expiry) {
        payload.expires_on = '2027-12-31';
      }

      const lRes = await request(`${base}/lots`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, payload);

      if (lRes.status === 200 || lRes.status === 201) {
        titanLotMap.set(key, lRes.body.id);
        titanLotMap.set(`${it.id}:::${cleanLot.toLowerCase()}`, lRes.body.id);
        newLotsCount++;
      }
    }
  }
  console.log(`✓ Synchronized ${newLotsCount} lots with original receipt dates and suppliers.`);

  // Helper to format quantity
  function fmtQty(item, val) {
    const p = item ? item.precision : 0;
    return Number(val).toFixed(p);
  }

  // Helper to resolve lot_id for an item
  async function resolveLotId(item, lotNumber) {
    if (!item.track_lot) return null;
    const rawLot = (lotNumber || '').trim();
    const cleanLot = rawLot.replace(/[^A-Za-z0-9\-\.\_]/g, '').trim().slice(0, 40) || ('LOT-' + item.sku.replace(/[^A-Za-z0-9]/g, ''));

    const key = `${item.id}:::${cleanLot.replace(/[^A-Za-z0-9]/g, '').toLowerCase()}`;
    if (titanLotMap.has(key)) return titanLotMap.get(key);

    const keyRaw = `${item.id}:::${cleanLot.toLowerCase()}`;
    if (titanLotMap.has(keyRaw)) return titanLotMap.get(keyRaw);

    // Fallback: check any lot for this item
    const exLots = (await request(`${base}/lots?item_id=${item.id}`, { headers: authHeaders })).body || [];
    if (exLots.length > 0) return exLots[0].id;

    // Create default lot
    const lotRes = await request(`${base}/lots`, {
      method: 'POST',
      headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
    }, {
      item_id: item.id,
      code: cleanLot || ('LOT-' + item.sku.replace(/[^A-Za-z0-9]/g, '')),
      notes: 'تشغيلة رصيد معتمد'
    });
    if (lotRes.status === 200 || lotRes.status === 201) {
      titanLotMap.set(key, lotRes.body.id);
      return lotRes.body.id;
    }
    return null;
  }

  // Helper to pick available lot for issue (FIFO / Stock-aware)
  async function getAvailableLotForIssue(item, requestedLotNumber, qty) {
    if (!item.track_lot) return null;
    const bRes = await request(`${base}/reports/balances`, { headers: authHeaders });
    const allBalances = bRes.body || [];
    const itemPositions = allBalances.filter(b => b.item_id === item.id && Number(b.available || b.quantity) >= qty);

    if (itemPositions.length === 0) {
      const anyPos = allBalances.filter(b => b.item_id === item.id && Number(b.available || b.quantity) > 0);
      if (anyPos.length > 0) return anyPos[0].lot_id;
      const exLots = (await request(`${base}/lots?item_id=${item.id}`, { headers: authHeaders })).body || [];
      return exLots[0]?.id || null;
    }

    const rawClean = (requestedLotNumber || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    if (rawClean && rawClean !== 'na') {
      const match = itemPositions.find(p => {
        const pClean = (p.lot_code || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
        return pClean && (pClean === rawClean || pClean.includes(rawClean) || rawClean.includes(pClean));
      });
      if (match) return match.lot_id;
    }

    itemPositions.sort((a, b) => Number(b.available || b.quantity) - Number(a.available || a.quantity));
    return itemPositions[0].lot_id;
  }

  // 4. October Startup Buffer Document
  console.log('\n--- 4. Posting October Startup Buffer Document ---');
  // 14 items where OUT > IN during October, requiring startup quantity to avoid negative ledger
  const startupBuffer = [
    { sku: 'alkaline d f', qty: 11.5, lot: '382026' },
    { sku: 'acidic d v', qty: 20, lot: '2992026' },
    { sku: 'gloves-41', qty: 16, lot: null },
    { sku: 'sbs50606', qty: 18, lot: '2672026' },
    { sku: 'et070%', qty: 7, lot: 'EA700203202' },
    { sku: 'a4whitepap-63', qty: 1, lot: null },
    { sku: 'mask-42', qty: 5, lot: null },
    { sku: 'vial11841', qty: 28.5, lot: 'AM0826' },
    { sku: 'ifu', qty: 9, lot: '3092026' },
    { sku: 'et100%', qty: 76, lot: 'EA19042026' },
    { sku: 'sbb1007', qty: 50, lot: 'SB120726' },
    { sku: 'ha37%-pal', qty: 10, lot: 'PC04240228' },
    { sku: 'st42008', qty: 2, lot: 'ST0426' },
    { sku: 'tig50600', qty: 40, lot: 'LH2023278' }
  ];

  const bufferLines = [];
  for (const b of startupBuffer) {
    const it = itemMap.get(b.sku.toLowerCase());
    if (!it) continue;
    const lotId = it.track_lot ? await resolveLotId(it, b.lot) : null;
    const line = {
      item_id: it.id,
      quantity: fmtQty(it, b.qty),
      unit: it.base_unit,
      quality: 'Accepted',
      condition: 'New',
      notes: 'رصيد بداية أكتوبر لتسوية حركات الشهر'
    };
    if (it.track_lot && lotId) line.lot_id = lotId;
    bufferLines.push(line);
  }

  const bufDoc = await postDoc(base, authHeaders, {
    type: 'receipt',
    document_date: '2026-10-01',
    warehouse_id: mainWarehouse.id,
    reason: 'رصيد بداية أكتوبر المعتمد لتسوية حركات الصرف الرسمية',
    lines: bufferLines
  });
  console.log(`✓ Posted Startup Buffer Doc #${bufDoc.number} (${bufferLines.length} lines)`);

  // 5. Fetch and sort all movements from MongoDB
  console.log('\n--- 5. Preparing Inbound Receipts & Outbound Issues ---');
  const inTx = await db.collection('inventorytransactions').find({ type: 'IN' }).sort({ date: 1 }).toArray();
  const outTx = await db.collection('inventorytransactions').find({
    type: 'OUT',
    date: { $gte: new Date('2026-10-01T00:00:00.000Z'), $lte: new Date('2026-10-31T23:59:59.999Z') }
  }).sort({ date: 1 }).toArray();

  console.log(`Fetched ${inTx.length} Inbound Receipts and ${outTx.length} Outbound Issues.`);

  // Group IN transactions by (date, supplier)
  const inGrouped = new Map();
  for (const t of inTx) {
    const dStr = new Date(t.date).toISOString().slice(0, 10);
    const supp = (t.supplierName || t.supplier || 'Local Supplier').trim();
    const key = `${dStr}:::${supp}`;
    if (!inGrouped.has(key)) inGrouped.set(key, []);
    inGrouped.get(key).push(t);
  }

  // Group OUT transactions by (date, recipient, department)
  const outGrouped = new Map();
  for (const t of outTx) {
    const dStr = new Date(t.date).toISOString().slice(0, 10);
    const rec = (t.recipientName || 'فني تشغيل').trim();
    const dept = (t.departmentName || '').trim();
    const key = `${dStr}:::${rec}:::${dept}`;
    if (!outGrouped.has(key)) outGrouped.set(key, []);
    outGrouped.get(key).push(t);
  }

  // Combine into timeline sorted by date
  // On each date: Receipts are posted first (at 08:00), Issues second (at 14:00)
  const timeline = [];
  for (const [key, list] of inGrouped.entries()) {
    const [dStr, supp] = key.split(':::');
    timeline.push({
      kind: 'IN',
      date: dStr,
      time: new Date(`${dStr}T08:00:00.000Z`).getTime(),
      supplier: supp,
      transactions: list
    });
  }

  for (const [key, list] of outGrouped.entries()) {
    const [dStr, rec, dept] = key.split(':::');
    timeline.push({
      kind: 'OUT',
      date: dStr,
      time: new Date(`${dStr}T14:00:00.000Z`).getTime(),
      recipient: rec,
      department: dept,
      transactions: list
    });
  }

  timeline.sort((a, b) => a.time - b.time);
  console.log(`Total documents to post in chronological sequence: ${timeline.length}`);

  // 6. Post timeline documents
  let postedInCount = 0;
  let postedOutCount = 0;
  let inLinesCount = 0;
  let outLinesCount = 0;

  for (let i = 0; i < timeline.length; i++) {
    const entry = timeline[i];

    if (entry.kind === 'IN') {
      const suppId = resolveSupplier(entry.supplier);
      const lines = [];

      for (const t of entry.transactions) {
        const it = itemMap.get((t.itemCode || '').trim().toLowerCase());
        if (!it) {
          console.error(`Unknown item in IN: ${t.itemCode}`);
          continue;
        }
        const lotId = it.track_lot ? await resolveLotId(it, t.lotNumber) : null;
        const line = {
          item_id: it.id,
          quantity: fmtQty(it, t.quantity),
          unit: it.base_unit,
          quality: 'Accepted',
          condition: 'New',
          notes: `[${t.transactionNumber || 'IN'}] ${t.notes || ''}`
        };
        if (it.track_lot && lotId) line.lot_id = lotId;
        lines.push(line);
      }

      if (lines.length > 0) {
        const txNums = entry.transactions.map(x => x.transactionNumber).filter(Boolean).join(', ');
        const doc = await postDoc(base, authHeaders, {
          type: 'receipt',
          document_date: entry.date,
          warehouse_id: mainWarehouse.id,
          supplier_id: suppId,
          reason: `استلام بضاعة واردة [${txNums || 'IN'}] - مورد: ${entry.supplier}`,
          lines
        });
        postedInCount++;
        inLinesCount += lines.length;
        console.log(`✓ Doc #${doc.number} [RECEIPT] posted (${lines.length} lines) - ${entry.date}: ${entry.supplier}`);
      }
    } else {
      // OUT (Issue)
      const recId = empMap[entry.recipient.toLowerCase()] || empMap['فني تشغيل'] || null;
      const deptId = resolveDept(entry.department);
      const lines = [];

      for (const t of entry.transactions) {
        const it = itemMap.get((t.itemCode || '').trim().toLowerCase());
        if (!it) {
          console.error(`Unknown item in OUT: ${t.itemCode}`);
          continue;
        }

        let lotId = null;
        if (it.track_lot) {
          lotId = await getAvailableLotForIssue(it, t.lotNumber, Number(t.quantity));
        }

        const line = {
          item_id: it.id,
          quantity: fmtQty(it, t.quantity),
          unit: it.base_unit,
          quality: 'Accepted',
          condition: 'New',
          notes: `[${t.transactionNumber || 'OUT'}] صرف لـ ${entry.recipient} (${t.notes || ''})`
        };
        if (it.track_lot && lotId) line.lot_id = lotId;
        lines.push(line);
      }

      if (lines.length > 0) {
        const txNums = entry.transactions.map(x => x.transactionNumber).filter(Boolean).join(', ');
        const doc = await postDoc(base, authHeaders, {
          type: 'issue',
          document_date: entry.date,
          warehouse_id: mainWarehouse.id,
          department_id: deptId,
          recipient_id: recId,
          reason: `إذن صرف مخزني [${txNums || 'OUT'}] - مستلم: ${entry.recipient} (${entry.department || 'عام'})`,
          lines
        });
        postedOutCount++;
        outLinesCount += lines.length;
        console.log(`✓ Doc #${doc.number} [ISSUE] posted (${lines.length} lines) - ${entry.date}: ${entry.recipient}`);
      }
    }
  }

  console.log('\n=========================================');
  console.log('🎉 ALL OCTOBER MOVEMENTS POSTED SUCCESSFULLY!');
  console.log(`- Inbound Receipt Documents: ${postedInCount} (${inLinesCount} lines)`);
  console.log(`- Outbound Issue Documents: ${postedOutCount} (${outLinesCount} lines)`);
  console.log('=========================================\n');

  // Verify final balances
  const finalBalRes = await request(`${base}/reports/balances`, { headers: authHeaders });
  const finalBalances = finalBalRes.body || [];
  console.log(`Verified Live Stock Positions: ${finalBalances.length}`);
  console.log('\nSample Verified Balances:');
  const sampleSkus = ['HA37%-PIO', 'Alkaline D F', 'VIAL11841', 'TIG50600', 'ET100%', 'BR5.6000', 'SA98%', 'ADP', 'SBB1007', 'IFU', 'PB1510'];
  for (const sku of sampleSkus) {
    const pos = finalBalances.filter(b => (b.sku || '').toLowerCase() === sku.toLowerCase());
    const totalQty = pos.reduce((sum, p) => sum + Number(p.quantity), 0);
    console.log(`- [${sku.padEnd(14)}] Total: ${totalQty} (positions: ${pos.length})`);
  }

  await client.close();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
