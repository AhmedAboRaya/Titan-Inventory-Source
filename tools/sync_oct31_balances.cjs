/**
 * TITAN INVENTORY — October 31, 2026 Database Synchronization
 * Reconciles the system to match the exact 102 balances from TITAN INVENTORY · balances (Oct 31, 2026).
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const reqOptions = {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: { 'Origin': u.origin, ...options.headers }
    };
    if (body) {
      const data = typeof body === 'string' ? body : JSON.stringify(body);
      reqOptions.headers['Content-Type'] = 'application/json';
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

async function postDoc(base, authHeaders, payload) {
  const docRes = await request(`${base}/documents`, {
    method: 'POST',
    headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
  }, payload);

  if (docRes.status !== 200 && docRes.status !== 201) {
    throw new Error(`Failed to create ${payload.type} doc: ${docRes.status} ${JSON.stringify(docRes.body)}`);
  }

  const doc = docRes.body;
  const submitRes = await request(`${base}/documents/${doc.id}/submit`, {
    method: 'POST',
    headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
  }, { version: doc.version });

  if (submitRes.status !== 200) {
    throw new Error(`Failed to submit doc #${doc.number}: ${submitRes.status} ${JSON.stringify(submitRes.body)}`);
  }

  const postRes = await request(`${base}/documents/${doc.id}/post`, {
    method: 'POST',
    headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
  }, { version: submitRes.body.version });

  if (postRes.status !== 200) {
    throw new Error(`Failed to post doc #${doc.number}: ${postRes.status} ${JSON.stringify(postRes.body)}`);
  }

  return postRes.body;
}

async function syncOct31Balances(base, authHeaders) {
  console.log('\n======================================================');
  console.log('🔄 STARTING OCTOBER 31, 2026 DATABASE RECONCILIATION');
  console.log('======================================================\n');

  const targetFile = path.resolve(__dirname, 'target_pdf_balances.json');
  if (!fs.existsSync(targetFile)) {
    throw new Error('Target balances file not found: ' + targetFile);
  }
  const targetBalances = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
  console.log(`Loaded ${targetBalances.length} target balances from PDF.`);

  // 1. Ensure Warehouses exist
  console.log('\n--- 1. Ensuring Warehouses ---');
  const whRes = await request(`${base}/warehouses?all=true`, { headers: authHeaders });
  const allWhs = whRes.body || [];

  let mainWh = allWhs.find(w => w.name === 'Main Medical Warehouse');
  let licensedWh = allWhs.find(w => w.name === 'Licensed warehouse 244');
  let unlicensedWh = allWhs.find(w => w.name === 'Unlicensed warehouse 815');

  if (!unlicensedWh) {
    console.log('Creating Unlicensed warehouse 815...');
    const createWh = await request(`${base}/warehouses`, {
      method: 'POST',
      headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
    }, {
      name: 'Unlicensed warehouse 815',
      site_id: null,
      active: true
    });
    unlicensedWh = createWh.body;
    console.log(`✓ Created Unlicensed warehouse 815 (${unlicensedWh.id})`);
  } else {
    console.log(`✓ Unlicensed warehouse 815 exists (${unlicensedWh.id})`);
  }

  const whMap = {
    'Main Medical Warehouse': mainWh,
    'Licensed warehouse 244': licensedWh,
    'Unlicensed warehouse 815': unlicensedWh
  };

  // 2. Fetch master records (departments, employees, suppliers)
  const deptsRes = await request(`${base}/masters?kind=department`, { headers: authHeaders });
  const allDepts = deptsRes.body || [];
  const defaultDept = allDepts.find(d => d.name.includes('CNC')) || allDepts[0];

  const empsRes = await request(`${base}/masters?kind=employee`, { headers: authHeaders });
  const allEmps = empsRes.body || [];
  const defaultEmp = allEmps.find(e => e.name.includes('Farahat') || e.name.includes('Shams')) || allEmps[0];

  const suppsRes = await request(`${base}/masters?kind=supplier`, { headers: authHeaders });
  const allSupps = suppsRes.body || [];
  const defaultSupp = allSupps.find(s => s.name.includes('Imported') || s.name.includes('Local')) || allSupps[0];

  // 3. Fetch all Items & Lots
  console.log('\n--- 2. Fetching Items and Lots ---');
  const itemsRes = await request(`${base}/items?limit=500`, { headers: authHeaders });
  const items = itemsRes.body || [];
  const itemMap = new Map();
  for (const it of items) {
    itemMap.set(it.sku, it);
  }

  // Helper to ensure lot exists
  async function ensureLot(item, lotCode) {
    if (!item.track_lot || !lotCode) return null;
    const lotsRes = await request(`${base}/lots?item_id=${item.id}`, { headers: authHeaders });
    const lots = lotsRes.body || [];
    let lot = lots.find(l => l.code === lotCode);
    if (!lot) {
      const createLot = await request(`${base}/lots`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, {
        item_id: item.id,
        code: lotCode,
        notes: `لوت رصيد 31 أكتوبر 2026 (${lotCode})`
      });
      lot = createLot.body;
      console.log(`  ✓ Created lot [${lotCode}] for item [${item.sku}]`);
    }
    return lot.id;
  }

  // 3. Current Balances
  console.log('\n--- 3. Analyzing Current Balances vs Target ---');
  const curBalRes = await request(`${base}/reports/balances?limit=1000`, { headers: authHeaders });
  const currentBalances = curBalRes.body || [];

  const makeKey = (b) => [b.sku, b.warehouse_name || b.wh, b.lot_code || b.lot].join(' | ');
  const currentMap = new Map();
  for (const c of currentBalances) {
    currentMap.set(makeKey(c), c);
  }

  const targetMap = new Map();
  for (const t of targetBalances) {
    targetMap.set(makeKey(t), t);
  }

  // Check if we need lot name adjustment for TIG50400 & TIG50800 in Licensed warehouse 244
  const oldLot400 = currentMap.get('TIG50400 | Licensed warehouse 244 | 24-GR5-26#');
  const oldLot800 = currentMap.get('TIG50800 | Licensed warehouse 244 | 24-GR5-26#');

  if (oldLot400 || oldLot800) {
    console.log('Fixing lot code GR5-26#-24 in Licensed warehouse 244...');
    const it400 = itemMap.get('TIG50400');
    const it800 = itemMap.get('TIG50800');
    const newLot400Id = await ensureLot(it400, 'GR5-26#-24');
    const newLot800Id = await ensureLot(it800, 'GR5-26#-24');

    // 1) Adjust out old lot
    const outLines = [];
    if (oldLot400) {
      outLines.push({
        item_id: it400.id,
        lot_id: oldLot400.lot_id,
        quantity: String(oldLot400.quantity),
        unit: it400.base_unit,
        quality: 'Accepted',
        condition: 'New',
        notes: 'تصحيح مسمى كود اللوت'
      });
    }
    if (oldLot800) {
      outLines.push({
        item_id: it800.id,
        lot_id: oldLot800.lot_id,
        quantity: String(oldLot800.quantity),
        unit: it800.base_unit,
        quality: 'Accepted',
        condition: 'New',
        notes: 'تصحيح مسمى كود اللوت'
      });
    }

    if (outLines.length > 0) {
      await postDoc(base, authHeaders, {
        type: 'issue',
        document_date: '2026-10-31',
        warehouse_id: licensedWh.id,
        department_id: defaultDept.id,
        recipient_id: defaultEmp.id,
        reason: 'تسوية خروج لتصحيح مسمى اللوت من 24-GR5-26# إلى GR5-26#-24',
        lines: outLines
      });
    }

    // 2) Adjust in new lot
    const inLines = [];
    if (oldLot400) {
      inLines.push({
        item_id: it400.id,
        lot_id: newLot400Id,
        quantity: String(oldLot400.quantity),
        unit: it400.base_unit,
        quality: 'Accepted',
        condition: 'New',
        notes: 'تصحيح مسمى كود اللوت GR5-26#-24'
      });
    }
    if (oldLot800) {
      inLines.push({
        item_id: it800.id,
        lot_id: newLot800Id,
        quantity: String(oldLot800.quantity),
        unit: it800.base_unit,
        quality: 'Accepted',
        condition: 'New',
        notes: 'تصحيح مسمى كود اللوت GR5-26#-24'
      });
    }

    if (inLines.length > 0) {
      await postDoc(base, authHeaders, {
        type: 'receipt',
        document_date: '2026-10-31',
        warehouse_id: licensedWh.id,
        supplier_id: defaultSupp.id,
        reason: 'تسوية إضافة برقم اللوت الصحيح GR5-26#-24 طبقاً لمطابقة المخزن المرخص',
        lines: inLines
      });
    }
    console.log('✓ Fixed lot code to GR5-26#-24.');
  }

  // Refresh balances
  const refreshBalRes = await request(`${base}/reports/balances?limit=1000`, { headers: authHeaders });
  const activeBalances = refreshBalRes.body || [];
  const activeMap = new Map();
  for (const c of activeBalances) {
    activeMap.set(makeKey(c), c);
  }

  // 4. Handle Transfers from Main Medical Warehouse to Unlicensed warehouse 815
  console.log('\n--- 4. Handling Unlicensed warehouse 815 items ---');
  const unlicensedTargets = targetBalances.filter(t => t.wh === 'Unlicensed warehouse 815');
  const transferLines = [];
  const directInLines = [];

  for (const ut of unlicensedTargets) {
    const curIn815 = activeMap.get(makeKey(ut));
    const curQtyIn815 = curIn815 ? Number(curIn815.quantity) : 0;
    const needed = ut.qty - curQtyIn815;

    if (needed > 0) {
      const it = itemMap.get(ut.sku);
      const lotId = await ensureLot(it, ut.lot);

      // Check if Main Medical Warehouse has this item & lot to transfer
      const mainBalKey = [ut.sku, 'Main Medical Warehouse', ut.lot].join(' | ');
      const curInMain = activeMap.get(mainBalKey);
      const availInMain = curInMain ? Number(curInMain.quantity) : 0;

      if (availInMain >= needed) {
        transferLines.push({
          item_id: it.id,
          lot_id: lotId,
          quantity: String(needed),
          unit: it.base_unit,
          quality: 'Accepted',
          condition: 'New',
          notes: `تحويل لمخزن غير مرخص 815 (${ut.lot})`
        });
      } else {
        // If not enough in Main, receive directly or adjust in
        directInLines.push({
          item_id: it.id,
          lot_id: lotId,
          quantity: String(needed),
          unit: it.base_unit,
          quality: 'Accepted',
          condition: 'New',
          notes: `رصيد استلام مخزن غير مرخص 815 (${ut.lot})`
        });
      }
    }
  }

  if (transferLines.length > 0) {
    console.log(`Posting transfer document of ${transferLines.length} items to Unlicensed warehouse 815...`);
    const doc = await postDoc(base, authHeaders, {
      type: 'transfer',
      document_date: '2026-10-31',
      warehouse_id: mainWh.id,
      destination_warehouse_id: unlicensedWh.id,
      reason: 'إذن تحويل أصناف رولات وأجهزة إلى المخزن غير المرخص 815 طبقاً لمحضر المطابقة',
      lines: transferLines
    });
    console.log(`✓ Transfer Doc #${doc.number} posted.`);
  }

  if (directInLines.length > 0) {
    console.log(`Posting receipt for ${directInLines.length} items in Unlicensed warehouse 815...`);
    const doc = await postDoc(base, authHeaders, {
      type: 'receipt',
      document_date: '2026-10-31',
      warehouse_id: unlicensedWh.id,
      supplier_id: defaultSupp.id,
      reason: 'رصيد افتتاحي معتمد لمخزن غير مرخص 815',
      lines: directInLines
    });
    console.log(`✓ Receipt Doc #${doc.number} posted.`);
  }

  // 5. Final Reconciliation across all warehouses
  console.log('\n--- 5. General Balances Reconciliation to match 102 rows ---');
  const balResAfterTransfer = await request(`${base}/reports/balances?limit=1000`, { headers: authHeaders });
  const midBalances = balResAfterTransfer.body || [];
  const midMap = new Map();
  for (const c of midBalances) {
    midMap.set(makeKey(c), c);
  }

  // Group reconciliations by warehouse
  const adjInByWh = {
    [mainWh.id]: [],
    [licensedWh.id]: [],
    [unlicensedWh.id]: []
  };
  const adjOutByWh = {
    [mainWh.id]: [],
    [licensedWh.id]: [],
    [unlicensedWh.id]: []
  };

  // Check all target balances
  for (const target of targetBalances) {
    const key = makeKey(target);
    const cur = midMap.get(key);
    const curQty = cur ? Number(cur.quantity) : 0;
    const diff = Number((target.qty - curQty).toFixed(6));
    const whObj = whMap[target.wh];
    const it = itemMap.get(target.sku);
    const lotId = await ensureLot(it, target.lot);

    if (diff > 0.000001) {
      adjInByWh[whObj.id].push({
        item_id: it.id,
        lot_id: lotId,
        quantity: String(diff),
        unit: it.base_unit,
        quality: 'Accepted',
        condition: 'New',
        notes: `تسوية زيادة جردية طبقاً لمحضر 31 أكتوبر 2026 [${target.sku}] (+${diff})`
      });
    } else if (diff < -0.000001) {
      adjOutByWh[whObj.id].push({
        item_id: it.id,
        lot_id: cur ? cur.lot_id : lotId,
        quantity: String(Math.abs(diff)),
        unit: it.base_unit,
        quality: 'Accepted',
        condition: 'New',
        notes: `تسوية صرف/عجز جردي طبقاً لمحضر 31 أكتوبر 2026 [${target.sku}] (-${Math.abs(diff)})`
      });
    }
  }

  // Check extra rows currently in DB that shouldn't be in target (zero them out)
  for (const [key, cur] of midMap.entries()) {
    if (!targetMap.has(key) && Number(cur.quantity) > 0) {
      const whObj = allWhs.find(w => w.name === cur.warehouse_name) || mainWh;
      const it = itemMap.get(cur.sku);
      adjOutByWh[whObj.id].push({
        item_id: it.id,
        lot_id: cur.lot_id,
        quantity: String(cur.quantity),
        unit: cur.base_unit,
        quality: cur.quality,
        condition: cur.condition,
        notes: `تسوية تصفير رصيد غير مدرج بمحضر 31 أكتوبر 2026 [${cur.sku}]`
      });
    }
  }

  // Post any needed adjustments
  for (const [whId, lines] of Object.entries(adjOutByWh)) {
    if (lines.length > 0) {
      const whName = allWhs.find(w => w.id === whId)?.name || whId;
      console.log(`Posting issue (${lines.length} lines) in ${whName}...`);
      const doc = await postDoc(base, authHeaders, {
        type: 'issue',
        document_date: '2026-10-31',
        warehouse_id: whId,
        department_id: defaultDept.id,
        recipient_id: defaultEmp.id,
        reason: `محضر تسوية الفروق الجردية والصرف الفعلي حتى 31 أكتوبر 2026 - ${whName} (صرف تسوية)`,
        lines
      });
      console.log(`✓ Issue Doc #${doc.number} posted.`);
    }
  }

  for (const [whId, lines] of Object.entries(adjInByWh)) {
    if (lines.length > 0) {
      const whName = allWhs.find(w => w.id === whId)?.name || whId;
      console.log(`Posting receipt (${lines.length} lines) in ${whName}...`);
      const doc = await postDoc(base, authHeaders, {
        type: 'receipt',
        document_date: '2026-10-31',
        warehouse_id: whId,
        supplier_id: defaultSupp.id,
        reason: `محضر تسوية الفروق الجردية والاستلام الفعلي حتى 31 أكتوبر 2026 - ${whName} (استلام تسوية)`,
        lines
      });
      console.log(`✓ Receipt Doc #${doc.number} posted.`);
    }
  }

  // 6. Verify final matches 100%
  console.log('\n======================================================');
  console.log('🔍 FINAL VERIFICATION: PDF vs DATABASE BALANCES');
  console.log('======================================================');

  const finalRes = await request(`${base}/reports/balances?limit=1000`, { headers: authHeaders });
  const finalBalances = finalRes.body || [];
  console.log(`Total Live Balances Count: ${finalBalances.length} (Target: ${targetBalances.length})`);

  const finalMap = new Map();
  for (const f of finalBalances) {
    finalMap.set(makeKey(f), f);
  }

  let perfect = true;
  let matchCount = 0;

  for (const t of targetBalances) {
    const key = makeKey(t);
    const f = finalMap.get(key);
    if (!f) {
      console.error(`❌ MISSING IN DB: ${key} (Expected: ${t.qty})`);
      perfect = false;
    } else if (Number(f.quantity) !== Number(t.qty)) {
      console.error(`❌ QTY MISMATCH: ${key} (DB: ${f.quantity}, Expected: ${t.qty})`);
      perfect = false;
    } else {
      matchCount++;
    }
  }

  for (const [key, f] of finalMap.entries()) {
    if (!targetMap.has(key)) {
      console.error(`❌ EXTRA IN DB: ${key} (Qty: ${f.quantity})`);
      perfect = false;
    }
  }

  if (perfect && matchCount === 102 && finalBalances.length === 102) {
    console.log(`\n🎉 PERFECT 100% MATCH! ALL 102 BALANCES EXACTLY MATCH THE USER'S PDF!`);
    console.log(`- Main Medical Warehouse: 86 balances`);
    console.log(`- Licensed warehouse 244: 6 balances`);
    console.log(`- Unlicensed warehouse 815: 10 balances`);
    console.log(`- Total live balance rows: 102 rows`);
  } else {
    console.warn(`\n⚠️ Verification finished with mismatch count: ${102 - matchCount}`);
  }
}

async function main() {
  const port = process.env.PORT || 19012;
  const base = `http://127.0.0.1:${port}/inventory/v1`;

  const loginRes = await request(`${base}/auth/login`, { method: 'POST' }, {
    username: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASSWORD || 'TEST-only-password-4821'
  });

  if (loginRes.status !== 200) {
    throw new Error('Login failed: ' + JSON.stringify(loginRes.body));
  }

  const cookie = loginRes.headers['set-cookie'];
  const csrf = loginRes.body.csrf;
  const authHeaders = { 'Cookie': cookie, 'x-csrf-token': csrf };

  await syncOct31Balances(base, authHeaders);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error during sync:', err);
    process.exit(1);
  });
}

module.exports = { syncOct31Balances };
