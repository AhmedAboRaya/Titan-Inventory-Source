import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Row, mutate, uid, ApiError } from './api';
import { useApp, useText, useData, usePermission, DataState, Empty, Table, Notice, Modal, Icon, date } from './ui';
import { Pagination, usePagination } from './Pagination';
import { MotionDiv, staggerItem } from './motion';
import { typeName } from './Documents';
import { ItemPicker } from './ItemPicker';

export function Returns({ forceNew }: { forceNew?: boolean }) {
  const t = useText();
  const app = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { id: paramId } = useParams();

  // Parse query params (e.g. ?type=return&refId=123)
  const searchParams = new URLSearchParams(location.search);
  const initialType = (searchParams.get('type') as 'return' | 'supplier_return' | 'scrap') || 'return';
  const initialRefId = searchParams.get('refId') || '';

  const isNew = forceNew || (!paramId && location.pathname.endsWith('/new')) || !!initialRefId;
  const [viewTab, setViewTab] = useState<'new' | 'history'>(isNew ? 'new' : 'history');
  const [returnType, setReturnType] = useState<'return' | 'supplier_return' | 'scrap'>(initialType);

  // Filters for history
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchDoc, setSearchDoc] = useState('');

  // Load masters, warehouses, and locations
  const mastersRes = useData<Row[]>('masters?all=true');
  const allMasters = mastersRes.data || [];
  const departments = useMemo(() => allMasters.filter(m => m.kind === 'department'), [allMasters]);
  const employees = useMemo(() => allMasters.filter(m => m.kind === 'employee'), [allMasters]);
  const suppliers = useMemo(() => allMasters.filter(m => m.kind === 'supplier'), [allMasters]);

  const warehousesRes = useData<Row[]>('warehouses');
  const warehouses = warehousesRes.data || [];
  const locationsRes = useData<Row[]>('locations');
  const locations = locationsRes.data || [];

  // Returns list query
  const queryParams = new URLSearchParams({
    ...(app.warehouse ? { warehouse_id: app.warehouse } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(typeFilter ? { type: typeFilter } : {})
  });

  const docsRes = useData<Row[]>(`documents?${queryParams}`);
  const singleDocRes = useData<Row>(paramId ? `documents/${paramId}` : null);

  // Filter returns history to only return/supplier_return/scrap
  const filteredReturns = useMemo(() => {
    if (!docsRes.data) return [];
    return docsRes.data
      .filter(d => ['return', 'supplier_return', 'scrap'].includes(d.type))
      .filter(d => {
        if (!typeFilter) return true;
        return d.type === typeFilter;
      })
      .filter(d => {
        if (!searchDoc) return true;
        const q = searchDoc.toLowerCase();
        return (
          String(d.number || '').toLowerCase().includes(q) ||
          String(d.reason || '').toLowerCase().includes(q) ||
          String(d.notes || '').toLowerCase().includes(q) ||
          String(d.recipient_name || '').toLowerCase().includes(q) ||
          String(d.department_name || '').toLowerCase().includes(q)
        );
      })
      .map(d => {
        const typeLabel =
          d.type === 'return'
            ? t('مرتجع صرف (من قسم)', 'Issue Return (Dept)')
            : d.type === 'supplier_return'
            ? t('مرتجع مورد (لشركة)', 'Supplier Return')
            : t('إعدام / إثبات تالف', 'Scrap / Damaged');

        const partyLabel =
          d.type === 'return'
            ? d.department_name || '—'
            : d.type === 'supplier_return'
            ? suppliers.find(s => s.id === d.supplier_id)?.name || '—'
            : t('المخزن الرئيسي', 'Warehouse');

        return {
          ...d,
          type_label: typeLabel,
          party_label: partyLabel,
          doc_date: String(d.document_date).slice(0, 10),
          lines_count: d.lines_count ?? (d.lines?.length || '—')
        };
      });
  }, [docsRes.data, typeFilter, searchDoc, suppliers, t]);

  const {
    page,
    pageSize,
    setPage,
    setPageSize,
    resetPage,
    paginatedItems: pagedReturns
  } = usePagination(filteredReturns, 15);

  useEffect(() => {
    resetPage();
  }, [typeFilter, statusFilter, searchDoc, resetPage]);

  // If viewing a specific return document
  if (paramId) {
    return (
      <div className="returns-page">
        <button className="back" onClick={() => navigate('/returns')}>
          ← {t('الرجوع لقائمة المرتجعات', 'Back to Returns')}
        </button>
        <DataState resource={singleDocRes} />
        {singleDocRes.data && (
          <ReturnDetail
            doc={singleDocRes.data}
            departments={departments}
            employees={employees}
            suppliers={suppliers}
            onBack={() => navigate('/returns')}
          />
        )}
      </div>
    );
  }

  return (
    <div className="returns-page">
      {/* Top Navigation Tabs */}
      <div className="tabs">
        <button
          className={viewTab === 'new' ? 'active' : ''}
          onClick={() => {
            setViewTab('new');
            navigate('/returns/new');
          }}
        >
          + {t('تسجيل إذن استرجاع / مرتجع جديد', 'New Return / Write-off')}
        </button>
        <button
          className={viewTab === 'history' ? 'active' : ''}
          onClick={() => {
            setViewTab('history');
            navigate('/returns');
          }}
        >
          {t('سجل وأرشيف المرتجعات', 'Returns Archive')}
        </button>
      </div>

      {viewTab === 'new' ? (
        <ReturnForm
          initialType={initialType}
          initialRefId={initialRefId}
          warehouses={warehouses}
          departments={departments}
          employees={employees}
          suppliers={suppliers}
          locations={locations}
          onDone={(createdDoc) => {
            app.refresh();
            if (createdDoc?.id) {
              navigate(`/returns/${createdDoc.id}`);
            } else {
              setViewTab('history');
              navigate('/returns');
            }
          }}
        />
      ) : (
        <section className="panel returns-history-panel">
          <div className="toolbar">
            <div className="actions">
              <label>
                {t('نوع المرتجع', 'Return Type')}
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                  <option value="">{t('جميع أنواع المرتجعات', 'All return types')}</option>
                  <option value="return">{t('مرتجع صرف (من قسم للمخزن)', 'Issue return (From department)')}</option>
                  <option value="supplier_return">{t('مرتجع مورد (لشركة)', 'Supplier return (To vendor)')}</option>
                  <option value="scrap">{t('إعدام / إثبات تالف', 'Scrap / Damaged write-off')}</option>
                </select>
              </label>

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
                {t('بحث', 'Search')}
                <input
                  type="text"
                  placeholder={t('رقم الإذن، القسم، السبب…', 'Voucher #, dept, reason…')}
                  value={searchDoc}
                  onChange={e => setSearchDoc(e.target.value)}
                />
              </label>
            </div>

            <button
              className="primary"
              onClick={() => {
                setViewTab('new');
                navigate('/returns/new');
              }}
            >
              + {t('إذن استرجاع جديد', 'New Return')}
            </button>
          </div>

          <DataState resource={docsRes} />

          {docsRes.data && (
            <>
              <Table
                rows={pagedReturns}
                columns={[
                  ['number', t('رقم المستند', 'Doc #')],
                  ['type_label', t('نوع المرتجع', 'Type')],
                  ['party_label', t('الجهة (القسم / المورد)', 'Beneficiary / Supplier')],
                  ['doc_date', t('تاريخ الاسترجاع', 'Return Date')],
                  ['reason', t('السبب / الحالة', 'Reason')],
                  ['lines_count', t('عدد الأصناف', 'Items count')],
                  ['status', t('الحالة', 'Status')],
                  ['creator_name', t('المسؤول', 'Created by')]
                ]}
                onRow={row => navigate(`/returns/${row.id}`)}
              />
              <Pagination
                total={filteredReturns.length}
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

// ============================================================================
// FORM COMPONENT: Handles Return from Dept, Supplier Return, and Scrap Write-off
// ============================================================================
interface ReturnLineState {
  item_id: string;
  sku: string;
  name: string;
  unit: string;
  original_quantity: number;
  already_returned: number;
  max_returnable: number;
  quantity: string;
  reference_line_id: string;
  lot_id?: string;
  lot_code?: string;
  location_id?: string;
  quality: string;
  condition: string;
  notes: string;
  selected: boolean;
}

function ReturnForm({
  initialType = 'return',
  initialRefId = '',
  warehouses,
  departments,
  employees,
  suppliers,
  locations,
  onDone
}: {
  initialType?: 'return' | 'supplier_return' | 'scrap';
  initialRefId?: string;
  warehouses: Row[];
  departments: Row[];
  employees: Row[];
  suppliers: Row[];
  locations: Row[];
  onDone: (doc?: Row) => void;
}) {
  const t = useText();
  const app = useApp();

  const [returnType, setReturnType] = useState<'return' | 'supplier_return' | 'scrap'>(initialType);
  const [selectedWarehouse, setSelectedWarehouse] = useState(app.warehouse || warehouses[0]?.id || '');
  const [documentDate, setDocumentDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [departmentId, setDepartmentId] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [referenceId, setReferenceId] = useState(initialRefId);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<ReturnLineState[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Ref tracking loaded reference doc id to prevent overwriting user-checked lines on re-renders
  const loadedRefId = useRef<string>('');

  // ==========================================================================
  // DISCOVERY & FILTER STATES (خيارات البحث والتصفية المتعددة)
  // ==========================================================================
  // For Issue Returns:
  const [issueLookupTab, setIssueLookupTab] = useState<'voucher' | 'smart_item'>('voucher');
  const [voucherSearchText, setVoucherSearchText] = useState('');
  const [voucherDeptFilter, setVoucherDeptFilter] = useState('');
  const [voucherEmpFilter, setVoucherEmpFilter] = useState('');
  const [smartSearchItemText, setSmartSearchItemText] = useState('');

  // For Supplier Returns:
  const [supFilter, setSupFilter] = useState('');
  const [invoiceSearchText, setInvoiceSearchText] = useState('');
  const [docNumSearchText, setDocNumSearchText] = useState('');
  const [lotSearchText, setLotSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Fetch candidate posted issues
  const postedIssuesRes = useData<Row[]>(
    returnType === 'return' ? `documents?type=issue&status=Posted${selectedWarehouse ? `&warehouse_id=${selectedWarehouse}` : ''}` : null
  );

  // Fetch candidate posted receipts
  const postedReceiptsRes = useData<Row[]>(
    returnType === 'supplier_return' ? `documents?type=receipt&status=Posted${selectedWarehouse ? `&warehouse_id=${selectedWarehouse}` : ''}` : null
  );

  // Load the selected reference document details
  const refDocRes = useData<Row>(referenceId ? `documents/${referenceId}` : null);
  // Load existing returns referencing this document to calculate remaining quantities
  const existingReturnsRes = useData<Row[]>(referenceId ? `documents?status=Posted` : null);

  // When reference document changes, auto-populate lines ONCE
  useEffect(() => {
    if (!refDocRes.data) return;
    const refDoc = refDocRes.data;

    // Prevent re-populating if already loaded (fixes uncheck resetting bug)
    if (loadedRefId.current === refDoc.id && lines.length > 0) return;
    loadedRefId.current = refDoc.id;

    if (refDoc.warehouse_id) setSelectedWarehouse(refDoc.warehouse_id);
    if (refDoc.department_id) setDepartmentId(refDoc.department_id);
    if (refDoc.recipient_id) setRecipientId(refDoc.recipient_id);
    if (refDoc.supplier_id) setSupplierId(refDoc.supplier_id);

    // Calculate how much has already been returned for each line
    const alreadyReturnedMap: Record<string, number> = {};
    const relatedReturns = (existingReturnsRes.data || []).filter(
      d => d.reference_id === refDoc.id && ['return', 'supplier_return'].includes(d.type)
    );
    for (const ret of relatedReturns) {
      for (const rl of ret.lines || []) {
        if (rl.reference_line_id) {
          alreadyReturnedMap[rl.reference_line_id] = (alreadyReturnedMap[rl.reference_line_id] || 0) + Number(rl.quantity || 0);
        }
      }
    }

    const newLines: ReturnLineState[] = (refDoc.lines || []).map((l: Row) => {
      const origQty = Number(l.quantity || 0);
      const retQty = alreadyReturnedMap[l.id] || 0;
      const maxRet = Math.max(0, origQty - retQty);

      return {
        item_id: l.item_id,
        sku: l.sku || '',
        name: l.name_ar || l.name_en || l.name || '',
        unit: l.unit || 'Piece',
        original_quantity: origQty,
        already_returned: retQty,
        max_returnable: maxRet,
        quantity: maxRet > 0 ? String(maxRet) : '0',
        reference_line_id: l.id,
        lot_id: l.lot_id || '',
        lot_code: l.lot_code || '',
        location_id: l.location_id || '',
        quality: 'Accepted',
        condition: 'New',
        notes: '',
        selected: maxRet > 0
      };
    });

    setLines(newLines);
  }, [refDocRes.data, existingReturnsRes.data]);

  // Handle line field update
  function updateLine(index: number, updates: Partial<ReturnLineState>) {
    setLines(prev => prev.map((l, i) => (i === index ? { ...l, ...updates } : l)));
  }

  // Clear chosen reference document
  function clearReferenceDoc() {
    setReferenceId('');
    setLines([]);
    loadedRefId.current = '';
  }

  // Filtered candidate issues for return
  const filteredCandidateIssues = useMemo(() => {
    if (!postedIssuesRes.data) return [];
    return postedIssuesRes.data.filter(d => {
      if (voucherDeptFilter && d.department_id !== voucherDeptFilter) return false;
      if (voucherEmpFilter && d.recipient_id !== voucherEmpFilter) return false;
      if (voucherSearchText) {
        const q = voucherSearchText.toLowerCase();
        const numMatch = String(d.number || '').toLowerCase().includes(q);
        const reasonMatch = String(d.reason || '').toLowerCase().includes(q);
        const recMatch = String(d.recipient_name || '').toLowerCase().includes(q);
        const deptMatch = String(d.department_name || '').toLowerCase().includes(q);
        if (!numMatch && !reasonMatch && !recMatch && !deptMatch) return false;
      }
      return true;
    });
  }, [postedIssuesRes.data, voucherDeptFilter, voucherEmpFilter, voucherSearchText]);

  // Filtered candidate receipts for supplier return
  const filteredCandidateReceipts = useMemo(() => {
    if (!postedReceiptsRes.data) return [];
    return postedReceiptsRes.data.filter(d => {
      if (supFilter && d.supplier_id !== supFilter) return false;
      if (docNumSearchText && !String(d.number || '').toLowerCase().includes(docNumSearchText.toLowerCase())) return false;
      if (invoiceSearchText) {
        const inv = String(d.metadata?.invoice || '').toLowerCase();
        if (!inv.includes(invoiceSearchText.toLowerCase())) return false;
      }
      if (lotSearchText) {
        const lotQ = lotSearchText.toLowerCase();
        const inNotes = String(d.notes || '').toLowerCase().includes(lotQ);
        const inReason = String(d.reason || '').toLowerCase().includes(lotQ);
        if (!inNotes && !inReason) return false;
      }
      if (dateFrom && String(d.document_date).slice(0, 10) < dateFrom) return false;
      if (dateTo && String(d.document_date).slice(0, 10) > dateTo) return false;
      return true;
    });
  }, [postedReceiptsRes.data, supFilter, docNumSearchText, invoiceSearchText, lotSearchText, dateFrom, dateTo]);

  // Submit and optionally post immediately
  async function handleSubmit(action: 'post' | 'draft') {
    if (busy) return;
    setError('');

    if (!selectedWarehouse) {
      setError(t('يرجى تحديد المخزن', 'Please select a warehouse'));
      return;
    }

    if (!referenceId) {
      setError(
        returnType === 'return'
          ? t('يرجى اختيار إذن الصرف المراد الاسترجاع منه أولاً', 'Please select the original issue voucher')
          : t('يرجى اختيار فاتورة / إذن استلام المشتريات المراد إرجاعها للمورد أولاً', 'Please select the original purchase receipt')
      );
      return;
    }

    const selectedLines = lines.filter(l => l.selected && Number(l.quantity) > 0);
    if (!selectedLines.length) {
      setError(t('يرجى تحديد صنف واحد على الأقل والكمية المراد استرجاعها', 'Please select at least one item with a valid return quantity'));
      return;
    }

    // Validate quantities do not exceed max returnable
    for (const l of selectedLines) {
      if (Number(l.quantity) > l.max_returnable) {
        setError(
          t(
            `الكمية المرتجعة للصنف ${l.sku} (${l.quantity}) تتجاوز الحد الأقصى المتاح للاسترجاع (${l.max_returnable})`,
            `Return quantity for ${l.sku} (${l.quantity}) exceeds remaining returnable quantity (${l.max_returnable})`
          )
        );
        return;
      }
    }

    setBusy(true);
    try {
      const payload: Row = {
        type: returnType,
        document_date: documentDate,
        warehouse_id: selectedWarehouse,
        department_id: departmentId || null,
        recipient_id: recipientId || null,
        supplier_id: supplierId || null,
        reference_id: referenceId,
        reason: reason || (returnType === 'return' ? 'استرجاع مواد فائضة من القسم' : 'مرتجع بضاعة للمورد'),
        notes: notes || '',
        currency: 'EGP',
        exchange_rate: '1',
        lines: selectedLines.map(l => ({
          item_id: l.item_id,
          quantity: String(l.quantity),
          unit: l.unit,
          reference_line_id: l.reference_line_id,
          location_id: l.location_id || null,
          lot_id: l.lot_id || null,
          quality: l.quality,
          condition: l.condition,
          notes: l.notes || ''
        }))
      };

      const key = uid();
      const created = await mutate('documents', payload, key);

      if (action === 'post' && created?.id) {
        // Submit
        const subRes = await mutate(`documents/${created.id}/submit`, { version: created.version }, uid());
        // Post directly to update stock
        const postRes = await mutate(`documents/${created.id}/post`, { version: subRes.version }, uid());
        app.notify(
          returnType === 'return'
            ? t('تم ترحيل إذن الاسترجاع وزيادة الرصيد في المخزن فورًا!', 'Return posted! Warehouse stock has been increased.')
            : t('تم ترحيل مرتجع المورد وخصمه من المخزن فورًا!', 'Supplier return posted! Stock deducted.')
        );
        onDone(postRes);
      } else {
        app.notify(t('تم حفظ المسودة بنجاح.', 'Draft saved successfully.'));
        onDone(created);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel return-form-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">RETURNS MANAGEMENT · فحص وإرجاع المواد</span>
          <h2>
            {returnType === 'return'
              ? t('تسجيل استرجاع مواد من قسم (يزيد رصيد المخزن)', 'Issue Return (Re-inject to Stock)')
              : t('تسجيل مرتجع بضاعة لمورد / شركة', 'Supplier Return (Return to Vendor)')}
          </h2>
        </div>
      </div>

      {/* Main Switcher: Return from Dept vs Return to Supplier */}
      <div className="return-type-switch">
        <button
          type="button"
          className={`return-switch-pill ${returnType === 'return' ? 'active' : ''}`}
          onClick={() => {
            setReturnType('return');
            clearReferenceDoc();
          }}
        >
          <Icon name="sync" />
          <span>{t('استرجاع مواد من قسم (إذن صرف)', 'Return from Department')}</span>
        </button>

        <button
          type="button"
          className={`return-switch-pill ${returnType === 'supplier_return' ? 'active' : ''}`}
          onClick={() => {
            setReturnType('supplier_return');
            clearReferenceDoc();
          }}
        >
          <Icon name="box" />
          <span>{t('مرتجع لشركة / مورد (فاتورة شراء)', 'Return to Supplier')}</span>
        </button>
      </div>

      <form onSubmit={e => { e.preventDefault(); handleSubmit('post'); }}>
        <fieldset disabled={busy}>
          {/* Main Info Grid */}
          <div className="fields return-fields-grid">
            <label>
              <span>{t('مخزن الاسترجاع', 'Warehouse')} *</span>
              <select
                value={selectedWarehouse}
                required
                onChange={e => {
                  setSelectedWarehouse(e.target.value);
                  clearReferenceDoc();
                }}
              >
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </label>

            <label>
              <span>{t('تاريخ الاسترجاع', 'Return Date')} *</span>
              <input
                type="date"
                required
                value={documentDate}
                onChange={e => setDocumentDate(e.target.value)}
              />
            </label>

            <label className="wide">
              <span>{t('سبب الاسترجاع / تقرير الحالة', 'Reason / Condition Report')} *</span>
              <input
                type="text"
                required
                placeholder={
                  returnType === 'return'
                    ? t('مثال: فائض تشغيل بعد انتهاء أمر العمل، استرجاع تالف ومعيب…', 'e.g. Surplus after job, damaged return…')
                    : t('مثال: غير مطابق للمواصفات، عيب صناعة، توريد زائد…', 'e.g. Defective, rejected specs…')
                }
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
            </label>
          </div>

          {/* ================================================================
              SECTION 1: DISCOVERY & SELECTION CENTER (عند عدم اختيار مستند بعد)
              ================================================================ */}
          {!referenceId ? (
            <div className="discovery-center-panel">
              <div className="discovery-header">
                <h3>
                  {returnType === 'return'
                    ? t('اختر أو ابحث عن إذن الصرف المراد الاسترجاع منه', 'Find Issue Voucher to Return From')
                    : t('اختر أو ابحث عن فاتورة / إذن استلام الشراء للمرتجع', 'Find Purchase Receipt to Return To')}
                </h3>
                <small className="discovery-subtitle">
                  {returnType === 'return'
                    ? t('اختر من الخيارات المتعددة أدناه للوصول السريع لإذن الصرف المطلوب:', 'Multiple options to easily find the voucher:')
                    : t('ابحث بكود اللوط، أو اسم الشركة الموردة، أو رقم فاتورة المورد، أو فترة التواريخ:', 'Search by Lot, Supplier, Invoice #, or Date range:')}
                </small>
              </div>

              {/* A) ISSUE RETURN DISCOVERY OPTIONS */}
              {returnType === 'return' && (
                <>
                  <div className="sub-lookup-nav">
                    <button
                      type="button"
                      className={`sub-nav-btn ${issueLookupTab === 'voucher' ? 'active' : ''}`}
                      onClick={() => setIssueLookupTab('voucher')}
                    >
                      <Icon name="search" />
                      <span>{t('بحث مباشر برقم الإذن أو المستلم أو القسم', 'Search by Voucher # or Recipient')}</span>
                    </button>
                    <button
                      type="button"
                      className={`sub-nav-btn ${issueLookupTab === 'smart_item' ? 'active' : ''}`}
                      onClick={() => setIssueLookupTab('smart_item')}
                    >
                      <Icon name="box" />
                      <span>{t('بحث ذكي بالصنف والقسم (أين صُرف هذا الصنف؟)', 'Smart Lookup by Item & Department')}</span>
                    </button>
                  </div>

                  {/* Mode 1: Search by Voucher Number, Department, Recipient */}
                  {issueLookupTab === 'voucher' && (
                    <div className="discovery-filter-bar">
                      <div className="filter-input-wrap">
                        <label>
                          <span>{t('رقم إذن الصرف / اسم المستلم / السبب', 'Voucher # / Recipient')}</span>
                          <input
                            type="text"
                            placeholder={t('اكتب رقم الإذن (مثال: 12 أو 105) أو اسم الموظف…', 'Type voucher # or name…')}
                            value={voucherSearchText}
                            onChange={e => setVoucherSearchText(e.target.value)}
                          />
                        </label>
                      </div>

                      <div className="filter-select-wrap">
                        <label>
                          <span>{t('القسم المستفيد', 'Department')}</span>
                          <select value={voucherDeptFilter} onChange={e => setVoucherDeptFilter(e.target.value)}>
                            <option value="">{t('جميع الأقسام', 'All departments')}</option>
                            {departments.map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="filter-select-wrap">
                        <label>
                          <span>{t('الموظف المستلم', 'Staff')}</span>
                          <select value={voucherEmpFilter} onChange={e => setVoucherEmpFilter(e.target.value)}>
                            <option value="">{t('جميع الموظفين', 'All staff')}</option>
                            {employees.map(e => (
                              <option key={e.id} value={e.id}>{e.name}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Mode 2: Smart Search by Item & Department */}
                  {issueLookupTab === 'smart_item' && (
                    <div className="discovery-filter-bar">
                      <div className="filter-input-wrap" style={{ flex: '2 1 300px' }}>
                        <label>
                          <span>{t('كود أو اسم الصنف (SKU / Name)', 'Item SKU or Name')}</span>
                          <input
                            type="text"
                            placeholder={t('مثال: كراتين، جوان، زيت، أو كود الصنف…', 'Item name or code…')}
                            value={smartSearchItemText}
                            onChange={e => {
                              setSmartSearchItemText(e.target.value);
                              setVoucherSearchText(e.target.value);
                            }}
                          />
                        </label>
                      </div>

                      <div className="filter-select-wrap">
                        <label>
                          <span>{t('القسم المسترجع منه', 'Department')}</span>
                          <select value={voucherDeptFilter} onChange={e => setVoucherDeptFilter(e.target.value)}>
                            <option value="">{t('جميع الأقسام', 'All departments')}</option>
                            {departments.map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Candidates List for Issue Vouchers */}
                  <div className="candidates-container">
                    {!filteredCandidateIssues.length ? (
                      <div className="empty-candidates">
                        <p>{t('لم يتم العثور على أذون صرف مطابقة لمعايير البحث الحالية.', 'No matching issue vouchers found.')}</p>
                      </div>
                    ) : (
                      <div className="candidate-cards-grid">
                        {filteredCandidateIssues.slice(0, 12).map(v => (
                          <div key={v.id} className="candidate-card issue-card">
                            <div className="candidate-card-top">
                              <span className="candidate-doc-number">#{v.number}</span>
                              <span className="candidate-doc-date">{String(v.document_date).slice(0, 10)}</span>
                            </div>

                            <div className="candidate-card-body">
                              <div className="candidate-meta-row">
                                <span className="meta-lbl">{t('القسم:', 'Dept:')}</span>
                                <b className="meta-val">{v.department_name || 'بدون قسم'}</b>
                              </div>
                              {v.recipient_name && (
                                <div className="candidate-meta-row">
                                  <span className="meta-lbl">{t('المستلم:', 'Staff:')}</span>
                                  <span className="meta-val">{v.recipient_name}</span>
                                </div>
                              )}
                              {v.reason && (
                                <div className="candidate-reason-text">
                                  {v.reason}
                                </div>
                              )}
                              <div className="candidate-lines-badge">
                                {v.lines_count || 1} {t('أصناف مصروفة', 'issued items')}
                              </div>
                            </div>

                            <button
                              type="button"
                              className="btn-select-candidate"
                              onClick={() => {
                                setReferenceId(v.id);
                                loadedRefId.current = '';
                              }}
                            >
                              ↩ {t('اختيار هذا الإذن للاسترجاع منه', 'Select this voucher')}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* B) SUPPLIER RETURN DISCOVERY OPTIONS */}
              {returnType === 'supplier_return' && (
                <>
                  <div className="discovery-filter-bar supplier-filter-bar">
                    <div className="filter-select-wrap">
                      <label>
                        <span>{t('المورد / الشركة', 'Supplier / Vendor')}</span>
                        <select value={supFilter} onChange={e => setSupFilter(e.target.value)}>
                          <option value="">{t('جميع الموردين والشركات', 'All suppliers')}</option>
                          {suppliers.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="filter-input-wrap">
                      <label>
                        <span>{t('كود اللوط (LOT Number)', 'LOT Code')}</span>
                        <input
                          type="text"
                          placeholder={t('مثال: LOT-2026-OCT…', 'LOT code…')}
                          value={lotSearchText}
                          onChange={e => setLotSearchText(e.target.value)}
                        />
                      </label>
                    </div>

                    <div className="filter-input-wrap">
                      <label>
                        <span>{t('رقم فاتورة المورد', 'Supplier Invoice #')}</span>
                        <input
                          type="text"
                          placeholder={t('رقم فاتورة الشراء…', 'Invoice #…')}
                          value={invoiceSearchText}
                          onChange={e => setInvoiceSearchText(e.target.value)}
                        />
                      </label>
                    </div>

                    <div className="filter-input-wrap">
                      <label>
                        <span>{t('رقم مستند الاستلام', 'Receipt #')}</span>
                        <input
                          type="text"
                          placeholder={t('مثال: 104…', 'Receipt #…')}
                          value={docNumSearchText}
                          onChange={e => setDocNumSearchText(e.target.value)}
                        />
                      </label>
                    </div>

                    <div className="filter-input-wrap">
                      <label>
                        <span>{t('من تاريخ', 'From Date')}</span>
                        <input
                          type="date"
                          value={dateFrom}
                          onChange={e => setDateFrom(e.target.value)}
                        />
                      </label>
                    </div>

                    <div className="filter-input-wrap">
                      <label>
                        <span>{t('إلى تاريخ', 'To Date')}</span>
                        <input
                          type="date"
                          value={dateTo}
                          onChange={e => setDateTo(e.target.value)}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Candidates List for Supplier Receipts */}
                  <div className="candidates-container">
                    {!filteredCandidateReceipts.length ? (
                      <div className="empty-candidates">
                        <p>{t('لم يتم العثور على فواتير أو أذون استلام مطابقة.', 'No matching purchase receipts found.')}</p>
                      </div>
                    ) : (
                      <div className="candidate-cards-grid">
                        {filteredCandidateReceipts.slice(0, 12).map(r => {
                          const supName = suppliers.find(s => s.id === r.supplier_id)?.name || 'مورد';
                          return (
                            <div key={r.id} className="candidate-card supplier-card-pick">
                              <div className="candidate-card-top">
                                <span className="candidate-doc-number">#{r.number}</span>
                                {r.metadata?.invoice && (
                                  <span className="candidate-invoice-badge">
                                    فاتورة: {r.metadata.invoice}
                                  </span>
                                )}
                                <span className="candidate-doc-date">{String(r.document_date).slice(0, 10)}</span>
                              </div>

                              <div className="candidate-card-body">
                                <div className="candidate-meta-row">
                                  <span className="meta-lbl">{t('المورد:', 'Supplier:')}</span>
                                  <b className="meta-val">{supName}</b>
                                </div>
                                {r.notes && (
                                  <div className="candidate-reason-text">
                                    {r.notes}
                                  </div>
                                )}
                                <div className="candidate-lines-badge">
                                  {r.lines_count || 1} {t('أصناف مستلمة', 'received items')}
                                </div>
                              </div>

                              <button
                                type="button"
                                className="btn-select-candidate primary-pick"
                                onClick={() => {
                                  setReferenceId(r.id);
                                  loadedRefId.current = '';
                                }}
                              >
                                ↩ {t('اختيار هذه الفاتورة للإرجاع للمورد', 'Select this invoice')}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            /* ================================================================
               SECTION 2: ACTIVE LINKED DOCUMENT BANNER (المستند المختار حالياً)
               ================================================================ */
            <div className="active-reference-banner">
              <div className="ref-banner-main">
                <span className="ref-banner-eyebrow">
                  {returnType === 'return' ? t('إذن الصرف المعتمد المرتبط:', 'Linked Issue Voucher:') : t('فاتورة / إذن الاستلام المرتبط:', 'Linked Purchase Receipt:')}
                </span>
                <div className="ref-banner-title">
                  <b>#{refDocRes.data?.number || referenceId}</b>
                  {refDocRes.data?.metadata?.invoice && (
                    <span className="ref-tag-invoice">فاتورة المورد: {refDocRes.data.metadata.invoice}</span>
                  )}
                  {refDocRes.data?.document_date && (
                    <span className="ref-tag-date">{String(refDocRes.data.document_date).slice(0, 10)}</span>
                  )}
                  {refDocRes.data?.department_name && (
                    <span className="ref-tag-party">{refDocRes.data.department_name}</span>
                  )}
                  {refDocRes.data?.supplier_id && (
                    <span className="ref-tag-party">
                      {suppliers.find(s => s.id === refDocRes.data?.supplier_id)?.name || 'مورد'}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                className="btn-change-ref"
                onClick={clearReferenceDoc}
                title={t('إلغاء هذا المستند واختيار مستند آخر', 'Change document')}
              >
                ✕ {t('تغيير أو اختيار مستند آخر', 'Change Document')}
              </button>
            </div>
          )}

          {/* ================================================================
              SECTION 3: LINES CHECKLIST & QUANTITY CONTROLS
              ================================================================ */}
          {referenceId && (
            <div className="lines-management-section">
              <div className="return-lines-bulk-header">
                <div>
                  <h3>
                    {returnType === 'return'
                      ? t('أصناف إذن الصرف المراد استرجاعها للمخزن', 'Voucher Items to Return')
                      : t('أصناف فاتورة الشراء المراد إرجاعها للمورد', 'Invoice Items to Return')}
                  </h3>
                  <small style={{ color: 'var(--muted)' }}>
                    {t('حدد الأصناف التي تود إرجاعها بالتعليم عليها، وحدد الكمية والحالة:', 'Check the items to return and adjust quantities:')}
                  </small>
                </div>

                {/* Bulk Select / Deselect Actions */}
                <div className="lines-bulk-actions">
                  <button
                    type="button"
                    className="btn-bulk-check"
                    onClick={() => setLines(prev => prev.map(l => ({ ...l, selected: l.max_returnable > 0 })))}
                  >
                    ☑ {t('تحديد الكل', 'Select All')}
                  </button>
                  <button
                    type="button"
                    className="btn-bulk-check"
                    onClick={() => setLines(prev => prev.map(l => ({ ...l, selected: false })))}
                  >
                    ☐ {t('إلغاء التحديد', 'Deselect All')}
                  </button>
                </div>
              </div>

              {!lines.length ? (
                <Empty>{t('جارٍ تحميل أصناف المستند المختار…', 'Loading document lines…')}</Empty>
              ) : (
                <div className="return-lines-container">
                  {lines.map((line, idx) => {
                    const isAvailable = line.max_returnable > 0;
                    return (
                      <div
                        key={line.reference_line_id || idx}
                        className={`return-line-item ${line.selected ? 'selected' : ''} ${!isAvailable ? 'disabled' : ''}`}
                      >
                        <div className="line-item-header">
                          <div className="line-item-identity">
                            <input
                              type="checkbox"
                              id={`line-chk-${idx}`}
                              checked={line.selected}
                              disabled={!isAvailable}
                              onChange={e => {
                                e.stopPropagation();
                                updateLine(idx, { selected: e.target.checked });
                              }}
                            />
                            <label htmlFor={`line-chk-${idx}`} className="line-sku-badge">{line.sku}</label>
                            <label htmlFor={`line-chk-${idx}`} className="line-name-label"><b>{line.name}</b></label>
                            {line.lot_code && <span className="lot-pill">LOT: {line.lot_code}</span>}
                          </div>

                          <div className="line-stats-pills">
                            <span>
                              {t('المصروف سابقاً:', 'Issued:')} <b>{line.original_quantity} {line.unit}</b>
                            </span>
                            {line.already_returned > 0 && (
                              <span className="returned-stat">
                                {t('مسترجع سابقاً:', 'Returned:')} <b>{line.already_returned} {line.unit}</b>
                              </span>
                            )}
                            <span className="max-return-stat">
                              {t('المتاح للاسترجاع:', 'Remaining:')} <b>{line.max_returnable} {line.unit}</b>
                            </span>
                          </div>
                        </div>

                        {line.selected && (
                          <div className="line-return-controls">
                            {/* Return Quantity */}
                            <label className="return-qty-field">
                              <span>{t('الكمية المسترجعة *', 'Return Qty *')}</span>
                              <div className="qty-input-group">
                                <input
                                  type="number"
                                  min="0.000001"
                                  max={line.max_returnable}
                                  step="any"
                                  required
                                  value={line.quantity}
                                  onChange={e => updateLine(idx, { quantity: e.target.value })}
                                />
                                <span className="unit-label">{line.unit}</span>
                              </div>
                            </label>

                            {/* Condition & Quality Selector */}
                            <label className="return-condition-field">
                              <span>{t('حالة وجودة القطعة المسترجعة *', 'Condition & Quality *')}</span>
                              <select
                                value={`${line.quality}|${line.condition}`}
                                onChange={e => {
                                  const [q, c] = e.target.value.split('|');
                                  updateLine(idx, { quality: q, condition: c });
                                }}
                              >
                                <option value="Accepted|New">
                                  ✔ {t('سليم مطابق - جديد (Accepted / New - يزيد الرصيد المتاح)', 'Accepted - New (Increases Available)')}
                                </option>
                                <option value="Accepted|Used">
                                  ✔ {t('سليم مطابق - مستعمل صالح للاستخدام (Accepted / Used)', 'Accepted - Used')}
                                </option>
                                <option value="Rejected|Damaged">
                                  ⚠ {t('تالف / معيب / مكسور (Damaged / Rejected - يُعزل بالمخزن ولا يصرف)', 'Damaged / Rejected (Quarantined)')}
                                </option>
                                <option value="Under Inspection|Used">
                                  🔍 {t('تحت الفحص / حجر جودة (Under Inspection)', 'Under Inspection')}
                                </option>
                              </select>
                            </label>

                            {/* Target Location */}
                            <label className="return-location-field">
                              <span>{t('موضع التخزين بالمخزن', 'Storage Location')}</span>
                              <select
                                value={line.location_id || ''}
                                onChange={e => updateLine(idx, { location_id: e.target.value })}
                              >
                                <option value="">{t('— بدون موضع محدد —', '— No specific location —')}</option>
                                {locations
                                  .filter(l => l.warehouse_id === selectedWarehouse)
                                  .map(l => (
                                    <option key={l.id} value={l.id}>{l.name}</option>
                                  ))}
                              </select>
                            </label>

                            {/* Line Notes */}
                            <label className="return-notes-field">
                              <span>{t('ملاحظة البند', 'Notes')}</span>
                              <input
                                type="text"
                                placeholder={t('سبب الإرجاع أو وصف التلف إن وجد…', 'Reason or damage description…')}
                                value={line.notes}
                                onChange={e => updateLine(idx, { notes: e.target.value })}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {error && <Notice error>{error}</Notice>}

          {/* Form Actions */}
          <div className="actions form-actions-row">
            <button
              type="button"
              className="primary post-btn"
              disabled={busy || !lines.some(l => l.selected && Number(l.quantity) > 0)}
              onClick={() => handleSubmit('post')}
            >
              {busy
                ? t('جارٍ الترحيل…', 'Posting…')
                : returnType === 'return'
                ? t('✔ استلام وترحيل استرجاع للمخزن فورًا (زيادة الرصيد)', '✔ Post Return to Warehouse (Increase Stock)')
                : t('✔ ترحيل مرتجع للمورد وخصمه فورًا', '✔ Post Supplier Return (Deduct Stock)')}
            </button>

            <button
              type="button"
              className="secondary draft-btn"
              disabled={busy || !lines.some(l => l.selected && Number(l.quantity) > 0)}
              onClick={() => handleSubmit('draft')}
            >
              {t('حفظ كمسودة مرتجع', 'Save Draft')}
            </button>

            <button type="button" onClick={() => onDone()} disabled={busy}>
              {t('إلغاء', 'Cancel')}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}

// ============================================================================
// DETAIL COMPONENT: View Posted Return Voucher with Signatures & Print
// ============================================================================
function ReturnDetail({
  doc,
  departments,
  employees,
  suppliers,
  onBack
}: {
  doc: Row;
  departments: Row[];
  employees: Row[];
  suppliers: Row[];
  onBack: () => void;
}) {
  const t = useText();
  const app = useApp();

  const isIssueReturn = doc.type === 'return';
  const isSupplierReturn = doc.type === 'supplier_return';
  const isScrap = doc.type === 'scrap';

  const dept = departments.find(d => d.id === doc.department_id);
  const emp = employees.find(e => e.id === doc.recipient_id);
  const supplier = suppliers.find(s => s.id === doc.supplier_id);

  return (
    <section className="panel return-detail-panel">
      {/* Header */}
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            RETURN VOUCHER #{doc.number} · {doc.type.toUpperCase()}
          </span>
          <h2>
            {isIssueReturn
              ? t('إذن استرجاع مواد من قسم (إعادة للمخزن)', 'Official Issue Return Voucher')
              : isSupplierReturn
              ? t('إذن مرتجع بضاعة لمورد / شركة', 'Official Supplier Return Voucher')
              : t('إذن إثبات وإعدام تالف', 'Official Scrap Write-Off')}
          </h2>
        </div>
        <span className={`status ${String(doc.status).toLowerCase().replaceAll(' ', '-')}`}>
          {doc.status}
        </span>
      </div>

      <dl className="detail-grid">
        <div>
          <dt>{t('رقم إذن الاسترجاع', 'Voucher #')}</dt>
          <dd><b>#{doc.number}</b></dd>
        </div>
        <div>
          <dt>{t('المستند الأصلي المرجعي', 'Reference Document')}</dt>
          <dd>
            {doc.reference_id ? (
              <span className="badge-pill">REF ID: {doc.reference_id.slice(0, 8)}…</span>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt>{t('الجهة (القسم / المورد)', 'Department / Supplier')}</dt>
          <dd>
            <b>
              {isIssueReturn
                ? dept?.name || doc.department_name || '—'
                : isSupplierReturn
                ? supplier?.name || '—'
                : t('المخزن', 'Warehouse')}
            </b>
          </dd>
        </div>
        <div>
          <dt>{t('الموظف المسؤول', 'Responsible Staff')}</dt>
          <dd>
            <b>{doc.recipient_name || emp?.name || doc.creator_name}</b>
            {doc.recipient_badge && <span className="badge-pill">ID: {doc.recipient_badge}</span>}
          </dd>
        </div>
        <div>
          <dt>{t('تاريخ الاسترجاع', 'Return Date')}</dt>
          <dd>{String(doc.document_date).slice(0, 10)}</dd>
        </div>
        <div>
          <dt>{t('سبب الاسترجاع / الحالة', 'Reason')}</dt>
          <dd><b>{doc.reason || '—'}</b></dd>
        </div>
      </dl>

      <h3>{t('الأصناف المسترجعة', 'Returned Items')}</h3>
      <Table
        rows={(doc.lines || []).map((l: Row) => ({
          ...l,
          condition_label:
            l.condition === 'Damaged' || l.quality === 'Rejected'
              ? `⚠ ${l.quality} (${l.condition})`
              : `✔ ${l.quality} (${l.condition})`
        }))}
        columns={[
          ['sku', 'SKU'],
          ['name_ar', t('الصنف', 'Item')],
          ['quantity', t('الكمية المسترجعة', 'Returned Qty')],
          ['unit', t('الوحدة', 'Unit')],
          ['condition_label', t('حالة وجودة القطعة', 'Condition & Quality')],
          ['notes', t('ملاحظات', 'Notes')]
        ]}
      />

      {doc.notes && (
        <div className="doc-notes-box">
          <small>{t('ملاحظات إضافية:', 'Additional Notes:')}</small>
          <p>{doc.notes}</p>
        </div>
      )}

      {/* Official Signatures for Auditing */}
      <div className="signatures-grid">
        <div className="signature-box">
          <span>{t('مسلّم القطع (القسم / الجهة):', 'Returned by (Dept Staff):')}</span>
          <b>{doc.recipient_name || emp?.name || '—'}</b>
          <div className="sign-line" />
        </div>
        <div className="signature-box">
          <span>{t('فحص واستلام (أمين المخزن):', 'Inspected & Received by (Storekeeper):')}</span>
          <b>{doc.creator_name}</b>
          <div className="sign-line" />
        </div>
        <div className="signature-box">
          <span>{t('اعتماد الجودة / الإدارة:', 'Quality / Manager Approval:')}</span>
          <div className="sign-line" />
        </div>
      </div>

      <div className="actions">
        <button onClick={() => window.print()}>
          <Icon name="chart" /> {t('طباعة إذن الاسترجاع', 'Print Return Voucher')}
        </button>
        <button onClick={onBack}>
          {t('الرجوع لقائمة المرتجعات', 'Back')}
        </button>
      </div>
    </section>
  );
}
