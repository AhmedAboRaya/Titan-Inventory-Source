import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Row, mutate, uid, ApiError } from './api';
import { useApp, useText, useData, usePermission, DataState, Empty, Table, Notice, Modal, Icon, date } from './ui';
import { ItemPicker } from './ItemPicker';
import { MotionDiv, staggerItem } from './motion';
import { Pagination, usePagination } from './Pagination';

export function Issues({ forceNew }: { forceNew?: boolean }) {
  const t = useText();
  const app = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { id: paramId } = useParams();

  const isNew = forceNew || (!paramId && location.pathname.endsWith('/new'));
  const [viewTab, setViewTab] = useState<'new' | 'history'>(isNew ? 'new' : 'history');

  // Filters for history
  const [statusFilter, setStatusFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [empFilter, setEmpFilter] = useState('');
  const [searchDoc, setSearchDoc] = useState('');

  // Load masters (departments, employees, machines) and warehouses
  const mastersRes = useData<Row[]>('masters?all=true');
  const allMasters = mastersRes.data || [];

  const departments = useMemo(() => allMasters.filter(m => m.kind === 'department'), [allMasters]);
  const employees = useMemo(() => allMasters.filter(m => m.kind === 'employee'), [allMasters]);
  const machines = useMemo(() => allMasters.filter(m => m.kind === 'machine'), [allMasters]);

  const warehousesRes = useData<Row[]>('warehouses');
  const warehouses = warehousesRes.data || [];

  // Issues list query
  const queryParams = new URLSearchParams({
    type: 'issue',
    ...(app.warehouse ? { warehouse_id: app.warehouse } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(deptFilter ? { department_id: deptFilter } : {}),
    ...(empFilter ? { recipient_id: empFilter } : {})
  });

  const issuesRes = useData<Row[]>(`documents?${queryParams}`);
  const singleDocRes = useData<Row>(paramId ? `documents/${paramId}` : null);

  // Memoized formatted & filtered rows
  const filteredIssues = useMemo(() => {
    if (!issuesRes.data) return [];
    return issuesRes.data
      .filter(d => {
        if (!searchDoc) return true;
        const q = searchDoc.toLowerCase();
        return (
          String(d.number || '').toLowerCase().includes(q) ||
          String(d.reason || '').toLowerCase().includes(q) ||
          String(d.recipient_name || '').toLowerCase().includes(q) ||
          String(d.department_name || '').toLowerCase().includes(q)
        );
      })
      .map(d => ({
        ...d,
        dept_label: d.department_name || '—',
        recipient_label: d.recipient_name
          ? `${d.recipient_badge ? `[${d.recipient_badge}] ` : ''}${d.recipient_name}${d.recipient_job ? ` (${d.recipient_job})` : ''}`
          : '—',
        doc_date: String(d.document_date).slice(0, 10),
        lines_count: d.lines_count ?? (d.lines?.length || '—')
      }));
  }, [issuesRes.data, searchDoc]);

  const {
    page,
    pageSize,
    setPage,
    setPageSize,
    resetPage,
    paginatedItems: pagedIssues
  } = usePagination(filteredIssues, 15);

  useEffect(() => {
    resetPage();
  }, [statusFilter, deptFilter, empFilter, searchDoc, resetPage]);

  // If a specific document is loaded by paramId, show its detailed voucher view
  if (paramId) {
    return (
      <div className="issues-page">
        <button className="back" onClick={() => navigate('/issues')}>
          ← {t('الرجوع لأذون الصرف', 'Back to issue vouchers')}
        </button>
        <DataState resource={singleDocRes} />
        {singleDocRes.data && (
          <IssueVoucherDetail
            doc={singleDocRes.data}
            departments={departments}
            employees={employees}
            onBack={() => navigate('/issues')}
          />
        )}
      </div>
    );
  }

  return (
    <div className="issues-page">
      {/* Top Navigation Tabs */}
      <div className="tabs">
        <button
          className={viewTab === 'new' ? 'active' : ''}
          onClick={() => {
            setViewTab('new');
            navigate('/issues/new');
          }}
        >
          + {t('إخراج إذن صرف جديد (فاتورة صرف مواد)', 'New Issue Voucher')}
        </button>
        <button
          className={viewTab === 'history' ? 'active' : ''}
          onClick={() => {
            setViewTab('history');
            navigate('/issues');
          }}
        >
          {t('سجل وأرشيف أذون الصرف', 'Issue Vouchers Archive')}
        </button>
        <button
          type="button"
          onClick={() => navigate('/returns/new?type=return')}
        >
          ↩ {t('إذن استرجاع مواد من قسم', 'Return from Department')}
        </button>
      </div>

      {viewTab === 'new' ? (
        <IssueVoucherForm
          warehouses={warehouses}
          departments={departments}
          employees={employees}
          machines={machines}
          onDone={(createdDoc) => {
            app.refresh();
            if (createdDoc?.id) {
              navigate(`/issues/${createdDoc.id}`);
            } else {
              setViewTab('history');
              navigate('/issues');
            }
          }}
        />
      ) : (
        <section className="panel issues-history-panel">
          <div className="toolbar">
            <div className="actions">
              <label>
                {t('القسم المستفيد', 'Department')}
                <select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setEmpFilter(''); }}>
                  <option value="">{t('جميع الأقسام', 'All departments')}</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>

              <label>
                {t('المستلم / الموظف', 'Recipient Staff')}
                <select value={empFilter} onChange={e => setEmpFilter(e.target.value)}>
                  <option value="">{t('جميع الموظفين', 'All staff')}</option>
                  {employees
                    .filter(e => !deptFilter || e.data?.department_id === deptFilter)
                    .map(e => (
                      <option key={e.id} value={e.id}>
                        {e.data?.badge ? `[${e.data.badge}] ` : ''}{e.name}
                      </option>
                    ))}
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
                navigate('/issues/new');
              }}
            >
              + {t('إذن صرف جديد', 'New Issue')}
            </button>
          </div>

          <DataState resource={issuesRes} />

          {issuesRes.data && (
            <>
              <Table
                rows={pagedIssues}
                columns={[
                  ['number', t('رقم إذن الصرف', 'Voucher #')],
                  ['dept_label', t('القسم المستفيد', 'Beneficiary Department')],
                  ['recipient_label', t('المستلم / الموظف', 'Recipient Staff (ID)')],
                  ['reason', t('سبب الصرف / أمر التشغيل', 'Reason / Work Order')],
                  ['doc_date', t('تاريخ الصرف', 'Issue Date')],
                  ['lines_count', t('عدد الأصناف', 'Items count')],
                  ['status', t('الحالة', 'Status')],
                  ['creator_name', t('المسؤول', 'Created by')]
                ]}
                onRow={row => navigate(`/issues/${row.id}`)}
              />
              <Pagination
                total={filteredIssues.length}
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

interface IssueLine {
  item_id: string;
  quantity: string;
  unit: string;
  location_id: string;
  quality: string;
  condition: string;
  notes: string;
  itemData?: Row;
  lot_id?: string;
}

function IssueLineLotSelector({
  line,
  warehouseId,
  idx,
  onChange,
  error,
  clearError
}: {
  line: IssueLine;
  warehouseId: string;
  idx: number;
  onChange: (updates: Partial<IssueLine>) => void;
  error?: string;
  clearError: (k: string) => void;
}) {
  const t = useText();
  const itemRes = useData<Row>(line.item_id ? `items/${line.item_id}` : null);
  const item = line.itemData || itemRes.data;
  const positions = (item?.positions || []).filter((p: Row) => p.warehouse_id === warehouseId && Number(p.quantity) > 0);
  const lotsRes = useData<Row[]>(line.item_id ? `lots?item_id=${line.item_id}` : null);
  const allLots = lotsRes.data || [];

  if (!line.item_id || !item?.track_lot) return null;

  const lotOptions = positions.filter((p: Row) => p.lot_id).map((p: Row) => {
    const lotObj = allLots.find(l => l.id === p.lot_id);
    return {
      id: p.lot_id,
      code: p.lot_code || lotObj?.code || p.lot_id,
      qty: p.quantity,
      unit: item.base_unit
    };
  });

  return (
    <div className={`line-lot-container ${error ? 'lot-error' : ''}`}>
      <div className="lot-header">
        <span>🏷️ {t('رقم اللوت / التشغيلة المطلوب صرفها (Lot No.)', 'Lot to Issue')} <b className="req-star" style={{ color: '#ef4444' }}>*</b></span>
      </div>
      <div className="lot-select-wrapper">
        <select
          className={error ? 'input-error' : ''}
          value={line.lot_id || ''}
          onChange={e => {
            onChange({ lot_id: e.target.value });
            clearError(`line_${idx}_lot`);
          }}
        >
          <option value="">{t('— اختر رقم اللوت المصروف منه —', '— Choose lot —')}</option>
          {lotOptions.map((l: any) => (
            <option key={l.id} value={l.id}>
              {l.code} (متاح: {l.qty} {l.unit})
            </option>
          ))}
          {allLots.filter(al => !lotOptions.some((lo: any) => lo.id === al.id)).map(al => (
            <option key={al.id} value={al.id}>
              {al.code} {al.expires_on ? ` · صلاحية: ${String(al.expires_on).slice(0, 10)}` : ''}
            </option>
          ))}
        </select>
        {error && <span className="field-error-msg">⚠️ {error}</span>}
      </div>
    </div>
  );
}

function IssueVoucherForm({
  warehouses,
  departments,
  employees,
  machines,
  onDone
}: {
  warehouses: Row[];
  departments: Row[];
  employees: Row[];
  machines: Row[];
  onDone: (doc?: Row) => void;
}) {
  const t = useText();
  const app = useApp();

  // Header information
  const [warehouseId, setWarehouseId] = useState(app.warehouse || warehouses[0]?.id || '');
  const [departmentId, setDepartmentId] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [documentDate, setDocumentDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  // Lines (multiple items in one voucher)
  const [lines, setLines] = useState<IssueLine[]>([
    {
      item_id: '',
      quantity: '',
      unit: 'Piece',
      location_id: '',
      quality: 'Accepted',
      condition: 'New',
      notes: '',
      lot_id: ''
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

  // Filtered employees list based on selected department
  const filteredEmployees = useMemo(() => {
    if (!departmentId) return employees;
    return employees.filter(e => !e.data?.department_id || e.data?.department_id === departmentId);
  }, [employees, departmentId]);

  // When recipient employee is selected, auto-select their department if not set
  function handleRecipientChange(empId: string) {
    setRecipientId(empId);
    clearError('beneficiary');
    if (empId) {
      const emp = employees.find(e => e.id === empId);
      if (emp?.data?.department_id && !departmentId) {
        setDepartmentId(emp.data.department_id);
      }
    }
  }

  // When department changes, if current recipient does not belong to it, reset recipient
  function handleDepartmentChange(deptId: string) {
    setDepartmentId(deptId);
    clearError('beneficiary');
    if (recipientId && deptId) {
      const emp = employees.find(e => e.id === recipientId);
      if (emp?.data?.department_id && emp.data.department_id !== deptId) {
        setRecipientId('');
      }
    }
  }

  // Locations for current warehouse
  const locationsRes = useData<Row[]>('locations');
  const warehouseLocations = useMemo(() => {
    return (locationsRes.data || []).filter(l => l.warehouse_id === warehouseId);
  }, [locationsRes.data, warehouseId]);

  function handleLineChange(index: number, updates: Partial<IssueLine>) {
    setLines(prev => prev.map((l, i) => (i === index ? { ...l, ...updates } : l)));
  }

  function handleAddLine() {
    setLines(prev => [
      ...prev,
      {
        item_id: '',
        quantity: '',
        unit: 'Piece',
        location_id: '',
        quality: 'Accepted',
        condition: 'New',
        notes: '',
        lot_id: ''
      }
    ]);
  }

  function handleRemoveLine(index: number) {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter((_, i) => i !== index));
  }

  // Totals
  const totalItemsCount = lines.filter(l => l.item_id).length;
  const totalQuantity = lines.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0);

  async function submitDocument(action: 'draft' | 'post') {
    if (busy) return;
    setError('');

    const errs: Record<string, string> = {};

    // 1. Validations
    if (!warehouseId) {
      errs.warehouse = t('برجاء تحديد مخزن الصرف.', 'Please select source warehouse.');
    }
    if (!departmentId && !machineId) {
      errs.beneficiary = t('برجاء تحديد القسم المستفيد أو الماكينة.', 'Please specify beneficiary department or machine.');
    }
    if (!reason.trim()) {
      errs.reason = t('برجاء كتابة سبب الصرف أو رقم أمر التشغيل.', 'Please specify reason or work order for the issue.');
    }

    if (lines.length === 0) {
      setError(t('برجاء إضافة صنف واحد على الأقل.', 'Please add at least one item.'));
      return;
    }

    lines.forEach((line, idx) => {
      if (!line.item_id) {
        errs[`line_${idx}_item`] = t('برجاء اختيار الصنف المطلوب صرفه.', 'Please select item.');
      }
      if (!line.quantity || Number(line.quantity) <= 0 || isNaN(Number(line.quantity))) {
        errs[`line_${idx}_quantity`] = t('برجاء إدخال كمية صحيحة أكبر من صفر.', 'Please enter quantity > 0.');
      }
      if (line.itemData?.track_lot && !line.lot_id) {
        errs[`line_${idx}_lot`] = t('اللوت مطلوب لهذا الصنف قبل الصرف.', 'Lot is required for this item.');
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
      const payload: Row = {
        type: 'issue',
        document_date: documentDate,
        warehouse_id: warehouseId,
        department_id: departmentId || null,
        recipient_id: recipientId || null,
        machine_id: machineId || null,
        reason: reason.trim(),
        notes: notes.trim(),
        currency: 'EGP',
        exchange_rate: '1',
        lines: lines.map(l => ({
          item_id: l.item_id,
          quantity: l.quantity,
          unit: l.unit,
          location_id: l.location_id || null,
          quality: l.quality || 'Accepted',
          condition: l.condition || 'New',
          notes: l.notes || '',
          ...(l.lot_id ? { lot_id: l.lot_id } : {})
        }))
      };

      // 1. Save draft on server
      const draftResult = await mutate('documents', payload, commitKey);

      if (action === 'post') {
        // 2. Submit & Post immediately to update warehouse stock
        const submitResult = await mutate(`documents/${draftResult.id}/submit`, { version: draftResult.version });
        const postResult = await mutate(`documents/${draftResult.id}/post`, { version: submitResult.version });
        app.notify(t('تم ترحيل إذن الصرف وخصم الأصناف من المخزن رسميًا بنجاح.', 'Issue voucher posted and items deducted from warehouse stock successfully.'));
        onDone(postResult);
      } else {
        app.notify(t('تم حفظ إذن الصرف كمسودة على الخادم بنجاح.', 'Issue draft saved successfully.'));
        onDone(draftResult);
      }
    } catch (err: any) {
      const msg = err.message || '';
      const serverErrs: Record<string, string> = {};
      if (msg.includes('اللوت') || err.code === 'LOT') {
        const idx = lines.findIndex(l => l.itemData?.track_lot);
        if (idx >= 0) serverErrs[`line_${idx}_lot`] = msg;
      }
      if (msg.includes('القسم') || msg.includes('الماكينة') || err.code === 'BENEFICIARY') {
        serverErrs.beneficiary = msg;
      }
      if (msg.includes('السبب') || err.code === 'REASON') {
        serverErrs.reason = msg;
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
    <section className="panel issue-editor-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">WAREHOUSE ISSUE VOUCHER</span>
          <h2>{t('إخراج إذن صرف مخزني جديد (فاتورة صرف مواد)', 'New Material Issue Voucher')}</h2>
        </div>
      </div>

      {error && <Notice error>{error}</Notice>}

      <form onSubmit={e => { e.preventDefault(); submitDocument('draft'); }}>
        {/* Issue Header Card */}
        <div className="invoice-header-card issue-header-card">
          <h3>{t('بيانات الصرف والجهة المستلمة', 'Issue & Beneficiary Details')}</h3>
          <div className="fields">
            {/* Beneficiary Department */}
            <label className={fieldErrors.beneficiary ? 'field-error' : ''}>
              <span>{t('القسم المستفيد', 'Beneficiary Department')} <b className="req-star" style={{ color: '#ef4444' }}>*</b></span>
              <select
                required
                className={fieldErrors.beneficiary ? 'input-error' : ''}
                value={departmentId}
                onChange={e => handleDepartmentChange(e.target.value)}
              >
                <option value="">{t('— اختر القسم —', '— Choose department —')}</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              {fieldErrors.beneficiary && <span className="field-error-msg">⚠️ {fieldErrors.beneficiary}</span>}
            </label>

            {/* Recipient Employee */}
            <label>
              <span>{t('المستلم / الموظف (مع كود ID)', 'Recipient Staff (with ID)')}</span>
              <select
                value={recipientId}
                onChange={e => handleRecipientChange(e.target.value)}
              >
                <option value="">{t('— اختر الموظف المستلم —', '— Choose recipient —')}</option>
                {filteredEmployees.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.data?.badge ? `[ID: ${e.data.badge}] ` : ''}{e.name}{e.data?.job_title ? ` (${e.data.job_title})` : ''}
                  </option>
                ))}
              </select>
            </label>

            {/* Source Warehouse */}
            <label className={fieldErrors.warehouse ? 'field-error' : ''}>
              <span>{t('مخزن الصرف', 'Source Warehouse')} <b className="req-star" style={{ color: '#ef4444' }}>*</b></span>
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

            {/* Issue Date */}
            <label className={fieldErrors.documentDate ? 'field-error' : ''}>
              <span>{t('تاريخ إذن الصرف', 'Issue Date')} <b className="req-star" style={{ color: '#ef4444' }}>*</b></span>
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

            {/* Machine / Production Line */}
            <label>
              <span>{t('الماكينة / الخط (اختياري)', 'Machine (optional)')}</span>
              <select
                value={machineId}
                onChange={e => {
                  setMachineId(e.target.value);
                  clearError('beneficiary');
                }}
              >
                <option value="">{t('— بدون تحديد ماكينة —', '— No specific machine —')}</option>
                {machines.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>

            {/* Reason / Work Order (Required) */}
            <label className={fieldErrors.reason ? 'field-error' : ''}>
              <span>{t('سبب الصرف / رقم أمر التشغيل', 'Reason / Work Order #')} <b className="req-star" style={{ color: '#ef4444' }}>*</b></span>
              <input
                type="text"
                required
                className={fieldErrors.reason ? 'input-error' : ''}
                placeholder={t('مثال: أمر تشغيل رقم 204 أو صيانة خط إنتاج…', 'e.g., Work order #204, workshop maintenance…')}
                value={reason}
                onChange={e => {
                  setReason(e.target.value);
                  clearError('reason');
                }}
              />
              {fieldErrors.reason && <span className="field-error-msg">⚠️ {fieldErrors.reason}</span>}
            </label>

            {/* Notes */}
            <label className="wide">
              <span>{t('ملاحظات إضافية', 'Additional Notes')}</span>
              <textarea
                placeholder={t('أي تعليمات تسليم أو ملاحظات خاصة بإذن الصرف…', 'Special instructions or notes…')}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
              />
            </label>
          </div>
        </div>

        {/* Multi-item lines section */}
        <div className="invoice-lines-section">
          <div className="lines-header">
            <h3>{t('الأصناف المطلوب صرفها (متعدد الأصناف)', 'Items to Issue (Multi-item)')}</h3>
            <span className="items-counter">
              {t('إجمالي الأصناف المضافة: ', 'Total items added: ')}
              <b>{lines.length}</b>
            </span>
          </div>

          {lines.map((line, idx) => {
            const available = line.itemData?.available !== undefined ? Number(line.itemData.available) : null;
            const requested = Number(line.quantity) || 0;
            const isExceeding = available !== null && requested > available;

            return (
              <MotionDiv key={idx} className={`doc-line issue-line-box ${isExceeding ? 'warning-stock' : ''}`} {...staggerItem(idx, 0.08, 0.32)}>
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

                {/* The Advanced Dual-Mode ItemPicker with Stock Display */}
                <ItemPicker
                  value={line.item_id}
                  warehouseId={warehouseId}
                  showStock={true}
                  required
                  error={fieldErrors[`line_${idx}_item`]}
                  onChange={(itemId, itemData) => {
                    handleLineChange(idx, {
                      item_id: itemId,
                      unit: itemData?.base_unit || line.unit || 'Piece',
                      itemData,
                      lot_id: ''
                    });
                    clearError(`line_${idx}_item`);
                    clearError(`line_${idx}_lot`);
                  }}
                />

                {/* Quantity and Line Parameters */}
                <div className="fields line-fields-grid">
                  <label className={fieldErrors[`line_${idx}_quantity`] ? 'field-error' : ''}>
                    <span>{t('الكمية المصروفة', 'Issue Quantity')} <b className="req-star" style={{ color: '#ef4444' }}>*</b></span>
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

                  <label>
                    <span>{t('الموضع في المخزن', 'Warehouse Location')}</span>
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
                    <span>{t('الغرض / ملاحظات الصنف', 'Item purpose / note')}</span>
                    <input
                      type="text"
                      placeholder={t('ملاحظة للاستخدام في…', 'Use note…')}
                      value={line.notes}
                      onChange={e => handleLineChange(idx, { notes: e.target.value })}
                    />
                  </label>

                  {/* Lot selection for tracked items */}
                  <IssueLineLotSelector
                    line={line}
                    warehouseId={warehouseId}
                    idx={idx}
                    onChange={updates => handleLineChange(idx, updates)}
                    error={fieldErrors[`line_${idx}_lot`]}
                    clearError={clearError}
                  />
                </div>

                {/* Inline Stock Warning if quantity exceeds available */}
                {isExceeding && (
                  <div className="stock-warning-alert">
                    <Icon name="chart" />
                    <span>
                      {t(
                        `تنبيه: الكمية المطلوبة (${requested} ${line.unit}) تتجاوز الرصيد المتاح (${available} ${line.unit}) في المخزن!`,
                        `Warning: Requested quantity (${requested}) exceeds available stock (${available}) in warehouse!`
                      )}
                    </span>
                  </div>
                )}
              </MotionDiv>
            );
          })}

          {/* Add Another Item Button */}
          <button
            type="button"
            className="add-line-btn"
            onClick={handleAddLine}
          >
            + {t('إضافة صنف آخر لإذن الصرف', 'Add another item to issue voucher')}
          </button>
        </div>

        {/* Live Summary Bar */}
        <div className="voucher-summary-bar">
          <div className="summary-stat">
            <span>{t('عدد الأصناف المصروفة', 'Total Items')}</span>
            <b>{totalItemsCount}</b>
          </div>
          <div className="summary-stat">
            <span>{t('إجمالي الكميات', 'Total Units Issued')}</span>
            <b>{totalQuantity.toLocaleString()}</b>
          </div>
          <div className="summary-stat">
            <span>{t('القسم والمستلم', 'Beneficiary')}</span>
            <b>{departments.find(d => d.id === departmentId)?.name || '—'}</b>
          </div>
        </div>

        {/* Form Actions */}
        <div className="actions form-actions-row">
          <button
            type="button"
            className="primary post-btn"
            disabled={busy}
            onClick={() => submitDocument('post')}
          >
            {busy ? t('جارٍ الترحيل…', 'Posting…') : t('✔ ترحيل وخصم الصرف من المخزن فورًا', '✔ Post & Issue from Warehouse Now')}
          </button>

          <button
            type="submit"
            disabled={busy}
            className="secondary draft-btn"
          >
            {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ كمسودة إذن صرف', 'Save Draft')}
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
    </section>
  );
}

function IssueVoucherDetail({
  doc,
  departments,
  employees,
  onBack
}: {
  doc: Row;
  departments: Row[];
  employees: Row[];
  onBack: () => void;
}) {
  const t = useText();
  const app = useApp();
  const navigate = useNavigate();

  const dept = departments.find(d => d.id === doc.department_id);
  const emp = employees.find(e => e.id === doc.recipient_id);

  return (
    <section className="panel issue-voucher-detail-panel">
      {/* Header with Print-Ready Info */}
      <div className="section-heading">
        <div>
          <span className="eyebrow">ISSUE VOUCHER #{doc.number} · v{doc.version}</span>
          <h2>{t('إذن صرف مخزني معتمد', 'Official Material Issue Voucher')}</h2>
        </div>
        <span className={`status ${String(doc.status).toLowerCase().replaceAll(' ', '-')}`}>
          {doc.status}
        </span>
      </div>

      <dl className="detail-grid">
        <div>
          <dt>{t('رقم إذن الصرف', 'Voucher #')}</dt>
          <dd><b>#{doc.number}</b></dd>
        </div>
        <div>
          <dt>{t('القسم المستفيد', 'Department')}</dt>
          <dd><b>{dept?.name || doc.department_name || '—'}</b></dd>
        </div>
        <div>
          <dt>{t('المستلم / الموظف', 'Recipient Staff')}</dt>
          <dd>
            <b>{doc.recipient_name || emp?.name || '—'}</b>
            {(doc.recipient_badge || emp?.data?.badge) && (
              <span className="badge-pill">ID: {doc.recipient_badge || emp?.data?.badge}</span>
            )}
            {(doc.recipient_job || emp?.data?.job_title) && (
              <small style={{ display: 'block', color: 'var(--muted)' }}>
                {doc.recipient_job || emp?.data?.job_title}
              </small>
            )}
          </dd>
        </div>
        <div>
          <dt>{t('تاريخ الصرف', 'Issue Date')}</dt>
          <dd>{String(doc.document_date).slice(0, 10)}</dd>
        </div>
        <div>
          <dt>{t('سبب الصرف / أمر التشغيل', 'Reason / Work Order')}</dt>
          <dd><b>{doc.reason || '—'}</b></dd>
        </div>
        <div>
          <dt>{t('أمين المخزن المسئول', 'Created by')}</dt>
          <dd>{doc.creator_name}</dd>
        </div>
      </dl>

      <h3>{t('الأصناف المصروفة', 'Issued Items')}</h3>
      <Table
        rows={doc.lines || []}
        columns={[
          ['sku', 'SKU'],
          ['name_ar', t('الصنف', 'Item')],
          ['quantity', t('الكمية المصروفة', 'Quantity')],
          ['unit', t('الوحدة', 'Unit')],
          ['quality', t('الجودة', 'Quality')],
          ['condition', t('الحالة', 'Condition')]
        ]}
      />

      {doc.notes && (
        <div className="doc-notes-box">
          <small>{t('ملاحظات:', 'Notes:')}</small>
          <p>{doc.notes}</p>
        </div>
      )}

      {/* Official Signatures Grid (Visible in Print & Screen) */}
      <div className="signatures-grid">
        <div className="signature-box">
          <span>{t('تسليم (أمين المخزن):', 'Issued by (Storekeeper):')}</span>
          <b>{doc.creator_name}</b>
          <div className="sign-line" />
        </div>
        <div className="signature-box">
          <span>{t('استلام (الموظف المستلم):', 'Received by (Staff):')}</span>
          <b>{doc.recipient_name || emp?.name || '—'}</b>
          <div className="sign-line" />
        </div>
        <div className="signature-box">
          <span>{t('اعتماد (مدير القسم):', 'Approved by (Dept Manager):')}</span>
          <b>{dept?.name || '—'}</b>
          <div className="sign-line" />
        </div>
      </div>

      <div className="actions">
        {doc.status === 'Posted' && (
          <button
            type="button"
            className="primary"
            style={{ backgroundColor: 'var(--success, #16a34a)', borderColor: 'var(--success, #16a34a)' }}
            onClick={() => navigate(`/returns/new?type=return&refId=${doc.id}`)}
          >
            ↩ {t('استرجاع مواد للمخزن من هذا الإذن', 'Return items to warehouse')}
          </button>
        )}
        <button onClick={() => window.print()}>
          <Icon name="chart" /> {t('طباعة إذن الصرف', 'Print Voucher')}
        </button>
        <button onClick={onBack}>
          {t('الرجوع لأذون الصرف', 'Back')}
        </button>
      </div>
    </section>
  );
}
