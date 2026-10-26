import React, { useState, useMemo } from 'react';
import { Row } from './ui';
import referenceItems from './official_stock_card_reference.json';

export interface StockCardLotRow {
  lot: string;
  qty: string;
  remarks: string;
  status: string;
}

export interface StockCardGroupedItem {
  code: string;
  name: string;
  category: string;
  lots: StockCardLotRow[];
}

export interface StockCardProps {
  balances: Row[];
  warehouseName: string;
  warehouseId?: string;
  items?: Row[];
  categories?: Row[];
  onPrint?: () => void;
}

export const OFFICIAL_PARENT_CATEGORIES = [
  'CNC Cutting Tools',
  'Machine Accessories',
  'Raw Materials',
  'Packaging Materials',
  'Chemicals',
  'Cleanroom Supplies',
  'Spare Parts & Devices',
  'General Tools',
  'Office & General Supplies',
  'Uniforms'
];

export const CATEGORY_INFO: Record<string, { ar: string; icon: string }> = {
  'CNC Cutting Tools': { ar: 'أدوات قطع CNC', icon: '⚙️' },
  'Machine Accessories': { ar: 'إكسسوارات الماكينات', icon: '🔧' },
  'Raw Materials': { ar: 'الخامات', icon: '🔩' },
  'Packaging Materials': { ar: 'مواد التغليف', icon: '📦' },
  'Chemicals': { ar: 'الكيماويات', icon: '🍶' },
  'Cleanroom Supplies': { ar: 'مستلزمات الغرف النظيفة', icon: '🧤' },
  'Spare Parts & Devices': { ar: 'قطع الغيار والأجهزة', icon: '⚡' },
  'General Tools': { ar: 'الأدوات العامة', icon: '🛠️' },
  'Office & General Supplies': { ar: 'مستلزمات المكتب', icon: '📄' },
  'Uniforms': { ar: 'الملابس واليونيفورم', icon: '🥼' }
};

export const CONVERSION_NOTES = [
  'Small Pouch (25 Kg sack, total 15,527 units): 10 bags weigh 16.1 g. Daily consumption for 600 implants + 600 accessories is 2.0 Kg.',
  'Ampoules (10 ampoules weigh 18.5 g): Daily consumption for 600 ampoules is 1.11 Kg. A 25 Kg raw material sack yields 9,600 ampoules.',
  'Implant Holder (10 holders weigh 9.7 g): Daily consumption for 600 holders is 0.5 Kg (500 g).',
  'IFU Leaflet: 1 ream contains 975 sheets, total weight is 7.8 Kg.'
];

export function toEnglishUnit(qtyStr: string): string {
  if (!qtyStr) return '0';
  let s = qtyStr.trim();
  s = s.replace(/رول/g, 'Rolls');
  s = s.replace(/قطعة|قطع/g, 'Pcs');
  s = s.replace(/كجم|كيلو/g, 'Kg');
  s = s.replace(/بار|قضيب/g, 'Bars');
  s = s.replace(/زجاجة/g, 'Bottles');
  s = s.replace(/شيكارة|كيس|أكياس/g, 'Bags');
  s = s.replace(/\bPieces?\b/gi, 'Pcs');
  s = s.replace(/\bBars?\b/gi, 'Bars');
  s = s.replace(/\bRolls?\b/gi, 'Rolls');
  s = s.replace(/\bBottles?\b/gi, 'Bottles');
  s = s.replace(/\bBags?\b/gi, 'Bags');
  return s;
}

