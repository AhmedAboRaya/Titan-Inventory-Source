/**
 * TITAN INVENTORY — Comprehensive Seed Data Importer
 * 
 * Imports:
 * 1. Main Medical Warehouse (WH-001)
 * 2. Arabic translations for all subcategories in TREE
 * 3. 10 Production & Medical Departments (with code, manager, ext)
 * 4. 32 Department Staff & Recipients (with badge, job title, phone, dept link)
 * 5. Suppliers from medical_warehouse_seed.json
 * 6. 79 Inventory Items properly categorized with units, precision, and tracking
 * 7. Official Posted Opening Balances Receipt Document with Lots
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

// Arabic names for subcategories
const subcatArabic = {
  'drills': 'بنط ثقب',
  'end mills': 'فريزات أصبعية',
  'thread mills': 'فريزات قلاووظ',
  'taps': 'ذكور قلاووظ',
  'inserts': 'فصوص ولُقم قطع',
  'micro turning tools': 'أقلام خراطة دقيقة',
  'carbide saws': 'مناشير كاربايد',
  'collets': 'كوليتات ظرف',
  'guide bushes': 'جلب دليلية',
  'finger chucks': 'فكوك وملاقط',
  'tool holders': 'حوامل عدد',
  'rotary broaches': 'أقلام تشكيل بروش',
  'whirling / polygon units': 'وحدات تخريم وقلوظة',
  'titanium': 'تيتانيوم',
  'stainless steel': 'ستانلس ستيل',
  'brass': 'نحاس',
  'acrylic': 'أكريليك',
  'teflon': 'تفلون',
  'plastic materials': 'خامات بلاستيكية',
  'stickers': 'استيكرز وبطاقات',
  'pouches': 'أكياس تغليف',
  'ampoules': 'أمبولات',
  'holders': 'حوامل غرسات',
  'protective packages': 'عبوات وقائية',
  'ifu': 'نشرات تعليمات الاستخدام (IFU)',
  'alcohols': 'كحوليات وإيثانول',
  'acids': 'أحماض',
  'alkaline / neutral detergents': 'منظفات قلوية ومتعادلة',
  'anodization materials': 'مواد وأنودة ومعالجة',
  'gloves': 'قفازات معقمة',
  'masks': 'كمامات',
  'gowns': 'بالطوهات وجاونات معقمة',
  'head covers': 'أغطية رأس',
  'shoe covers': 'أغطية أحذية',
  'bearings': 'رولمان بلي',
  'filters': 'فلاتر',
  'drives': 'مشغلات درايف',
  'encoders': 'إنكودر ومجسات',
  'transmission parts': 'أجزاء حركة وسيور',
  'devices': 'أجهزة ومعدات',
  'scissors': 'مقصات',
  'forceps': 'ملاقط طبية وصناعية',
  'cutters': 'كواتر وشفرات',
  'general workshop tools': 'أدوات عامة وورشة',
  'paper': 'أوراق وتصوير',
  'stationery': 'أدوات مكتبية',
  'batteries': 'بطاريات',
  'general consumables': 'مستهلكات عامة',
  'coats': 'بالطوهات عمل ومعمل',
  't-shirts': 'تيشيرتات',
  'trousers': 'بناطيل عمل',
  'hygiene uniforms': 'ملابس نظافة وتطهير'
};

// Item Arabic Names Dictionary
const arabicNames = {
  'PBS7010 (T)': 'استيكر حراري وقائي (7×10)',
  'SBS5060 (T)': 'استيكر حراري حاجز عقيم (5×6)',
  'AMS3030 (T)': 'استيكر حراري للتشغيلة واللوت (3×3)',
  'AMS7010(T)': 'استيكر حراري للأمبول (7×10)',
  'WOS5050(T)': 'استيكر حراري لأمر الشغل (5×5)',
  'PBS70104': 'استيكر وقائي مستمر C4000 (7×10)',
  'SBS50604': 'استيكر حاجز عقيم C4000 (5×6)',
  'AMS30304': 'استيكر أمبول C4000 (3×3)',
  'TRS40154': 'استيكر تتبع C4000 (4×1.5)',
  'PBS07106': 'استيكر وقائي C6000 (7×10)',
  'SBS50606': 'استيكر حاجز عقيم C6000 (5×6)',
  'AMS30306': 'استيكر أمبول C6000 (3×3)',
  'TRS40156': 'استيكر تتبع C6000 (4×1.5)',
  'PPS084.56': 'استيكر وقائي 8×4.5',
  'AMS3.56': 'استيكر أمبول 3.5×3.5',
  'IFU': 'نشرة تعليمات الاستخدام (IFU)',
  'PB1510': 'كيس وقائي خارجي',
  'SBB1007': 'أكياس حاجز عقيم',
  'HOIM98261': 'هولدر حامل غرسات (مقبول)',
  'HOIM98261-INSP': 'هولدر حامل غرسات (تحت الفحص)',
  'VIAL11841': 'أمبولات زجاجية/بلاستيكية',
  'TIG50600': 'خامة تيتانيوم جريد 5 (قطر 6 مم طول 2.80 م)',
  'BR5.6000': 'عمود نحاس (بار)',
  'AC100000': 'عمود أكريليك',
  'STG31606 STG31610': 'خامة ستانلس ستيل طبي 316L',
  'ST42008': 'خامة ستانلس ستيل 420',
  'TE080000': 'عمود تفلون قطر 8 مم طول 100 سم',
  'Alkaline D F': 'منظف قلوي (فيري)',
  'Alkaline D N': 'منظف قلوي صناعي (نيترو HD)',
  'Neutral D N': 'منظف متعادل (نيترو MD)',
  'Acidic D V': 'منظف حمضي (خل/حمض أسيتيك)',
  'ADP': 'بودرة معالجة أنودة',
  'Acidic D C': 'حمض ستريك (ملح ليمون نقي)',
  'ET070%': 'كحول إيثيلي 70%',
  'ET100%': 'كحول إيثيلي نقي 100%',
  'HA37%-PIO': 'حمض هيدروكلوريك 37% (بيوكيم)',
  'SA98%': 'حمض كبريتيك 98% (بيوكيم)',
  'HA37%-PAL': 'حمض هيدروكلوريك 37% (بالاف)',
  'OVERHEAD-39': 'غطاء رأس للغرف النظيفة (أوفر هيد)',
  'OVERSHOES-40': 'غطاء حذاء للغرف النظيفة (أوفر شوز)',
  'GLOVES-41': 'قفازات طبية معقمة للغرف النظيفة',
  'MASK-42': 'كمامات طبية للغرف النظيفة',
  'GOWN-43': 'جاون طبي معقم للغرف النظيفة',
  'SCISSORS-44': 'مقصات ورش واستخدام عام',
  'FORCEPS-45': 'ملاقط دقيقة',
  'EXTRAPARTS-46': 'أداة إزالة الزوائد والرايش',
  'ANODIZATIO-47': 'أسلاك معالجة وأنودة تيتانيوم',
  'STICKROOLS-48': 'شريط لاصق عام (رول)',
  'ELECTRICIT-49': 'شريط لاصق عازل كهرباء (شكرتون)',
  'TEFLONROLL-50': 'شريط تفلون عازل (رول)',
  'PATTERY-51': 'بطاريات عامة',
  'VERNEIRPAT-52': 'بطاريات قدمة ذات ورنية رقمية',
  'CUTTERS-53': 'كاتر يدوي للورش',
  'CUTTERSWEA-54': 'شفرات كاتر غيار',
  'TEPPATTERY-55': 'بطاريات أجهزة فحص',
  'ITEM056-56': 'أربطة مطاطية (أساتك)',
  'RINGLIGHT-57': 'وحدة إضاءة دائرية للفحص المجهري',
  'ULTRASONIC-58': 'جهاز غسيل بالموجات فوق الصوتية',
  'ARABOOILFI-59': 'فلتر زيت ماكينات قماش (Arabo)',
  'ARABOOILFI-60': 'فلتر زيت ماكينات ستانلس (Arabo)',
  'PYREXBOWL-61': 'حوض بايركس معملي',
  'ITEM062-62': 'مكثفات معملية زجاجية',
  'A4WHITEPAP-63': 'باكت ورق تصوير A4 أبيض',
  'STAPLERPIN-64': 'دبابيس دباسة مكتبية',
  'NOTEBOOK-65': 'دفاتر ملاحظات وسجلات',
  'WINTERUNIF-66': 'يونيفورم شتوي للعاملين',
  'WHITECOAT-67': 'بالطو أبيض معملي',
  'BLUECOAT-68': 'بالطو أزرق معملي',
  'PINKCOAT-69': 'بالطو وردي معملي',
  'DARKBLUE-70': 'بالطو أزرق داكن',
  'SUMMERUNIF-71': 'يونيفورم صيفي للعاملين',
  'TROUSERS-72': 'بنطلون عمل',
  'HYGIENEUNI-73': 'بدلة نظافة ووقاية معملية',
  'SAND-74': 'حذاء سيفتي / كروكس طبي للغرف النظيفة',
  'TI120000': 'بلوك تيتانيوم مقاس 12',
  'TI140000': 'بلوك تيتانيوم مقاس 14',
  'OVERBEAR-41': 'واقي اللحية (أوفر بير)',
  'BASICCARTONS-01': 'كراتين أساسية لشحن المنتجات',
  'HA37%POWER': 'حمض هيدروكلوريك 37% باور'
};

function mapUnit(arUnit) {
  switch (arUnit) {
    case 'رول': return 'Roll';
    case 'قطعة': return 'Piece';
    case 'كجم': return 'Kg';
    case 'بار': return 'Bar';
    case 'زجاجة': return 'Bottle';
    default: return 'Piece';
  }
}

async function main() {
  const port = process.env.PORT || 19012;
  const base = `http://127.0.0.1:${port}/inventory/v1`;
  const seedFile = 'E:/AboRaya/TITAN/medical_warehouse_seed.json';
  const prepFile = 'E:/AboRaya/TITAN/titan_inventory_prepared_migration.json';

  if (!fs.existsSync(seedFile)) {
    throw new Error('Seed file not found: ' + seedFile);
  }

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
  console.log('Login successful! CSRF acquired.');

  const seedData = JSON.parse(fs.readFileSync(seedFile, 'utf8'));

  // ==========================================
  // 1. CONFIGURE MAIN MEDICAL WAREHOUSE
  // ==========================================
  console.log('\n--- 1. Warehouse Setup ---');
  const whRes = await request(`${base}/warehouses`, { headers: authHeaders });
  let mainWarehouse = (whRes.body || []).find(w => w.name === 'Main Medical Warehouse');

  if (!mainWarehouse) {
    const fixtureWh = (whRes.body || []).find(w => w.name === 'Fixture Warehouse') || whRes.body[0];
    if (fixtureWh) {
      console.log(`Renaming warehouse [${fixtureWh.id}] "${fixtureWh.name}" to "Main Medical Warehouse"...`);
      const updateRes = await request(`${base}/warehouses/${fixtureWh.id}`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, {
        name: 'Main Medical Warehouse',
        site_id: null,
        active: true,
        version: fixtureWh.version
      });
      mainWarehouse = updateRes.body;
      console.log('Main Medical Warehouse updated successfully.');
    } else {
      console.log('Creating Main Medical Warehouse...');
      const createWh = await request(`${base}/warehouses`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, {
        name: 'Main Medical Warehouse',
        site_id: null
      });
      mainWarehouse = createWh.body;
      console.log('Main Medical Warehouse created:', mainWarehouse.id);
    }
  } else {
    console.log('Main Medical Warehouse already exists:', mainWarehouse.id);
  }

  // ==========================================
  // 2. TRANSLATE CATEGORIES & SUBCATEGORIES
  // ==========================================
  console.log('\n--- 2. Updating Category Names to Arabic ---');
  const catRes = await request(`${base}/categories`, { headers: authHeaders });
  const allCats = catRes.body || [];
  const subMap = {}; // key -> uuid

  for (const c of allCats) {
    if (c.parent_id) {
      subMap[c.name_en.toLowerCase()] = c.id;
      const lower = c.name_en.toLowerCase();
      const arName = subcatArabic[lower];
      if (arName && c.name_ar === c.name_en) {
        await request(`${base}/categories/${c.id}`, {
          method: 'POST',
          headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
        }, {
          name_ar: arName,
          name_en: c.name_en,
          parent_id: c.parent_id,
          illustration: c.illustration,
          sort: c.sort,
          active: c.active,
          version: c.version
        });
      }
    }
  }
  console.log(`Verified ${Object.keys(subMap).length} subcategories.`);

  // ==========================================
  // 3. IMPORT DEPARTMENTS (10)
  // ==========================================
  console.log('\n--- 3. Importing Departments ---');
  const existingMastersRes = await request(`${base}/masters?all=true`, { headers: authHeaders });
  const existingMasters = existingMastersRes.body || [];
  const existingDepts = existingMasters.filter(m => m.kind === 'department');
  const deptMap = {}; // seed._id -> db.id

  const arabicDeptNames = {
    'DEP-CNC': 'قسم تشغيل الماكينات CNC',
    'DEP-PROD': 'قسم حقن وتشكيل البلاستيك والغرسات',
    'DEP-WASH': 'قسم الغسيل بالموجات فوق الصوتية والتعقيم',
    'DEP-PACK': 'قسم التعبئة والتغليف بالغرف النظيفة (CR)',
    'DEP-LAB': 'قسم المعالجة الكيميائية والمعمل',
    'DEP-QA': 'قسم توكيد ومراقبة الجودة (QC/QA)',
    'DEP-PRINT': 'قسم الطباعة والترميز',
    'DEP-FP': 'مخزن المنتجات تامة الصنع (F.P)',
    'DEP-OFFICE': 'إدارة العمليات والمرافق الإدارية',
    'DEP-STORE': 'المخازن الطبية المركزية واللوجستيات'
  };

  for (const d of seedData.departments || []) {
    let match = existingDepts.find(x => x.data?.code === d.code || x.data?.legacy_id === d._id || x.name === d.name);
    const arName = arabicDeptNames[d.code] || d.name;
    const deptDisplayName = `${arName} (${d.name})`;

    const deptPayload = {
      kind: 'department',
      name: deptDisplayName,
      data: {
        code: d.code,
        manager: d.manager || '',
        internal_ext: String(d.internalExt || ''),
        legacy_id: d._id,
        notes: `المدير المسؤول: ${d.manager} · تحويلة: ${d.internalExt}`
      },
      active: true
    };

    if (match) {
      deptMap[d._id] = match.id;
      // Update if needed
      await request(`${base}/masters/${match.id}`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, {
        ...deptPayload,
        version: match.version
      });
      console.log(`  Updated department: [${d.code}] ${d.name}`);
    } else {
      const insRes = await request(`${base}/masters`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, deptPayload);
      if (insRes.status === 200 || insRes.status === 201) {
        deptMap[d._id] = insRes.body.id;
        console.log(`  Created department: [${d.code}] ${d.name}`);
      } else {
        console.error(`  Failed to create department ${d.code}:`, insRes.body);
      }
    }
  }

  // ==========================================
  // 4. IMPORT EMPLOYEES / RECIPIENTS (32)
  // ==========================================
  console.log('\n--- 4. Importing Staff & Employees ---');
  const existingEmps = existingMasters.filter(m => m.kind === 'employee');
  const empMap = {}; // seed._id -> db.id

  for (const r of seedData.recipients || []) {
    const targetDeptId = deptMap[r.departmentId] || '';
    const badge = r._id.slice(-6).toUpperCase();
    let match = existingEmps.find(x => x.data?.legacy_id === r._id || x.name === r.name || x.data?.badge === badge);

    const empPayload = {
      kind: 'employee',
      name: r.name,
      data: {
        department_id: targetDeptId,
        badge,
        job_title: r.role || 'موظف',
        phone: r.phone || '',
        legacy_id: r._id,
        legacy_dept_id: r.departmentId,
        notes: `المسمى الوظيفي: ${r.role} · هاتف: ${r.phone}`
      },
      active: true
    };

    if (match) {
      empMap[r._id] = match.id;
      await request(`${base}/masters/${match.id}`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, {
        ...empPayload,
        version: match.version
      });
      console.log(`  Updated staff: [${badge}] ${r.name} (${r.role})`);
    } else {
      const insRes = await request(`${base}/masters`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, empPayload);
      if (insRes.status === 200 || insRes.status === 201) {
        empMap[r._id] = insRes.body.id;
        console.log(`  Created staff: [${badge}] ${r.name} (${r.role})`);
      } else {
        console.error(`  Failed to create staff ${r.name}:`, insRes.body);
      }
    }
  }

  // ==========================================
  // 5. IMPORT SUPPLIERS
  // ==========================================
  console.log('\n--- 5. Importing Suppliers ---');
  const existingSuppliers = existingMasters.filter(m => m.kind === 'supplier');
  for (const s of seedData.suppliers || []) {
    let match = existingSuppliers.find(x => x.name === s.name || x.data?.code === s.code);
    if (!match) {
      await request(`${base}/masters`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, {
        kind: 'supplier',
        name: s.name,
        data: {
          code: s.code || '',
          contact: s.contactPerson || '',
          phone: s.phone || '',
          email: s.email || '',
          address: s.address || ''
        },
        active: true
      });
      console.log(`  Created supplier: ${s.name}`);
    }
  }

  // ==========================================
  // 6. MAP & INSERT ITEMS
  // ==========================================
  console.log('\n--- 6. Importing Catalogue Items ---');
  let preparedItems = [];
  if (fs.existsSync(prepFile)) {
    preparedItems = JSON.parse(fs.readFileSync(prepFile, 'utf8')).items || [];
  } else {
    preparedItems = (seedData.warehouse_items || []).map(it => ({
      sku: (it.code || '').replace(/\r?\n/g, ' ').trim(),
      name_en: it.name,
      name_ar: arabicNames[it.code] || it.name,
      base_unit: mapUnit(it.unit),
      opening_balance: { quantity: it.stockCardQty || 0, lot_code: it.stockCardLot || '' },
      track_lot: Boolean(it.hasBatch || it.stockCardLot),
      track_expiry: Boolean(it.hasExpiry),
      legacy_mongo_id: it._id
    }));
  }

  function resolveItemSubId(it) {
    const sku = it.sku;
    const nameEn = (it.name_en || '').toLowerCase();
    const parent = (it.parent_category_name_en || '').toLowerCase();
    const sub = (it.subcategory_name_en || '').toLowerCase();

    // Packaging Materials
    if (sub.includes('sticker') || parent.includes('packaging')) {
      if (sku === 'IFU') return subMap['ifu'];
      if (sku.startsWith('PB') || sku.startsWith('SBB')) return subMap['pouches'];
      if (sku.startsWith('HOIM')) return subMap['holders'];
      if (sku.startsWith('VIAL')) return subMap['ampoules'];
      if (sub.includes('protective') || sku.startsWith('PPS') || sku.startsWith('AMS3.56') || sku.startsWith('BASIC')) {
        return subMap['protective packages'] || subMap['pouches'];
      }
      return subMap['stickers'];
    }

    // Batteries (Must be checked before TE prefix because of TEPPATTERY-55!)
    if (sku.includes('PATTERY') || sku.includes('BATTERY') || nameEn.includes('battery') || nameEn.includes('pattery')) {
      return subMap['batteries'] || subMap['devices'];
    }

    // Teflon Roll Tape (Workshop consumable, not raw bar stock)
    if (sku.includes('TEFLONROLL')) {
      return subMap['general workshop tools'];
    }

    // Raw Materials
    if (parent.includes('material') || sku.startsWith('TI') || sku.startsWith('ST') || sku.startsWith('BR') || sku.startsWith('AC') || sku.startsWith('TE0') || sku.startsWith('TE1') || sku === 'TE080000') {
      if (sku.startsWith('TI')) return subMap['titanium'];
      if (sku.startsWith('ST')) return subMap['stainless steel'];
      if (sku.startsWith('BR')) return subMap['brass'];
      if (sku.startsWith('AC')) return subMap['acrylic'];
      if (sku.startsWith('TE')) return subMap['teflon'];
      return subMap['titanium'];
    }

    // Chemicals
    if (parent.includes('chemical') || sku.startsWith('ET') || sku.includes('Alkaline') || sku.includes('Neutral') || sku.startsWith('HA') || sku.startsWith('SA') || sku === 'ADP' || sku.includes('ANODIZATIO')) {
      if (sku.startsWith('ET') || nameEn.includes('alcohol') || nameEn.includes('ethanol')) return subMap['alcohols'];
      if (sku.includes('Alkaline') || sku.includes('Neutral') || nameEn.includes('detergent')) return subMap['alkaline / neutral detergents'];
      if (sku === 'ADP' || sku.includes('ANODIZATIO')) return subMap['anodization materials'];
      return subMap['acids'];
    }

    // Cleanroom
    if (parent.includes('cleanroom') || sku.includes('GLOVES') || sku.includes('MASK') || sku.includes('GOWN') || sku.includes('OVERHEAD') || sku.includes('OVERSHOES') || sku.includes('OVERBEAR')) {
      if (sku.includes('GLOVES')) return subMap['gloves'];
      if (sku.includes('MASK')) return subMap['masks'];
      if (sku.includes('GOWN')) return subMap['gowns'];
      if (sku.includes('OVERHEAD') || sku.includes('OVERBEAR')) return subMap['head covers'];
      if (sku.includes('OVERSHOES')) return subMap['shoe covers'];
      return subMap['gloves'];
    }

    // Spares & Devices
    if (nameEn.includes('filter') || sku.includes('ARABOOILFI')) return subMap['filters'];
    if (sku.includes('PATTERY') || sku.includes('RINGLIGHT') || sku.includes('ULTRASONIC') || sku.includes('ITEM062')) return subMap['devices'];

    // General Tools
    if (sku.includes('SCISSORS')) return subMap['scissors'];
    if (sku.includes('FORCEPS')) return subMap['forceps'];
    if (sku.includes('CUTTER')) return subMap['cutters'];
    if (sku.includes('EXTRAPARTS') || sku.includes('STICKROOLS') || sku.includes('ELECTRICIT') || sku.includes('TEFLONROLL') || sku.includes('ITEM056') || sku.includes('PYREX')) {
      return subMap['general workshop tools'];
    }

    // Office
    if (sku.includes('PAPER') || sku.includes('PAP')) return subMap['paper'];
    if (sku.includes('STAPLER') || sku.includes('NOTEBOOK')) return subMap['stationery'];

    // Uniforms
    if (sku.includes('COAT')) return subMap['coats'];
    if (sku.includes('TROUSERS')) return subMap['trousers'];
    if (sku.includes('HYGIENE')) return subMap['hygiene uniforms'];
    if (sku.includes('WINTER') || sku.includes('DARKBLUE') || sku.includes('SUMMER') || sku.includes('SAND')) return subMap['t-shirts'];

    return subMap['general workshop tools'] || Object.values(subMap)[0];
  }

  const existingItemsRes = await request(`${base}/items?limit=200`, { headers: authHeaders });
  const existingItems = existingItemsRes.body || [];
  const existingItemMap = Object.fromEntries(existingItems.map(x => [x.sku, x]));

  const insertedItemMap = {}; // sku -> item_id
  let newCount = 0;
  let updateCount = 0;

  for (const it of preparedItems) {
    const cleanSku = it.sku.replace(/\r?\n/g, ' ').trim();
    const targetSubId = resolveItemSubId(it);
    const qty = it.opening_balance?.quantity || 0;
    const precision = (it.base_unit === 'Kg') ? 3 : (!Number.isInteger(qty) ? 2 : 0);
    const arName = arabicNames[it.sku] || arabicNames[cleanSku] || it.name_ar || it.name_en;

    const payload = {
      sku: cleanSku,
      name_ar: arName,
      name_en: it.name_en.replace(/\r?\n/g, ' ').trim(),
      category_id: targetSubId,
      base_unit: it.base_unit || 'Piece',
      precision,
      tracking: 'consumable',
      track_lot: Boolean(it.track_lot),
      track_serial: false,
      track_expiry: Boolean(it.track_expiry),
      description: it.description || '',
      brand: it.brand || '',
      specification: it.specification || '',
      data: {
        legacy_id: it.legacy_mongo_id || '',
        raw_qty: it.opening_balance?.raw_stock_card_qty || String(qty)
      },
      active: (cleanSku === 'SUMMERUNIF-71' || cleanSku === 'TROUSERS-72') ? false : true
    };

    const existing = existingItemMap[cleanSku];
    if (existing) {
      insertedItemMap[cleanSku] = existing.id;
      if (existing.category_id !== targetSubId) {
        await request(`${base}/items/${existing.id}`, {
          method: 'POST',
          headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
        }, {
          ...payload,
          version: existing.version
        });
        console.log(`  ✓ Updated category for [${cleanSku}] to ${targetSubId}`);
      }
      updateCount++;
    } else {
      const res = await request(`${base}/items`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, payload);

      if (res.status === 200 || res.status === 201) {
        insertedItemMap[cleanSku] = res.body.id;
        newCount++;
      } else {
        console.error(`Failed to insert item [${cleanSku}]:`, res.status, res.body);
      }
    }
  }

  console.log(`Catalogue Items: ${newCount} new created, ${updateCount} existing matched. Total: ${Object.keys(insertedItemMap).length}`);

  // ==========================================
  // 7. OPENING BALANCES & LOTS RECEIPT
  // ==========================================
  console.log('\n--- 7. Posting Opening Balances Receipt ---');
  
  // Check if opening receipt already posted
  const docsRes = await request(`${base}/documents?type=receipt`, { headers: authHeaders });
  const existingReceipts = docsRes.body || [];
  const openingReceipt = existingReceipts.find(d => d.reason?.includes('افتتاحي') && d.status === 'Posted');

  if (openingReceipt) {
    console.log(`Official opening balances receipt already posted (#${openingReceipt.number}) with ${openingReceipt.lines_count} lines.`);
  } else {
    const lines = [];

    for (const it of preparedItems) {
      const cleanSku = it.sku.replace(/\r?\n/g, ' ').trim();
      const itemId = insertedItemMap[cleanSku];
      const qty = it.opening_balance?.quantity || 0;

      if (!itemId || qty <= 0 || cleanSku === 'SUMMERUNIF-71' || cleanSku === 'TROUSERS-72') continue;

      let lotId = null;
      if (it.track_lot) {
        const rawLot = (it.opening_balance?.lot_code && it.opening_balance.lot_code !== '(N.A)')
          ? it.opening_balance.lot_code.split(',')[0].replace(/[^A-Za-z0-9\-\.\_]/g, '').trim()
          : ('LOT-' + cleanSku.replace(/[^A-Za-z0-9]/g, ''));
        const cleanLot = rawLot.slice(0, 40) || 'LOT-INIT';

        const lotPayload = {
          item_id: itemId,
          code: cleanLot,
          notes: 'رصيد افتتاحي كارت المخزن'
        };
        if (it.track_expiry) {
          lotPayload.expires_on = '2027-12-31';
        }

        const exLots = await request(`${base}/lots?item_id=${itemId}`, { headers: authHeaders });
        if (exLots.body && exLots.body.length > 0) {
          lotId = exLots.body[0].id;
        } else {
          const lotRes = await request(`${base}/lots`, {
            method: 'POST',
            headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
          }, lotPayload);
          if (lotRes.status === 200 || lotRes.status === 201) lotId = lotRes.body.id;
        }
      }

      const precision = (it.base_unit === 'Kg') ? 3 : (!Number.isInteger(qty) ? 2 : 0);
      const line = {
        item_id: itemId,
        quantity: Number.isInteger(qty) ? String(qty) : qty.toFixed(precision),
        unit: it.base_unit || 'Piece',
        quality: 'Accepted',
        condition: 'New',
        notes: it.opening_balance?.raw_stock_card_qty ? ('كارت: ' + it.opening_balance.raw_stock_card_qty) : ''
      };
      if (lotId) line.lot_id = lotId;
      lines.push(line);
    }

    console.log(`Creating official Opening Receipt Document for ${lines.length} items with positive stock...`);
    const docPayload = {
      type: 'receipt',
      document_date: new Date().toISOString().split('T')[0],
      warehouse_id: mainWarehouse.id,
      reason: 'رصيد افتتاحي معتمد من كروت المخزن الرئيسي',
      lines
    };

    const docRes = await request(`${base}/documents`, {
      method: 'POST',
      headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
    }, docPayload);

    if (docRes.status === 200 || docRes.status === 201) {
      const doc = docRes.body;
      console.log(`Document #${doc.number} created. Submitting...`);

      const subRes = await request(`${base}/documents/${doc.id}/submit`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, { version: doc.version });

      if (subRes.status === 200) {
        console.log(`Document submitted. Posting to ledger...`);
        const postRes = await request(`${base}/documents/${doc.id}/post`, {
          method: 'POST',
          headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
        }, { version: subRes.body.version });

        if (postRes.status === 200) {
          console.log(`SUCCESS! Document #${doc.number} officially posted to immutable ledger!`);
        } else {
          console.error('Failed to post document:', postRes.status, postRes.body);
        }
      } else {
        console.error('Failed to submit document:', subRes.status, subRes.body);
      }
    } else {
      console.error('Failed to create opening document:', docRes.status, docRes.body);
    }
  }

  // ==========================================
  // 8. LICENSED WAREHOUSE 244 & ITEMS
  // ==========================================
  console.log('\n--- 8. Setting up Licensed warehouse 244 ---');
  let licensedWh = (whRes.body || []).find(w => w.name === 'Licensed warehouse 244');
  if (!licensedWh) {
    const createWh = await request(`${base}/warehouses`, {
      method: 'POST',
      headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
    }, {
      name: 'Licensed warehouse 244',
      site_id: null,
      active: true
    });
    licensedWh = { id: createWh.body.id, name: 'Licensed warehouse 244' };
    console.log(`✓ Licensed warehouse 244 created: ${licensedWh.id}`);
  } else {
    console.log(`✓ Licensed warehouse 244 exists: ${licensedWh.id}`);
  }

  const licensedItems = [
    { sku: 'TIG506280', name_en: 'TI D6', name_ar: 'خامة تيتانيوم قطر 6 مم (TI D6)', sub: 'titanium', unit: 'Bar', qty: 0, lot: '24-GR5-22#' },
    { sku: 'TIG50400', name_en: 'Titanium (D 4   L 2.80)', name_ar: 'خامة تيتانيوم (قطر 4 مم طول 2.80 م)', sub: 'titanium', unit: 'Bar', qty: 60, lot: '24-GR5-26#' },
    { sku: 'TIG50800', name_en: 'Titanium (D 8   L 2.80)', name_ar: 'خامة تيتانيوم (قطر 8 مم طول 2.80 م - وزن البار 630 جم)', sub: 'titanium', unit: 'Bar', qty: 18, lot: '24-GR5-26#' },
    { sku: 'TIG51000', name_en: 'Titanium (D10   L 2.80)', name_ar: 'خامة تيتانيوم (قطر 10 مم طول 2.80 م - وزن البار 980 جم)', sub: 'titanium', unit: 'Bar', qty: 0, lot: '24-GR5-26#' },
    { sku: 'PP901', name_en: 'Polypropylene (Random 901)', name_ar: 'خامة بولي بروبيلين حقن (راندوم 901)', sub: 'plastic materials', unit: 'Bag', qty: 15, lot: 'PP426' },
    { sku: 'PS861', name_en: 'Polystyrene (861)', name_ar: 'خامة بولي ستيرين حقن (861)', sub: 'plastic materials', unit: 'Bag', qty: 29, lot: 'PS426' },
    { sku: 'HDM30', name_en: 'HDPE (M30)', name_ar: 'خامة بولي إيثيلين عالي الكثافة HDPE (M30)', sub: 'plastic materials', unit: 'Bag', qty: 15, lot: 'HDM30' },
    { sku: 'AB500', name_en: 'ABS (5000 S)', name_ar: 'خامة أكريلونتريل بوتادين ستايرين ABS (5000 S)', sub: 'plastic materials', unit: 'Bag', qty: 6, lot: 'AB500' }
  ];

  const currentItemsRes = await request(`${base}/items?limit=500`, { headers: authHeaders });
  const currentItems = currentItemsRes.body || [];
  const currentItemMap = Object.fromEntries(currentItems.map(x => [x.sku, x]));
  const licensedLines = [];

  for (const it of licensedItems) {
    let itemId = currentItemMap[it.sku]?.id;
    if (!itemId) {
      const insRes = await request(`${base}/items`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, {
        sku: it.sku,
        name_ar: it.name_ar,
        name_en: it.name_en,
        category_id: subMap[it.sub],
        base_unit: it.unit,
        precision: 0,
        tracking: 'consumable',
        track_lot: true,
        track_serial: false,
        track_expiry: false,
        active: true
      });
      itemId = insRes.body.id;
      currentItemMap[it.sku] = insRes.body;
      console.log(`  ✓ Inserted item: [${it.sku}] ${it.name_ar}`);
    }

    // Ensure lot exists
    const lotsRes = await request(`${base}/lots?item_id=${itemId}`, { headers: authHeaders });
    let lotId = lotsRes.body?.find(l => l.code === it.lot)?.id;
    if (!lotId) {
      const lotRes = await request(`${base}/lots`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, {
        item_id: itemId,
        code: it.lot,
        notes: `لوت رصيد مخزن Licensed warehouse 244 (${it.lot})`
      });
      lotId = lotRes.body.id;
    }

    if (it.qty > 0) {
      licensedLines.push({
        item_id: itemId,
        quantity: String(it.qty),
        unit: it.unit,
        lot_id: lotId,
        quality: 'Accepted',
        condition: 'New',
        notes: `رصيد كارت مخزن Licensed warehouse 244 - Lot ${it.lot}`
      });
    }
  }

  // Check if opening receipt for Licensed warehouse 244 already exists
  const existingLicensedDocs = await request(`${base}/documents?warehouse_id=${licensedWh.id}&type=receipt`, { headers: authHeaders });
  const hasPostedReceipt = (existingLicensedDocs.body || []).some(d => d.status === 'Posted');

  if (hasPostedReceipt) {
    console.log(`✓ Official opening balances receipt already posted for ${licensedWh.name}.`);
  } else if (licensedLines.length > 0) {
    console.log(`Creating opening receipt for ${licensedLines.length} items in ${licensedWh.name}...`);
    const docRes = await request(`${base}/documents`, {
      method: 'POST',
      headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
    }, {
      type: 'receipt',
      document_date: new Date().toISOString().split('T')[0],
      warehouse_id: licensedWh.id,
      reason: 'رصيد افتتاحي معتمد لمخزن Licensed warehouse 244',
      lines: licensedLines
    });

    if (docRes.status === 200 || docRes.status === 201) {
      const doc = docRes.body;
      const subRes = await request(`${base}/documents/${doc.id}/submit`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, { version: doc.version });

      if (subRes.status === 200) {
        await request(`${base}/documents/${doc.id}/post`, {
          method: 'POST',
          headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
        }, { version: subRes.body.version });
        console.log(`✓ SUCCESS! Document #${doc.number} posted for ${licensedWh.name}!`);
      }
    }
  }

  // ==========================================
  // 9. DETAILED UNIFORM SIZES (Size-Specific Items)
  // ==========================================
  console.log('\n--- 9. Setting up Detailed Uniform Sizes ---');
  const tshirtsCatId = subMap['t-shirts'];
  const trousersCatId = subMap['trousers'];

  const detailedUniformItems = [
    // 4 Summer T-Shirts
    { sku: 'SUMMERUNIF-TS-M', name_en: 'Summer uniform T-shirt (Size M)', name_ar: 'تيشيرت صيفي للعاملين - مقاس M', catId: tshirtsCatId, qty: 16 },
    { sku: 'SUMMERUNIF-TS-L', name_en: 'Summer uniform T-shirt (Size L)', name_ar: 'تيشيرت صيفي للعاملين - مقاس L', catId: tshirtsCatId, qty: 11 },
    { sku: 'SUMMERUNIF-TS-XL', name_en: 'Summer uniform T-shirt (Size XL)', name_ar: 'تيشيرت صيفي للعاملين - مقاس XL', catId: tshirtsCatId, qty: 20 },
    { sku: 'SUMMERUNIF-TS-2XL', name_en: 'Summer uniform T-shirt (Size 2XL)', name_ar: 'تيشيرت صيفي للعاملين - مقاس 2XL', catId: tshirtsCatId, qty: 10 },
    // 4 Summer Trousers
    { sku: 'SUMMERUNIF-TR-XL', name_en: 'Summer uniform trousers (Size XL)', name_ar: 'بنطلون صيفي للعاملين - مقاس XL', catId: trousersCatId, qty: 11 },
    { sku: 'SUMMERUNIF-TR-2XL', name_en: 'Summer uniform trousers (Size 2XL)', name_ar: 'بنطلون صيفي للعاملين - مقاس 2XL', catId: trousersCatId, qty: 21 },
    { sku: 'SUMMERUNIF-TR-3XL', name_en: 'Summer uniform trousers (Size 3XL)', name_ar: 'بنطلون صيفي للعاملين - مقاس 3XL', catId: trousersCatId, qty: 12 },
    { sku: 'SUMMERUNIF-TR-4XL', name_en: 'Summer uniform trousers (Size 4XL)', name_ar: 'بنطلون صيفي للعاملين - مقاس 4XL', catId: trousersCatId, qty: 11 },
    // 6 Work Trousers
    { sku: 'TROUSERS-L', name_en: 'Work trousers (Size L)', name_ar: 'بنطلون عمل - مقاس L', catId: trousersCatId, qty: 1 },
    { sku: 'TROUSERS-XL', name_en: 'Work trousers (Size XL)', name_ar: 'بنطلون عمل - مقاس XL', catId: trousersCatId, qty: 14 },
    { sku: 'TROUSERS-2XL', name_en: 'Work trousers (Size 2XL)', name_ar: 'بنطلون عمل - مقاس 2XL', catId: trousersCatId, qty: 4 },
    { sku: 'TROUSERS-40', name_en: 'Work trousers (Size 40)', name_ar: 'بنطلون عمل - مقاس 40', catId: trousersCatId, qty: 2 },
    { sku: 'TROUSERS-48', name_en: 'Work trousers (Size 48)', name_ar: 'بنطلون عمل - مقاس 48', catId: trousersCatId, qty: 2 },
    { sku: 'TROUSERS-52', name_en: 'Work trousers (Size 52)', name_ar: 'بنطلون عمل - مقاس 52', catId: trousersCatId, qty: 3 }
  ];

  const uniformReceiptLines = [];

  for (const def of detailedUniformItems) {
    let item = null;
    const itemRes = await request(`${base}/items?sku=${encodeURIComponent(def.sku)}`, { headers: authHeaders });
    if (itemRes.body && itemRes.body.length > 0) {
      item = itemRes.body.find(x => x.sku === def.sku);
    }

    if (!item) {
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
      if (createRes.status === 200 || createRes.status === 201) {
        item = createRes.body;
      }
    }

    if (item) {
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

      uniformReceiptLines.push({
        item_id: item.id,
        quantity: String(def.qty),
        unit: 'Piece',
        quality: 'Accepted',
        condition: 'New',
        notes: `مقاس: ${def.sku.split('-').pop()}`,
        ...(lotId ? { lot_id: lotId } : {})
      });
    }
  }

  // Check if receipt already posted for uniform sizes
  const uniformDocsRes = await request(`${base}/documents?warehouse_id=${mainWarehouse.id}&type=receipt`, { headers: authHeaders });
  const hasUniformReceipt = (uniformDocsRes.body || []).some(d => d.reason?.includes('تفصيل مقاسات'));

  if (!hasUniformReceipt && uniformReceiptLines.length > 0) {
    console.log(`Creating opening receipt for ${uniformReceiptLines.length} uniform size items...`);
    const uniformDocRes = await request(`${base}/documents`, {
      method: 'POST',
      headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
    }, {
      type: 'receipt',
      document_date: new Date().toISOString().split('T')[0],
      warehouse_id: mainWarehouse.id,
      reason: 'رصيد افتتاحي - تفصيل مقاسات اليونيفورم وبناطيل العمل',
      lines: uniformReceiptLines
    });

    if (uniformDocRes.status === 200 || uniformDocRes.status === 201) {
      const doc = uniformDocRes.body;
      const uniformSubRes = await request(`${base}/documents/${doc.id}/submit`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, { version: doc.version });

      if (uniformSubRes.status === 200) {
        await request(`${base}/documents/${doc.id}/post`, {
          method: 'POST',
          headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
        }, { version: uniformSubRes.body.version });
        console.log(`✓ SUCCESS! Document #${doc.number} posted for Uniform Sizes!`);
      }
    }
  }

  // ==========================================
  // 10. SYNCHRONIZE OCTOBER MOVEMENTS & LOTS
  // ==========================================
  try {
    const { syncOctoberMovements } = require('./sync_all_movements.cjs');
    await syncOctoberMovements(base, authHeaders, mainWarehouse);
  } catch (syncErr) {
    console.error('Error during October movements sync:', syncErr);
  }

  // ==========================================
  // 11. CONFIGURE INTELLIGENT STOCK LEVELS
  // ==========================================
  try {
    const itemsRes = await request(`${base}/items?limit=200`, { headers: authHeaders });
    const allItems = itemsRes.body || [];
    let levelsCount = 0;
    for (const it of allItems) {
      let min = '10', rop = '25', target = '100';
      if (it.sku.startsWith('TIG') || it.sku.startsWith('BR') || it.sku.startsWith('ST')) {
        min = '5'; rop = '15'; target = '50';
      } else if (it.sku.includes('%') || it.sku.toLowerCase().includes('acid') || it.sku.toLowerCase().includes('alkaline')) {
        min = '20'; rop = '40'; target = '150';
      } else if (it.sku.startsWith('GLOVES') || it.sku.startsWith('MASK') || it.sku.startsWith('OVER')) {
        min = '50'; rop = '100'; target = '500';
      } else if (it.base_unit === 'Kg') {
        min = '10'; rop = '25'; target = '100';
      }

      await request(`${base}/item-levels`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, {
        item_id: it.id,
        warehouse_id: mainWarehouse.id,
        minimum: min,
        reorder: rop,
        target: target
      });
      levelsCount++;
    }
    console.log(`✓ Intelligent Stock Levels set for ${levelsCount} items in ${mainWarehouse.name}`);
  } catch (levelErr) {
    console.error('Error configuring stock levels:', levelErr);
  }

  // ==========================================
  // 12. SYNCHRONIZE BALANCES TO OCT 31 STATE
  // ==========================================
  try {
    const { syncOct31Balances } = require('./sync_oct31_balances.cjs');
    await syncOct31Balances(base, authHeaders);
  } catch (sync31Err) {
    console.error('Error during Oct 31 balance sync:', sync31Err);
  }

  console.log('\n======================================================');
  console.log('✓ SEED & MIGRATION COMPLETE');
  console.log(`✓ Main Medical Warehouse: ${mainWarehouse.name} (${mainWarehouse.id})`);
  console.log(`✓ Licensed warehouse 244: ${licensedWh.name} (${licensedWh.id})`);
  console.log(`✓ Departments: ${Object.keys(deptMap).length}`);
  console.log(`✓ Staff Members: ${Object.keys(empMap).length}`);
  console.log(`✓ Inventory Items: ${Object.keys(insertedItemMap).length + licensedItems.length}`);
  console.log('======================================================\n');
}

main().catch(err => {
  console.error('Error during seed:', err);
  process.exit(1);
});
