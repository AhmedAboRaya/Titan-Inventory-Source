const fs = require('fs');

const content = fs.readFileSync('temp_last_user_input.txt', 'utf8');
const lines = content.split(/\r?\n/);

let currentRoot = null;
let currentSub = null;
let currentLeaf = null;

const categories = [];
const items = [];
const errors = [];

for (let i = 60; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line.startsWith('## ثالثاً:')) break;

  if (line.startsWith('### القسم الرئيسي')) {
    const match = line.match(/`([^`]+)`\s*\(([^)]+)\)/);
    if (match) {
      currentRoot = { en: match[1].trim(), ar: match[2].trim() };
      currentSub = null;
      currentLeaf = null;
    }
  } else if (line.startsWith('#### ') && (line.includes('تحت التصنيف الفرعي:') || line.includes('تحت التصنيف الفرعي'))) {
    const match = line.match(/`([^`]+)`\s*\(([^)]+)\)/);
    if (match) {
      let subEn = match[1].trim();
      let subAr = match[2].trim();
      if (line.includes('يُعدّل اسمه إلى:')) {
        const updateMatch = line.match(/يُعدّل اسمه إلى:\s*`([^`]+)`\s*-\s*([^)]+)\)/);
        if (updateMatch) {
          subEn = updateMatch[1].trim();
          subAr = updateMatch[2].trim();
        }
      } else if (line.includes('يُعدّل اسمه إلى')) {
        const updateMatch2 = line.match(/يُعدّل اسمه إلى\s*`([^`]+)`\s*-\s*([^)]+)\)/);
        if (updateMatch2) {
          subEn = updateMatch2[1].trim();
          subAr = updateMatch2[2].trim();
        }
      }
      currentSub = { en: subEn, ar: subAr, root: currentRoot?.en };
      currentLeaf = null;
    }
  } else if (line.startsWith('##### ') || (line.startsWith('- **`') && line.includes('`') && currentSub) || (line.startsWith('1. تحت التصنيف الفرعي') || line.startsWith('2. تحت التصنيف الفرعي') || line.startsWith('3. تحت التصنيف الفرعي') || line.startsWith('4. تحت التصنيف الفرعي'))) {
    if (currentRoot?.en === 'Spare Parts & Devices') {
      // In Spare Parts, the items are listed directly under Level 2 subcategories (Drives, Encoders, etc.)
      const matchSub = line.match(/\*\*`([^`]+)`\s*\(([^)]+)\)\*\*/);
      if (matchSub) {
        currentSub = { en: matchSub[1].trim(), ar: matchSub[2].trim(), root: currentRoot?.en };
        currentLeaf = null;
      }
    } else {
      const match = line.match(/`([^`]+)`\s*\(([^)]+)\)/);
      const illMatch = line.match(/Illustration:\s*`([^`]+)`/);
      if (match) {
        currentLeaf = {
          en: match[1].trim(),
          ar: match[2].trim(),
          sub: currentSub?.en,
          root: currentRoot?.en,
          illustration: illMatch ? illMatch[1].trim() : 'storage'
        };
        categories.push(currentLeaf);
      }
    }
  } else if (line.includes('SKU:')) {
    // Parse item line
    const parts = line.split('|').map(p => p.trim());
    const skuMatch = parts[0].match(/SKU:\s*([A-Za-z0-9._-]+)/);
    if (!skuMatch) {
      errors.push({ lineIndex: i + 1, line, reason: 'No SKU match' });
      continue;
    }
    const sku = skuMatch[1];
    let nameAr = '';
    let nameEn = '';
    let spec = '';
    let brand = '';
    let unit = 'Piece';
    let qty = 0;
    let repairQty = 0;
    let notes = '';

    for (let pIdx = 1; pIdx < parts.length; pIdx++) {
      const p = parts[pIdx];
      if (p.startsWith('الاسم:')) {
        const rawName = p.replace(/^الاسم:\s*/, '').trim();
        const enMatch = rawName.match(/\(`([^`]+)`\)/) || rawName.match(/\(([^)]+)\)/);
        if (enMatch) {
          nameEn = enMatch[1].replace(/`/g, '').trim();
          nameAr = rawName.replace(enMatch[0], '').replace(/`/g, '').trim();
        } else {
          nameAr = rawName.replace(/`/g, '').trim();
          nameEn = rawName.replace(/`/g, '').trim();
        }
      } else if (p.startsWith('المقاس:') || p.startsWith('المواصفة:')) {
        spec = p.replace(/^(المقاس|المواصفة):\s*/, '').replace(/`/g, '').trim();
      } else if (p.startsWith('الماركة:')) {
        brand = p.replace(/^الماركة:\s*/, '').replace(/`/g, '').trim();
      } else if (p.startsWith('الوحدة:')) {
        const rawUnit = p.replace(/^الوحدة:\s*/, '').replace(/`/g, '').trim();
        if (rawUnit.includes('Set')) unit = 'Set';
        else if (rawUnit.includes('Box')) unit = 'Box';
        else if (rawUnit.includes('Bar')) unit = 'Bar';
        else if (rawUnit.includes('Roll')) unit = 'Roll';
      }

      if (p.includes('الكمية')) {
        const qtyMatch = p.match(/الكمية[^`*]*:\s*`(\d+)`/);
        if (qtyMatch) qty = parseInt(qtyMatch[1], 10);
        const repairMatch = p.match(/تحت الإصلاح.*?:\s*`(\d+)`/);
        if (repairMatch) repairQty = parseInt(repairMatch[1], 10);
        const noteMatch = p.match(/\*\(([^)]+)\)\*/);
        if (noteMatch) notes = noteMatch[1].trim();
      }
    }

    if (!nameAr && spec) {
      nameAr = spec;
      nameEn = spec;
    }

    // Default Arabic / English names fallback
    if (!nameAr) nameAr = sku;
    if (!nameEn) nameEn = sku;

    items.push({
      sku,
      name_ar: nameAr,
      name_en: nameEn,
      specification: spec,
      brand,
      base_unit: unit,
      qty,
      repair_qty: repairQty,
      notes,
      root: currentRoot?.en,
      sub: currentSub?.en,
      leaf: currentLeaf?.en || null
    });
  }
}

console.log('Categories parsed:', categories.length);
console.log('Items parsed:', items.length);
if (errors.length) console.log('Errors:', errors);

// Check if any item has missing root or sub
const missingCat = items.filter(i => !i.root || (!i.sub && !i.leaf));
if (missingCat.length) {
  console.log('Items missing category:', missingCat.length, missingCat);
}

fs.writeFileSync('tools/cnc_parsed_data.json', JSON.stringify({ categories, items }, null, 2), 'utf8');
console.log('Written to tools/cnc_parsed_data.json');