const REMARKS_TRANSLATIONS: Record<string, string> = {
  'بغرفه الطباعة': 'In printing room',
  'تم فتح باليته 30/7/2026': 'Pallet opened on 30/07/2026',
  'رصيد راكد مرحل من دفاتر 2025 (وارد 2023)': 'Dormant stock carried forward from 2025 ledger (received 2023)',
  '1 قطعة': '1 Pc',
  '1 (1m)': '1 Pc (1 m)',
  'Supplier  374 litre': 'Supplier: 374 Litres',
  '28 bottles on shelf (1 bottle deficit)': '28 bottles on shelf (1 bottle deficit)',
  '7 kg Under inspection': '7 Kg (Under inspection)',
  '10.5 Kg (5500 Ampoule) (N)': '10.5 Kg (5,500 Ampoules) (N)',
  '46 bar 1.5 m (D6)': '46 bars 1.5 m (D6)',
  '2 (D10) (bar=760gm)': '2 bars (D10, bar=760g)',
  'Injected raw material': 'Injected raw material',
  '(bar=630gm)': '(bar = 630g)',
  '(bar=980gm)': '(bar = 980g)',
  '10 L': '10 L',
  '25 Kg': '25 Kg',
  '12 N': '12 N',
  '190 N': '190 N',
  '40 N': '40 N',
  '20 N': '20 N',
  '502L': '502L',
  '3 جديد (New) + 6 غسيل (Washing)': '3 New + 6 in Laundry',
  'تيشيرت: M:16, L:11, XL:20, 2XL:10 | بنطلون: XL:11, 2XL:21, 3XL:12, 4XL:11': 'T-shirt: M:16, L:11, XL:20, 2XL:10 | Trousers: XL:11, 2XL:21, 3XL:12, 4XL:11',
  'مقاسات: 1L, 14XL, 4(2XL), 2(40), 2(48), 3(52)': 'Sizes: 1(L), 14(XL), 4(2XL), 2(size 40), 2(size 48), 3(size 52)',
  '3 بنطلون هايجين معتمد': '3 Certified Hygiene Trousers',
  '1 شيكارة (110 Micron) + 1.5 شيكارة (250 Micron)': '1 Sack (110 Micron) + 1.5 Sack (250 Micron)',
  '6 لفات كاملة + نصف لفة (6 + ½)': '6 Full Coils + ½ Coil (6.5 Coils)',
  '2 كبير (Large) + 33 عادي (Regular)': '2 Large + 33 Regular',
  '20 كبير (Large) + 20 صغير (Small)': '20 Large + 20 Small'
};

export function toEnglishRemarks(remarks?: string): string {
  if (!remarks || !remarks.trim() || remarks.trim() === '—') return '—';
  const trimmed = remarks.trim();
  if (REMARKS_TRANSLATIONS[trimmed]) return REMARKS_TRANSLATIONS[trimmed];
  return trimmed
    .replace(/بغرفه الطباعة/g, 'In printing room')
    .replace(/تم فتح باليته 30\/7\/2026/g, 'Pallet opened on 30/07/2026')
    .replace(/رصيد راكد مرحل من دفاتر 2025 \(وارد 2023\)/g, 'Dormant stock carried forward from 2025 ledger (received 2023)')
    .replace(/جديد/g, 'New')
    .replace(/غسيل/g, 'Laundry')
    .replace(/تيشيرت/g, 'T-shirt')
    .replace(/بنطلون/g, 'Trousers')
    .replace(/مقاسات/g, 'Sizes')
    .replace(/شيكارة/g, 'Sack')
    .replace(/لفات|لفة/g, 'Coils')
    .replace(/كبير/g, 'Large')
    .replace(/صغير/g, 'Small')
    .replace(/عادي/g, 'Regular')
    .replace(/قطعة/g, 'Pc')
    .replace(/كجم/g, 'Kg');
}

