/**
 * TITAN INVENTORY — Full October History & Handover Reconciliations Seeder
 * Replays opening stock on Oct 1, daily issues/receipts Oct 1-9, and Oct 10 handover adjustments.
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
    throw new Error(`Failed to post doc #${doc.number}: ${postRes.status} ${JSON.stringify(postRes.body)}`);
  }

  console.log(`✓ Doc #${doc.number} [${payload.type.toUpperCase()}] posted (${payload.lines.length} lines) - ${payload.document_date}: ${payload.reason}`);
  return postRes.body;
}

async function main() {
  const port = process.env.PORT || 19012;
  const base = `http://127.0.0.1:${port}/inventory/v1`;
  const seedFile = 'E:/AboRaya/TITAN/medical_warehouse_seed.json';
  const preparedFile = 'E:/AboRaya/TITAN/titan_inventory_prepared_migration.json';

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

  // Create manager user for independent approval
  await request(`${base}/users`, {
    method: 'POST',
    headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
  }, {
    username: 'manager',
    display_name: 'Dr. Warehouse Manager',
    password: 'TEST-only-manager-4821',
    role_id: 'manager',
    warehouse_ids: [],
    department_ids: [],
    all_warehouses: true,
    all_departments: true
  });

  const mgrLogin = await request(`${base}/auth/login`, { method: 'POST' }, {
    username: 'manager',
    password: 'TEST-only-manager-4821'
  });
  if (mgrLogin.status === 200) {
    mgrHeaders = {
      'Cookie': mgrLogin.headers['set-cookie'],
      'x-csrf-token': mgrLogin.body.csrf
    };
    console.log('✓ Dual-control manager authenticated for approvals.');
  } else {
    console.error('Failed to log in as manager:', mgrLogin.status, mgrLogin.body);
  }

  const catRes = await request(`${base}/categories`, { headers: authHeaders });
  const subcategories = catRes.body.filter(c => c.parent_id);
  const subMap = {};
  for (const s of subcategories) subMap[s.name_en.toLowerCase()] = s.id;

  const whRes = await request(`${base}/warehouses`, { headers: authHeaders });
  const warehouse = whRes.body[0];
  const depRes = await request(`${base}/masters?kind=department`, { headers: authHeaders });
  const department = depRes.body[0];

  const prepared = JSON.parse(fs.readFileSync(preparedFile, 'utf8'));
  const rawSeed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));

  function findSubcategory(it) {
    const sub = it.subcategory_name_en.toLowerCase();
    const parent = it.parent_category_name_en.toLowerCase();
    const sku = it.sku;
    if (sub.includes('sticker') || parent.includes('packaging')) {
      if (sku === 'IFU') return subMap['ifu'];
      if (sub.includes('protective')) return subMap['protective packages'] || subMap['pouches'];
      return subMap['stickers'] || subcategories[0].id;
    }
    if (parent.includes('material')) {
      if (sku.startsWith('TI')) return subMap['titanium'];
      if (sku.startsWith('ST')) return subMap['stainless steel'];
      if (sku.startsWith('BR')) return subMap['brass'];
      if (sku.startsWith('AC')) return subMap['acrylic'];
      if (sku.startsWith('TE')) return subMap['teflon'];
      return subMap['titanium'];
    }
    if (parent.includes('chemical')) {
      const n = it.name_en.toLowerCase();
      if (n.includes('ethanol') || n.includes('alcohol')) return subMap['alcohols'];
      if (n.includes('acid') || n.includes('hcl') || n.includes('anodiz')) return subMap['acids'] || subMap['anodization materials'];
      return subMap['alkaline / neutral detergents'] || subMap['acids'];
    }
    if (parent.includes('cleanroom')) {
      const n = it.name_en.toLowerCase();
      if (n.includes('glove')) return subMap['gloves'];
      if (n.includes('mask')) return subMap['masks'];
      if (n.includes('gown')) return subMap['gowns'];
      if (n.includes('head')) return subMap['head covers'];
      if (n.includes('shoe')) return subMap['shoe covers'];
      return subMap['gloves'];
    }
    if (parent.includes('tool')) {
      const n = it.name_en.toLowerCase();
      if (n.includes('scissor')) return subMap['scissors'];
      if (n.includes('forcep')) return subMap['forceps'];
      if (n.includes('cutter')) return subMap['cutters'];
      if (n.includes('filter')) return subMap['filters'];
      if (n.includes('pattery') || n.includes('ultrasonic') || n.includes('light')) return subMap['devices'];
      return subMap['general workshop tools'];
    }
    if (parent.includes('office')) {
      if (it.name_en.toLowerCase().includes('paper')) return subMap['paper'];
      return subMap['stationery'];
    }
    if (parent.includes('uniform')) {
      if (it.name_en.toLowerCase().includes('coat')) return subMap['coats'];
      if (it.name_en.toLowerCase().includes('trouser')) return subMap['trousers'];
      return subMap['hygiene uniforms'];
    }
    return subcategories[0].id;
  }

  // 1. Insert/ensure all 76 items exist
  console.log('Ensuring all 76 catalogue items exist...');
  const itemMap = {}; // sku -> item
  for (const it of prepared.items) {
    const subId = findSubcategory(it);
    const qty = it.opening_balance?.quantity || 0;
    const precision = (!Number.isInteger(qty) || it.sku.includes('Alkaline') || it.sku.includes('ANODIZATIO') || it.sku.includes('SAND') || it.sku.includes('VIAL') || it.sku.includes('SBB')) ? 2 : (it.base_unit === 'Kg' ? 3 : 0);

    const payload = {
      sku: it.sku,
      name_ar: it.name_ar,
      name_en: it.name_en,
      category_id: subId,
      base_unit: it.base_unit,
      precision,
      tracking: it.tracking || 'consumable',
      track_lot: it.track_lot || false,
      track_serial: false,
      track_expiry: it.track_expiry || false,
      description: it.description || '',
      brand: it.brand || '',
      specification: it.specification || '',
      data: { legacy_id: it.legacy_mongo_id, raw_qty: it.opening_balance.raw_stock_card_qty }
    };

    const res = await request(`${base}/items`, {
      method: 'POST',
      headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
    }, payload);

    if (res.status === 200 || res.status === 201) {
      itemMap[it.sku] = { ...it, id: res.body.id, precision };
    } else {
      const ex = await request(`${base}/items?search=${encodeURIComponent(it.sku)}`, { headers: authHeaders });
      const f = (ex.body || []).find(x => x.sku === it.sku);
      if (f) itemMap[it.sku] = { ...it, id: f.id, precision: f.precision };
    }
  }

  // 2. Ensure lots exist for all lot-tracking items
  console.log('Ensuring lots exist...');
  const lotMap = {}; // sku -> lot_id
  for (const it of prepared.items) {
    const item = itemMap[it.sku];
    if (!item || !item.track_lot) continue;

    const lotCode = (it.opening_balance.lot_code && it.opening_balance.lot_code !== '(N.A)')
      ? it.opening_balance.lot_code.split(',')[0].replace(/[^A-Za-z0-9\-\.\_]/g, '').trim()
      : ('LOT-' + it.sku.replace(/[^A-Za-z0-9]/g, ''));
    const cleanLot = lotCode.slice(0, 40) || 'LOT-INIT';

    const exLots = await request(`${base}/lots?item_id=${item.id}`, { headers: authHeaders });
    if (exLots.body && exLots.body.length > 0) {
      lotMap[it.sku] = exLots.body[0].id;
    } else {
      const lotPayload = { item_id: item.id, code: cleanLot, notes: 'رصيد مخزن معتمد' };
      if (item.track_expiry) lotPayload.expires_on = '2027-12-31';

      const lotRes = await request(`${base}/lots`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, lotPayload);
      if (lotRes.status === 200 || lotRes.status === 201) {
        lotMap[it.sku] = lotRes.body.id;
      }
    }
  }

  // Helper for formatting quantity
  function fmtQty(sku, val) {
    const item = itemMap[sku];
    const p = item ? item.precision : 0;
    return Number(val).toFixed(p);
  }

  function makeLine(sku, qty, notes = '') {
    const item = itemMap[sku];
    const line = {
      item_id: item.id,
      quantity: fmtQty(sku, qty),
      unit: item.base_unit,
      quality: 'Accepted',
      condition: 'New',
      notes
    };
    if (item.track_lot && lotMap[sku]) line.lot_id = lotMap[sku];
    return line;
  }

  // 3. Document 1: Opening Balances as of 2026-10-01 (before October operations)
  console.log('\n--- Creating Document #1: Opening Balances (2026-10-01) ---');
  // Calculation of Oct 1 balances:
  // For items with October operations:
  // TIG50600: starts at 2070 (issues 40+85=125, shortage -85 => net -210 => 1945 final)
  // SBB1007: starts at 195.5 kg (issues 25+25=50, shortage -20.5 => 125 final)
  // ET100%: starts at 180 (issues 24+24+12=60, shortage -0 => 120 final)
  // Acidic D V: starts at 64 (issues 5+1=6, shortage -9 => 49 final)
  // VIAL11841: starts at 33 kg (issue 7 => 26 final)
  // IFU: starts at 18 (issues 3+3=6 => 12 final)
  // SBS50606: starts at 35 (issues 5+4+4=13 => 22 final)
  // PBS07106: starts at 17 (issues 2+2+1=5 => 12 final)
  // TRS40156: starts at 13 (issues 1+1=2 => 11 final)
  // ET070%: starts at 71 (issue 1 => 70 final)
  // SA98%: starts at 0 (received 40, issue 2 => 38 final)
  // ADP: starts at 0 (received 12, issue 2 => 10 final)
  // BR5.6000: starts at 0 (received 93, net => 69 final)
  // Alkaline D F: starts at 14.5 (issues 3+3=6 => 8.5 final)
  // Alkaline D N: starts at 5 (issues 1+1=2, received 1 => 4 final)
  // Neutral D N: starts at 2 (issue 1, received 3 => 4 final)
  // HA37%-PIO: starts at 48 (issues 6+3+6+6+2=23 => 25 final)
  // AMS30306: starts at 5 (issues 1+1=2 => 3 final)
  // ST42008: starts at 13 (issue 2 => 11 final)

  const oct1OpeningQty = {
    'TIG50600': 2070,
    'SBB1007': 195.5,
    'ET100%': 180,
    'Acidic D V': 64,
    'VIAL11841': 33,
    'IFU': 18,
    'SBS50606': 35,
    'PBS07106': 17,
    'TRS40156': 13,
    'ET070%': 71,
    'Alkaline D F': 14.5,
    'Alkaline D N': 5,
    'Neutral D N': 2,
    'HA37%-PIO': 48,
    'AMS30306': 5,
    'ST42008': 13,
    'SA98%': 0,
    'ADP': 0,
    'BR5.6000': 0
  };

  const doc1Lines = [];
  for (const it of prepared.items) {
    let q = it.opening_balance.quantity || 0;
    if (oct1OpeningQty[it.sku] !== undefined) {
      q = oct1OpeningQty[it.sku];
    }
    if (q > 0) {
      doc1Lines.push(makeLine(it.sku, q, 'رصيد افتتاحي قبل تشغيل أكتوبر 2026'));
    }
  }

  await postDoc(base, authHeaders, {
    type: 'receipt',
    document_date: '2026-10-01',
    warehouse_id: warehouse.id,
    reason: 'رصيد افتتاحي معتمد للمخزن في بداية أكتوبر 2026',
    lines: doc1Lines
  });

  // 4. Document 2: 2026-10-01 Issue to Cleanroom & Production
  console.log('\n--- Creating Document #2: Issue (2026-10-01) ---');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-01',
    warehouse_id: warehouse.id,
    department_id: department.id,
    reason: 'صرف مستلزمات تشغيل وتعبئة نظيفة (فنيي الإنتاج)',
    lines: [
      makeLine('IFU', 3, 'صرف (Asmaa)'),
      makeLine('Alkaline D N', 1, 'صرف منظف قلوي'),
      makeLine('TRS40156', 1, 'صرف استيكر تتبع'),
      makeLine('Neutral D N', 1, 'صرف منظف متعادل'),
      makeLine('SBB1007', 25, 'صرف أكياس عقيمة (Shehata)'),
      makeLine('AMS30306', 1, 'صرف استيكر أمبول'),
      makeLine('HA37%-PIO', 6, 'صرف حمض HCL (Hany)'),
      makeLine('SBS50606', 5, 'صرف استيكر حاجز عقيم'),
      makeLine('Alkaline D F', 3, 'صرف منظف فيري'),
      makeLine('PBS07106', 2, 'صرف استيكر وقائي'),
      makeLine('VIAL11841', 7, 'صرف أمبولات (Hany)'),
      makeLine('ET100%', 24, 'صرف كحول إيثيلي نقي (Shehata+Thoria)'),
      makeLine('Acidic D V', 5, 'صرف منظف حمضي (Thoria)')
    ]
  });

  // 5. Document 3: 2026-10-03 Issue
  console.log('\n--- Creating Document #3: Issue (2026-10-03) ---');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-03',
    warehouse_id: warehouse.id,
    department_id: department.id,
    reason: 'صرف كحول معقم لغرف التعبئة',
    lines: [
      makeLine('ET070%', 1, 'صرف (Eman)')
    ]
  });

  // 6. Document 4: 2026-10-04 Inbound Receipts
  console.log('\n--- Creating Document #4: Receipt (2026-10-04) ---');
  await postDoc(base, authHeaders, {
    type: 'receipt',
    document_date: '2026-10-04',
    warehouse_id: warehouse.id,
    reason: 'توريدات وارد كيماويات وخامات واردة (تشغيلات جديدة)',
    lines: [
      makeLine('SA98%', 40, 'وارد حمض كبريتيك تشغيلة SA98%17082026'),
      makeLine('ADP', 12, 'وارد بودرة أنودة تشغيلة معملية'),
      makeLine('BR5.6000', 93, 'وارد أعمدة نحاس تشغيلة Cu0826')
    ]
  });

  // 7. Document 5: 2026-10-04 Issue
  console.log('\n--- Creating Document #5: Issue (2026-10-04) ---');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-04',
    warehouse_id: warehouse.id,
    department_id: department.id,
    reason: 'صرف حمض HCL لمعالجة الأسطح',
    lines: [
      makeLine('HA37%-PIO', 3, 'صرف HCL (Hany)')
    ]
  });

  // 8. Document 6: 2026-10-05 Issue
  console.log('\n--- Creating Document #6: Issue (2026-10-05) ---');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-05',
    warehouse_id: warehouse.id,
    department_id: department.id,
    reason: 'صرف حمض HCL لمعمل المعالجة',
    lines: [
      makeLine('HA37%-PIO', 6, 'صرف HCL (Hany)')
    ]
  });

  // 9. Document 7: 2026-10-06 Inbound Receipts
  console.log('\n--- Creating Document #7: Receipt (2026-10-06) ---');
  await postDoc(base, authHeaders, {
    type: 'receipt',
    document_date: '2026-10-06',
    warehouse_id: warehouse.id,
    reason: 'توريد منظفات صناعية واردة',
    lines: [
      makeLine('Alkaline D N', 1, 'وارد منظف قلوي نيترو تشغيلة 1521012026'),
      makeLine('Neutral D N', 3, 'وارد منظف متعادل تشغيلة 0918072026')
    ]
  });

  // 10. Document 8: 2026-10-06 Issue
  console.log('\n--- Creating Document #8: Issue (2026-10-06) ---');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-06',
    warehouse_id: warehouse.id,
    department_id: department.id,
    reason: 'صرف حمض HCL للغسيل الكيميائي',
    lines: [
      makeLine('HA37%-PIO', 6, 'صرف HCL (Hany)')
    ]
  });

  // 11. Document 9: 2026-10-07 Major Production Issue
  console.log('\n--- Creating Document #9: Issue (2026-10-07) ---');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-07',
    warehouse_id: warehouse.id,
    department_id: department.id,
    reason: 'صرف أمر إنتاج وتشغيل خامات تيتانيوم وكيماويات ومستلزمات',
    lines: [
      makeLine('TIG50600', 40, 'صرف خامة تيتانيوم لخط الـ CNC'),
      makeLine('SA98%', 2, 'صرف كبريتيك (Hassan)'),
      makeLine('ADP', 2, 'صرف بودرة أنودة (Thoria)'),
      makeLine('Acidic D V', 1, 'صرف منظف حمضي (Thoria)'),
      makeLine('TRS40156', 1, 'صرف استيكر تتبع'),
      makeLine('AMS30306', 1, 'صرف استيكر أمبول'),
      makeLine('SBS50606', 4, 'صرف استيكر حاجز عقيم'),
      makeLine('HA37%-PIO', 2, 'صرف HCL (Hassan)'),
      makeLine('Alkaline D F', 3, 'صرف منظف فيري'),
      makeLine('SBB1007', 25, 'صرف أكياس حاجز عقيم'),
      makeLine('PBS07106', 2, 'صرف استيكر وقائي'),
      makeLine('ET100%', 24, 'صرف كحول إيثيلي 100%'),
      makeLine('IFU', 3, 'صرف نشرات استخدام')
    ]
  });

  // 12. Document 10: 2026-10-08 Machining Issue
  console.log('\n--- Creating Document #10: Issue (2026-10-08) ---');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-08',
    warehouse_id: warehouse.id,
    department_id: department.id,
    reason: 'صرف بارات خامات تيتانيوم وستانلس لقسم الخراطة',
    lines: [
      makeLine('TIG50600', 85, 'صرف تيتانيوم لأوامر تشغيل CNC'),
      makeLine('ST42008', 2, 'صرف ستانلس 420 لورشة التشغيل')
    ]
  });

  // 13. Document 11: 2026-10-09 Packaging Issue
  console.log('\n--- Creating Document #11: Issue (2026-10-09) ---');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-09',
    warehouse_id: warehouse.id,
    department_id: department.id,
    reason: 'صرف مستلزمات واستيكرز تغليف وتطهير',
    lines: [
      makeLine('ET100%', 12, 'صرف تطهير (Shehata)'),
      makeLine('SBS50606', 4, 'صرف استيكر عقيم'),
      makeLine('PBS07106', 1, 'صرف استيكر وقائي')
    ]
  });

  // 14. Document 12: 2026-10-10 Handover Reconciliations - Shortages (adjustment_out)
  console.log('\n--- Creating Document #12: Handover Shortages (2026-10-10) ---');
  await postDoc(base, authHeaders, {
    type: 'adjustment_out',
    document_date: '2026-10-10',
    warehouse_id: warehouse.id,
    reason: 'محضر جرد تسليم وتسلم المخزن بين المسؤول السابق والحالي (تسوية عجز جرد)',
    lines: [
      makeLine('TIG50600', 40, 'عجز جرد تسليم المخزن بين المسؤول السابق والحالي'),
      makeLine('SBB1007', 20.5, 'عجز جرد تسليم أكياس عقيمة'),
      makeLine('Acidic D V', 9, 'عجز جرد تسليم منظف حمضي'),
      makeLine('BR5.6000', 24, 'عجز فارق ترحيل لوط النحاس')
    ]
  });

  // 15. Document 13: 2026-10-10 Handover Reconciliations - Surpluses (adjustment_in)
  console.log('\n--- Creating Document #13: Handover Surpluses (2026-10-10) ---');
  await postDoc(base, authHeaders, {
    type: 'adjustment_in',
    document_date: '2026-10-10',
    warehouse_id: warehouse.id,
    reason: 'محضر جرد تسليم وتسلم المخزن بين المسؤول السابق والحالي (تسوية زيادة جردية)',
    lines: [
      makeLine('TE080000', 1, 'تسوية زيادة جردية طبقا للرصيد الفعلي بالستوك كارد (+1.0 قطعة)'),
      makeLine('PBS70104', 4, 'تسوية زيادة جردية طبقا للرصيد الفعلي بالستوك كارد (+4.0 رول)')
    ]
  });

  console.log('\n=========================================');
  console.log('🎉 ALL 13 OCTOBER DOCUMENTS POSTED TO LEDGER!');
  console.log('=========================================');

  // Verify final balances
  const finalBalRes = await request(`${base}/reports/balances`, { headers: authHeaders });
  const finalBalances = finalBalRes.body;
  console.log(`Live stock balance positions in warehouse: ${finalBalances.length}`);
  console.log('Sample verified balances:');
  ['TIG50600', 'Neutral D N', 'Alkaline D N', 'HA37%-PIO', 'ET100%', 'BR5.6000', 'SBB1007', 'IFU'].forEach(sku => {
    const b = finalBalances.find(x => x.sku === sku);
    console.log(`- [${sku}] Final Balance: ${b ? b.quantity : '0'} ${b ? b.base_unit : ''}`);
  });
}

main().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
