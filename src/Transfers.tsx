import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Row, mutate, ApiError } from './api';
import { useApp, useText, useData, usePermission, DataState, Empty, Table, Notice, Modal, Icon, n } from './ui';
import { ItemPicker } from './ItemPicker';
import { MotionDiv, staggerItem } from './motion';

export function Transfers({ forceNew }: { forceNew?: boolean }) {
  const t = useText();
  const app = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { id: paramId } = useParams();

  const isNew = forceNew || (!paramId && location.pathname.endsWith('/new'));
  const [viewTab, setViewTab] = useState<'new' | 'history'>(isNew ? 'new' : 'history');

  // Filters for history
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [destFilter, setDestFilter] = useState('');
  const [searchDoc, setSearchDoc] = useState('');

  // Load warehouses
  const warehousesRes = useData<Row[]>('warehouses?all=true');
  const warehouses = useMemo(() => warehousesRes.data || [], [warehousesRes.data]);

  // Query transfers list
  const queryParams = new URLSearchParams({
    type: 'transfer',
    ...(app.warehouse ? { warehouse_id: app.warehouse } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(sourceFilter ? { warehouse_id: sourceFilter } : {})
  });

  const transfersRes = useData<Row[]>(`documents?${queryParams}`);
  const singleDocRes = useData<Row>(paramId ? `documents/${paramId}` : null);

  // If a specific document is loaded by paramId, show its detailed voucher view
  if (paramId) {
    return (
      <div className="transfers-page">
        <button className="back" onClick={() => navigate('/transfers')}>
          ← {t('الرجوع لأذون التحويل المخزني', 'Back to transfers')}
        </button>
        <DataState resource={singleDocRes} />
        {singleDocRes.data && (
          <TransferVoucherDetail
            doc={singleDocRes.data}
            warehouses={warehouses}
            onBack={() => navigate('/transfers')}
          />
        )}
      </div>
    );
  }

  return (
    <div className="transfers-page">
      {/* Top Navigation Tabs */}
      <div className="tabs">
        <button
          className={viewTab === 'new' ? 'active' : ''}
          onClick={() => {
            setViewTab('new');
            navigate('/transfers/new');
          }}
        >
          + {t('إجراء تحويل مخزني جديد (نقل أصناف)', 'New Stock Transfer')}
        </button>
        <button
          className={viewTab === 'history' ? 'active' : ''}
          onClick={() => {
            setViewTab('history');
            navigate('/transfers');
          }}
        >
          {t('سجل وأرشيف التحويلات المخزنية', 'Transfers Archive')}
        </button>
      </div>

      {viewTab === 'new' ? (
        <TransferForm
          warehouses={warehouses}
          onDone={(createdDoc) => {
            app.refresh();
            if (createdDoc?.id) {
              navigate(`/transfers/${createdDoc.id}`);
            } else {
              setViewTab('history');
              navigate('/transfers');
            }
          }}
        />
      ) : (
        <section className="panel transfers-history-panel">
          <div className="toolbar">
            <div className="actions">
              <label>
                {t('الحالة', 'Status')}
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="">{t('جميع الحالات', 'All statuses')}</option>
                  {['Posted', 'Draft', 'Cancelled'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>

              <label>
                {t('من مخزن', 'From Warehouse')}
                <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
                  <option value="">{t('جميع المخازن', 'All Warehouses')}</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </label>

              <label>
                {t('إلى مخزن', 'To Warehouse')}
                <select value={destFilter} onChange={e => setDestFilter(e.target.value)}>
                  <option value="">{t('جميع المخازن', 'All Warehouses')}</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </label>

              <label>
                {t('بحث', 'Search')}
                <input
                  type="text"
                  placeholder={t('رقم الإذن أو السبب…', 'Voucher # or reason…')}
                  value={searchDoc}
                  onChange={e => setSearchDoc(e.target.value)}
                />
              </label>
            </div>

            <button
              className="primary"
              onClick={() => {
                setViewTab('new');
                navigate('/transfers/new');
              }}
            >
              + {t('تحويل جديد', 'New Transfer')}
            </button>
          </div>

          <DataState resource={transfersRes} />

          {transfersRes.data && (
            <Table
              rows={transfersRes.data
                .filter(d => {
                  if (destFilter && d.destination_warehouse_id !== destFilter) return false;
                  if (!searchDoc) return true;
                  const q = searchDoc.toLowerCase();
                  return (
                    String(d.number || '').toLowerCase().includes(q) ||
                    String(d.reason || '').toLowerCase().includes(q) ||
                    String(d.notes || '').toLowerCase().includes(q)
                  );
                })
                .map(d => ({
                  ...d,
                  from_warehouse: warehouses.find(w => w.id === d.warehouse_id)?.name || '—',
                  to_warehouse: warehouses.find(w => w.id === d.destination_warehouse_id)?.name || '—',
                  doc_date: String(d.document_date).slice(0, 10),
                  lines_count: d.lines_count ?? (d.lines?.length || '—')
                }))}
              columns={[
                ['number', t('رقم إذن التحويل', 'Transfer #')],
                ['doc_date', t('تاريخ التحويل', 'Transfer Date')],
                ['from_warehouse', t('من مخزن (المصدر)', 'From Warehouse')],
                ['to_warehouse', t('إلى مخزن (الوجهة)', 'To Warehouse')],
                ['reason', t('سبب التحويل', 'Reason')],
                ['lines_count', t('عدد الأصناف', 'Items count')],
                ['status', t('الحالة', 'Status')],
                ['creator_name', t('المسؤول', 'Created by')]
              ]}
              onRow={row => navigate(`/transfers/${row.id}`)}
            />
          )}
        </section>
      )}
    </div>
  );
}

interface TransferLine {
  item_id: string;
  quantity: string;
  unit: string;
  location_id: string;
  destination_location_id: string;
  quality: string;
  condition: string;
  notes: string;
  itemData?: Row;
  lot_id?: string;
  available_qty?: number;
}

function TransferLineRow({
  line,
  idx,
  sourceWarehouseId,
  destWarehouseId,
  onChange,
  onRemove,
  canRemove,
  fieldErrors,
  clearError
}: {
  line: TransferLine;
  idx: number;
  sourceWarehouseId: string;
  destWarehouseId: string;
  onChange: (updates: Partial<TransferLine>) => void;
  onRemove: () => void;
  canRemove: boolean;
  fieldErrors: Record<string, string>;
  clearError: (k: string) => void;
}) {
  const t = useText();
  const app = useApp();

  // Load item details & positions in source warehouse
  const itemRes = useData<Row>(line.item_id ? `items/${line.item_id}` : null);
  const item = line.itemData || itemRes.data;

  // Available positions in source warehouse
  const positions = useMemo(() => {
    return (item?.positions || []).filter(
      (p: Row) => p.warehouse_id === sourceWarehouseId && Number(p.quantity) > 0
    );
  }, [item?.positions, sourceWarehouseId]);

  // Lots available in source warehouse
  const lotsRes = useData<Row[]>(line.item_id ? `lots?item_id=${line.item_id}` : null);
  const allLots = lotsRes.data || [];

  const availableLots = useMemo(() => {
    if (!item?.track_lot) return [];
    return positions
      .filter((p: Row) => p.lot_id)
      .map((p: Row) => {
        const lotObj = allLots.find(l => l.id === p.lot_id);
        return {
          id: p.lot_id,
          code: p.lot_code || lotObj?.code || p.lot_id,
          qty: Number(p.quantity),
          unit: item.base_unit
        };
      });
  }, [positions, allLots, item]);

  // Selected lot position
  const selectedPosition = useMemo(() => {
    if (line.lot_id) {
      return positions.find((p: Row) => p.lot_id === line.lot_id);
    }
    return positions[0];
  }, [positions, line.lot_id]);

  // Total available quantity in source warehouse for this selection
  const currentAvailableQty = useMemo(() => {
    if (item?.track_lot && line.lot_id) {
      const pos = positions.find((p: Row) => p.lot_id === line.lot_id);
      return pos ? Number(pos.quantity) : 0;
    }
    // Sum across positions in source warehouse
    return positions.reduce((sum: number, p: Row) => sum + Number(p.quantity || 0), 0);
  }, [positions, item?.track_lot, line.lot_id]);

  // Locations in source and destination warehouses
  const sourceLocsRes = useData<Row[]>(sourceWarehouseId ? `locations?warehouse_id=${sourceWarehouseId}` : null);
  const destLocsRes = useData<Row[]>(destWarehouseId ? `locations?warehouse_id=${destWarehouseId}` : null);
  const sourceLocs = sourceLocsRes.data || [];
  const destLocs = destLocsRes.data || [];

  // When available lot options load and none selected, auto-select first lot
  useEffect(() => {
    if (item?.track_lot && availableLots.length > 0 && !line.lot_id) {
      onChange({ lot_id: availableLots[0].id });
    }
  }, [availableLots, item?.track_lot, line.lot_id]);

  const qtyNum = Number(line.quantity || 0);
  const isOverStock = Boolean(line.item_id && line.quantity && qtyNum > currentAvailableQty);

  // Transfer Full Stock Button handler
  function handleTransferAll() {
    if (currentAvailableQty > 0) {
      onChange({ quantity: String(currentAvailableQty) });
      clearError(`line_${idx}_qty`);
    }
  }

  return (
    <div className={`transfer-line-card ${fieldErrors[`line_${idx}_qty`] || isOverStock ? 'line-has-error' : ''}`}>
      <div className="line-header-bar">
        <span className="line-number-badge">#{idx + 1}</span>
        {canRemove && (
          <button
            type="button"
            className="btn-remove-line"
            onClick={onRemove}
            title={t('حذف هذا البند من التحويل', 'Remove line')}
          >
            × {t('حذف', 'Remove')}
          </button>
        )}
      </div>

      <div className="line-fields-grid">
        {/* Item Picker */}
        <div className="picker-container-full">
          <ItemPicker
            value={line.item_id}
            warehouseId={sourceWarehouseId}
            showStock={true}
            required={true}
            label={t('الصنف المراد نقله', 'Item to Transfer')}
            error={fieldErrors[`line_${idx}_item`]}
            onChange={(itemId, itemData) => {
              clearError(`line_${idx}_item`);
              clearError(`line_${idx}_qty`);
              clearError(`line_${idx}_lot`);
              onChange({
                item_id: itemId,
                itemData,
                unit: itemData?.base_unit || 'Piece',
                quantity: '',
                lot_id: ''
              });
            }}
          />
        </div>

        {line.item_id && item && (
          <>
            {/* Source Stock Badge */}
            <div className="stock-info-banner">
              <div className="stock-info-text">
                <span className="label-text">
                  📍 {t('الرصيد المتاح بالمخزن المصدر:', 'Available in Source WH:')}
                </span>
                <b className="val-text">
                  {n(currentAvailableQty)} {item.base_unit}
                </b>
              </div>

              {currentAvailableQty > 0 && (
                <button
                  type="button"
                  className="btn-transfer-all"
                  onClick={handleTransferAll}
                  title={t('نقل كامل الرصيد المتوفر بنقرة واحدة', 'Transfer entire available stock')}
                >
                  ⚡ {t('نقل الرصيد بالكامل', 'Transfer Full Stock')} ({n(currentAvailableQty)})
                </button>
              )}
            </div>

            {/* Lot Selector if tracked */}
            {item.track_lot && (
              <div className={`lot-field-wrap ${fieldErrors[`line_${idx}_lot`] ? 'field-error' : ''}`}>
                <label>
                  <span>
                    🏷️ {t('رقم اللوت / التشغيلة بالمخزن المصدر', 'Source Lot / Batch')}{' '}
                    <b style={{ color: '#ef4444' }}>*</b>
                  </span>
                  {availableLots.length === 0 ? (
                    <div className="no-lot-alert">
                      ⚠️ {t('لا توجد تشغيلات برصيد متاح في هذا المخزن', 'No lots with available stock in this warehouse')}
                    </div>
                  ) : (
                    <select
                      required
                      className={fieldErrors[`line_${idx}_lot`] ? 'input-error' : ''}
                      value={line.lot_id || ''}
                      onChange={e => {
                        onChange({ lot_id: e.target.value });
                        clearError(`line_${idx}_lot`);
                      }}
                    >
                      <option value="">{t('— اختر التشغيلة / اللوت —', '— Choose Lot —')}</option>
                      {availableLots.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.code} (متاح: {n(l.qty)} {l.unit})
                        </option>
                      ))}
                    </select>
                  )}
                  {fieldErrors[`line_${idx}_lot`] && (
                    <span className="field-error-msg">⚠️ {fieldErrors[`line_${idx}_lot`]}</span>
                  )}
                </label>
              </div>
            )}

            {/* Quantity Input */}
            <div className={`qty-field-wrap ${fieldErrors[`line_${idx}_qty`] || isOverStock ? 'field-error' : ''}`}>
              <label>
                <span>
                  {t('الكمية المراد نقلها', 'Quantity to Transfer')}{' '}
                  <b style={{ color: '#ef4444' }}>*</b>
                </span>
                <div className="qty-input-group">
                  <input
                    type="number"
                    min="0.000001"
                    step="any"
                    required
                    placeholder="0.00"
                    className={fieldErrors[`line_${idx}_qty`] || isOverStock ? 'input-error' : ''}
                    value={line.quantity}
                    onChange={e => {
                      onChange({ quantity: e.target.value });
                      clearError(`line_${idx}_qty`);
                    }}
                  />
                  <span className="unit-addon">{item.base_unit}</span>
                </div>
                {isOverStock && (
                  <span className="field-error-msg">
                    ⚠️ {t(`الكمية المدخلة (${qtyNum}) تتجاوز المتاح (${currentAvailableQty}) بالمخزن`, `Quantity (${qtyNum}) exceeds available stock (${currentAvailableQty})`)}
                  </span>
                )}
                {fieldErrors[`line_${idx}_qty`] && !isOverStock && (
                  <span className="field-error-msg">⚠️ {fieldErrors[`line_${idx}_qty`]}</span>
                )}
              </label>
            </div>

            {/* Destination Location (optional) */}
            {destLocs.length > 0 && (
              <label>
                <span>{t('موضع التخزين في مخزن الوجهة (اختياري)', 'Target Location (Optional)')}</span>
                <select
                  value={line.destination_location_id || ''}
                  onChange={e => onChange({ destination_location_id: e.target.value })}
                >
                  <option value="">{t('— بدون موضع محدد —', '— None —')}</option>
                  {destLocs.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </label>
            )}

            {/* Line Notes */}
            <label className="field-span-all">
              <span>{t('ملاحظات على البند (اختياري)', 'Line notes (optional)')}</span>
              <input
                type="text"
                placeholder={t('أي تعليمات خاصة بنقل هذا الصنف…', 'Special handling or transfer notes…')}
                value={line.notes}
                onChange={e => onChange({ notes: e.target.value })}
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
}

function TransferForm({
  warehouses,
  onDone
}: {
  warehouses: Row[];
  onDone: (doc?: Row) => void;
}) {
  const t = useText();
  const app = useApp();
  const location = useLocation();

  // Read URL query params for quick transfer prefill (e.g. ?source=...&target=...&item=...&lot=...)
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const urlSource = searchParams.get('source') || '';
  const urlTarget = searchParams.get('target') || '';
  const urlItem = searchParams.get('item_id') || searchParams.get('item') || '';
  const urlLot = searchParams.get('lot') || '';

  // Source warehouse
  const defaultSource = urlSource || app.warehouse || warehouses[0]?.id || '';
  const [sourceWhId, setSourceWhId] = useState(defaultSource);

  // Destination warehouse (must be different from source)
  const availableTargetWhs = useMemo(() => {
    return warehouses.filter(w => w.id !== sourceWhId && w.active);
  }, [warehouses, sourceWhId]);

  const defaultTarget = urlTarget && urlTarget !== defaultSource ? urlTarget : availableTargetWhs[0]?.id || '';
  const [destWhId, setDestWhId] = useState(defaultTarget);

  useEffect(() => {
    if (destWhId === sourceWhId || !availableTargetWhs.some(w => w.id === destWhId)) {
      setDestWhId(availableTargetWhs[0]?.id || '');
    }
  }, [sourceWhId, availableTargetWhs]);

  const [documentDate, setDocumentDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [reason, setReason] = useState(t('نقل وتوزيع مخزون بين المخازن', 'Stock transfer between warehouses'));
  const [notes, setNotes] = useState('');

  // Transfer Lines
  const [lines, setLines] = useState<TransferLine[]>([
    {
      item_id: urlItem || '',
      quantity: '',
      unit: 'Piece',
      location_id: '',
      destination_location_id: '',
      quality: 'Accepted',
      condition: 'New',
      notes: '',
      lot_id: urlLot || ''
    }
  ]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function clearError(k: string) {
    if (fieldErrors[k]) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
    }
  }

  function handleLineChange(idx: number, updates: Partial<TransferLine>) {
    setLines(prev => prev.map((l, i) => (i === idx ? { ...l, ...updates } : l)));
  }

  function addLine() {
    setLines(prev => [
      ...prev,
      {
        item_id: '',
        quantity: '',
        unit: 'Piece',
        location_id: '',
        destination_location_id: '',
        quality: 'Accepted',
        condition: 'New',
        notes: ''
      }
    ]);
  }

  function removeLine(idx: number) {
    if (lines.length > 1) {
      setLines(prev => prev.filter((_, i) => i !== idx));
    }
  }

  // Pre-submit validation
  function validateForm(): boolean {
    const errs: Record<string, string> = {};

    if (!sourceWhId) {
      errs.source_warehouse = t('يرجى تحديد المخزن المصدر (المنقول منه).', 'Please select source warehouse.');
    }
    if (!destWhId) {
      errs.dest_warehouse = t('يرجى تحديد المخزن الهدف (المنقول إليه).', 'Please select destination warehouse.');
    }
    if (sourceWhId && destWhId && sourceWhId === destWhId) {
      errs.dest_warehouse = t('لا يمكن النقل لنفس المخزن؛ يجب اختيار مخزن مختلف.', 'Source and destination warehouses cannot be the same.');
    }
    if (!documentDate) {
      errs.doc_date = t('تاريخ التحويل مطلوب.', 'Transfer date is required.');
    }

    if (lines.length === 0) {
      errs.general = t('يجب إضافة صنف واحد على الأقل للتحويل.', 'At least one item line is required.');
    }

    lines.forEach((l, idx) => {
      if (!l.item_id) {
        errs[`line_${idx}_item`] = t('يرجى اختيار الصنف.', 'Please select item.');
      }
      if (!l.quantity || Number(l.quantity) <= 0) {
        errs[`line_${idx}_qty`] = t('الكمية يجب أن تكون أكبر من صفر.', 'Quantity must be greater than zero.');
      }
      if (l.itemData?.track_lot && !l.lot_id) {
        errs[`line_${idx}_lot`] = t('اللوت مطلوب للأصناف التي تُدار برقم التشغيلة.', 'Lot number is required for this item.');
      }
    });

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // Submit transfer document
  async function submitTransfer(mode: 'post' | 'draft') {
    setError('');
    if (!validateForm()) {
      setError(t('يرجى مراجعة الحقول المطلوبة والمميزة بالأحمر.', 'Please correct highlighted errors.'));
      return;
    }

    setBusy(true);
    try {
      const payload: Row = {
        type: 'transfer',
        document_date: documentDate,
        warehouse_id: sourceWhId,
        destination_warehouse_id: destWhId,
        reason: reason.trim() || t('تحويل مخزني', 'Stock Transfer'),
        notes: notes.trim(),
        currency: 'EGP',
        exchange_rate: '1',
        lines: lines.map(l => ({
          item_id: l.item_id,
          quantity: String(l.quantity),
          unit: l.unit || 'Piece',
          location_id: l.location_id || null,
          destination_location_id: l.destination_location_id || null,
          lot_id: l.lot_id || null,
          quality: l.quality || 'Accepted',
          condition: l.condition || 'New',
          notes: l.notes || ''
        }))
      };

      // 1. Create document draft
      const createdDoc = await mutate('documents', payload);

      if (!createdDoc?.id) {
        throw new Error(t('فشل إنشاء إذن التحويل', 'Failed to create transfer document'));
      }

      // 2. If immediate posting requested:
      if (mode === 'post') {
        const submitted = await mutate(`documents/${createdDoc.id}/submit`, {
          version: createdDoc.version || 1
        });
        const posted = await mutate(`documents/${createdDoc.id}/post`, {
          version: submitted.version
        });
        app.notify(t('تم ترحيل ونقل المخزون رسميًا بنجاح!', 'Transfer posted & stock moved successfully!'));
        app.refresh();
        onDone(posted);
      } else {
        app.notify(t('تم حفظ إذن التحويل كمسودة بنجاح.', 'Transfer draft saved successfully.'));
        app.refresh();
        onDone(createdDoc);
      }
    } catch (err: any) {
      setError(err?.message || t('حدث خطأ أثناء حفظ أو ترحيل إذن التحويل.', 'Error saving transfer document.'));
    } finally {
      setBusy(false);
    }
  }

  const sourceName = warehouses.find(w => w.id === sourceWhId)?.name || 'المخزن المصدر';
  const destName = warehouses.find(w => w.id === destWhId)?.name || 'المخزن الوجهة';

  const totalTransferUnits = useMemo(() => {
    return lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
  }, [lines]);

  return (
    <section className="panel transfer-form-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">STOCK TRANSFER VOUCHER</span>
          <h2>{t('إذن نقل وتحويل مخزني بين الفروع والمستودعات', 'Warehouse Stock Transfer Voucher')}</h2>
          <p className="subtitle">
            {t(
              'نقل صنف بالكامل أو كمية مجتزأة من مخزن لآخر، مع الحفاظ التام على أرقام التشغيلات (LOTs) وتقييم التكلفة.',
              'Transfer entire items or partial quantities between warehouses while preserving lot batches and cost valuation.'
            )}
          </p>
        </div>
      </div>

      {error && <Notice error>{error}</Notice>}

      <form onSubmit={e => { e.preventDefault(); submitTransfer('post'); }}>
        {/* Header Information Card */}
        <div className="transfer-header-card">
          <h3>{t('بيانات إذن التحويل والمخازن', 'Transfer Header & Warehouses')}</h3>

          {/* Visual Transfer Arrow Banner */}
          <div className="transfer-flow-banner">
            <div className="wh-flow-node from-node">
              <span className="node-eyebrow">{t('من مخزن (المصدر)', 'From Source')}</span>
              <b className="node-name">{sourceName}</b>
            </div>

            <div className="wh-flow-arrow">
              <span className="arrow-icon">{app.lang === 'ar' ? '⬅' : '➔'}</span>
              <small>{t('تحويل فوري', 'Direct Move')}</small>
            </div>

            <div className="wh-flow-node to-node">
              <span className="node-eyebrow">{t('إلى مخزن (الوجهة)', 'To Destination')}</span>
              <b className="node-name">{destName}</b>
            </div>
          </div>

          <div className="fields transfer-header-fields">
            {/* Source Warehouse */}
            <label className={fieldErrors.source_warehouse ? 'field-error' : ''}>
              <span>{t('من مخزن (المصدر)', 'From Source Warehouse')} <b style={{ color: '#ef4444' }}>*</b></span>
              <select
                required
                className={fieldErrors.source_warehouse ? 'input-error' : ''}
                value={sourceWhId}
                onChange={e => {
                  setSourceWhId(e.target.value);
                  clearError('source_warehouse');
                }}
              >
                <option value="">{t('— اختر المخزن المصدر —', '— Choose source —')}</option>
                {warehouses.filter(w => w.active).map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              {fieldErrors.source_warehouse && (
                <span className="field-error-msg">⚠️ {fieldErrors.source_warehouse}</span>
              )}
            </label>

            {/* Destination Warehouse */}
            <label className={fieldErrors.dest_warehouse ? 'field-error' : ''}>
              <span>{t('إلى مخزن (الوجهة)', 'To Destination Warehouse')} <b style={{ color: '#ef4444' }}>*</b></span>
              <select
                required
                className={fieldErrors.dest_warehouse ? 'input-error' : ''}
                value={destWhId}
                onChange={e => {
                  setDestWhId(e.target.value);
                  clearError('dest_warehouse');
                }}
              >
                <option value="">{t('— اختر المخزن المستلم —', '— Choose destination —')}</option>
                {availableTargetWhs.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              {fieldErrors.dest_warehouse && (
                <span className="field-error-msg">⚠️ {fieldErrors.dest_warehouse}</span>
              )}
            </label>

            {/* Transfer Date */}
            <label className={fieldErrors.doc_date ? 'field-error' : ''}>
              <span>{t('تاريخ التحويل', 'Transfer Date')} <b style={{ color: '#ef4444' }}>*</b></span>
              <input
                type="date"
                required
                className={fieldErrors.doc_date ? 'input-error' : ''}
                value={documentDate}
                onChange={e => {
                  setDocumentDate(e.target.value);
                  clearError('doc_date');
                }}
              />
              {fieldErrors.doc_date && (
                <span className="field-error-msg">⚠️ {fieldErrors.doc_date}</span>
              )}
            </label>

            {/* Reason */}
            <label className="field-span-all">
              <span>{t('سبب أو غرض التحويل', 'Transfer Reason')} <b style={{ color: '#ef4444' }}>*</b></span>
              <input
                type="text"
                required
                placeholder={t('مثال: نقل خامات للمستودع المرخص، إعادة توزيع مخزون…', 'e.g. Replenishment, production dispatch…')}
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
            </label>

            {/* Notes */}
            <label className="field-span-all">
              <span>{t('ملاحظات إضافية (اختياري)', 'Additional Notes')}</span>
              <textarea
                rows={2}
                placeholder={t('أي ملاحظات عن السائق، وسيلة النقل، أو تعليمات التسليم…', 'Driver, vehicle, or handling instructions…')}
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </label>
          </div>
        </div>

        {/* Lines Section */}
        <div className="transfer-lines-section">
          <div className="lines-header-row">
            <div>
              <h3>{t('الأصناف والكميات المطلوب نقلها', 'Items to Transfer')}</h3>
              <p className="subtitle">
                {t(
                  'اختر الصنف من المخزن المصدر، وحدد الكمية أو اضغط «نقل الرصيد بالكامل».',
                  'Select items from source warehouse and specify quantity or click «Transfer Full Stock».'
                )}
              </p>
            </div>
            <span className="badge-count">
              {lines.length} {t('صنف مضاف', 'items')}
            </span>
          </div>

          {lines.map((line, idx) => (
            <TransferLineRow
              key={idx}
              line={line}
              idx={idx}
              sourceWarehouseId={sourceWhId}
              destWarehouseId={destWhId}
              onChange={updates => handleLineChange(idx, updates)}
              onRemove={() => removeLine(idx)}
              canRemove={lines.length > 1}
              fieldErrors={fieldErrors}
              clearError={clearError}
            />
          ))}

          {/* Add Line Button */}
          <button
            type="button"
            className="btn-add-line"
            onClick={addLine}
          >
            + {t('إضافة صنف آخر للتحويل', 'Add Another Item')}
          </button>
        </div>

        {/* Transfer Summary Card */}
        <div className="transfer-summary-card">
          <div className="summary-stat">
            <span className="summary-label">{t('عدد الأصناف', 'Items Count')}</span>
            <b className="summary-val">{lines.filter(l => l.item_id).length}</b>
          </div>
          <div className="summary-stat">
            <span className="summary-label">{t('إجمالي الكميات المنقولة', 'Total Transferred Units')}</span>
            <b className="summary-val">{n(totalTransferUnits)}</b>
          </div>
          <div className="summary-stat">
            <span className="summary-label">{t('مسار الحركة', 'Movement Route')}</span>
            <b className="summary-val summary-route">{sourceName} {app.lang === 'ar' ? '⬅' : '➔'} {destName}</b>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="actions form-actions">
          <button
            type="button"
            className="primary btn-primary-post"
            disabled={busy}
            onClick={() => submitTransfer('post')}
            title={t('ترحيل إذن التحويل ونقل الأرصدة فعليًا فورًا', 'Post and move stock immediately')}
          >
            ✔ {busy ? t('جارٍ التحويل…', 'Transferring…') : t('تنفيذ وترحيل التحويل فورًا', 'Transfer & Post Official Now')}
          </button>

          <button
            type="button"
            className="btn-save-draft"
            disabled={busy}
            onClick={() => submitTransfer('draft')}
            title={t('حفظ كمسودة للمراجعة دون ترحيل فوري للأرصدة', 'Save draft without moving stock yet')}
          >
            {t('حفظ كمسودة تحويل', 'Save Draft')}
          </button>

          <button
            type="button"
            onClick={() => {
              if (window.confirm(t('هل تريد إلغاء التعديل والرجوع؟', 'Cancel and return?'))) {
                onDone();
              }
            }}
            disabled={busy}
          >
            {t('إلغاء', 'Cancel')}
          </button>
        </div>
      </form>
    </section>
  );
}

function TransferVoucherDetail({
  doc,
  warehouses,
  onBack
}: {
  doc: Row;
  warehouses: Row[];
  onBack: () => void;
}) {
  const t = useText();
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fromWarehouse = warehouses.find(w => w.id === doc.warehouse_id);
  const toWarehouse = warehouses.find(w => w.id === doc.destination_warehouse_id);

  async function handlePost() {
    if (!window.confirm(t('تأكيد ترحيل إذن التحويل ونقل المخزون فعليًا؟', 'Confirm posting this transfer?'))) return;
    setBusy(true);
    setError('');
    try {
      let currentVersion = doc.version;
      if (doc.status === 'Draft') {
        const sub = await mutate(`documents/${doc.id}/submit`, { version: currentVersion });
        currentVersion = sub.version;
      }
      await mutate(`documents/${doc.id}/post`, { version: currentVersion });
      app.notify(t('تم ترحيل إذن التحويل ونقل المخزون بنجاح!', 'Transfer posted successfully!'));
      app.refresh();
    } catch (e: any) {
      setError(e?.message || t('فشل ترحيل التحويل', 'Failed to post transfer'));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!window.confirm(t('هل تريد بالتأكيد إلغاء هذا المستند؟', 'Confirm cancelling document?'))) return;
    setBusy(true);
    setError('');
    try {
      await mutate(`documents/${doc.id}/cancel`, { version: doc.version });
      app.notify(t('تم إلغاء إذن التحويل', 'Transfer voucher cancelled'));
      app.refresh();
    } catch (e: any) {
      setError(e?.message || t('فشل إلغاء المستند', 'Failed to cancel'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel transfer-voucher-detail">
      <div className="section-heading">
        <div>
          <span className="eyebrow">#{doc.number} · v{doc.version}</span>
          <h2>{t('إذن نقل وتحويل مخزني رسمي', 'Official Warehouse Transfer Voucher')}</h2>
        </div>
        <span className={`status ${String(doc.status).toLowerCase().replaceAll(' ', '-')}`}>
          {doc.status === 'Posted' ? t('مُرحل رسميًا', 'Posted') : doc.status}
        </span>
      </div>

      {error && <Notice error>{error}</Notice>}

      <div className="transfer-flow-banner voucher-flow">
        <div className="wh-flow-node from-node">
          <span className="node-eyebrow">{t('مخزن المصدر (المُسلِم)', 'Source (Issuing WH)')}</span>
          <b className="node-name">{fromWarehouse?.name || '—'}</b>
        </div>
        <div className="wh-flow-arrow">
          <span className="arrow-icon">➔</span>
          <small>{doc.status === 'Posted' ? t('تم النقل', 'Transferred') : t('قيد التحويل', 'In Transfer')}</small>
        </div>
        <div className="wh-flow-node to-node">
          <span className="node-eyebrow">{t('مخزن الوجهة (المُستلِم)', 'Destination (Receiving WH)')}</span>
          <b className="node-name">{toWarehouse?.name || '—'}</b>
        </div>
      </div>

      <dl className="detail-grid">
        <div>
          <dt>{t('رقم إذن التحويل', 'Transfer Doc #')}</dt>
          <dd><b>#{doc.number}</b></dd>
        </div>
        <div>
          <dt>{t('تاريخ التحويل', 'Transfer Date')}</dt>
          <dd>{String(doc.document_date).slice(0, 10)}</dd>
        </div>
        <div>
          <dt>{t('سبب التحويل', 'Transfer Reason')}</dt>
          <dd>{doc.reason || '—'}</dd>
        </div>
        <div>
          <dt>{t('المسؤول / منشئ الإذن', 'Created By')}</dt>
          <dd>{doc.creator_name || '—'}</dd>
        </div>
        <div>
          <dt>{t('تاريخ الترحيل الفعلي', 'Posted Date')}</dt>
          <dd>{doc.posted_at ? new Date(doc.posted_at).toLocaleString() : '—'}</dd>
        </div>
        <div>
          <dt>{t('ملاحظات', 'Notes')}</dt>
          <dd>{doc.notes || '—'}</dd>
        </div>
      </dl>

      <div className="voucher-items-section">
        <h3>{t('الأصناف المنقولة بالإذن', 'Transferred Items')}</h3>
        <table className="voucher-table">
          <thead>
            <tr>
              <th>#</th>
              <th>SKU</th>
              <th>{t('الصنف', 'Item Name')}</th>
              <th>{t('رقم اللوت / التشغيلة', 'LOT / Batch')}</th>
              <th>{t('الكمية المنقولة', 'Quantity')}</th>
              <th>{t('الوحدة', 'Unit')}</th>
            </tr>
          </thead>
          <tbody>
            {(doc.lines || []).map((line: Row, i: number) => (
              <tr key={line.id || i}>
                <td>{i + 1}</td>
                <td><code>{line.sku}</code></td>
                <td><b>{line.name_ar}</b></td>
                <td>{line.lot_id ? <code>{line.lot_id}</code> : '—'}</td>
                <td><b className="qty-val">{n(line.quantity)}</b></td>
                <td>{line.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="actions voucher-actions">
        {doc.status === 'Draft' && (
          <>
            <button className="primary" disabled={busy} onClick={handlePost}>
              ✔ {busy ? t('جارٍ الترحيل…', 'Posting…') : t('ترحيل ونقل المخزون الآن', 'Post & Move Stock')}
            </button>
            <button className="danger" disabled={busy} onClick={handleCancel}>
              {t('إلغاء المسودة', 'Cancel Draft')}
            </button>
          </>
        )}

        <button type="button" onClick={() => window.print()} title={t('طباعة إذن التحويل', 'Print')}>
          🖨️ {t('طباعة الإذن', 'Print Voucher')}
        </button>

        <button type="button" onClick={onBack}>
          ← {t('رجوع', 'Back')}
        </button>
      </div>
    </section>
  );
}