export function StockCard({ balances = [], warehouseName, warehouseId, items = [], categories = [], onPrint }: StockCardProps) {
  const currentDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Map reference items for lookup (fallback for official remarks, units, status)
  const refMap = useMemo(() => {
    const map = new Map<string, typeof referenceItems[0]>();
    for (const item of referenceItems) {
      map.set(item.code.trim().toUpperCase(), item);
      const normalized = item.code.replace(/[\s\(\)\-_]/g, '').toUpperCase();
      map.set(normalized, item);
    }
    return map;
  }, []);

  // Classify each balance / item to official parent category
  const categorizedData = useMemo(() => {
    const groups: Record<string, StockCardGroupedItem[]> = {};
    for (const c of OFFICIAL_PARENT_CATEGORIES) {
      groups[c] = [];
    }

    const itemMap = new Map<string, Row>();
    for (const it of items) {
      if (it.sku) {
        const skuUpper = it.sku.trim().toUpperCase();
        itemMap.set(skuUpper, it);
        itemMap.set(skuUpper.replace(/[\s\(\)\-_]/g, ''), it);
      }
    }

    const catMap = new Map<string, Row>();
    for (const c of categories) {
      if (c.id) catMap.set(c.id, c);
    }

    // Helper to find parent category
    function matchParentCategory(code: string, name: string): string {
      const codeUpper = (code || '').toUpperCase().trim();
      const normCode = codeUpper.replace(/[\s\(\)\-_]/g, '');

      // 1. Try matching from DB items and categories tree
      const dbItem = itemMap.get(codeUpper) || itemMap.get(normCode);
      if (dbItem && dbItem.category_id) {
        const cat = catMap.get(dbItem.category_id);
        if (cat) {
          if (!cat.parent_id) {
            const found = OFFICIAL_PARENT_CATEGORIES.find(p => p.toLowerCase() === cat.name_en?.toLowerCase());
            if (found) return found;
          } else {
            const parent = catMap.get(cat.parent_id);
            if (parent) {
              const found = OFFICIAL_PARENT_CATEGORIES.find(p => p.toLowerCase() === parent.name_en?.toLowerCase());
              if (found) return found;
            }
          }
        }
      }

      // 2. Pattern-based robust fallback
      if (
        codeUpper.endsWith('(T)') ||
        codeUpper.startsWith('PBS') ||
        codeUpper.startsWith('SBS') ||
        codeUpper.startsWith('AMS') ||
        codeUpper.startsWith('TRS') ||
        codeUpper.startsWith('PPS') ||
        codeUpper === 'IFU' ||
        codeUpper.startsWith('PB1') ||
        codeUpper.startsWith('SBB') ||
        codeUpper.startsWith('HOIM') ||
        codeUpper.startsWith('VIAL') ||
        codeUpper.startsWith('BASIC')
      ) {
        return 'Packaging Materials';
      }
      if (
        codeUpper.startsWith('TI') ||
        codeUpper.startsWith('ST') ||
        codeUpper.startsWith('BR') ||
        codeUpper.startsWith('AC') ||
        codeUpper.startsWith('TE0') ||
        codeUpper.startsWith('TE1') ||
        codeUpper === 'TE080000' ||
        codeUpper.startsWith('PP') ||
        codeUpper.startsWith('PS') ||
        codeUpper.startsWith('HD') ||
        codeUpper.startsWith('AB')
      ) {
        return 'Raw Materials';
      }
      if (
        codeUpper.startsWith('ET') ||
        codeUpper.startsWith('HA') ||
        codeUpper.startsWith('SA') ||
        codeUpper.includes('ALKALINE') ||
        codeUpper.includes('NEUTRAL') ||
        codeUpper.includes('ACIDIC') ||
        codeUpper === 'ADP' ||
        codeUpper.startsWith('SAND-74') ||
        codeUpper.startsWith('ANODIZATIO')
      ) {
        return 'Chemicals';
      }
      if (
        codeUpper.startsWith('GLOVES') ||
        codeUpper.startsWith('MASK') ||
        codeUpper.startsWith('GOWN') ||
        codeUpper.startsWith('OVERHEAD') ||
        codeUpper.startsWith('OVERSHOES') ||
        codeUpper.startsWith('OVERBEAR')
      ) {
        return 'Cleanroom Supplies';
      }
      if (
        codeUpper.startsWith('A4') ||
        codeUpper.startsWith('NOTEBOOK') ||
        codeUpper.startsWith('PATTERY') ||
        codeUpper.startsWith('VERNEIRPAT') ||
        codeUpper.startsWith('TEPPATTERY') ||
        codeUpper.startsWith('STAPLERPIN')
      ) {
        return 'Office & General Supplies';
      }
      if (
        codeUpper.includes('UNIF') ||
        codeUpper.includes('COAT') ||
        codeUpper.includes('TROUSERS') ||
        codeUpper.includes('DARKBLUE') ||
        codeUpper.includes('HYGIENE')
      ) {
        return 'Uniforms';
      }
      if (
        codeUpper.startsWith('ARABO') ||
        codeUpper.startsWith('RINGLIGHT') ||
        codeUpper.startsWith('ULTRASONIC') ||
        codeUpper.startsWith('ITEM062')
      ) {
        return 'Spare Parts & Devices';
      }
      if (
        codeUpper.startsWith('CUTTERS') ||
        codeUpper.startsWith('SCISSORS') ||
        codeUpper.startsWith('FORCEPS') ||
        codeUpper.startsWith('EXTRAPARTS') ||
        codeUpper.startsWith('ELECTRICIT') ||
        codeUpper.startsWith('STICKROOLS') ||
        codeUpper.startsWith('TEFLONROLL') ||
        codeUpper.startsWith('ITEM056') ||
        codeUpper.startsWith('PYREXBOWL')
      ) {
        return 'General Tools';
      }

      return 'General Tools';
    }

    // Determine items scope:
    const isLicensedWh = warehouseName.toLowerCase().includes('licensed') || warehouseName.includes('244');
    
    if (isLicensedWh) {
      // 8 Specific items for Licensed warehouse 244 (Raw Materials)
      const licensedDefs = [
        { code: 'TIG506280', name: 'TI D6', lot: '24-GR5-22#', qty: '0 Bars', remarks: '', status: '' },
        { code: 'TIG50400', name: 'Titanium (D 4   L 2.80)', lot: '24-GR5-26# (Parked)', qty: '60 Bars', remarks: '', status: 'parked' },
        { code: 'TIG50800', name: 'Titanium (D 8   L 2.80)', lot: '24-GR5-26# (Parked)', qty: '18 Bars', remarks: '(bar = 630g)', status: 'parked' },
        { code: 'TIG51000', name: 'Titanium (D10   L 2.80)', lot: '24-GR5-26#', qty: '0 Bars', remarks: '(bar = 980g)', status: '' },
        { code: 'PP901', name: 'Polypropylene (Random 901)', lot: 'PP426 (Parked)', qty: '15 Bags', remarks: 'Injected raw material', status: 'parked' },
        { code: 'PS861', name: 'Polystyrene (861)', lot: 'PS426 (Parked)', qty: '29 Bags', remarks: '', status: 'parked' },
        { code: 'HDM30', name: 'HDPE (M30)', lot: 'HDM30 (Parked)', qty: '15 Bags', remarks: '', status: 'parked' },
        { code: 'AB500', name: 'ABS (5000 S)', lot: 'AB500 (Parked)', qty: '6 Bags', remarks: '', status: 'parked' }
      ];

      const enriched: StockCardGroupedItem[] = licensedDefs.map(def => {
        const bal = balances.find(b => b.sku === def.code || b.name_en === def.name);
        let qtyStr = def.qty;
        let status = def.status;
        if (bal) {
          const qtyVal = Number(bal.quantity) || 0;
          qtyStr = `${qtyVal} ${def.qty.split(' ')[1] || bal.base_unit || 'Bars'}`;
          status = qtyVal > 0 ? 'parked' : '';
        }
        return {
          code: def.code,
          name: def.name,
          category: 'Raw Materials',
          lots: [{
            lot: def.lot,
            qty: toEnglishUnit(qtyStr),
            remarks: toEnglishRemarks(def.remarks),
            status
          }]
        };
      });

      groups['Raw Materials'] = enriched;
      return groups;
    }

    // Default: Main Medical Warehouse or All Warehouses
    // Count occurrences of each code in referenceItems to detect multi-lot items
    const refCodeCounts = new Map<string, number>();
    for (const ref of referenceItems) {
      const codeUpper = ref.code.trim().toUpperCase();
      refCodeCounts.set(codeUpper, (refCodeCounts.get(codeUpper) || 0) + 1);
    }

    const balanceBySku = new Map<string, Row[]>();
    for (const b of balances) {
      const sku = (b.sku || '').trim().toUpperCase();
      if (!balanceBySku.has(sku)) balanceBySku.set(sku, []);
      balanceBySku.get(sku)!.push(b);
    }

    for (const ref of referenceItems) {
      const cat = matchParentCategory(ref.code, ref.name);
      const skuUpper = ref.code.trim().toUpperCase();
      const liveBals = balanceBySku.get(skuUpper) || balanceBySku.get(skuUpper.replace(/[\s\(\)\-_]/g, '')) || [];
      const isMultiLot = (refCodeCounts.get(skuUpper) || 0) > 1;

      // Determine lot status
      let status = '';
      if (ref.lot.includes('(In Use)')) {
        status = 'in-use';
      } else if (ref.lot.includes('(Parked)')) {
        status = 'parked';
      }

      let displayQty = ref.qty;
      if (!isMultiLot && liveBals.length > 0) {
        const num = Number(liveBals[0].quantity);
        const unitPart = ref.qty.replace(/^[0-9\.\,]+\s*/, '');
        if (!isNaN(num) && unitPart) {
          displayQty = `${num} ${unitPart}`.trim();
        }
      }

      const lotRow: StockCardLotRow = {
        lot: ref.lot,
        qty: toEnglishUnit(displayQty),
        remarks: toEnglishRemarks(ref.remarks),
        status
      };

      // Group lots under the same item code so rowSpan can merge them
      const existing = groups[cat].find(x => x.code.trim().toUpperCase() === skuUpper);
      if (existing) {
        existing.lots.push(lotRow);
      } else {
        groups[cat].push({
          code: ref.code,
          name: ref.name,
          category: cat,
          lots: [lotRow]
        });
      }
    }

    // If there are any balances for items not present in reference (like newly added items), append them
    for (const b of balances) {
      const sku = (b.sku || '').trim().toUpperCase();
      const norm = sku.replace(/[\s\(\)\-_]/g, '');
      const dbItem = itemMap.get(sku) || itemMap.get(norm);
      if (dbItem && !dbItem.active) continue;
      if (sku === 'SUMMERUNIF-71' || sku === 'TROUSERS-72') continue;
      if (!refMap.has(sku) && !refMap.has(norm)) {
        const cat = matchParentCategory(b.sku, b.name_en || b.name_ar);
        if (!groups[cat]) groups[cat] = [];
        const existing = groups[cat].find(x => x.code.trim().toUpperCase() === sku);
        const lotRow: StockCardLotRow = {
          lot: `${b.lot_code || '(N.A)'} (Parked)`,
          qty: toEnglishUnit(`${Number(b.quantity) || 0} ${b.base_unit || ''}`.trim()),
          remarks: toEnglishRemarks(b.lot_notes || ''),
          status: 'parked'
        };
        if (existing) {
          existing.lots.push(lotRow);
        } else {
          groups[cat].push({
            code: b.sku,
            name: b.name_en || b.name_ar,
            category: cat,
            lots: [lotRow]
          });
        }
      }
    }

    return groups;
  }, [balances, warehouseName, refMap, items, categories]);

  // Total summary counts
  const totalSummary = useMemo(() => {
    let totalItems = 0;
    let inUseCount = 0;
    let parkedCount = 0;
    for (const itemsList of Object.values(categorizedData)) {
      totalItems += itemsList.length;
      for (const item of itemsList) {
        for (const lot of item.lots) {
          if (lot.status === 'in-use') inUseCount++;
          else if (lot.status === 'parked') parkedCount++;
        }
      }
    }
    return { totalItems, inUseCount, parkedCount };
  }, [categorizedData]);

  // Filter categories based on selection and search
  const visibleCategories = useMemo(() => {
    let cats = activeCategory === 'all' ? OFFICIAL_PARENT_CATEGORIES : [activeCategory];

    // Filter out categories with zero items unless specifically selected
    cats = cats.filter(c => (categorizedData[c] || []).length > 0);

    if (!searchTerm.trim()) {
      return cats;
    }

    const term = searchTerm.toLowerCase().trim();
    return cats.filter(c => {
      const itemsList = categorizedData[c] || [];
      return (
        c.toLowerCase().includes(term) ||
        CATEGORY_INFO[c]?.ar?.toLowerCase().includes(term) ||
        itemsList.some(i =>
          i.code.toLowerCase().includes(term) ||
          i.name.toLowerCase().includes(term) ||
          i.lots.some(l =>
            l.lot.toLowerCase().includes(term) ||
            l.qty.toLowerCase().includes(term) ||
            l.remarks?.toLowerCase().includes(term)
          )
        )
      );
    });
  }, [activeCategory, categorizedData, searchTerm]);

  return (
    <div className="stock-card-wrapper">
      {/* Interactive Category Segment Tabs Bar */}
      <div className="stock-card-category-pills no-print">
        <button
          className={`cat-pill ${activeCategory === 'all' ? 'active' : ''}`}
          onClick={() => setActiveCategory('all')}
        >
          <span className="pill-title">🌐 All Categories</span>
          <span className="pill-badge">{totalSummary.totalItems}</span>
        </button>

        {OFFICIAL_PARENT_CATEGORIES.map(catKey => {
          const catList = categorizedData[catKey] || [];
          if (catList.length === 0) return null;
          const info = CATEGORY_INFO[catKey] || { ar: '', icon: '📁' };

          return (
            <button
              key={catKey}
              className={`cat-pill ${activeCategory === catKey ? 'active' : ''}`}
              onClick={() => setActiveCategory(catKey)}
            >
              <span className="pill-icon">{info.icon}</span>
              <span className="pill-title">{catKey}</span>
              <span className="pill-badge">{catList.length}</span>
            </button>
          );
        })}
      </div>

      {/* Toolbar with Search and Print */}
      <div className="stock-card-toolbar no-print">
        <div className="stock-card-search-box">
          <input
            type="search"
            placeholder="🔍 Search by Item Code, Name, Lot No., or Remarks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="clear-search" onClick={() => setSearchTerm('')}>✕</button>
          )}
        </div>

        <div className="toolbar-stats">
          <span className="stat-badge in-use">
            🟢 In Use: <b>{totalSummary.inUseCount}</b>
          </span>
          <span className="stat-badge parked">
            🟡 Parked: <b>{totalSummary.parkedCount}</b>
          </span>
        </div>

        <div className="toolbar-btns">
          <button className="primary" onClick={onPrint || (() => window.print())}>
            🖨️ {activeCategory === 'all' ? 'Print Entire Stock Card (PDF)' : `Print (${activeCategory}) PDF`}
          </button>
        </div>
      </div>

      {/* Printable Sheet */}
      <div className="stock-card-paper">
        {/* Official Titan Boxed Header */}
        <table className="stock-card-header-table">
          <tbody>
            <tr>
              <td rowSpan={2} className="stock-card-header-logo-cell">
                <img
                  src={import.meta.env.BASE_URL + 'art/titan_logo.jpeg'}
                  alt="TITAN INDUSTRIES"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent && !parent.querySelector('.logo-fallback')) {
                      const div = document.createElement('div');
                      div.className = 'logo-fallback';
                      div.style.fontWeight = 'bold';
                      div.style.fontSize = '16px';
                      div.style.letterSpacing = '1px';
                      div.style.color = '#0f172a';
                      div.innerText = 'TITAN INDUSTRIES';
                      parent.appendChild(div);
                    }
                  }}
                />
              </td>
              <td className="stock-card-header-title-cell">
                Stock card {activeCategory !== 'all' ? `— ${activeCategory}` : ''}
              </td>
            </tr>
            <tr>
              <td className="stock-card-header-code-cell">
                QF-027-002
              </td>
            </tr>
          </tbody>
        </table>

        {/* Subtitle / Metadata Strip */}
        <div className="stock-card-meta-bar">
          <div>
            <b>Warehouse:</b> {warehouseName}
          </div>
          <div>
            <b>Issue Date:</b> {currentDate}
          </div>
          <div>
            <b>Active Category:</b> {activeCategory === 'all' ? 'All Official Categories' : activeCategory}
          </div>
          <div>
            <b>Quality Standard:</b> Rev 1/0 • ISO 13485:2016 Audit Compliance
          </div>
        </div>

        {/* Divided Distinct Tables per Category */}
        {visibleCategories.map(catKey => {
          let catItems = categorizedData[catKey] || [];
          if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase().trim();
            catItems = catItems.filter(i =>
              i.code.toLowerCase().includes(term) ||
              i.name.toLowerCase().includes(term) ||
              i.lots.some(l =>
                l.lot.toLowerCase().includes(term) ||
                l.qty.toLowerCase().includes(term) ||
                l.remarks?.toLowerCase().includes(term)
              )
            );
          }
          if (catItems.length === 0) return null;

          const catInfo = CATEGORY_INFO[catKey] || { ar: '', icon: '📁' };

          return (
            <div key={catKey} className="stock-card-category-block">
              {/* Category Segment Header */}
              <div className="stock-card-category-header">
                <div className="cat-title-left">
                  <span className="cat-icon">{catInfo.icon}</span>
                  <span className="cat-name-en">{catKey}</span>
                </div>
                <div className="cat-badge-right">
                  {catItems.length} {catItems.length === 1 ? 'Item' : 'Items'}
                </div>
              </div>

              {/* 5-Column Table for this Category */}
              <table className="stock-card-table">
                <thead>
                  <tr>
                    <th style={{ width: '16%' }}>Item Code</th>
                    <th style={{ width: '30%' }}>Item Name</th>
                    <th style={{ width: '18%' }}>Lot No.</th>
                    <th style={{ width: '16%' }}>QTY.</th>
                    <th style={{ width: '20%' }}>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {catItems.map((item, itemIdx) => (
                    <React.Fragment key={`${catKey}_${item.code}_${itemIdx}`}>
                      {item.lots.map((lotRow, lotIdx) => (
                        <tr key={`${catKey}_${item.code}_lot_${lotIdx}`}>
                          {lotIdx === 0 && (
                            <>
                              <td
                                rowSpan={item.lots.length > 1 ? item.lots.length : undefined}
                                className="cell-code"
                              >
                                {item.code}
                              </td>
                              <td
                                rowSpan={item.lots.length > 1 ? item.lots.length : undefined}
                                className="cell-name"
                              >
                                {item.name}
                              </td>
                            </>
                          )}
                          <td className={`cell-lot ${lotRow.status ? `status-${lotRow.status}` : ''}`}>
                            {lotRow.lot}
                          </td>
                          <td className={`cell-qty ${lotRow.status ? `status-${lotRow.status}` : ''}`}>
                            {lotRow.qty}
                          </td>
                          <td className="cell-remarks">{lotRow.remarks || '—'}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        {/* Technical Conversion Ratios & Consumption Notes */}
        {(activeCategory === 'all' || activeCategory === 'Packaging Materials') && (
          <div className="stock-card-conversion-box">
            <div className="conversion-box-header">
              📌 <b>Technical Conversion Ratios & Standard Consumption Formulas (Medical Packaging & Production):</b>
            </div>
            <ul className="conversion-list">
              {CONVERSION_NOTES.map((note, idx) => (
                <li key={`note_${idx}`}>{note}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Official Document Footer */}
        <div className="stock-card-footer">
          <div>
            {warehouseName} • {currentDate}
          </div>
          <div>
            TITAN INDUSTRIES • MEDICAL WAREHOUSE MANAGEMENT SYSTEM
          </div>
          <div>
            QF-027-002 • ISO 13485:2016 Compliance
          </div>
        </div>
      </div>
    </div>
  );
}
