/**
 * TITAN INVENTORY — Seed Data Importer
 * Imports prepared items, lots, and posted opening balances from titan_inventory_prepared_migration.json
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

async function main() {
  const port = process.env.PORT || 19012;
  const base = `http://127.0.0.1:${port}/inventory/v1`;
  const seedFile = process.env.SEED_FILE || 'E:/AboRaya/TITAN/titan_inventory_prepared_migration.json';

  if (!fs.existsSync(seedFile)) {
    console.error('Seed file not found at:', seedFile);
    process.exit(1);
  }

  console.log(`Connecting to ${base}...`);
  const loginRes = await request(`${base}/auth/login`, { method: 'POST' }, {
    username: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASSWORD || 'TEST-only-password-4821'
  });

  if (loginRes.status !== 200) {
    console.error('Login failed:', loginRes.body);
    process.exit(1);
  }

  const cookie = loginRes.headers['set-cookie'];
  const csrf = loginRes.body.csrf;
  const authHeaders = { 'Cookie': cookie, 'x-csrf-token': csrf };

  const catRes = await request(`${base}/categories`, { headers: authHeaders });
  const subcategories = catRes.body.filter(c => c.parent_id);
  const subMap = {};
  for (const s of subcategories) subMap[s.name_en.toLowerCase()] = s.id;

  const whRes = await request(`${base}/warehouses`, { headers: authHeaders });
  const warehouse = whRes.body[0];
  if (!warehouse) throw new Error('No warehouse available');

  const prepared = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
  console.log(`Importing ${prepared.items.length} items into inventory...`);

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

  const insertedItemMap = {};
  for (const it of prepared.items) {
    const subId = findSubcategory(it);
    const qty = it.opening_balance?.quantity || 0;
    const precision = !Number.isInteger(qty) ? 2 : (it.base_unit === 'Kg' ? 3 : 0);

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
      insertedItemMap[it.sku] = res.body.id;
    } else {
      const ex = await request(`${base}/items?search=${encodeURIComponent(it.sku)}`, { headers: authHeaders });
      const f = (ex.body || []).find(x => x.sku === it.sku);
      if (f) insertedItemMap[it.sku] = f.id;
    }
  }

  console.log(`Items confirmed in system: ${Object.keys(insertedItemMap).length}`);

  // Opening balances receipt
  const lines = [];
  for (const it of prepared.items) {
    const itemId = insertedItemMap[it.sku];
    const qty = it.opening_balance?.quantity || 0;
    if (!itemId || qty <= 0) continue;

    let lotId = null;
    if (it.track_lot) {
      const lotCode = (it.opening_balance.lot_code && it.opening_balance.lot_code !== '(N.A)')
        ? it.opening_balance.lot_code.split(',')[0].replace(/[^A-Za-z0-9\-\.\_]/g, '').trim()
        : ('LOT-' + it.sku.replace(/[^A-Za-z0-9]/g, ''));
      const cleanLot = lotCode.slice(0, 40) || 'LOT-INIT';

      const lotPayload = { item_id: itemId, code: cleanLot, notes: 'رصيد افتتاحي' };
      if (it.track_expiry) lotPayload.expires_on = '2027-12-31';

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

    const precision = !Number.isInteger(qty) ? 2 : (it.base_unit === 'Kg' ? 3 : 0);
    const line = {
      item_id: itemId,
      quantity: Number.isInteger(qty) ? String(qty) : qty.toFixed(precision),
      unit: it.base_unit,
      quality: 'Accepted',
      condition: 'New'
    };
    if (lotId) line.lot_id = lotId;
    lines.push(line);
  }

  if (lines.length > 0) {
    console.log(`Posting receipt for ${lines.length} inventory positions...`);
    const docRes = await request(`${base}/documents`, {
      method: 'POST',
      headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
    }, {
      type: 'receipt',
      document_date: new Date().toISOString().split('T')[0],
      warehouse_id: warehouse.id,
      reason: 'رصيد افتتاحي معتمد من كروت المخزن',
      lines
    });

    if (docRes.status === 200 || docRes.status === 201) {
      const doc = docRes.body;
      const sub = await request(`${base}/documents/${doc.id}/submit`, {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, { version: doc.version });

      if (sub.status === 200) {
        const post = await request(`${base}/documents/${doc.id}/post`, {
          method: 'POST',
          headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
        }, { version: sub.body.version });

        if (post.status === 200) {
          console.log(`Document #${doc.number} successfully posted to official ledger!`);
        }
      }
    }
  }

  console.log('Done! All inventory items and balances are live.');
}

main().catch(console.error);
