/**
 * TITAN INVENTORY — Synchronize October 11–22 Movements & New Items
 * Connects to live running NestJS server, ensures employees & new items exist,
 * and posts all movements from Oct 11 to Oct 22 in strict chronological sequence.
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
    throw new Error(`Failed to post doc #${doc.number}: ${postRes.status} ${JSON.stringify(postRes.body)}`);
  }

  console.log(`✓ Doc #${doc.number} [${payload.type.toUpperCase()}] posted (${payload.lines.length} lines) - ${payload.document_date}: ${payload.reason}`);
  return postRes.body;
}

async function main() {
  const port = process.env.PORT || 19012;
  const base = `http://127.0.0.1:${port}/inventory/v1`;

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

  // Manager login for dual approvals
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

  // 1. Ensure master employees exist
  console.log('\n--- Ensuring employees in masters ---');
  const employees = [
    'Shehata', 'Asmaa Sabry', 'Eman Anwer', 'Samar Zakaria',
    'Thoria Helmy', 'A. Shams', 'Hassan', 'Mo. Hany', 'Fatma Mo.', 'Suha Hassan'
  ];
  const empMap = {};
  const exEmps = (await request(`${base}/masters?kind=employee`, { headers: authHeaders })).body || [];
  for (const e of exEmps) empMap[e.name] = e.id;

  for (const empName of employees) {
    if (!empMap[empName]) {
      const res = await request(`${base}/masters`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, { kind: 'employee', name: empName, data: {} });
      if (res.status === 200 || res.status === 201) {
        empMap[empName] = res.body.id;
        console.log(`✓ Registered employee: ${empName}`);
      }
    }
  }

  // 2. Fetch categories & warehouse & department
  const catRes = await request(`${base}/categories`, { headers: authHeaders });
  const subcategories = catRes.body.filter(c => c.parent_id);
  const subMap = {};
  for (const s of subcategories) subMap[s.name_en.toLowerCase()] = s.id;

  const whRes = await request(`${base}/warehouses`, { headers: authHeaders });
  const warehouse = whRes.body[0];
  const depRes = await request(`${base}/masters?kind=department`, { headers: authHeaders });
  const department = depRes.body[0];

  // 3. Ensure 3 new items exist
  console.log('\n--- Ensuring new items in catalogue ---');
  const newItemsConfig = [
    {
      sku: 'OVERBEAR-41',
      name_ar: 'واقي اللحية (أوفر بير)',
      name_en: 'Over bear',
      category_id: subMap['head covers'],
      base_unit: 'Piece',
      precision: 0,
      tracking: 'consumable',
      track_lot: true,
      description: 'واقي لحية لغرف التعبئة المعقمة'
    },
    {
      sku: 'BASICCARTONS-01',
      name_ar: 'كراتين أساسية',
      name_en: 'Basic Cartons',
      category_id: subMap['protective packages'] || subMap['pouches'],
      base_unit: 'Piece',
      precision: 0,
      tracking: 'consumable',
      track_lot: true,
      description: 'كراتين أساسية لتعبئة وشحن المنتجات (مخزن البدروم)'
    },
    {
      sku: 'HA37%POWER',
      name_ar: 'حمض الهيدروكلوريك 37% باور',
      name_en: 'HCL 37% Power',
      category_id: subMap['acids'],
      base_unit: 'Bottle',
      precision: 0,
      tracking: 'consumable',
      track_lot: true,
      description: 'حمض هيدروكلوريك 37% ماركة باور لمعالجة الأسطح'
    }
  ];

  for (const it of newItemsConfig) {
    const res = await request(`${base}/items`, {
      method: 'POST',
      headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
    }, {
      ...it,
      brand: '',
      specification: '',
      track_serial: false,
      track_expiry: false,
      data: {}
    });
    if (res.status === 200 || res.status === 201) {
      console.log(`✓ Created new item: ${it.sku} (${it.name_en})`);
    } else {
      console.log(`- Item ${it.sku} already exists or code: ${res.status}`);
    }
  }

  // 4. Map all items and lots
  const allItemsRes = await request(`${base}/items?limit=200`, { headers: authHeaders });
  const allItems = allItemsRes.body.items || allItemsRes.body || [];
  const itemMap = {};
  for (const it of allItems) {
    itemMap[it.sku.toLowerCase()] = it;
  }

  // Ensure lots exist
  const lotMap = {};
  for (const it of allItems) {
    if (!it.track_lot) continue;
    const exLots = await request(`${base}/lots?item_id=${it.id}`, { headers: authHeaders });
    if (exLots.body && exLots.body.length > 0) {
      lotMap[it.sku.toLowerCase()] = exLots.body[0].id;
    } else {
      const lotPayload = { item_id: it.id, code: 'LOT-' + it.sku.replace(/[^A-Za-z0-9]/g, '').slice(0, 30), notes: 'تشغيلة رصيد معتمد' };
      const lotRes = await request(`${base}/lots`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, lotPayload);
      if (lotRes.status === 200 || lotRes.status === 201) {
        lotMap[it.sku.toLowerCase()] = lotRes.body.id;
      }
    }
  }

  function fmtQty(item, val) {
    const p = item ? item.precision : 0;
    return Number(val).toFixed(p);
  }

  function makeLine(sku, qty, notes = '') {
    const item = itemMap[sku.toLowerCase()];
    if (!item) throw new Error(`Item not found in catalogue: ${sku}`);
    const line = {
      item_id: item.id,
      quantity: fmtQty(item, qty),
      unit: item.base_unit,
      quality: 'Accepted',
      condition: 'New',
      notes
    };
    const lotId = lotMap[sku.toLowerCase()];
    if (item.track_lot && lotId) line.lot_id = lotId;
    return line;
  }

  console.log('\n=============================================');
  console.log('--- POSTING MOVEMENTS FROM OCT 11 TO OCT 22 ---');
  console.log('=============================================\n');

  // --- 2026-10-11 ---
  console.log('1. Date 2026-10-11: Inbound Receipt');
  await postDoc(base, authHeaders, {
    type: 'receipt',
    document_date: '2026-10-11',
    warehouse_id: warehouse.id,
    reason: 'استلام بضاعة واردة - توريد خامات تعبئة واستيكرز منتصف أكتوبر',
    lines: [
      makeLine('PB1510', 420, 'استلام بضاعة واردة'),
      makeLine('HOIM98261-INSP', 28.5, 'استلام بضاعة واردة'),
      makeLine('TRS40156', 15, 'استلام بضاعة واردة'),
      makeLine('AMS3.56', 12, 'استلام بضاعة واردة'),
      makeLine('PBS07106', 35, 'استلام بضاعة واردة')
    ]
  });

  console.log('2. Date 2026-10-11: Issue to Hassan');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-11',
    warehouse_id: warehouse.id,
    department_id: department.id,
    recipient_id: empMap['Hassan'] || null,
    reason: 'إذن صرف مخزني - حمض كبريتيك لقسم المعالجة',
    lines: [
      makeLine('SA98%', 1, 'إذن صرف مخزني (Hassan)')
    ]
  });

  // --- 2026-10-13 ---
  console.log('\n3. Date 2026-10-13: Issue to Packaging & Treatment');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-13',
    warehouse_id: warehouse.id,
    department_id: department.id,
    reason: 'إذن صرف مخزني - أكياس واستيكرز وحمض كبريتيك',
    lines: [
      makeLine('PB1510', 20, 'إذن صرف مخزني (Asmaa Sabry)'),
      makeLine('AMS30306', 2, 'إذن صرف مخزني (Suha Hassan)'),
      makeLine('SA98%', 1, 'إذن صرف مخزني (A. Shams)'),
      makeLine('AMS3.56', 2, 'إذن صرف مخزني (Suha Hassan)')
    ]
  });

  // --- 2026-10-14 ---
  console.log('\n4. Date 2026-10-14: Issue to A. Shams');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-14',
    warehouse_id: warehouse.id,
    department_id: department.id,
    recipient_id: empMap['A. Shams'] || null,
    reason: 'إذن صرف مخزني - حمض كبريتيك للأنودة',
    lines: [
      makeLine('SA98%', 1, 'إذن صرف مخزني (A. Shams)')
    ]
  });

  // --- 2026-10-15 ---
  console.log('\n5. Date 2026-10-15: Daily Operations Issues (16 lines)');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-15',
    warehouse_id: warehouse.id,
    department_id: department.id,
    reason: 'إذن صرف مخزني - مستلزمات تشغيل وغرف نظيفة ومطهرات وتعبئة',
    lines: [
      makeLine('ADP', 2, 'إذن صرف مخزني (Thoria Helmy)'),
      makeLine('Alkaline D F', 2, 'إذن صرف مخزني (Thoria Helmy)'),
      makeLine('AMS30306', 1, 'إذن صرف مخزني (Suha Hassan)'),
      makeLine('Alkaline D F', 0.5, 'إذن صرف مخزني (Shehata)'),
      makeLine('TRS40156', 1, 'إذن صرف مخزني (Suha Hassan)'),
      makeLine('SA98%', 1, 'إذن صرف مخزني (A. Shams)'),
      makeLine('Acidic D V', 5, 'إذن صرف مخزني (Thoria Helmy)'),
      makeLine('AMS3.56', 1, 'إذن صرف مخزني (Suha Hassan)'),
      makeLine('SBS50606', 3, 'إذن صرف مخزني (Suha Hassan)'),
      makeLine('ET070%', 3, 'إذن صرف مخزني (Fatma Mo.)'),
      makeLine('PBS07106', 2, 'إذن صرف مخزني (Suha Hassan)'),
      makeLine('IFU', 2, 'إذن صرف مخزني (Suha Hassan)'),
      makeLine('VIAL11841', 7.5, 'إذن صرف مخزني (A. Shams)'),
      makeLine('SBB1007', 25, 'إذن صرف مخزني (Fatma Mo.)'),
      makeLine('PB1510', 40, 'إذن صرف مخزني (Asmaa Sabry)'),
      makeLine('ET100%', 24, 'إذن صرف مخزني (Thoria Helmy)')
    ]
  });

  // --- 2026-10-18 ---
  console.log('\n6. Date 2026-10-18: Inbound Chemicals Receipt (HCL Piochem & Power)');
  await postDoc(base, authHeaders, {
    type: 'receipt',
    document_date: '2026-10-18',
    warehouse_id: warehouse.id,
    reason: 'استلام بضاعة واردة - توريدات أحماض HCL (Piochem و Power)',
    lines: [
      makeLine('HA37%-PIO', 30, 'استلام بضاعة واردة - Piochem'),
      makeLine('HA37%POWER', 30, 'استلام بضاعة واردة - Power')
    ]
  });

  console.log('7. Date 2026-10-18: Issue to Treatment');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-18',
    warehouse_id: warehouse.id,
    department_id: department.id,
    reason: 'إذن صرف مخزني - كحول وحمض كبريتيك',
    lines: [
      makeLine('ET070%', 1, 'إذن صرف مخزني (Eman Anwer)'),
      makeLine('SA98%', 3, 'إذن صرف مخزني (Hassan)')
    ]
  });

  // --- 2026-10-19 ---
  console.log('\n8. Date 2026-10-19: Issue to Hassan');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-19',
    warehouse_id: warehouse.id,
    department_id: department.id,
    recipient_id: empMap['Hassan'] || null,
    reason: 'إذن صرف مخزني - حمض كبريتيك',
    lines: [
      makeLine('SA98%', 1, 'إذن صرف مخزني (Hassan)')
    ]
  });

  // --- 2026-10-20 ---
  console.log('\n9. Date 2026-10-20: Issue to Hassan');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-20',
    warehouse_id: warehouse.id,
    department_id: department.id,
    recipient_id: empMap['Hassan'] || null,
    reason: 'إذن صرف مخزني - حمض HCL باور وحمض كبريتيك',
    lines: [
      makeLine('HA37%POWER', 3, 'إذن صرف مخزني (Hassan)'),
      makeLine('SA98%', 1, 'إذن صرف مخزني (Hassan)')
    ]
  });

  // --- 2026-10-21 (Yesterday) ---
  console.log('\n10. Date 2026-10-21: Daily Issue');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-21',
    warehouse_id: warehouse.id,
    department_id: department.id,
    reason: 'إذن صرف مخزني - كحول وأمبولات طبية',
    lines: [
      makeLine('ET100%', 4, 'إذن صرف مخزني (Thoria Helmy)'),
      makeLine('VIAL11841', 2, 'إذن صرف مخزني (Mo. Hany)')
    ]
  });

  console.log('11. Date 2026-10-21: Audit Adjustment AUDIT-2026-003');
  await postDoc(base, authHeaders, {
    type: 'adjustment_out',
    document_date: '2026-10-21',
    warehouse_id: warehouse.id,
    reason: 'تسوية عجز فحص جردي [AUDIT-2026-003]: لان ده من شركه تانيه و هضيفها تاني',
    lines: [
      makeLine('HA37%-PIO', 30, '[Physical Count Deficit] الرصيد قبل: (55)، الرصيد بعد: (25)، الفرق: (-30) Bottle')
    ]
  });

  // --- 2026-10-22 (TODAY! The movements the user just performed!) ---
  console.log('\n=============================================');
  console.log('--- TODAY\'S MOVEMENTS (2026-10-22) ---');
  console.log('=============================================\n');

  console.log('12. Date 2026-10-22: Inbound Receipts of Discovered/Unregistered Items');
  await postDoc(base, authHeaders, {
    type: 'receipt',
    document_date: '2026-10-22',
    warehouse_id: warehouse.id,
    reason: 'تسجيل وحصر أصناف مفرودة ومتاحة بالمخزن (غير مسجلة بالستوك كارد سابقاً وبمخزن البدروم)',
    lines: [
      makeLine('OVERBEAR-41', 8, 'المتاح بالمخزن لانه غير مسجل'),
      makeLine('OVERHEAD-39', 11, 'متاح بالمخزن و غير مسجل بالستوك كارد'),
      makeLine('BASICCARTONS-01', 8, 'رقم تقريبي للي موجود في مخزن البدروم')
    ]
  });

  console.log('13. Date 2026-10-22: Audit Adjustment AUDIT-2026-004');
  await postDoc(base, authHeaders, {
    type: 'adjustment_out',
    document_date: '2026-10-22',
    warehouse_id: warehouse.id,
    reason: 'تسوية عجز فحص جردي [AUDIT-2026-004]: موجود في الستوك كارد بتاع د جميله اقل 3 من الي عندي و مشوفتش السبب',
    lines: [
      makeLine('A4WHITEPAP-63', 3, '[Physical Count Deficit] الرصيد قبل: (7)، الرصيد بعد: (4)، الفرق: (-3) Pack')
    ]
  });

  console.log('14. Date 2026-10-22: Issue to Shehata (Cleanroom Pack)');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-22',
    warehouse_id: warehouse.id,
    department_id: department.id,
    recipient_id: empMap['Shehata'] || null,
    reason: 'إذن صرف مخزني - مستلزمات وقاية وأمبولات غرفة نظيفة',
    lines: [
      makeLine('VIAL11841', 1, 'إذن صرف مخزني - أمبولات'),
      makeLine('VIAL11841', 5, 'إذن صرف مخزني - أمبولات تشغيل'),
      makeLine('OVERBEAR-41', 1, 'إذن صرف مخزني - واقي لحية'),
      makeLine('OVERHEAD-39', 1, 'إذن صرف مخزني - واقي رأس'),
      makeLine('MASK-42', 4, 'إذن صرف مخزني - ماسكات'),
      makeLine('GLOVES-41', 10, 'إذن صرف مخزني - قفازات')
    ]
  });

  console.log('15. Date 2026-10-22: Issue to Samar Zakaria');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-22',
    warehouse_id: warehouse.id,
    department_id: department.id,
    recipient_id: empMap['Samar Zakaria'] || null,
    reason: 'إذن صرف مخزني - قفازات ومنظف فيري',
    lines: [
      makeLine('GLOVES-41', 3, 'إذن صرف مخزني (Samar Zakaria)'),
      makeLine('Alkaline D F', 1, 'إذن صرف مخزني (Samar Zakaria)')
    ]
  });

  console.log('16. Date 2026-10-22: Issue to Asmaa Sabry');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-22',
    warehouse_id: warehouse.id,
    department_id: department.id,
    recipient_id: empMap['Asmaa Sabry'] || null,
    reason: 'إذن صرف مخزني - مستلزمات تغليف وكراتين وأكياس وقائية',
    lines: [
      makeLine('GLOVES-41', 1, 'إذن صرف مخزني (Asmaa Sabry)'),
      makeLine('MASK-42', 1, 'إذن صرف مخزني (Asmaa Sabry)'),
      makeLine('OVERHEAD-39', 1, 'إذن صرف مخزني (Asmaa Sabry)'),
      makeLine('IFU', 4, 'إذن صرف مخزني (Asmaa Sabry)'),
      makeLine('BASICCARTONS-01', 1, 'إذن صرف مخزني (Asmaa Sabry)'),
      makeLine('PB1510', 20, 'إذن صرف مخزني (Asmaa Sabry)')
    ]
  });

  console.log('17. Date 2026-10-22: Issue to Eman Anwer');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-22',
    warehouse_id: warehouse.id,
    department_id: department.id,
    recipient_id: empMap['Eman Anwer'] || null,
    reason: 'إذن صرف مخزني - ورق وأدوات مكتبية واستيكرز وحواجز عقيمة وكحول',
    lines: [
      makeLine('A4WHITEPAP-63', 1, 'إذن صرف مخزني (Eman Anwer)'),
      makeLine('ET070%', 1, 'إذن صرف مخزني (Eman Anwer)'),
      makeLine('SBS50606', 6, 'إذن صرف مخزني (Eman Anwer)'),
      makeLine('TRS40156', 1, 'إذن صرف مخزني (Eman Anwer)'),
      makeLine('TRS40156', 1, 'إذن صرف مخزني (Eman Anwer)')
    ]
  });

  console.log('18. Date 2026-10-22: Issue to A. Shams');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-22',
    warehouse_id: warehouse.id,
    department_id: department.id,
    recipient_id: empMap['A. Shams'] || null,
    reason: 'إذن صرف مخزني - قفازات وبودرة أنودة وخل حمضي',
    lines: [
      makeLine('GLOVES-41', 2, 'إذن صرف مخزني (A. Shams)'),
      makeLine('ADP', 2, 'إذن صرف مخزني (A. Shams)'),
      makeLine('Acidic D V', 5, 'إذن صرف مخزني (A. Shams)')
    ]
  });

  console.log('19. Date 2026-10-22: Issue to Thoria Helmy');
  await postDoc(base, authHeaders, {
    type: 'issue',
    document_date: '2026-10-22',
    warehouse_id: warehouse.id,
    department_id: department.id,
    recipient_id: empMap['Thoria Helmy'] || null,
    reason: 'إذن صرف مخزني - منظف فيري',
    lines: [
      makeLine('Alkaline D F', 2, 'إذن صرف مخزني (Thoria Helmy)')
    ]
  });

  console.log('\n=============================================');
  console.log('✓ ALL MOVEMENTS SYNCHRONIZED SUCCESSFULLY!');
  console.log('=============================================\n');
}

main().catch(err => {
  console.error('\n❌ Synchronization error:', err);
  process.exit(1);
});
