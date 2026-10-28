import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Row, mutate, request, uid, ApiError } from './api';
import { useApp, useText, useData, usePermission, DataState, Empty, Table, Notice, Modal, Icon, date } from './ui';
import { ItemPicker } from './ItemPicker';
import { opts } from './Catalogue';
import { MotionDiv, staggerItem } from './motion';
import { Pagination, usePagination } from './Pagination';

export function Purchases({ forceNew }: { forceNew?: boolean }) {
  const t = useText();
  const app = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { id: paramId } = useParams();

  const isNew = forceNew || (!paramId && location.pathname.endsWith('/new'));
  const [viewTab, setViewTab] = useState<'new' | 'history'>(isNew ? 'new' : 'history');
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [searchDoc, setSearchDoc] = useState('');

  // Suppliers & Warehouses
  const masters = useData<Row[]>('masters?kind=supplier');
  const suppliers = masters.data || [];
  const warehousesRes = useData<Row[]>('warehouses');
  const warehouses = warehousesRes.data || [];

  // Receipts list
  const queryParams = new URLSearchParams({
    type: 'receipt',
    ...(app.warehouse ? { warehouse_id: app.warehouse } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(supplierFilter ? { supplier_id: supplierFilter } : {})
  });

  const receiptsRes = useData<Row[]>(`documents?${queryParams}`);
  const singleDocRes = useData<Row>(paramId ? `documents/${paramId}` : null);

  // Memoized formatted & filtered rows
  const filteredReceipts = useMemo(() => {
    if (!receiptsRes.data) return [];
    return receiptsRes.data
      .filter(d => {
        if (!searchDoc) return true;
        const q = searchDoc.toLowerCase();
        return (
          String(d.number || '').toLowerCase().includes(q) ||
          String(d.metadata?.invoice || '').toLowerCase().includes(q) ||
          String(d.notes || '').toLowerCase().includes(q)
        );
      })
      .map(d => ({
        ...d,
        invoice_no: d.metadata?.invoice || '—',
        supplier_name: suppliers.find(s => s.id === d.supplier_id)?.name || '—',
        doc_date: String(d.document_date).slice(0, 10),
        lines_count: d.lines_count ?? (d.lines?.length || '—')
      }));
  }, [receiptsRes.data, searchDoc, suppliers]);

  const {
    page,
    pageSize,
    setPage,
    setPageSize,
    resetPage,
    paginatedItems: pagedReceipts
  } = usePagination(filteredReceipts, 15);

  useEffect(() => {
    resetPage();
  }, [statusFilter, supplierFilter, searchDoc, resetPage]);

  // If a specific document is loaded by paramId, show its detailed view
  if (paramId) {
    return (
      <div className="purchases-page">
        <button className="back" onClick={() => navigate('/purchases')}>
          ← {t('الرجوع لقائمة المشتريات', 'Back to purchases')}
        </button>
        <DataState resource={singleDocRes} />
        {singleDocRes.data && (
          <PurchaseReceiptDetail
            doc={singleDocRes.data}
            suppliers={suppliers}
            onBack={() => navigate('/purchases')}
          />
        )}
      </div>
    );
  }

  return (
    <div className="purchases-page">
      {/* Top Navigation Tabs */}
      <div className="tabs">
        <button
          className={viewTab === 'new' ? 'active' : ''}
          onClick={() => {
            setViewTab('new');
            navigate('/purchases/new');
          }}
        >
          + {t('تسجيل فاتورة شراء واستلام جديدة', 'New Purchase Invoice / Receipt')}
        </button>
        <button
          className={viewTab === 'history' ? 'active' : ''}
          onClick={() => {
            setViewTab('history');
            navigate('/purchases');
          }}
        >
          {t('سجل وأرشيف المشتريات', 'Purchases History')}
        </button>
        <button
          type="button"
          onClick={() => navigate('/returns/new?type=supplier_return')}
        >
          ↩ {t('إرجاع بضاعة لمورد / شركة', 'Return to Supplier')}
        </button>
      </div>

      {viewTab === 'new' ? (
        <PurchaseReceiptForm
          warehouses={warehouses}
          suppliers={suppliers}
          onDone={(createdDoc) => {
            app.refresh();
            if (createdDoc?.id) {
              navigate(`/purchases/${createdDoc.id}`);
            } else {
              setViewTab('history');
              navigate('/purchases');
            }
          }}
        />
      ) : (
        <section className="panel purchases-history-panel">
          <div className="toolbar">
            <div className="actions">
              <label>
                {t('الحالة', 'Status')}
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="">{t('جميع الحالات', 'All statuses')}</option>
                  {['Draft', 'Submitted', 'Pending Approval', 'Posted', 'Cancelled'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>

              <label>
                {t('المورد', 'Supplier')}
                <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
                  <option value="">{t('جميع الموردين', 'All suppliers')}</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>

              <label>
                {t('بحث', 'Search')}
                <input
                  type="text"
                  placeholder={t('رقم الفاتورة أو المستند…', 'Invoice or doc #…')}
                  value={searchDoc}
                  onChange={e => setSearchDoc(e.target.value)}
                />
              </label>
            </div>

            <button
              className="primary"
              onClick={() => {
                setViewTab('new');
                navigate('/purchases/new');
              }}
            >
              + {t('فاتورة شراء جديدة', 'New Purchase')}
            </button>
          </div>

          <DataState resource={receiptsRes} />

          {receiptsRes.data && (
            <>
              <Table
                rows={pagedReceipts}
                columns={[
                  ['number', t('رقم المستند', 'Doc #')],
                  ['invoice_no', t('رقم فاتورة المورد', 'Supplier Invoice #')],
                  ['supplier_name', t('المورد', 'Supplier')],
                  ['doc_date', t('تاريخ الاستلام', 'Receipt Date')],
                  ['lines_count', t('عدد الأصناف', 'Items count')],
                  ['status', t('الحالة', 'Status')],
                  ['creator_name', t('المسؤول', 'Created by')]
                ]}
                onRow={row => navigate(`/purchases/${row.id}`)}
              />
              <Pagination
                total={filteredReceipts.length}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </>
          )}
        </section>
      )}
    </div>
  );
}

interface PurchaseLine {
  item_id: string;
  quantity: string;
  unit: string;
  unit_cost: string;
  location_id: string;
  quality: string;
  condition: string;
  notes: string;
  itemData?: Row;
  lot_id?: string;
  new_lot_code?: string;
  expires_on?: string;
  lot_mode?: 'new' | 'select';
}

function LineLotSelector({
  line,
  idx,
  invoiceNumber,
  onChange,
  error,
  expiryError,
  clearError
}: {
  line: PurchaseLine;
  idx: number;
  invoiceNumber: string;
  onChange: (updates: Partial<PurchaseLine>) => void;
  error?: string;
  expiryError?: string;
  clearError: (k: string) => void;
}) {
  const t = useText();
  const app = useApp();
  const itemRes = useData<Row>(line.item_id ? `items/${line.item_id}` : null);
  const lotsRes = useData<Row[]>(line.item_id ? `lots?item_id=${line.item_id}` : null);
  const item = line.itemData || itemRes.data;
  const lots = lotsRes.data || [];

  useEffect(() => {
    if (itemRes.data && !line.itemData) {
      onChange({ itemData: itemRes.data });
    }
  }, [itemRes.data, line.itemData]);

  if (!line.item_id || !item?.track_lot) return null;

  const mode = line.lot_mode || (lots.length > 0 ? 'select' : 'new');

  return (
    <div className={`line-lot-container ${error ? 'lot-error' : ''}`}>
      <div className="lot-header">
        <span>🏷️ {t('رقم اللوت / التشغيلة (Lot No.)', 'Lot / Batch Number')} <b className="req-star" style={{ color: '#ef4444' }}>*</b></span>
        {lots.length > 0 && (
          <div className="lot-mode-toggle">
            <button
              type="button"
              className={mode === 'new' ? 'active' : ''}
              onClick={() => {
                onChange({ lot_mode: 'new', lot_id: '' });
                clearError(`line_${idx}_lot`);
              }}
            >
              + {t('رقم لوت جديد', 'New Lot')}
            </button>
            <button
              type="button"
              className={mode === 'select' ? 'active' : ''}
              onClick={() => {
                onChange({ lot_mode: 'select', new_lot_code: '' });
                clearError(`line_${idx}_lot`);
              }}
            >
              {t('اختيار لوت سابق', 'Existing Lot')} ({lots.length})
            </button>
          </div>
        )}
      </div>

      {mode === 'select' && lots.length > 0 ? (
        <div className="lot-select-wrapper">
          <select
            className={error ? 'input-error' : ''}
            value={line.lot_id || ''}
            onChange={e => {
              onChange({ lot_id: e.target.value, new_lot_code: '' });
              clearError(`line_${idx}_lot`);
            }}
          >
            <option value="">{t('— اختر رقم اللوت أو أضف تشغيلة جديدة —', '— Select lot or add new —')}</option>
            {lots.map(l => (
              <option key={l.id} value={l.id}>
                {l.code} {l.expires_on ? ` · ${t('صلاحية:', 'Exp:')} ${String(l.expires_on).slice(0, 10)}` : ''} {l.notes ? ` · ${l.notes}` : ''}
              </option>
            ))}
          </select>
          {error && <span className="field-error-msg">⚠️ {error}</span>}
        </div>
      ) : (
        <div className="lot-new-wrapper">
          <div className="lot-input-row">
            <input
              type="text"
              className={error ? 'input-error' : ''}
              placeholder={t('اكتب رقم اللوت (مثال: LOT-26102026 أو 24-GR5-26#)…', 'Type lot code (e.g. LOT-26102026)…')}
              value={line.new_lot_code || ''}
              onChange={e => {
                onChange({ new_lot_code: e.target.value, lot_id: '' });
                clearError(`line_${idx}_lot`);
              }}
            />
            {invoiceNumber && !line.new_lot_code && (
              <button
                type="button"
                className="btn-use-invoice"
                title={t('استخدام رقم الفاتورة كـ LOT', 'Use invoice # as lot')}
                onClick={() => {
                  onChange({ new_lot_code: invoiceNumber, lot_id: '' });
                  clearError(`line_${idx}_lot`);
                }}
              >
                {t('استخدام رقم الفاتورة', 'Use invoice #')} ({invoiceNumber})
              </button>
            )}
          </div>
          {error && <span className="field-error-msg">⚠️ {error}</span>}
        </div>
      )}

      {item?.track_expiry && (
        <div className="lot-expiry-wrapper">
          <label className={expiryError ? 'field-error' : ''}>
            <span>{t('تاريخ انتهاء الصلاحية', 'Expiry Date')} <b className="req-star" style={{ color: '#ef4444' }}>*</b></span>
            <input
              type="date"
              className={expiryError ? 'input-error' : ''}
              value={line.expires_on || ''}
              onChange={e => {
                onChange({ expires_on: e.target.value });
                clearError(`line_${idx}_expiry`);
              }}
            />
            {expiryError && <span className="field-error-msg">⚠️ {expiryError}</span>}
          </label>
        </div>
      )}
    </div>
  );
}

function PurchaseReceiptForm({
  warehouses,
  suppliers,
  onDone
}: {
  warehouses: Row[];
  suppliers: Row[];
  onDone: (doc?: Row) => void;
}) {
  const t = useText();
  const app = useApp();
  const canCost = usePermission('cost.read');

  const location = useLocation();
  const initialSupplier = useMemo(() => {
    return new URLSearchParams(location.search).get('supplier_id') || '';
  }, [location.search]);

  // Form header fields
  const [warehouseId, setWarehouseId] = useState(app.warehouse || warehouses[0]?.id || '');
  const [supplierId, setSupplierId] = useState(initialSupplier);
  const [quickSupplierModal, setQuickSupplierModal] = useState(false);
  const [newSupName, setNewSupName] = useState('');
  const [newSupCode, setNewSupCode] = useState('');
  const [newSupPhone, setNewSupPhone] = useState('');
  const [newSupError, setNewSupError] = useState('');
  const [newSupBusy, setNewSupBusy] = useState(false);

  useEffect(() => {
    if (initialSupplier) setSupplierId(initialSupplier);
  }, [initialSupplier]);

  async function handleQuickAddSupplier(e: React.FormEvent) {
    e.preventDefault();
    if (!newSupName.trim()) {
      setNewSupError(t('اسم المورد مطلوب', 'Supplier name is required'));
      return;
    }
    setNewSupBusy(true);
    setNewSupError('');
    try {
      const res = await mutate('masters', {
        kind: 'supplier',
        name: newSupName.trim(),
        data: {
          code: newSupCode.trim() || undefined,
          phone: newSupPhone.trim() || undefined
        },
        active: true
      });
      app.refresh();
      app.notify(t('تمت إضافة المورد بنجاح', 'Supplier added successfully'));
      if (res?.id) {
        setSupplierId(res.id);
      }
      setQuickSupplierModal(false);
      setNewSupName('');
      setNewSupCode('');
      setNewSupPhone('');
    } catch (err: any) {
      setNewSupError(err?.message || 'Error');
    } finally {
      setNewSupBusy(false);
    }
  }

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [documentDate, setDocumentDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [currency, setCurrency] = useState('EGP');
  const [exchangeRate, setExchangeRate] = useState('1');
  const [notes, setNotes] = useState('');

  const initialItemId = useMemo(() => {
    return new URLSearchParams(location.search).get('item_id') || '';
  }, [location.search]);

  // Purchase items (lines)
  const [lines, setLines] = useState<PurchaseLine[]>([
    {
      item_id: initialItemId,
      quantity: '',
      unit: 'Piece',
      unit_cost: '',
      location_id: '',
      quality: 'Accepted',
      condition: 'New',
      notes: '',
      new_lot_code: '',
      lot_id: '',
      expires_on: '',
      lot_mode: 'new'
    }
  ]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearError = (key: string) => {
    setFieldErrors(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // Locations for current warehouse
  const locationsRes = useData<Row[]>('locations');
  const warehouseLocations = useMemo(() => {
    return (locationsRes.data || []).filter(l => l.warehouse_id === warehouseId);
  }, [locationsRes.data, warehouseId]);

  // Compute live totals
  const totalItemsCount = lines.filter(l => l.item_id).length;
  const totalQuantity = lines.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0);
  const totalAmount = lines.reduce((acc, l) => {
    const q = Number(l.quantity) || 0;
    const cost = Number(l.unit_cost) || 0;
    return acc + (q * cost);
  }, 0);

  function handleLineChange(index: number, updates: Partial<PurchaseLine>) {
    setLines(prev => prev.map((l, i) => (i === index ? { ...l, ...updates } : l)));
  }

  function handleAddLine() {
    setLines(prev => [
      ...prev,
      {
        item_id: '',
        quantity: '',
        unit: 'Piece',
        unit_cost: '',
        location_id: '',
        quality: 'Accepted',
        condition: 'New',
        notes: '',
        new_lot_code: invoiceNumber?.startsWith('LOT-') ? invoiceNumber : '',
        lot_id: '',
        expires_on: '',
        lot_mode: 'new'
      }
    ]);
  }

  function handleRemoveLine(index: number) {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter((_, i) => i !== index));
  }

  async function submitDocument(action: 'draft' | 'post') {
    if (busy) return;
    setError('');

    const errs: Record<string, string> = {};

    // 1. Header Validations
    if (!supplierId) {
      errs.supplier = t('برجاء اختيار المورد من القائمة.', 'Please select supplier.');
    }
    if (!warehouseId) {
      errs.warehouse = t('برجاء تحديد مخزن الاستلام.', 'Please select receiving warehouse.');
    }
    if (!documentDate) {
      errs.documentDate = t('برجاء تحديد تاريخ الفاتورة / الاستلام.', 'Please select receipt date.');
    }
    if (currency !== 'EGP' && (!exchangeRate || Number(exchangeRate) <= 0)) {
      errs.exchangeRate = t('سعر التحويل مطلوب عند اختيار عملة أجنبية.', 'Exchange rate is required.');
    }

    // 2. Lines Validation
    if (lines.length === 0) {
      setError(t('برجاء إضافة صنف واحد على الأقل.', 'Please add at least one item.'));
      return;
    }

    lines.forEach((line, idx) => {
      if (!line.item_id) {
        errs[`line_${idx}_item`] = t('برجاء اختيار الصنف لهذا البند.', 'Please select item.');
      }
      if (!line.quantity || Number(line.quantity) <= 0 || isNaN(Number(line.quantity))) {
        errs[`line_${idx}_quantity`] = t('برجاء إدخال كمية صحيحة أكبر من صفر.', 'Please enter quantity > 0.');
      }
      if (line.itemData?.track_lot) {
        const hasLot = line.lot_id || (line.new_lot_code && line.new_lot_code.trim());
        if (!hasLot) {
          errs[`line_${idx}_lot`] = t('اللوت مطلوب لهذا الصنف (اختر لوت موجود أو اكتب رقم تشغيلة جديدة).', 'Lot number is required for this item.');
        }
      }
      if (line.itemData?.track_expiry) {
        if (!line.expires_on) {
          errs[`line_${idx}_expiry`] = t('تاريخ الصلاحية مطلوب لهذا الصنف.', 'Expiry date is required.');
        }
      }
    });

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setError(t('توجد حقول مطلوبة غير مكتملة مميزة بالمربعات الحمراء أدناه؛ يرجى استكمالها.', 'Please complete highlighted red fields below.'));
      setTimeout(() => {
        const el = document.querySelector('.input-error, .picker-error');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const input = el.matches('input, select, textarea') ? el : el.querySelector('input, select, textarea');
          (input as HTMLElement)?.focus();
        }
      }, 100);
      return;
    }

    setBusy(true);
    try {
      const commitKey = uid();

      // Resolve or automatically create lots for lines with new lot codes
      const processedLines = [];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        let lotId = l.lot_id || null;

        if (!lotId && l.itemData?.track_lot && l.new_lot_code && l.new_lot_code.trim()) {
          const codeTrimmed = l.new_lot_code.trim();
          try {
            const existingLots = await request(`lots?item_id=${l.item_id}`);
            const matched = (existingLots || []).find((x: any) => x.code.trim().toUpperCase() === codeTrimmed.toUpperCase());
            if (matched) {
              lotId = matched.id;
            } else {
              const createdLot = await mutate('lots', {
                item_id: l.item_id,
                code: codeTrimmed,
                supplier_id: supplierId || null,
                expires_on: l.expires_on || null,
                notes: l.notes ? `وارد فاتورة: ${l.notes}` : `وارد فاتورة: ${invoiceNumber || 'مشتريات'}`
              });
              lotId = createdLot.id;
            }
          } catch (lotErr) {
            console.error('Error handling lot creation:', lotErr);
            throw lotErr;
          }
        }

        processedLines.push({
          item_id: l.item_id,
          quantity: l.quantity,
          unit: l.unit,
          location_id: l.location_id || null,
          quality: l.quality || 'Accepted',
          condition: l.condition || 'New',
          notes: l.notes || '',
          ...(lotId ? { lot_id: lotId } : {}),
          ...(canCost && l.unit_cost !== '' ? { unit_cost: l.unit_cost } : {})
        });
      }

      const payload: Row = {
        type: 'receipt',
        document_date: documentDate,
        warehouse_id: warehouseId,
        supplier_id: supplierId,
        currency,
        exchange_rate: currency === 'EGP' ? '1' : exchangeRate,
        notes,
        reason: invoiceNumber ? `${t('فاتورة شراء رقم:', 'Purchase Invoice #')} ${invoiceNumber}` : t('شراء واستلام بضاعة', 'Goods purchase and receipt'),
        metadata: {
          invoice: invoiceNumber || undefined
        },
        lines: processedLines
      };

      // 1. Save draft on server
      const draftResult = await mutate('documents', payload, commitKey);

      if (action === 'post') {
        // 2. Submit & Post immediately
        const submitResult = await mutate(`documents/${draftResult.id}/submit`, { version: draftResult.version });
        const postResult = await mutate(`documents/${draftResult.id}/post`, { version: submitResult.version });
        app.notify(t('تم ترحيل فاتورة الشراء واستلام الأصناف في المخزن رسميًا بنجاح.', 'Purchase invoice posted and stock received successfully.'));
        onDone(postResult);
      } else {
        app.notify(t('تم حفظ فاتورة الشراء كمسودة على الخادم بنجاح.', 'Purchase invoice draft saved successfully.'));
        onDone(draftResult);
      }
    } catch (err: any) {
      const msg = err.message || '';
      const serverErrs: Record<string, string> = {};
      if (msg.includes('اللوت') || err.code === 'LOT') {
        const idx = lines.findIndex(l => l.itemData?.track_lot);
        if (idx >= 0) serverErrs[`line_${idx}_lot`] = msg;
      }
      if (msg.includes('الصلاحية') || err.code === 'EXPIRY') {
        const idx = lines.findIndex(l => l.itemData?.track_expiry);
        if (idx >= 0) serverErrs[`line_${idx}_expiry`] = msg;
      }
      if (msg.includes('المورد') || err.code === 'SUPPLIER') {
        serverErrs.supplier = msg;
      }
      if (msg.includes('المخزن') || err.code === 'WAREHOUSE') {
        serverErrs.warehouse = msg;
      }
      if (Object.keys(serverErrs).length > 0) {
        setFieldErrors(prev => ({ ...prev, ...serverErrs }));
      }
      setError(msg);
      setTimeout(() => {
        const el = document.querySelector('.input-error, .picker-error');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const input = el.matches('input, select, textarea') ? el : el.querySelector('input, select, textarea');
          (input as HTMLElement)?.focus();
        }
      }, 100);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel purchase-editor-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PURCHASE & RECEIPT VOUCHER</span>
          <h2>{t('فاتورة شراء واستلام مواد جديدة', 'New Purchase Receipt & Invoice')}</h2>
        </div>
      </div>

      {error && <Notice error>{error}</Notice>}

      <form onSubmit={e => { e.preventDefault(); submitDocument('draft'); }}>
        {/* Header Information Card */}
        <div className="invoice-header-card">
          <h3>{t('بيانات الفاتورة والمورد', 'Invoice & Supplier Details')}</h3>
          <div className="fields">
            {/* Supplier */}
            <label className={fieldErrors.supplier ? 'field-error' : ''}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span>{t('المورد', 'Supplier')} <b className="req-star" style={{ color: '#ef4444' }}>*</b></span>
                <button
                  type="button"
                  className="link"
                  style={{ fontSize: '12px', color: '#ddaa79', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                  onClick={() => setQuickSupplierModal(true)}
                  title={t('إضافة مورد جديد للقائمة فورًا', 'Add new supplier to list immediately')}
                >
                  + {t('إضافة مورد جديد', 'Add supplier')}
                </button>
              </div>
              <select
                required
                className={fieldErrors.supplier ? 'input-error' : ''}
                value={supplierId}
                onChange={e => {
                  setSupplierId(e.target.value);
                  clearError('supplier');
                }}
              >
                <option value="">{t('— اختر المورد —', '— Choose supplier —')}</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {fieldErrors.supplier && <span className="field-error-msg">⚠️ {fieldErrors.supplier}</span>}
            </label>

            {/* Warehouse */}
            <label className={fieldErrors.warehouse ? 'field-error' : ''}>
              <span>{t('مخزن الاستلام', 'Receiving Warehouse')} <b className="req-star" style={{ color: '#ef4444' }}>*</b></span>
              <select
                required
                className={fieldErrors.warehouse ? 'input-error' : ''}
                value={warehouseId}
                onChange={e => {
                  setWarehouseId(e.target.value);
                  clearError('warehouse');
                }}
              >
                <option value="">{t('— اختر المخزن —', '— Choose warehouse —')}</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              {fieldErrors.warehouse && <span className="field-error-msg">⚠️ {fieldErrors.warehouse}</span>}
            </label>

            {/* Document Date */}
            <label className={fieldErrors.documentDate ? 'field-error' : ''}>
              <span>{t('تاريخ الشراء / الاستلام', 'Purchase / Receipt Date')} <b className="req-star" style={{ color: '#ef4444' }}>*</b></span>
              <input
                type="date"
                required
                className={fieldErrors.documentDate ? 'input-error' : ''}
                value={documentDate}
                onChange={e => {
                  setDocumentDate(e.target.value);
                  clearError('documentDate');
                }}
              />
              {fieldErrors.documentDate && <span className="field-error-msg">⚠️ {fieldErrors.documentDate}</span>}
            </label>

            {/* Invoice Number */}
            <label>
              <span>{t('رقم فاتورة المورد / إذن الاستلام', 'Supplier Invoice #')}</span>
              <input
                type="text"
                placeholder="INV-9821..."
                value={invoiceNumber}
                onChange={e => setInvoiceNumber(e.target.value)}
              />
            </label>

            {/* Costing: Currency & Rate */}
            {canCost && (
              <>
                <label>
                  <span>{t('العملة', 'Currency')}</span>
                  <select value={currency} onChange={e => setCurrency(e.target.value)}>
                    {['EGP', 'USD', 'EUR'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>

                {currency !== 'EGP' && (
                  <label className={fieldErrors.exchangeRate ? 'field-error' : ''}>
                    <span>{t('سعر التحويل إلى EGP', 'Exchange Rate to EGP')} <b className="req-star" style={{ color: '#ef4444' }}>*</b></span>
                    <input
                      type="number"
                      step="any"
                      min="0.000001"
                      required
                      className={fieldErrors.exchangeRate ? 'input-error' : ''}
                      value={exchangeRate}
                      onChange={e => {
                        setExchangeRate(e.target.value);
                        clearError('exchangeRate');
                      }}
                    />
                    {fieldErrors.exchangeRate && <span className="field-error-msg">⚠️ {fieldErrors.exchangeRate}</span>}
                  </label>
                )}
              </>
            )}

            {/* Notes */}
            <label className="wide">
              <span>{t('ملاحظات الفاتورة', 'Invoice Notes')}</span>
              <textarea
                placeholder={t('ملاحظات عن عملية الشراء، الشحن، أو طريقة الدفع…', 'Notes about purchase, delivery, or terms…')}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
              />
            </label>
          </div>
        </div>

        {/* Lines Section */}
        <div className="invoice-lines-section">
          <div className="lines-header">
            <h3>{t('أصناف الفاتورة (المشتريات)', 'Invoice Items (Lines)')}</h3>
            <span className="items-counter">
              {t('إجمالي الأصناف المضافة: ', 'Total items added: ')}
              <b>{lines.length}</b>
            </span>
          </div>

          {lines.map((line, idx) => (
            <MotionDiv key={idx} className="doc-line purchase-line-box" {...staggerItem(idx, 0.08, 0.32)}>
              <header>
                <b>{t('الصنف رقم ', 'Item #')}{idx + 1}</b>
                {lines.length > 1 && (
                  <button
                    type="button"
                    className="link danger"
                    onClick={() => handleRemoveLine(idx)}
                  >
                    {t('حذف هذا الصنف', 'Remove this item')}
                  </button>
                )}
              </header>

              {/* The Advanced Dual-Mode ItemPicker */}
              <ItemPicker
                value={line.item_id}
                warehouseId={warehouseId}
                showCost={canCost}
                required
                error={fieldErrors[`line_${idx}_item`]}
                onChange={(itemId, itemData) => {
                  handleLineChange(idx, {
                    item_id: itemId,
                    unit: itemData?.base_unit || line.unit || 'Piece',
                    itemData,
                    lot_id: '',
                    new_lot_code: invoiceNumber?.startsWith('LOT-') ? invoiceNumber : '',
                    expires_on: '',
                    lot_mode: 'new'
                  });
                  clearError(`line_${idx}_item`);
                  clearError(`line_${idx}_lot`);
                  clearError(`line_${idx}_expiry`);
                }}
              />

              {/* Line Attributes */}
              <div className="fields line-fields-grid">
                <label className={fieldErrors[`line_${idx}_quantity`] ? 'field-error' : ''}>
                  <span>{t('الكمية المشتراة', 'Purchased Qty')} <b className="req-star" style={{ color: '#ef4444' }}>*</b></span>
                  <input
                    type="number"
                    step="any"
                    min="0.000001"
                    required
                    placeholder="0.00"
                    className={fieldErrors[`line_${idx}_quantity`] ? 'input-error' : ''}
                    value={line.quantity}
                    onChange={e => {
                      handleLineChange(idx, { quantity: e.target.value });
                      clearError(`line_${idx}_quantity`);
                    }}
                  />
                  {fieldErrors[`line_${idx}_quantity`] && (
                    <span className="field-error-msg">⚠️ {fieldErrors[`line_${idx}_quantity`]}</span>
                  )}
                </label>

                <label>
                  <span>{t('الوحدة', 'Unit')} <b className="req-star" style={{ color: '#ef4444' }}>*</b></span>
                  <select
                    value={line.unit}
                    onChange={e => handleLineChange(idx, { unit: e.target.value })}
                  >
                    <option value={line.itemData?.base_unit || line.unit}>
                      {line.itemData?.base_unit || line.unit}
                    </option>
                    {(line.itemData?.conversions || []).map((c: Row) => (
                      <option key={c.unit} value={c.unit}>{c.unit}</option>
                    ))}
                  </select>
                </label>

                {canCost && (
                  <label>
                    <span>{t('سعر الوحدة', 'Unit Price')} ({currency})</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      value={line.unit_cost}
                      onChange={e => handleLineChange(idx, { unit_cost: e.target.value })}
                    />
                  </label>
                )}

                {canCost && Number(line.quantity) > 0 && Number(line.unit_cost) > 0 && (
                  <div className="line-total-pill">
                    <small>{t('إجمالي البند:', 'Line Total:')}</small>
                    <b>{(Number(line.quantity) * Number(line.unit_cost)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</b>
                  </div>
                )}

                <label>
                  <span>{t('موضع التخزين', 'Location')}</span>
                  <select
                    value={line.location_id}
                    onChange={e => handleLineChange(idx, { location_id: e.target.value })}
                  >
                    <option value="">{t('— بدون موضع محدد —', '— No specific location —')}</option>
                    {warehouseLocations.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>{t('ملاحظات البند', 'Line notes')}</span>
                  <input
                    type="text"
                    placeholder={t('ملاحظة عن التشغيلة أو التغليف…', 'Batch, packaging note…')}
                    value={line.notes}
                    onChange={e => handleLineChange(idx, { notes: e.target.value })}
                  />
                </label>

                {/* Dedicated Lot & Expiry Section with Red Box Highlighting */}
                <LineLotSelector
                  line={line}
                  idx={idx}
                  invoiceNumber={invoiceNumber}
                  onChange={updates => handleLineChange(idx, updates)}
                  error={fieldErrors[`line_${idx}_lot`]}
                  expiryError={fieldErrors[`line_${idx}_expiry`]}
                  clearError={clearError}
                />
              </div>
            </MotionDiv>
          ))}

          {/* Add Line Button */}
          <button
            type="button"
            className="add-line-btn"
            onClick={handleAddLine}
          >
            + {t('إضافة صنف آخر للفاتورة', 'Add another item to invoice')}
          </button>
        </div>

        {/* Live Summary Bar */}
        <div className="voucher-summary-bar">
          <div className="summary-stat">
            <span>{t('عدد الأصناف', 'Distinct Items')}</span>
            <b>{totalItemsCount}</b>
          </div>
          <div className="summary-stat">
            <span>{t('إجمالي الكميات', 'Total Units')}</span>
            <b>{totalQuantity.toLocaleString()}</b>
          </div>
          {canCost && (
            <div className="summary-stat highlight">
              <span>{t('إجمالي قيمة الفاتورة', 'Total Invoice Amount')}</span>
              <b>{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</b>
            </div>
          )}
        </div>

        {/* Form Actions */}
        <div className="actions form-actions-row">
          <button
            type="button"
            className="primary post-btn"
            disabled={busy}
            onClick={() => submitDocument('post')}
          >
            {busy ? t('جارٍ الترحيل…', 'Posting…') : t('✔ استلام وترحيل رسمي للمخزن فورًا', '✔ Receive & Post to Warehouse Now')}
          </button>

          <button
            type="submit"
            disabled={busy}
            className="secondary draft-btn"
          >
            {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ كمسودة فاتورة', 'Save Draft')}
          </button>

          <button
            type="button"
            onClick={() => onDone()}
            disabled={busy}
          >
            {t('إلغاء', 'Cancel')}
          </button>
        </div>
      </form>
      {quickSupplierModal && (
        <Modal
          title={t('إضافة مورد جديد للفاتورة', 'Quick Add Supplier')}
          close={() => setQuickSupplierModal(false)}
        >
          <form className="form" onSubmit={handleQuickAddSupplier}>
            <div className="fields">
              <label>
                <span>{t('اسم المورد / الشركة', 'Supplier Name')} <b style={{ color: '#ef4444' }}>*</b></span>
                <input
                  type="text"
                  required
                  placeholder={t('مثال: شركة النصر للكيماويات', 'e.g. Acme Corp')}
                  value={newSupName}
                  onChange={e => setNewSupName(e.target.value)}
                />
              </label>

              <label>
                <span>{t('كود المورد (اختياري)', 'Supplier Code')}</span>
                <input
                  type="text"
                  placeholder="SUP-001"
                  value={newSupCode}
                  onChange={e => setNewSupCode(e.target.value)}
                />
              </label>

              <label>
                <span>{t('رقم الهاتف / الموبايل', 'Phone / Mobile')}</span>
                <input
                  type="tel"
                  dir="ltr"
                  placeholder="+20 10 01234567"
                  value={newSupPhone}
                  onChange={e => setNewSupPhone(e.target.value)}
                />
              </label>
            </div>

            {newSupError && <Notice error>{newSupError}</Notice>}

            <div className="actions">
              <button className="primary" type="submit" disabled={newSupBusy}>
                {newSupBusy ? t('جارٍ الإضافة…', 'Adding…') : t('إضافة واختيار المورد', 'Add & Select')}
              </button>
              <button type="button" onClick={() => setQuickSupplierModal(false)}>
                {t('إلغاء', 'Cancel')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

function PurchaseReceiptDetail({
  doc,
  suppliers,
  onBack
}: {
  doc: Row;
  suppliers: Row[];
  onBack: () => void;
}) {
  const t = useText();
  const app = useApp();
  const navigate = useNavigate();
  const canCost = usePermission('cost.read');
  const supplier = suppliers.find(s => s.id === doc.supplier_id);

  return (
    <section className="panel purchase-receipt-detail">
      <div className="section-heading">
        <div>
          <span className="eyebrow">#{doc.number} · v{doc.version}</span>
          <h2>{t('إذن استلام مشتريات', 'Purchase Receipt')}</h2>
        </div>
        <span className={`status ${String(doc.status).toLowerCase().replaceAll(' ', '-')}`}>
          {doc.status}
        </span>
      </div>

      <dl className="detail-grid">
        <div>
          <dt>{t('رقم فاتورة المورد', 'Supplier Invoice #')}</dt>
          <dd><b>{doc.metadata?.invoice || '—'}</b></dd>
        </div>
        <div>
          <dt>{t('المورد', 'Supplier')}</dt>
          <dd><b>{supplier?.name || doc.supplier_name || '—'}</b></dd>
        </div>
        <div>
          <dt>{t('تاريخ الاستلام', 'Receipt Date')}</dt>
          <dd>{String(doc.document_date).slice(0, 10)}</dd>
        </div>
        <div>
          <dt>{t('المسؤول عن الإدخال', 'Created by')}</dt>
          <dd>{doc.creator_name}</dd>
        </div>
        {canCost && (
          <div>
            <dt>{t('العملة', 'Currency')}</dt>
            <dd>{doc.currency || 'EGP'}</dd>
          </div>
        )}
      </dl>

      <h3>{t('الأصناف المستلمة', 'Received Items')}</h3>
      <Table
        rows={doc.lines || []}
        columns={[
          ['sku', 'SKU'],
          ['name_ar', t('الصنف', 'Item')],
          ['quantity', t('الكمية', 'Quantity')],
          ['unit', t('الوحدة', 'Unit')],
          ['quality', t('الجودة', 'Quality')],
          ['condition', t('الحالة', 'Condition')],
          ...(canCost ? [['posted_unit_cost', t('سعر الوحدة', 'Unit Price')] as [string, string]] : [])
        ]}
      />

      {doc.notes && (
        <div className="doc-notes-box">
          <small>{t('ملاحظات:', 'Notes:')}</small>
          <p>{doc.notes}</p>
        </div>
      )}

      <div className="actions">
        {doc.status === 'Posted' && (
          <button
            type="button"
            className="secondary"
            style={{ borderColor: 'var(--amber, #f59e0b)', color: 'var(--amber, #f59e0b)' }}
            onClick={() => navigate(`/returns/new?type=supplier_return&refId=${doc.id}`)}
          >
            ↩ {t('إرجاع بضاعة / مرتجع للمورد من هذا الإذن', 'Create Supplier Return')}
          </button>
        )}
        <button onClick={() => window.print()}>
          <Icon name="chart" /> {t('طباعة إذن الاستلام', 'Print Receipt')}
        </button>
        <button onClick={onBack}>
          {t('الرجوع للقائمة', 'Back')}
        </button>
      </div>
    </section>
  );
}
