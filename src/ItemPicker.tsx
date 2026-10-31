import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Row } from './api';
import { useData, useText, useApp, Icon } from './ui';
import { MotionLi, staggerItem } from './motion';

export interface ItemPickerProps {
  value: string; // item_id (UUID)
  onChange: (itemId: string, itemData?: Row) => void;
  warehouseId?: string;
  showStock?: boolean;
  showCost?: boolean;
  required?: boolean;
  label?: string;
  error?: string;
}

export function ItemPicker({
  value,
  onChange,
  warehouseId,
  showStock = false,
  showCost = false,
  required = false,
  label,
  error
}: ItemPickerProps) {
  const t = useText();
  const app = useApp();

  // Mode: 'category' (شجرة التصنيفات) or 'search' (بحث مباشر)
  const [mode, setMode] = useState<'category' | 'search'>('category');

  // Hierarchical selection state
  const [selectedMainCat, setSelectedMainCat] = useState<string>('');
  const [selectedSubCat, setSelectedSubCat] = useState<string>('');
  const [selectedLeafCat, setSelectedLeafCat] = useState<string>('');

  // Direct search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Load all active categories
  const categoriesRes = useData<Row[]>('categories');
  const allCategories = categoriesRes.data || [];

  // Main categories (where parent_id is null/empty)
  const mainCategories = useMemo(() => {
    return allCategories.filter(c => !c.parent_id);
  }, [allCategories]);

  // Subcategories for selected main category (Level 2)
  const subCategories = useMemo(() => {
    if (!selectedMainCat) return [];
    return allCategories.filter(c => c.parent_id === selectedMainCat);
  }, [allCategories, selectedMainCat]);

  // Leaf categories (Level 3) for selected subcategory
  const leafCategories = useMemo(() => {
    if (!selectedSubCat) return [];
    return allCategories.filter(c => c.parent_id === selectedSubCat);
  }, [allCategories, selectedSubCat]);

  // Query items for category mode
  const categoryItemsQuery = useMemo(() => {
    const targetCat = selectedLeafCat || selectedSubCat || selectedMainCat;
    if (targetCat) {
      return `items?limit=100&category_id=${encodeURIComponent(targetCat)}${warehouseId ? '&warehouse_id=' + encodeURIComponent(warehouseId) : ''}`;
    }
    return null;
  }, [selectedMainCat, selectedSubCat, selectedLeafCat, warehouseId]);

  const catItemsRes = useData<Row[]>(categoryItemsQuery);

  // Query items for direct search mode
  const searchItemsQuery = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return null;
    return `items?limit=40&search=${encodeURIComponent(q)}${warehouseId ? '&warehouse_id=' + encodeURIComponent(warehouseId) : ''}`;
  }, [searchQuery, warehouseId]);

  const searchItemsRes = useData<Row[]>(searchItemsQuery);

  // Fetch full details of the currently selected item
  const selectedItemRes = useData<Row>(value ? `items/${encodeURIComponent(value)}` : null);
  const currentItem = selectedItemRes.data;

  const notifiedIdRef = useRef<string>('');
  useEffect(() => {
    if (currentItem && value && notifiedIdRef.current !== value) {
      notifiedIdRef.current = value;
      onChange(value, currentItem);
    }
  }, [currentItem, value]);

  // When currentItem is loaded, sync category dropdowns so they reflect the selected item's category
  useEffect(() => {
    if (currentItem && currentItem.category_id && allCategories.length > 0) {
      const itemCat = allCategories.find(c => c.id === currentItem.category_id);
      if (itemCat) {
        if (itemCat.parent_id) {
          const parentCat = allCategories.find(c => c.id === itemCat.parent_id);
          if (parentCat && parentCat.parent_id) {
            // itemCat is Level 3
            setSelectedMainCat(parentCat.parent_id);
            setSelectedSubCat(parentCat.id);
            setSelectedLeafCat(itemCat.id);
          } else {
            // itemCat is Level 2
            setSelectedMainCat(itemCat.parent_id);
            setSelectedSubCat(itemCat.id);
            setSelectedLeafCat('');
          }
        } else {
          setSelectedMainCat(itemCat.id);
          setSelectedSubCat('');
          setSelectedLeafCat('');
        }
      }
    }
  }, [currentItem, allCategories]);

  // Close search suggestions on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute available stock in selected warehouse or total
  const availableStock = useMemo(() => {
    if (!currentItem) return null;
    if (warehouseId && currentItem.positions && Array.isArray(currentItem.positions)) {
      const warehousePositions = currentItem.positions.filter(
        (p: Row) => p.warehouse_id === warehouseId && p.quality === 'Accepted' && !['Repair', 'Damaged'].includes(p.condition)
      );
      return warehousePositions.reduce((sum: number, p: Row) => sum + (Number(p.quantity || 0) - Number(p.reserved || 0)), 0);
    }
    return currentItem.available !== undefined ? Number(currentItem.available) : null;
  }, [currentItem, warehouseId]);

  function handleSelectItem(item: Row) {
    onChange(item.id, item);
    setIsSearchOpen(false);
    setSearchQuery('');
  }

  function handleClear() {
    onChange('', undefined);
    setSelectedSubCat('');
    setSelectedLeafCat('');
  }

  return (
    <div className={`item-picker-wrapper ${error ? 'picker-error' : ''}`}>
      <div className="item-picker-header">
        <label className="picker-label">
          <span>{label || t('اختيار الصنف', 'Select item')} {required && <b className="req-star">*</b>}</span>
        </label>
        
        {/* Toggle between Category Cascade and Direct Search */}
        <div className="picker-mode-switch" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'category'}
            className={`mode-btn ${mode === 'category' ? 'active' : ''}`}
            onClick={() => setMode('category')}
          >
            <Icon name="box" />
            <span>{t('تصفح بالتصنيفات', 'By Categories')}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'search'}
            className={`mode-btn ${mode === 'search' ? 'active' : ''}`}
            onClick={() => {
              setMode('search');
              setIsSearchOpen(true);
            }}
          >
            <Icon name="docs" />
            <span>{t('بحث مباشر بالاسم / SKU', 'Direct Search')}</span>
          </button>
        </div>
      </div>

      {/* Mode 1: Hierarchical Category Tree */}
      {mode === 'category' && (
        <div className="category-cascade-grid">
          {/* Main Category */}
          <div className="cascade-field">
            <label>
              <small>{t('التصنيف الرئيسي', 'Main Category')}</small>
              <select
                value={selectedMainCat}
                onChange={e => {
                  setSelectedMainCat(e.target.value);
                  setSelectedSubCat('');
                  setSelectedLeafCat('');
                }}
              >
                <option value="">{t('— اختر التصنيف الرئيسي —', '— Choose main category —')}</option>
                {mainCategories.map(c => (
                  <option key={c.id} value={c.id}>
                    {app.lang === 'ar' ? (c.name_ar || c.name_en) : (c.name_en || c.name_ar)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Subcategory */}
          <div className="cascade-field">
            <label>
              <small>{t('التصنيف الفرعي', 'Subcategory')}</small>
              <select
                value={selectedSubCat}
                disabled={!selectedMainCat || subCategories.length === 0}
                onChange={e => {
                  setSelectedSubCat(e.target.value);
                  setSelectedLeafCat('');
                }}
              >
                <option value="">
                  {!selectedMainCat
                    ? t('اختر التصنيف الرئيسي أولًا', 'Select main category first')
                    : subCategories.length === 0
                    ? t('لا توجد تصنيفات فرعية', 'No subcategories')
                    : t('— اختر التصنيف الفرعي —', '— Choose subcategory —')}
                </option>
                {subCategories.map(c => (
                  <option key={c.id} value={c.id}>
                    {app.lang === 'ar' ? (c.name_ar || c.name_en) : (c.name_en || c.name_ar)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Level 3: Leaf Category / Family (only if subcategory has children) */}
          {leafCategories.length > 0 && (
            <div className="cascade-field">
              <label>
                <small>{t('النوع / العائلة', 'Sub-type / Family')}</small>
                <select
                  value={selectedLeafCat}
                  onChange={e => setSelectedLeafCat(e.target.value)}
                >
                  <option value="">{t('— اختر النوع أو العائلة —', '— Choose family / type —')}</option>
                  {leafCategories.map(c => (
                    <option key={c.id} value={c.id}>
                      {app.lang === 'ar' ? (c.name_ar || c.name_en) : (c.name_en || c.name_ar)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* Item Selector */}
          <div className="cascade-field">
            <label>
              <small>{t('الصنف', 'Item')} {required && '*'}</small>
              <select
                required={required}
                className={error ? 'input-error' : ''}
                value={value}
                disabled={!selectedMainCat && !currentItem}
                onChange={e => {
                  const itemId = e.target.value;
                  const found = (catItemsRes.data || []).find(i => i.id === itemId) || (currentItem?.id === itemId ? currentItem : undefined);
                  onChange(itemId, found);
                }}
              >
                <option value="">
                  {!selectedMainCat && !currentItem
                    ? t('حدد التصنيف لإظهار الأصناف', 'Choose category to list items')
                    : catItemsRes.loading
                    ? t('جارٍ تحميل الأصناف…', 'Loading items…')
                    : (catItemsRes.data?.length || 0) === 0 && !currentItem
                    ? t('لا توجد أصناف في هذا التصنيف', 'No items in this category')
                    : t('— اختر الصنف —', '— Choose item —')}
                </option>
                {catItemsRes.data?.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.sku} · {app.lang === 'ar' ? (i.name_ar || i.name_en) : (i.name_en || i.name_ar)}{i.specification ? ` (${i.specification})` : ''}
                  </option>
                ))}
                {/* Keep current selected item in options if not in current category results */}
                {currentItem && !catItemsRes.data?.some(i => i.id === currentItem.id) && (
                  <option value={currentItem.id}>
                    {currentItem.sku} · {app.lang === 'ar' ? (currentItem.name_ar || currentItem.name_en) : (currentItem.name_en || currentItem.name_ar)}{currentItem.specification ? ` (${currentItem.specification})` : ''}
                  </option>
                )}
              </select>
            </label>
          </div>
        </div>
      )}

      {/* Mode 2: Direct Search with Live Autocomplete */}
      {mode === 'search' && (
        <div className="direct-search-box" ref={searchContainerRef}>
          <div className="search-input-wrapper">
            <input
              type="text"
              className={error ? 'input-error' : ''}
              placeholder={t('اكتب كود الصنف (SKU) أو الاسم بالعربي أو الإنجليزي…', 'Type SKU, Arabic, or English item name…')}
              value={searchQuery}
              onFocus={() => setIsSearchOpen(true)}
              onChange={e => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
            />
            {searchQuery && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setSearchQuery('')}
                title={t('مسح', 'Clear')}
              >
                ×
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {isSearchOpen && searchQuery.trim().length > 0 && (
            <div className="search-suggestions-dropdown">
              {searchItemsRes.loading ? (
                <div className="search-status">{t('جارٍ البحث في الأصناف…', 'Searching items…')}</div>
              ) : (searchItemsRes.data?.length || 0) === 0 ? (
                <div className="search-status empty">{t('لم يتم العثور على أصناف مطابقة للبحث', 'No matching items found')}</div>
              ) : (
                <ul className="suggestions-list">
                  {searchItemsRes.data?.map((item, idx) => (
                    <MotionLi
                      key={item.id}
                      className={`suggestion-item ${item.id === value ? 'selected' : ''}`}
                      onClick={() => handleSelectItem(item)}
                      {...staggerItem(idx, 0.04, 0.22)}
                    >
                      <div className="item-sku-badge">{item.sku}</div>
                      <div className="item-info">
                        <span className="item-name">
                          {app.lang === 'ar' ? (item.name_ar || item.name_en) : (item.name_en || item.name_ar)}
                        </span>
                        <small className="item-cat-breadcrumb">
                          {item.category_name || item.brand || item.base_unit}
                        </small>
                      </div>
                      {showStock && (
                        <div className="item-stock-tag">
                          <small>{t('المتاح:', 'Avail:')}</small>
                          <b className={Number(item.available || 0) > 0 ? 'stock-ok' : 'stock-zero'}>
                            {item.available ?? 0} {item.base_unit}
                          </b>
                        </div>
                      )}
                    </MotionLi>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {error && !currentItem && <span className="field-error-msg">⚠️ {error}</span>}

      {/* Selected Item Summary Card */}
      {currentItem && (
        <div className="selected-item-card">
          <div className="selected-item-main">
            <span className="sku-tag">{currentItem.sku}</span>
            <div className="selected-item-text">
              <strong className="item-title">
                {app.lang === 'ar' ? (currentItem.name_ar || currentItem.name_en) : (currentItem.name_en || currentItem.name_ar)}
              </strong>
              {currentItem.name_en && currentItem.name_ar && (
                <span className="item-sub-title">
                  {app.lang === 'ar' ? currentItem.name_en : currentItem.name_ar}
                </span>
              )}
            </div>
          </div>

          <div className="selected-item-meta">
            <span className="unit-badge">
              <small>{t('الوحدة الأساسية:', 'Base unit:')}</small> <b>{currentItem.base_unit}</b>
            </span>

            {showStock && availableStock !== null && (
              <span className={`stock-badge ${availableStock > 0 ? 'in-stock' : 'out-of-stock'}`}>
                <small>{warehouseId ? t('الرصيد المتاح بالمخزن:', 'Warehouse available:') : t('إجمالي المتاح:', 'Total available:')}</small>
                <b>{availableStock} {currentItem.base_unit}</b>
              </span>
            )}

            {showCost && currentItem.costs?.average_cost && (
              <span className="cost-badge">
                <small>{t('متوسط التكلفة:', 'Avg Cost:')}</small>
                <b>{Number(currentItem.costs.average_cost).toFixed(2)} EGP</b>
              </span>
            )}

            <button
              type="button"
              className="change-item-btn"
              onClick={handleClear}
              title={t('إلغاء الاختيار', 'Remove item')}
            >
              {t('إلغاء', 'Remove')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
