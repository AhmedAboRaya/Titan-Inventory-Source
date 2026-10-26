/**
 * Script to add Licensed warehouse 244 and its items with opening stock.
 */
const http = require('http');
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

async function run() {
  const base = 'http://127.0.0.1:19012/inventory/v1';
  console.log('Logging in to Titan Inventory API...');

  const loginRes = await request(`${base}/auth/login`, { method: 'POST' }, {
    username: 'admin',
    password: 'TEST-only-password-4821'
  });

  if (loginRes.status !== 200) {
    throw new Error('Login failed: ' + JSON.stringify(loginRes.body));
  }

  const cookie = loginRes.headers['set-cookie'];
  const csrf = loginRes.body.csrf;
  const headers = { 'Cookie': cookie, 'x-csrf-token': csrf };
  console.log('Authenticated successfully.');

  // 1. Get or Create Warehouse: Licensed warehouse 244
  console.log('\n--- 1. Warehouse: Licensed warehouse 244 ---');
  const whRes = await request(`${base}/warehouses?all=true`, { headers });
  let licensedWh = (whRes.body || []).find(w => w.name.toLowerCase() === 'licensed warehouse 244');

  if (!licensedWh) {
    console.log('Creating warehouse "Licensed warehouse 244"...');
    const createWh = await request(`${base}/warehouses`, {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() }
    }, {
      name: 'Licensed warehouse 244',
      site_id: null,
      active: true
    });

    if (createWh.status !== 200 && createWh.status !== 201) {
      throw new Error('Failed to create warehouse: ' + JSON.stringify(createWh.body));
    }
    licensedWh = { id: createWh.body.id, name: 'Licensed warehouse 244' };
    console.log(`✓ Warehouse created with ID: ${licensedWh.id}`);
  } else {
    console.log(`✓ Warehouse already exists with ID: ${licensedWh.id}`);
    if (!licensedWh.active) {
      console.log('Reactivating warehouse...');
      await request(`${base}/warehouses/${licensedWh.id}`, {
        method: 'POST',
        headers: { ...headers, 'idempotency-key': crypto.randomUUID() }
      }, {
        name: licensedWh.name,
        site_id: licensedWh.site_id || null,
        active: true,
        version: licensedWh.version
      });
      console.log('✓ Warehouse reactivated.');
    }
  }

  // 2. Discover Categories
  console.log('\n--- 2. Finding Categories ---');
  const catRes = await request(`${base}/categories`, { headers });
  const allCats = catRes.body || [];
  
  const rawMatCat = allCats.find(c => c.name_en === 'Raw Materials' || c.name_ar === 'الخامات');
  if (!rawMatCat) throw new Error('Raw Materials category not found!');

  const subcats = allCats.filter(c => c.parent_id === rawMatCat.id);
  const titaniumCat = subcats.find(c => c.name_en.toLowerCase() === 'titanium');
  const plasticCat = subcats.find(c => c.name_en.toLowerCase().includes('plastic'));

  if (!titaniumCat) throw new Error('Titanium subcategory not found!');
  if (!plasticCat) throw new Error('Plastic Materials subcategory not found!');

  console.log(`✓ Titanium category ID: ${titaniumCat.id} (${titaniumCat.name_ar})`);
  console.log(`✓ Plastic Materials category ID: ${plasticCat.id} (${plasticCat.name_ar})`);

  // 3. Define the 8 items
  const itemsToCreate = [
    // Titanium items
    {
      sku: 'TIG506280',
      name_en: 'TI D6',
      name_ar: 'خامة تيتانيوم قطر 6 مم (TI D6)',
      category_id: titaniumCat.id,
      base_unit: 'Bar',
      precision: 0,
      tracking: 'consumable',
      track_lot: true,
      specification: 'Raw Materials - Titanium (D 6)',
      lot_no: '24-GR5-22#',
      qty: 0
    },
    {
      sku: 'TIG50400',
      name_en: 'Titanium (D 4   L 2.80)',
      name_ar: 'خامة تيتانيوم (قطر 4 مم طول 2.80 م)',
      category_id: titaniumCat.id,
      base_unit: 'Bar',
      precision: 0,
      tracking: 'consumable',
      track_lot: true,
      specification: 'D 4 mm, L 2.80 m',
      lot_no: '24-GR5-26#',
      qty: 60
    },
    {
      sku: 'TIG50800',
      name_en: 'Titanium (D 8   L 2.80)',
      name_ar: 'خامة تيتانيوم (قطر 8 مم طول 2.80 م - وزن البار 630 جم)',
      category_id: titaniumCat.id,
      base_unit: 'Bar',
      precision: 0,
      tracking: 'consumable',
      track_lot: true,
      specification: 'D 8 mm, L 2.80 m, bar=630gm',
      lot_no: '24-GR5-26#',
      qty: 18
    },
    {
      sku: 'TIG51000',
      name_en: 'Titanium (D10   L 2.80)',
      name_ar: 'خامة تيتانيوم (قطر 10 مم طول 2.80 م - وزن البار 980 جم)',
      category_id: titaniumCat.id,
      base_unit: 'Bar',
      precision: 0,
      tracking: 'consumable',
      track_lot: true,
      specification: 'D 10 mm, L 2.80 m, bar=980gm',
      lot_no: '24-GR5-26#',
      qty: 0
    },
    // Injected Plastic items
    {
      sku: 'PP901',
      name_en: 'Polypropylene (Random 901)',
      name_ar: 'خامة بولي بروبيلين حقن (راندوم 901)',
      category_id: plasticCat.id,
      base_unit: 'Bag',
      precision: 0,
      tracking: 'consumable',
      track_lot: true,
      specification: 'Injected raw material - Random 901',
      lot_no: 'PP426',
      qty: 15
    },
    {
      sku: 'PS861',
      name_en: 'Polystyrene (861)',
      name_ar: 'خامة بولي ستيرين حقن (861)',
      category_id: plasticCat.id,
      base_unit: 'Bag',
      precision: 0,
      tracking: 'consumable',
      track_lot: true,
      specification: 'Injected raw material - 861',
      lot_no: 'PS426',
      qty: 29
    },
    {
      sku: 'HDM30',
      name_en: 'HDPE (M30)',
      name_ar: 'خامة بولي إيثيلين عالي الكثافة HDPE (M30)',
      category_id: plasticCat.id,
      base_unit: 'Bag',
      precision: 0,
      tracking: 'consumable',
      track_lot: true,
      specification: 'Injected raw material - M30',
      lot_no: 'HDM30',
      qty: 15
    },
    {
      sku: 'AB500',
      name_en: 'ABS (5000 S)',
      name_ar: 'خامة أكريلونتريل بوتادين ستايرين ABS (5000 S)',
      category_id: plasticCat.id,
      base_unit: 'Bag',
      precision: 0,
      tracking: 'consumable',
      track_lot: true,
      specification: 'Injected raw material - 5000 S',
      lot_no: 'AB500',
      qty: 6
    }
  ];

  console.log('\n--- 3. Registering / Finding Items ---');
  const existingItemsRes = await request(`${base}/items?limit=500`, { headers });
  const existingItems = existingItemsRes.body || [];

  const itemMap = {}; // sku -> item_id
  const lotMap = {};  // sku -> lot_id

  for (const itemDef of itemsToCreate) {
    let item = existingItems.find(x => x.sku === itemDef.sku);
    if (!item) {
      console.log(`Creating item [${itemDef.sku}] ${itemDef.name_ar}...`);
      const payload = {
        sku: itemDef.sku,
        name_ar: itemDef.name_ar,
        name_en: itemDef.name_en,
        category_id: itemDef.category_id,
        base_unit: itemDef.base_unit,
        precision: itemDef.precision,
        tracking: itemDef.tracking,
        track_lot: itemDef.track_lot,
        track_serial: false,
        track_expiry: false,
        specification: itemDef.specification,
        active: true
      };
      const createRes = await request(`${base}/items`, {
        method: 'POST',
        headers: { ...headers, 'idempotency-key': crypto.randomUUID() }
      }, payload);

      if (createRes.status !== 200 && createRes.status !== 201) {
        throw new Error(`Failed to create item ${itemDef.sku}: ` + JSON.stringify(createRes.body));
      }
      item = createRes.body;
      console.log(`  ✓ Created item ID: ${item.id}`);
    } else {
      console.log(`  ✓ Item already exists [${itemDef.sku}]: ${item.id}`);
    }
    itemMap[itemDef.sku] = item.id;

    // Register lot for item
    const lotsRes = await request(`${base}/lots?item_id=${item.id}`, { headers });
    let lot = (lotsRes.body || []).find(l => l.code === itemDef.lot_no);
    if (!lot) {
      console.log(`  Creating lot [${itemDef.lot_no}] for item [${itemDef.sku}]...`);
      const createLot = await request(`${base}/lots`, {
        method: 'POST',
        headers: { ...headers, 'idempotency-key': crypto.randomUUID() }
      }, {
        item_id: item.id,
        code: itemDef.lot_no,
        notes: `لوت رصيد مخزن Licensed warehouse 244 (${itemDef.lot_no})`
      });
      if (createLot.status !== 200 && createLot.status !== 201) {
        throw new Error(`Failed to create lot: ` + JSON.stringify(createLot.body));
      }
      lot = createLot.body;
      console.log(`  ✓ Lot created ID: ${lot.id}`);
    } else {
      console.log(`  ✓ Lot exists [${itemDef.lot_no}]: ${lot.id}`);
    }
    lotMap[itemDef.sku] = lot.id;
  }

  // 4. Check existing documents / balances in Licensed warehouse 244
  console.log('\n--- 4. Checking & Posting Stock Receipt ---');
  const balancesRes = await request(`${base}/reports/balances?warehouse_id=${licensedWh.id}`, { headers });
  const existingBalances = Array.isArray(balancesRes.body) ? balancesRes.body : [];
  console.log(`Existing balances in ${licensedWh.name}: ${existingBalances.length} lines`);

  const linesToPost = [];
  for (const itemDef of itemsToCreate) {
    if (itemDef.qty > 0) {
      // Check if balance already exists
      const existingBal = existingBalances.find(b => b.item_id === itemMap[itemDef.sku]);
      if (existingBal && Number(existingBal.quantity) >= itemDef.qty) {
        console.log(`Item [${itemDef.sku}] already has balance: ${existingBal.quantity} ${itemDef.base_unit}`);
      } else {
        linesToPost.push({
          item_id: itemMap[itemDef.sku],
          quantity: String(itemDef.qty),
          unit: itemDef.base_unit,
          lot_id: lotMap[itemDef.sku],
          quality: 'Accepted',
          condition: 'New',
          notes: `رصيد كارت مخزن Licensed warehouse 244 - Lot ${itemDef.lot_no}`
        });
      }
    }
  }

  if (linesToPost.length === 0) {
    console.log('✓ All stock items already posted and present in Licensed warehouse 244.');
  } else {
    console.log(`Creating Opening Receipt for ${linesToPost.length} items in ${licensedWh.name}...`);
    const docPayload = {
      type: 'receipt',
      document_date: new Date().toISOString().split('T')[0],
      warehouse_id: licensedWh.id,
      reason: 'رصيد افتتاحي معتمد لمخزن Licensed warehouse 244',
      lines: linesToPost
    };

    const docRes = await request(`${base}/documents`, {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() }
    }, docPayload);

    if (docRes.status !== 200 && docRes.status !== 201) {
      throw new Error('Failed to create receipt document: ' + JSON.stringify(docRes.body));
    }

    const doc = docRes.body;
    console.log(`✓ Receipt Document #${doc.number} created (ID: ${doc.id}). Submitting...`);

    const subRes = await request(`${base}/documents/${doc.id}/submit`, {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() }
    }, { version: doc.version });

    if (subRes.status !== 200) {
      throw new Error('Failed to submit document: ' + JSON.stringify(subRes.body));
    }
    console.log('✓ Document submitted. Posting to ledger...');

    const postRes = await request(`${base}/documents/${doc.id}/post`, {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() }
    }, { version: subRes.body.version });

    if (postRes.status !== 200) {
      throw new Error('Failed to post document: ' + JSON.stringify(postRes.body));
    }
    console.log(`✓ SUCCESS! Document #${doc.number} officially posted to ledger!`);
  }

  // 5. Verification
  console.log('\n--- 5. Verification ---');
  const verifyRes = await request(`${base}/reports/balances?warehouse_id=${licensedWh.id}`, { headers });
  const finalBalances = Array.isArray(verifyRes.body) ? verifyRes.body : [];
  console.log(`Total balance lines in ${licensedWh.name}: ${finalBalances.length}`);
  for (const b of finalBalances) {
    console.log(`  - SKU: ${b.sku} | Name: ${b.name_ar} | Qty: ${b.quantity} ${b.base_unit} | Lot: ${b.lot_code || '—'}`);
  }

  console.log('\n======================================================');
  console.log('✓ Licensed warehouse 244 setup completed successfully!');
  console.log('======================================================\n');
}

run().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
