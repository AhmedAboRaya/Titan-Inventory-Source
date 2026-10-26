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

async function main() {
  const port = process.env.PORT || 19012;
  const base = `http://127.0.0.1:${port}/inventory/v1`;

  console.log(`Connecting to ${base}...`);
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
  console.log('Login successful! CSRF acquired.');

  // Get warehouses
  const whRes = await request(`${base}/warehouses`, { headers: authHeaders });
  const mainWh = (whRes.body || []).find(w => w.name === 'Main Medical Warehouse') || whRes.body[0];
  if (!mainWh) throw new Error('Main warehouse not found');

  // Get categories
  const catRes = await request(`${base}/categories?limit=200`, { headers: authHeaders });
  const cats = catRes.body || [];
  const tshirtsCat = cats.find(c => c.name_en === 'T-Shirts');
  const trousersCat = cats.find(c => c.name_en === 'Trousers');
  if (!tshirtsCat || !trousersCat) throw new Error('T-Shirts or Trousers subcategories not found');

  // 14 detailed size items
  const newItems = [
    // 4 Summer T-Shirts
    { sku: 'SUMMERUNIF-TS-M', name_en: 'Summer uniform T-shirt (Size M)', name_ar: 'تيشيرت صيفي للعاملين - مقاس M', catId: tshirtsCat.id, qty: 16 },
    { sku: 'SUMMERUNIF-TS-L', name_en: 'Summer uniform T-shirt (Size L)', name_ar: 'تيشيرت صيفي للعاملين - مقاس L', catId: tshirtsCat.id, qty: 11 },
    { sku: 'SUMMERUNIF-TS-XL', name_en: 'Summer uniform T-shirt (Size XL)', name_ar: 'تيشيرت صيفي للعاملين - مقاس XL', catId: tshirtsCat.id, qty: 20 },
    { sku: 'SUMMERUNIF-TS-2XL', name_en: 'Summer uniform T-shirt (Size 2XL)', name_ar: 'تيشيرت صيفي للعاملين - مقاس 2XL', catId: tshirtsCat.id, qty: 10 },
    // 4 Summer Trousers
    { sku: 'SUMMERUNIF-TR-XL', name_en: 'Summer uniform trousers (Size XL)', name_ar: 'بنطلون صيفي للعاملين - مقاس XL', catId: trousersCat.id, qty: 11 },
    { sku: 'SUMMERUNIF-TR-2XL', name_en: 'Summer uniform trousers (Size 2XL)', name_ar: 'بنطلون صيفي للعاملين - مقاس 2XL', catId: trousersCat.id, qty: 21 },
    { sku: 'SUMMERUNIF-TR-3XL', name_en: 'Summer uniform trousers (Size 3XL)', name_ar: 'بنطلون صيفي للعاملين - مقاس 3XL', catId: trousersCat.id, qty: 12 },
    { sku: 'SUMMERUNIF-TR-4XL', name_en: 'Summer uniform trousers (Size 4XL)', name_ar: 'بنطلون صيفي للعاملين - مقاس 4XL', catId: trousersCat.id, qty: 11 },
    // 6 Work Trousers
    { sku: 'TROUSERS-L', name_en: 'Work trousers (Size L)', name_ar: 'بنطلون عمل - مقاس L', catId: trousersCat.id, qty: 1 },
    { sku: 'TROUSERS-XL', name_en: 'Work trousers (Size XL)', name_ar: 'بنطلون عمل - مقاس XL', catId: trousersCat.id, qty: 14 },
    { sku: 'TROUSERS-2XL', name_en: 'Work trousers (Size 2XL)', name_ar: 'بنطلون عمل - مقاس 2XL', catId: trousersCat.id, qty: 4 },
    { sku: 'TROUSERS-40', name_en: 'Work trousers (Size 40)', name_ar: 'بنطلون عمل - مقاس 40', catId: trousersCat.id, qty: 2 },
    { sku: 'TROUSERS-48', name_en: 'Work trousers (Size 48)', name_ar: 'بنطلون عمل - مقاس 48', catId: trousersCat.id, qty: 2 },
    { sku: 'TROUSERS-52', name_en: 'Work trousers (Size 52)', name_ar: 'بنطلون عمل - مقاس 52', catId: trousersCat.id, qty: 3 },
  ];

  // Existing items
  const exItemsRes = await request(`${base}/items?limit=500`, { headers: authHeaders });
  const exItems = exItemsRes.body || [];
  const exMap = Object.fromEntries(exItems.map(x => [x.sku, x]));

  const receiptLines = [];

  for (const def of newItems) {
    let item = exMap[def.sku];
    if (!item) {
      console.log(`Creating item [${def.sku}] ${def.name_en}...`);
      const createRes = await request(`${base}/items`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, {
        sku: def.sku,
        name_en: def.name_en,
        name_ar: def.name_ar,
        category_id: def.catId,
        base_unit: 'Piece',
        precision: 0,
        tracking: 'consumable',
        track_lot: true,
        track_serial: false,
        track_expiry: false,
        active: true
      });
      if (createRes.status !== 200 && createRes.status !== 201) {
        console.error('Failed to create item:', def.sku, createRes.body);
        continue;
      }
      item = createRes.body;
      exMap[def.sku] = item;
    } else {
      console.log(`Item exists: [${def.sku}]`);
    }

    // Ensure lot exists
    let lotId = null;
    const lotRes = await request(`${base}/lots?item_id=${item.id}`, { headers: authHeaders });
    if (lotRes.body && lotRes.body.length > 0) {
      lotId = lotRes.body[0].id;
    } else {
      const createLot = await request(`${base}/lots`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, {
        item_id: item.id,
        code: `LOT-${def.sku.replace(/[^A-Za-z0-9]/g, '')}`,
        notes: 'رصيد افتتاحي مفصل بالمقاس'
      });
      if (createLot.status === 200 || createLot.status === 201) {
        lotId = createLot.body.id;
      }
    }

    receiptLines.push({
      item_id: item.id,
      quantity: String(def.qty),
      unit: 'Piece',
      quality: 'Accepted',
      condition: 'New',
      notes: `مقاس: ${def.sku.split('-').pop()}`,
      ...(lotId ? { lot_id: lotId } : {})
    });
  }

  // Check if receipt already posted for these detailed items
  const docsRes = await request(`${base}/documents?type=receipt`, { headers: authHeaders });
  const existingReceipts = docsRes.body || [];
  const alreadyPosted = existingReceipts.find(d => d.reason?.includes('تفصيل مقاسات اليونيفورم'));

  if (alreadyPosted) {
    console.log(`Receipt #${alreadyPosted.number} for detailed uniform sizes already exists.`);
  } else {
    console.log(`Creating Receipt Document for ${receiptLines.length} size-specific items...`);
    const docRes = await request(`${base}/documents`, {
      method: 'POST',
      headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
    }, {
      type: 'receipt',
      document_date: new Date().toISOString().split('T')[0],
      warehouse_id: mainWh.id,
      reason: 'رصيد افتتاحي - تفصيل مقاسات اليونيفورم وبناطيل العمل',
      lines: receiptLines
    });

    if (docRes.status === 200 || docRes.status === 201) {
      const doc = docRes.body;
      const subRes = await request(`${base}/documents/${doc.id}/submit`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, { version: doc.version });

      if (subRes.status === 200) {
        const postRes = await request(`${base}/documents/${doc.id}/post`, {
          method: 'POST',
          headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
        }, { version: subRes.body.version });

        if (postRes.status === 200) {
          console.log(`SUCCESS! Document #${doc.number} posted! All 14 size-specific items are now in stock!`);
        } else {
          console.error('Post failed:', postRes.body);
        }
      }
    }
  }

  // Deactivate old generic items SUMMERUNIF-71 and TROUSERS-72 in items table
  const oldSummer = exMap['SUMMERUNIF-71'];
  if (oldSummer && oldSummer.active) {
    console.log('Deactivating generic SUMMERUNIF-71...');
    await request(`${base}/items/${oldSummer.id}`, {
      method: 'POST',
      headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
    }, {
      ...oldSummer,
      active: false,
      version: oldSummer.version
    });
  }

  const oldTrousers = exMap['TROUSERS-72'];
  if (oldTrousers && oldTrousers.active) {
    console.log('Deactivating generic TROUSERS-72...');
    await request(`${base}/items/${oldTrousers.id}`, {
      method: 'POST',
      headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
    }, {
      ...oldTrousers,
      active: false,
      version: oldTrousers.version
    });
  }

  console.log('Uniform sizes migration completed successfully!');
}

main().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
