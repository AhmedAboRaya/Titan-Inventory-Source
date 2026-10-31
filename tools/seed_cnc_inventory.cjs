/**
 * TITAN INVENTORY — CNC Inventory & 3-Level Categories Seeder
 * 
 * Creates:
 * 1. Renames subcategories (Micro Turning Tools -> Turning Tools & Holders, Rotary Broaches -> Broaches & Punches)
 * 2. Deactivates obsolete subcategories (Whirling / Polygon Units)
 * 3. Creates 38 Level 3 Categories under CNC Cutting Tools & Machine Accessories
 * 4. Seeds 378 CNC Items with exact specs, brands, and units
 * 5. Posts Opening Balances Receipt in Main Medical Warehouse with New & Repair conditions
 */

const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
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

async function fetchAllItems(base, authHeaders) {
  let all = [];
  let offset = 0;
  while (true) {
    const res = await request(`${base}/items?limit=100&offset=${offset}`, { headers: authHeaders });
    const batch = res.body || [];
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break;
    offset += 100;
  }
  return all;
}

async function seedCncInventory(base, authHeaders) {
  console.log('\n======================================================');
  console.log('--- Seeding CNC 3-Level Categories and Inventory Items ---');
  console.log('======================================================\n');

  const cncDataPath = path.resolve(__dirname, 'cnc_parsed_data.json');
  if (!fs.existsSync(cncDataPath)) {
    throw new Error('CNC parsed data file not found: ' + cncDataPath);
  }
  const cncData = JSON.parse(fs.readFileSync(cncDataPath, 'utf8'));

  // 1. Fetch current categories
  const catRes = await request(`${base}/categories`, { headers: authHeaders });
  let allCats = catRes.body || [];

  // Map subcategories
  let subMap = {};
  for (const c of allCats) {
    if (c.parent_id) {
      const parent = allCats.find(p => p.id === c.parent_id);
      if (parent) {
        subMap[`${parent.name_en.toLowerCase()} > ${c.name_en.toLowerCase()}`] = c;
      }
    }
  }

  // 2. Rename and update subcategories if needed
  console.log('--- 1. Renaming and Updating Subcategories ---');
  for (const c of allCats) {
    if (c.parent_id) {
      const lower = c.name_en.toLowerCase();
      // Rename Micro Turning Tools -> Turning Tools & Holders
      if (lower === 'micro turning tools') {
        console.log(`Renaming [${c.id}] to "Turning Tools & Holders"...`);
        await request(`${base}/categories/${c.id}`, {
          method: 'POST',
          headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
        }, {
          name_ar: 'أقلام خراطة وحوامل فصوص',
          name_en: 'Turning Tools & Holders',
          parent_id: c.parent_id,
          illustration: 'cutting-6',
          sort: c.sort,
          active: true,
          version: c.version
        });
        c.name_en = 'Turning Tools & Holders';
        c.name_ar = 'أقلام خراطة وحوامل فصوص';
        c.illustration = 'cutting-6';
      }
      // Rename Rotary Broaches -> Broaches & Punches
      else if (lower === 'rotary broaches') {
        console.log(`Renaming [${c.id}] to "Broaches & Punches"...`);
        await request(`${base}/categories/${c.id}`, {
          method: 'POST',
          headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
        }, {
          name_ar: 'أقلام بروش وبانش تشكيل',
          name_en: 'Broaches & Punches',
          parent_id: c.parent_id,
          illustration: 'accessories-5',
          sort: c.sort,
          active: true,
          version: c.version
        });
        c.name_en = 'Broaches & Punches';
        c.name_ar = 'أقلام بروش وبانش تشكيل';
        c.illustration = 'accessories-5';
      }
      // Deactivate Whirling / Polygon Units
      else if (lower.includes('whirling') && lower.includes('polygon')) {
        console.log(`Deactivating obsolete subcategory [${c.id}] "${c.name_en}"...`);
        await request(`${base}/categories/${c.id}`, {
          method: 'POST',
          headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
        }, {
          name_ar: c.name_ar,
          name_en: c.name_en,
          parent_id: c.parent_id,
          illustration: c.illustration,
          sort: c.sort,
          active: false,
          version: c.version
        });
        c.active = false;
      }
    }
  }

  // Refresh categories
  const catRes2 = await request(`${base}/categories`, { headers: authHeaders });
  allCats = catRes2.body || [];
  subMap = {};
  for (const c of allCats) {
    if (c.parent_id) {
      const parent = allCats.find(p => p.id === c.parent_id);
      if (parent) {
        subMap[`${parent.name_en.toLowerCase()} > ${c.name_en.toLowerCase()}`] = c;
      }
    }
  }

  // 3. Create Level 3 Categories
  console.log('\n--- 2. Creating Level 3 Leaf Categories (38) ---');
  const leafMap = {}; // name_en -> id

  for (let idx = 0; idx < cncData.categories.length; idx++) {
    const l3 = cncData.categories[idx];
    const key = `${l3.root.toLowerCase()} > ${l3.sub.toLowerCase()}`;
    const parentSub = subMap[key];

    if (!parentSub) {
      console.error(`Parent subcategory not found for: ${key}`);
      continue;
    }

    // Check if Level 3 category already exists under parentSub
    let existingL3 = allCats.find(c => c.parent_id === parentSub.id && (c.name_en.toLowerCase() === l3.en.toLowerCase() || c.name_ar === l3.ar));

    if (!existingL3) {
      const createRes = await request(`${base}/categories`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, {
        name_ar: l3.ar,
        name_en: l3.en,
        parent_id: parentSub.id,
        illustration: l3.illustration || parentSub.illustration || 'storage',
        sort: idx + 1
      });

      if (createRes.status !== 200 && createRes.status !== 201) {
        console.error(`Failed to create L3 category "${l3.en}":`, createRes.body);
      } else {
        existingL3 = createRes.body;
        allCats.push({ ...createRes.body, parent_id: parentSub.id, name_en: l3.en, name_ar: l3.ar });
        console.log(`+ Created Level 3 Category: [${parentSub.name_en}] ➔ ${l3.en} (${l3.ar})`);
      }
    } else {
      console.log(`= Existing Level 3 Category: [${parentSub.name_en}] ➔ ${l3.en}`);
    }

    if (existingL3) {
      leafMap[l3.en] = existingL3.id;
    }
  }

  // Also map Spare Parts & Devices subcategories (which don't have Level 3)
  for (const c of allCats) {
    if (c.parent_id) {
      const parent = allCats.find(p => p.id === c.parent_id);
      if (parent && parent.name_en === 'Spare Parts & Devices') {
        leafMap[c.name_en] = c.id;
      }
    }
  }

  // 4. Create CNC Items
  console.log('\n--- 3. Creating CNC Items (378) ---');
  const existingItems = await fetchAllItems(base, authHeaders);
  const existingSkuMap = new Map();
  existingItems.forEach(i => existingSkuMap.set(i.sku, i));
  console.log(`Found ${existingItems.length} existing items in DB.`);

  let createdCount = 0;
  let skippedCount = 0;
  const itemMap = new Map(); // sku -> id

  for (const item of cncData.items) {
    if (existingSkuMap.has(item.sku)) {
      skippedCount++;
      itemMap.set(item.sku, existingSkuMap.get(item.sku).id);
      continue;
    }

    const catKey = item.leaf || item.sub;
    const catId = leafMap[catKey];
    if (!catId) {
      console.error(`Category ID not found for item ${item.sku} (category key: ${catKey})`);
      continue;
    }

    const descParts = [];
    if (item.specification) descParts.push(item.specification);
    if (item.notes) descParts.push(item.notes);
    if (item.brand) descParts.push(`الماركة: ${item.brand}`);
    const description = descParts.join(' · ') || item.name_en || item.name_ar;

    const payload = {
      sku: item.sku,
      name_ar: item.name_ar,
      name_en: item.name_en,
      category_id: catId,
      brand: item.brand || '',
      specification: item.specification || '',
      description: description,
      base_unit: item.base_unit || 'Piece',
      precision: 0,
      tracking: 'consumable',
      track_lot: false,
      track_serial: false,
      track_expiry: false,
      active: true
    };

    const res = await request(`${base}/items`, {
      method: 'POST',
      headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
    }, payload);

    if (res.status === 200 || res.status === 201) {
      createdCount++;
      itemMap.set(item.sku, res.body.id);
      if (createdCount % 40 === 0 || createdCount === cncData.items.length) {
        console.log(`Created ${createdCount} items so far...`);
      }
    } else {
      console.error(`Failed to create item ${item.sku}:`, res.body);
    }
  }

  console.log(`✓ Items Creation Complete: ${createdCount} created, ${skippedCount} already existed.`);

  // 5. Post Opening Balances Receipt for CNC in Main Medical Warehouse
  console.log('\n--- 4. Posting Opening Balances Receipt in Main Medical Warehouse ---');
  const whRes = await request(`${base}/warehouses`, { headers: authHeaders });
  const warehouses = whRes.body || [];
  const mainWh = warehouses.find(w => w.name === 'Main Medical Warehouse') || warehouses[0];

  if (!mainWh) {
    throw new Error('Main Medical Warehouse not found!');
  }

  // Find department (DEP-CNC or first department)
  const mastersRes = await request(`${base}/masters?all=true`, { headers: authHeaders });
  const masters = mastersRes.body || [];
  const depts = masters.filter(m => m.kind === 'department');
  const cncDept = depts.find(d => d.data?.code === 'DEP-CNC') || depts[0];

  // Fetch existing balances to avoid double-crediting
  const balancesRes = await request(`${base}/reports/balances?limit=5000`, { headers: authHeaders });
  const existingBalances = balancesRes.body || [];
  const balancedItemIds = new Set(existingBalances.filter(b => b.warehouse_id === mainWh.id && Number(b.quantity) > 0).map(b => b.item_id));

  // Build receipt lines only for items without existing balance
  const lines = [];

  for (const item of cncData.items) {
    const itemId = itemMap.get(item.sku) || existingSkuMap.get(item.sku)?.id;
    if (!itemId) continue;

    // Skip if item already has a balance in this warehouse
    if (balancedItemIds.has(itemId)) continue;

    // Regular / Accepted / New balance
    if (item.qty > 0) {
      lines.push({
        item_id: itemId,
        quantity: String(item.qty),
        unit: item.base_unit || 'Piece',
        quality: 'Accepted',
        condition: 'New'
      });
    }

    // Repair balance
    if (item.repair_qty > 0) {
      lines.push({
        item_id: itemId,
        quantity: String(item.repair_qty),
        unit: item.base_unit || 'Piece',
        quality: 'Accepted',
        condition: 'Repair'
      });
    }

    // Special item: TM-M1.8X0.35-1T (38 items under repair/damaged note)
    if (item.sku === 'TM-M1.8X0.35-1T') {
      lines.push({
        item_id: itemId,
        quantity: '38',
        unit: 'Piece',
        quality: 'Accepted',
        condition: 'Repair'
      });
    }
  }

  if (lines.length === 0) {
    console.log(`✓ All CNC items already have balances in warehouse "${mainWh.name}".`);
  } else {
    const BATCH_SIZE = 70;
    const chunks = [];
    for (let i = 0; i < lines.length; i += BATCH_SIZE) {
      chunks.push(lines.slice(i, i + BATCH_SIZE));
    }
    console.log(`Preparing CNC opening receipts in ${chunks.length} batches (${lines.length} lines total) in warehouse "${mainWh.name}"...`);

    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
      const chunkLines = chunks[cIdx];
      const draftPayload = {
        type: 'receipt',
        document_date: '2026-10-31',
        warehouse_id: mainWh.id,
        reason: `رصيد افتتاحي - جرد عدد وأدوات قطع CNC وإكسسوارات الماكينات (دفعة ${cIdx + 1}/${chunks.length})`,
        lines: chunkLines
      };

      const draftRes = await request(`${base}/documents`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, draftPayload);

      if (draftRes.status !== 200 && draftRes.status !== 201) {
        console.error(`Failed to create CNC receipt draft batch ${cIdx + 1}:`, draftRes.body);
        continue;
      }

      let postTarget = draftRes.body;
      if (postTarget.status === 'Draft') {
        const submitRes = await request(`${base}/documents/${postTarget.id}/submit`, {
          method: 'POST',
          headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
        }, { version: postTarget.version });
        if (submitRes.status === 200) postTarget = submitRes.body;
      }

      if (postTarget.status === 'Submitted') {
        const postRes = await request(`${base}/documents/${postTarget.id}/post`, {
          method: 'POST',
          headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
        }, { version: postTarget.version });
        if (postRes.status === 200) {
          console.log(`✓ CNC Opening Receipt Batch ${cIdx + 1}/${chunks.length} posted successfully! [${postRes.body.number}]`);
        } else {
          console.error(`Failed to post CNC receipt batch ${cIdx + 1}:`, postRes.body);
        }
      } else if (postTarget.status === 'Posted') {
        console.log(`✓ CNC Opening Receipt Batch ${cIdx + 1}/${chunks.length} posted immediately! [${postTarget.number}]`);
      }
    }
  }

  console.log('\n======================================================');
  console.log('✓ CNC SEED COMPLETE');
  console.log(`✓ Level 3 Categories: ${Object.keys(leafMap).length}`);
  console.log(`✓ CNC Items Registered: ${itemMap.size}`);
  console.log('======================================================\n');
}

// Standalone runner
if (require.main === module) {
  (async () => {
    const port = process.env.PORT || 19012;
    const base = `http://127.0.0.1:${port}/inventory/v1`;
    console.log(`Connecting to TITAN INVENTORY API on ${base}...`);
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

    await seedCncInventory(base, authHeaders);

    // Refresh database dumps
    console.log('\nRefreshing database full dump files...');
    try {
      const { spawnSync } = require('child_process');
      const dumpRes = spawnSync(process.execPath, [path.resolve(__dirname, 'export_full_database_dump.cjs')], {
        stdio: 'inherit'
      });
      if (dumpRes.status === 0) {
        console.log('✓ Database dump files refreshed successfully.');
      }
    } catch (dumpErr) {
      console.error('Dump refresh error:', dumpErr);
    }
  })().catch(err => {
    console.error('Error during CNC seed:', err);
    process.exit(1);
  });
}

module.exports = { seedCncInventory };
