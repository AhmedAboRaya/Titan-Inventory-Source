/**
 * TITAN INVENTORY — Standalone Test for 1-by-1 Chronological Posting
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
    console.error(`\n[POST FAILED] Doc #${doc.number} [${payload.type}]:`, postRes.body);
    console.error('Lines:', JSON.stringify(payload.lines, null, 2));
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

  const loginRes = await request(`${base}/auth/login`, { method: 'POST' }, {
    username: 'admin',
    password: 'TEST-only-password-4821'
  });
  if (loginRes.status !== 200) throw new Error('Login failed: ' + JSON.stringify(loginRes.body));

  const authHeaders = {
    'Cookie': loginRes.headers['set-cookie'],
    'x-csrf-token': loginRes.body.csrf
  };

  const mgrLogin = await request(`${base}/auth/login`, { method: 'POST' }, {
    username: 'manager',
    password: 'TEST-only-manager-4821'
  });
  if (mgrLogin.status === 200) {
    mgrHeaders = {
      'Cookie': mgrLogin.headers['set-cookie'],
      'x-csrf-token': mgrLogin.body.csrf
    };
  }

  await client.connect();
  const db = client.db();

  // Masters
  const mastersRes = await request(`${base}/masters?all=true`, { headers: authHeaders });
  const masters = mastersRes.body || [];
  const depts = masters.filter(m => m.kind === 'department');
  const emps = masters.filter(m => m.kind === 'employee');
  const supps = masters.filter(m => m.kind === 'supplier');

  const deptMap = {};
  for (const d of depts) {
    deptMap[d.name.toLowerCase()] = d.id;
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

  const suppMap = {};
  for (const s of supps) suppMap[s.name.toLowerCase()] = s.id;
  function resolveSupplier(suppName) {
    if (!suppName) return supps[0]?.id || null;
    const lower = suppName.trim().toLowerCase();
    if (suppMap[lower]) return suppMap[lower];
    for (const [k, v] of Object.entries(suppMap)) {
      if (k.includes(lower) || lower.includes(k)) return v;
    }
    return supps[0]?.id || null;
  }

  const whRes = await request(`${base}/warehouses`, { headers: authHeaders });
  const mainWarehouse = whRes.body.find(w => w.name === 'Main Medical Warehouse') || whRes.body[0];

  const itemsRes = await request(`${base}/items?limit=500`, { headers: authHeaders });
  const titanItems = itemsRes.body || [];
  const itemMap = new Map(titanItems.map(it => [it.sku.toLowerCase(), it]));

  // Ensure all lots from MongoDB lots collection exist
  const mongoLots = await db.collection('lots').find({}).toArray();
  const titanLotMap = new Map();
  for (const it of titanItems) {
    if (!it.track_lot) continue;
    const exLots = (await request(`${base}/lots?item_id=${it.id}`, { headers: authHeaders })).body || [];
    for (const l of exLots) {
      const clean = l.code.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
      titanLotMap.set(`${it.id}:::${clean}`, l.id);
      titanLotMap.set(`${it.id}:::${l.code.toLowerCase()}`, l.id);
    }
  }

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
      const payload = { item_id: it.id, code: cleanLot, notes };
      if (it.track_expiry && ml.expiryDate) payload.expires_on = new Date(ml.expiryDate).toISOString().slice(0, 10);
      else if (it.track_expiry) payload.expires_on = '2027-12-31';

      const lRes = await request(`${base}/lots`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, payload);

      if (lRes.status === 200 || lRes.status === 201) {
        titanLotMap.set(key, lRes.body.id);
        titanLotMap.set(`${it.id}:::${cleanLot.toLowerCase()}`, lRes.body.id);
      }
    }
  }

  function fmtQty(item, val) {
    const p = item ? item.precision : 0;
    return Number(val).toFixed(p);
  }

  async function resolveLotIdForReceipt(item, lotNumber) {
    if (!item.track_lot) return null;
    const rawLot = (lotNumber || '').trim();
    let cleanLot = rawLot.replace(/[^A-Za-z0-9\-\.\_]/g, '').trim().slice(0, 40);
    if (!cleanLot || cleanLot.toUpperCase() === 'N.A' || cleanLot.toUpperCase() === 'NA') {
      cleanLot = 'LOT-' + item.sku.replace(/[^A-Za-z0-9]/g, '');
    }
    const key = `${item.id}:::${cleanLot.replace(/[^A-Za-z0-9]/g, '').toLowerCase()}`;
    if (titanLotMap.has(key)) return titanLotMap.get(key);

    const exLots = (await request(`${base}/lots?item_id=${item.id}`, { headers: authHeaders })).body || [];
    const match = exLots.find(l => l.code.replace(/[^A-Za-z0-9]/g, '').toLowerCase() === cleanLot.replace(/[^A-Za-z0-9]/g, '').toLowerCase());
    if (match) {
      titanLotMap.set(key, match.id);
      return match.id;
    }

    const lotRes = await request(`${base}/lots`, {
      method: 'POST',
      headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
    }, { item_id: item.id, code: cleanLot, notes: 'تشغيلة واردة معتمدة' });
    if (lotRes.status === 200 || lotRes.status === 201) {
      titanLotMap.set(key, lotRes.body.id);
      return lotRes.body.id;
    }

    if (exLots.length > 0) return exLots[0].id;
    return null;
  }

  async function getAvailableLotForIssue(item, requestedLotNumber, qty) {
    if (!item.track_lot) return null;
    const bRes = await request(`${base}/reports/balances`, { headers: authHeaders });
    const allBalances = bRes.body || [];
    const itemPositions = allBalances.filter(b => b.item_id === item.id && b.warehouse_id === mainWarehouse.id && Number(b.available || b.quantity) >= qty);

    if (itemPositions.length === 0) {
      const anyPos = allBalances.filter(b => b.item_id === item.id && b.warehouse_id === mainWarehouse.id && Number(b.available || b.quantity) > 0);
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

  // 4. Ensure October Startup Buffer Document
  const exDocsRes = await request(`${base}/documents?limit=500`, { headers: authHeaders });
  const exDocs = exDocsRes.body || [];
  const hasBuffer = exDocs.some(d => d.reason?.includes('October Startup Buffer') || d.reason?.includes('تسوية حركات'));
  if (!hasBuffer) {
    console.log('Posting October Startup Buffer Document...');
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
      { sku: 'ha37%-pio', qty: 30, lot: 'HA37%01092026' },
      { sku: 'tig50600', qty: 40, lot: 'LH2023278' }
    ];

    const bufferLines = [];
    for (const b of startupBuffer) {
      const it = itemMap.get(b.sku.toLowerCase());
      if (!it) continue;
      const lotId = it.track_lot ? await resolveLotIdForReceipt(it, b.lot) : null;
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
      reason: 'رصيد بداية أكتوبر المعتمد لتسوية حركات الصرف الرسمية (October Startup Buffer)',
      lines: bufferLines
    });
    console.log(`✓ Posted Startup Buffer Doc #${bufDoc.number} (${bufferLines.length} lines)`);
  }

  // Fetch all transactions from Mongo
  const inTx = await db.collection('inventorytransactions').find({ type: 'IN' }).sort({ date: 1 }).toArray();
  const outTx = await db.collection('inventorytransactions').find({
    type: 'OUT',
    date: { $gte: new Date('2026-10-01T00:00:00.000Z'), $lte: new Date('2026-10-31T23:59:59.999Z') }
  }).sort({ date: 1 }).toArray();

  // Combine into single timeline of individual transactions
  const timeline = [];
  for (const t of inTx) {
    const dStr = new Date(t.date).toISOString().slice(0, 10);
    timeline.push({ kind: 'IN', date: dStr, time: new Date(`${dStr}T08:00:00.000Z`).getTime(), tx: t });
  }
  for (const t of outTx) {
    const dStr = new Date(t.date).toISOString().slice(0, 10);
    timeline.push({ kind: 'OUT', date: dStr, time: new Date(`${dStr}T14:00:00.000Z`).getTime(), tx: t });
  }
  timeline.sort((a, b) => a.time - b.time);

  console.log(`Ready to post ${timeline.length} individual vouchers...`);

  // Check existing documents in Titan Inventory to avoid double-posting
  const currentDocsRes = await request(`${base}/documents?limit=500`, { headers: authHeaders });
  const currentDocs = currentDocsRes.body || [];
  const postedTxNums = new Set();
  for (const d of currentDocs) {
    const match = (d.reason || '').match(/\[(IN-\d+|OUT-\d+)\]/);
    if (match) postedTxNums.add(match[1]);
  }
  console.log(`Already posted vouchers in database: ${postedTxNums.size}`);

  let successCount = 0;
  let skipCount = 0;

  for (let i = 0; i < timeline.length; i++) {
    const item = timeline[i];
    const t = item.tx;
    const txNum = t.transactionNumber;

    if (postedTxNums.has(txNum)) {
      skipCount++;
      continue;
    }

    const it = itemMap.get((t.itemCode || '').trim().toLowerCase());
    if (!it) {
      console.error(`Item not found: ${t.itemCode}`);
      continue;
    }

    if (item.kind === 'IN') {
      const suppId = resolveSupplier(t.supplierName || t.supplier);
      const lotId = it.track_lot ? await resolveLotIdForReceipt(it, t.lotNumber) : null;
      const line = {
        item_id: it.id,
        quantity: fmtQty(it, t.quantity),
        unit: it.base_unit,
        quality: 'Accepted',
        condition: 'New',
        notes: `[${txNum}] ${t.notes || ''}`
      };
      if (it.track_lot && lotId) line.lot_id = lotId;

      const doc = await postDoc(base, authHeaders, {
        type: 'receipt',
        document_date: item.date,
        warehouse_id: mainWarehouse.id,
        supplier_id: suppId,
        reason: `استلام بضاعة واردة [${txNum}] - مورد: ${t.supplierName || t.supplier || 'معتمد'} (${t.notes || ''})`,
        lines: [line]
      });
      successCount++;
      postedTxNums.add(txNum);
      console.log(`[${successCount}/${timeline.length}] ✓ Doc #${doc.number} RECEIPT [${txNum}] ${t.itemCode} qty=${t.quantity}`);
    } else {
      // OUT
      const recName = (t.recipientName || 'فني تشغيل').trim();
      const recId = empMap[recName.toLowerCase()] || empMap['فني تشغيل'] || null;
      const deptId = resolveDept(t.departmentName);
      const lotId = it.track_lot ? await getAvailableLotForIssue(it, t.lotNumber, Number(t.quantity)) : null;

      const line = {
        item_id: it.id,
        quantity: fmtQty(it, t.quantity),
        unit: it.base_unit,
        quality: 'Accepted',
        condition: 'New',
        notes: `[${txNum}] تشغيلة: ${t.lotNumber || 'N.A'} | صرف لـ ${recName} (${t.notes || ''})`
      };
      if (it.track_lot && lotId) line.lot_id = lotId;

      const doc = await postDoc(base, authHeaders, {
        type: 'issue',
        document_date: item.date,
        warehouse_id: mainWarehouse.id,
        department_id: deptId,
        recipient_id: recId,
        reason: `إذن صرف مخزني [${txNum}] - مستلم: ${recName} (${t.departmentName || 'عام'})`,
        lines: [line]
      });
      successCount++;
      postedTxNums.add(txNum);
      console.log(`[${successCount}/${timeline.length}] ✓ Doc #${doc.number} ISSUE [${txNum}] ${t.itemCode} qty=${t.quantity} (${recName})`);
    }
  }

  console.log(`\nDONE! Newly Posted: ${successCount}, Skipped already posted: ${skipCount}`);
  await client.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
