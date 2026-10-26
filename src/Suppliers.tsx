import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { mutate, Row } from './api';
import { useApp, useText, useData, DataState, Empty, Modal, Notice, Icon } from './ui';
import { MotionDiv, staggerItem } from './motion';

export function Suppliers() {
  const t = useText();
  const app = useApp();
  const navigate = useNavigate();

  // Load all suppliers (including inactive)
  const mastersRes = useData<Row[]>('masters?kind=supplier&all=true');
  const receiptsRes = useData<Row[]>('documents?type=receipt&limit=500');

  // Search and status filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal state
  const [editingSupplier, setEditingSupplier] = useState<Row | null>(null);
  const [isNewModal, setIsNewModal] = useState(false);
  const [toggleConfirm, setToggleConfirm] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Form fields state
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [notes, setNotes] = useState('');

  const suppliers = useMemo(() => mastersRes.data || [], [mastersRes.data]);
  const receipts = useMemo(() => receiptsRes.data || [], [receiptsRes.data]);

  // Receipts count per supplier
  const supplierReceiptCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of receipts) {
      if (r.supplier_id) {
        map.set(r.supplier_id, (map.get(r.supplier_id) || 0) + 1);
      }
    }
    return map;
  }, [receipts]);

  // Filtered suppliers
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => {
      if (statusFilter === 'active' && !s.active) return false;
      if (statusFilter === 'inactive' && s.active) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const sCode = String(s.data?.code || '').toLowerCase();
      const sName = String(s.name || '').toLowerCase();
      const sContact = String(s.data?.contact || '').toLowerCase();
      const sPhone = String(s.data?.phone || '').toLowerCase();
      const sEmail = String(s.data?.email || '').toLowerCase();
      return (
        sName.includes(q) ||
        sCode.includes(q) ||
        sContact.includes(q) ||
        sPhone.includes(q) ||
        sEmail.includes(q)
      );
    });
  }, [suppliers, search, statusFilter]);

  // Open modal for editing
  function startEdit(supplier: Row) {
    setEditingSupplier(supplier);
    setName(supplier.name || '');
    setCode(supplier.data?.code || '');
    setContact(supplier.data?.contact || '');
    setPhone(supplier.data?.phone || '');
    setEmail(supplier.data?.email || '');
    setAddress(supplier.data?.address || '');
    setTaxNumber(supplier.data?.tax_number || supplier.data?.taxNumber || '');
    setNotes(supplier.data?.notes || '');
    setError('');
  }

  // Open modal for new supplier
  function startCreate() {
    setEditingSupplier(null);
    setName('');
    setCode('');
    setContact('');
    setPhone('');
    setEmail('');
    setAddress('');
    setTaxNumber('');
    setNotes('');
    setError('');
    setIsNewModal(true);
  }

  // Save supplier handler
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('اسم المورد مطلوب', 'Supplier name is required'));
      return;
    }
    setBusy(true);
    setError('');

    try {
      const payload: Row = {
        kind: 'supplier',
        name: name.trim(),
        data: {
          code: code.trim() || undefined,
          contact: contact.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          tax_number: taxNumber.trim() || undefined,
          notes: notes.trim() || undefined
        },
        active: editingSupplier ? editingSupplier.active : true,
        ...(editingSupplier?.id ? { version: editingSupplier.version } : {})
      };

      const path = editingSupplier?.id ? `masters/${editingSupplier.id}` : 'masters';
      await mutate(path, payload);

      app.notify(
        editingSupplier
          ? t('تم تحديث بيانات المورد بنجاح', 'Supplier updated successfully')
          : t('تمت إضافة المورد الجديد بنجاح', 'Supplier created successfully')
      );
      app.refresh();
      setEditingSupplier(null);
      setIsNewModal(false);
    } catch (err: any) {
      setError(err?.message || t('حدث خطأ أثناء حفظ بيانات المورد', 'Failed to save supplier'));
    } finally {
      setBusy(false);
    }
  }

  // Toggle active status
  async function handleToggleActive() {
    if (!toggleConfirm) return;
    setBusy(true);
    setError('');
    try {
      await mutate(`masters/${toggleConfirm.id}`, {
        kind: 'supplier',
        name: toggleConfirm.name,
        data: toggleConfirm.data || {},
        active: !toggleConfirm.active,
        version: toggleConfirm.version
      });
      app.notify(
        toggleConfirm.active
          ? t('تم إيقاف تفعيل المورد', 'Supplier deactivated')
          : t('تم تفعيل المورد بنجاح', 'Supplier activated')
      );
      app.refresh();
      setToggleConfirm(null);
    } catch (err: any) {
      setError(err?.message || t('تعذر تغيير حالة المورد', 'Failed to toggle supplier status'));
    } finally {
      setBusy(false);
    }
  }

  const activeCount = useMemo(() => suppliers.filter(s => s.active).length, [suppliers]);
  const inactiveCount = useMemo(() => suppliers.filter(s => !s.active).length, [suppliers]);

  return (
    <div className="suppliers-page">
      {/* Header and Stats */}
      <section className="panel suppliers-header-panel">
        <div className="suppliers-top-bar">
          <div>
            <span className="eyebrow">{t('سجل الموردين والجهات الموردة', 'SUPPLIERS DIRECTORY')}</span>
            <h2>{t('إدارة الموردين والشركات المعتمدة', 'Suppliers & Approved Vendors')}</h2>
            <p className="subtitle">
              {t(
                'إدارة بيانات الموردين، أكوادهم، وبيانات الاتصال. يظهر الموردون المضافون تلقائيًا عند إنشاء فواتير وأذون الشراء.',
                'Manage suppliers, contact information, and vendor codes. New suppliers appear automatically in purchase invoices.'
              )}
            </p>
          </div>

          <button className="primary add-supplier-btn" onClick={startCreate}>
            + {t('إضافة مورد جديد', 'Add New Supplier')}
          </button>
        </div>

        <div className="stats-cards-grid">
          <div className="stat-card">
            <span className="stat-label">{t('إجمالي الموردين', 'Total Suppliers')}</span>
            <b className="stat-value">{suppliers.length}</b>
            <small>{t('مسجل في النظام', 'Registered in system')}</small>
          </div>
          <div className="stat-card stat-active">
            <span className="stat-label">{t('موردون نشطون', 'Active Suppliers')}</span>
            <b className="stat-value">{activeCount}</b>
            <small>{t('متاحون للشراء', 'Available for purchasing')}</small>
          </div>
          <div className="stat-card stat-inactive">
            <span className="stat-label">{t('غير نشط', 'Inactive')}</span>
            <b className="stat-value">{inactiveCount}</b>
            <small>{t('موقوف مؤقتًا', 'Temporarily paused')}</small>
          </div>
          <div className="stat-card">
            <span className="stat-label">{t('فواتير الاستلام', 'Total Receipts')}</span>
            <b className="stat-value">{receipts.length}</b>
            <small>{t('عمليات استلام مرتبطة', 'Linked inbound receipts')}</small>
          </div>
        </div>
      </section>

      {/* Toolbar & Filters */}
      <section className="panel suppliers-list-panel">
        <div className="toolbar suppliers-toolbar">
          <div className="search-box">
            <Icon name="search" />
            <input
              type="text"
              placeholder={t('بحث بالاسم، الكود، مسؤول الاتصال، أو الهاتف…', 'Search name, code, contact or phone…')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="clear-btn" onClick={() => setSearch('')}>
                ×
              </button>
            )}
          </div>

          <div className="status-filter-group">
            <button
              className={`filter-pill ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              {t('الكل', 'All')} ({suppliers.length})
            </button>
            <button
              className={`filter-pill ${statusFilter === 'active' ? 'active' : ''}`}
              onClick={() => setStatusFilter('active')}
            >
              {t('النشط فقط', 'Active')} ({activeCount})
            </button>
            <button
              className={`filter-pill ${statusFilter === 'inactive' ? 'active' : ''}`}
              onClick={() => setStatusFilter('inactive')}
            >
              {t('المعطل', 'Inactive')} ({inactiveCount})
            </button>
          </div>
        </div>

        <DataState resource={mastersRes} />

        {/* Suppliers Grid / Cards */}
        {filteredSuppliers.length === 0 ? (
          <Empty>
            {search || statusFilter !== 'all'
              ? t('لا توجد نتائج مطابقة لبحثك', 'No suppliers match your search')
              : t('لا يوجد موردون مسجلون بعد', 'No suppliers registered yet')}
          </Empty>
        ) : (
          <div className="suppliers-grid">
            {filteredSuppliers.map((supplier, idx) => {
              const receiptCount = supplierReceiptCounts.get(supplier.id) || 0;
              return (
                <MotionDiv
                  key={supplier.id}
                  {...staggerItem(idx, 0.04, 0.2)}
                  className={`supplier-card ${!supplier.active ? 'is-inactive' : ''}`}
                >
                  <div className="supplier-card-header">
                    <div className="supplier-avatar">
                      {supplier.name.trim().charAt(0).toUpperCase()}
                    </div>
                    <div className="supplier-title-wrap">
                      <div className="title-row">
                        <h3 className="supplier-name">{supplier.name}</h3>
                        <span className={`status-tag ${supplier.active ? 'active' : 'inactive'}`}>
                          {supplier.active ? t('نشط', 'Active') : t('معطل', 'Inactive')}
                        </span>
                      </div>
                      {supplier.data?.code && (
                        <span className="supplier-code">
                          <code>{supplier.data.code}</code>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="supplier-card-body">
                    {supplier.data?.contact && (
                      <div className="info-row">
                        <span className="info-icon">👤</span>
                        <span className="info-label">{t('مسؤول الاتصال:', 'Contact:')}</span>
                        <span className="info-val">{supplier.data.contact}</span>
                      </div>
                    )}
                    {supplier.data?.phone && (
                      <div className="info-row">
                        <span className="info-icon">📞</span>
                        <span className="info-label">{t('الهاتف:', 'Phone:')}</span>
                        <a href={`tel:${supplier.data.phone}`} className="info-val link">
                          {supplier.data.phone}
                        </a>
                      </div>
                    )}
                    {supplier.data?.email && (
                      <div className="info-row">
                        <span className="info-icon">✉️</span>
                        <span className="info-label">{t('البريد:', 'Email:')}</span>
                        <a href={`mailto:${supplier.data.email}`} className="info-val link">
                          {supplier.data.email}
                        </a>
                      </div>
                    )}
                    {supplier.data?.address && (
                      <div className="info-row">
                        <span className="info-icon">📍</span>
                        <span className="info-label">{t('العنوان:', 'Address:')}</span>
                        <span className="info-val address-text">{supplier.data.address}</span>
                      </div>
                    )}
                    {supplier.data?.tax_number && (
                      <div className="info-row">
                        <span className="info-icon">🏛️</span>
                        <span className="info-label">{t('البطاقة الضريبية:', 'Tax ID:')}</span>
                        <span className="info-val"><code>{supplier.data.tax_number}</code></span>
                      </div>
                    )}
                    {supplier.data?.notes && (
                      <div className="info-notes">
                        <small>{supplier.data.notes}</small>
                      </div>
                    )}
                  </div>

                  <div className="supplier-card-footer">
                    <span className="receipts-count-badge">
                      📦 {receiptCount} {t('فاتورة استلام', 'Receipts')}
                    </span>

                    <div className="card-actions">
                      <button
                        className="btn-action-small primary-subtle"
                        title={t('فاتورة شراء جديدة لهذا المورد', 'New purchase invoice for this supplier')}
                        onClick={() => navigate(`/purchases/new?supplier_id=${supplier.id}`)}
                      >
                        + {t('شراء', 'Purchase')}
                      </button>
                      <button
                        className="btn-action-small"
                        onClick={() => startEdit(supplier)}
                        title={t('تعديل البيانات', 'Edit supplier')}
                      >
                        ✏️ {t('تعديل', 'Edit')}
                      </button>
                      <button
                        className={`btn-action-small ${supplier.active ? 'danger-subtle' : 'success-subtle'}`}
                        onClick={() => setToggleConfirm(supplier)}
                        title={supplier.active ? t('تعطيل المورد', 'Deactivate') : t('تفعيل المورد', 'Activate')}
                      >
                        {supplier.active ? t('تعطيل', 'Deactivate') : t('تفعيل', 'Activate')}
                      </button>
                    </div>
                  </div>
                </MotionDiv>
              );
            })}
          </div>
        )}
      </section>

      {/* Create / Edit Supplier Modal */}
      {(isNewModal || editingSupplier) && (
        <Modal
          title={
            editingSupplier
              ? t(`تعديل بيانات المورد: ${editingSupplier.name}`, `Edit Supplier: ${editingSupplier.name}`)
              : t('إضافة مورد جديد للنظام', 'Add New Supplier')
          }
          close={() => {
            setIsNewModal(false);
            setEditingSupplier(null);
          }}
        >
          <form className="supplier-form" onSubmit={handleSave}>
            <div className="form-grid">
              <label className="field-span-2">
                <span>
                  {t('اسم المورد / الشركة', 'Supplier / Company Name')}{' '}
                  <b style={{ color: '#ef4444' }}>*</b>
                </span>
                <input
                  type="text"
                  required
                  placeholder={t('مثال: شركة النصر للمواد الكيماوية', 'e.g. Cairo Chemical Supplies')}
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </label>

              <label>
                <span>{t('كود المورد (اختياري)', 'Supplier Code (Optional)')}</span>
                <input
                  type="text"
                  placeholder="SUP-001"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                />
              </label>

              <label>
                <span>{t('مسؤول الاتصال / المندوب', 'Contact Person / Representative')}</span>
                <input
                  type="text"
                  placeholder={t('مثال: أ. محمد عبد الله', 'e.g. John Doe')}
                  value={contact}
                  onChange={e => setContact(e.target.value)}
                />
              </label>

              <label>
                <span>{t('رقم الهاتف / الموبايل', 'Phone / Mobile')}</span>
                <input
                  type="tel"
                  dir="ltr"
                  placeholder="+20 10 01234567"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                />
              </label>

              <label>
                <span>{t('البريد الإلكتروني', 'Email Address')}</span>
                <input
                  type="email"
                  dir="ltr"
                  placeholder="orders@supplier.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </label>

              <label className="field-span-2">
                <span>{t('العنوان / المقر الرئيسي', 'Address / Headquarters')}</span>
                <input
                  type="text"
                  placeholder={t('مثال: المنطقة الصناعية، مدينة العاشر من رمضان', 'e.g. Industrial Zone, 10th of Ramadan')}
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                />
              </label>

              <label className="field-span-2">
                <span>{t('البطاقة الضريبية / السجل التجاري', 'Tax ID / Commercial Registration')}</span>
                <input
                  type="text"
                  placeholder="123-456-789"
                  value={taxNumber}
                  onChange={e => setTaxNumber(e.target.value)}
                />
              </label>

              <label className="field-span-2">
                <span>{t('ملاحظات إضافية / شروط التوريد', 'Notes & Terms')}</span>
                <textarea
                  rows={3}
                  placeholder={t('ملاحظات عن طريقة التوريد أو فترة الائتمان…', 'Delivery terms, payment credit period…')}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </label>
            </div>

            {error && <Notice error>{error}</Notice>}

            <div className="actions modal-actions">
              <button className="primary" type="submit" disabled={busy}>
                {busy
                  ? t('جارٍ الحفظ…', 'Saving…')
                  : editingSupplier
                  ? t('حفظ التعديلات', 'Save Changes')
                  : t('إضافة المورد', 'Create Supplier')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsNewModal(false);
                  setEditingSupplier(null);
                }}
              >
                {t('إلغاء', 'Cancel')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Toggle Confirm Modal */}
      {toggleConfirm && (
        <Modal
          title={
            toggleConfirm.active
              ? t('تأكيد تعطيل المورد', 'Confirm Deactivating Supplier')
              : t('تأكيد تفعيل المورد', 'Confirm Activating Supplier')
          }
          close={() => setToggleConfirm(null)}
        >
          <p>
            {toggleConfirm.active
              ? t(
                  `هل أنت متأكد من رغبتك في تعطيل المورد «${toggleConfirm.name}»؟ لن يظهر في القوائم المنسدلة للفواتير الجديدة حتى يُعاد تفعيله.`,
                  `Are you sure you want to deactivate "${toggleConfirm.name}"? They will not appear in new purchase dropdowns until reactivated.`
                )
              : t(
                  `هل تريد تفعيل المورد «${toggleConfirm.name}» ليصبح متاحًا في فواتير الشراء؟`,
                  `Do you want to activate "${toggleConfirm.name}" for purchasing?`
                )}
          </p>

          {error && <Notice error>{error}</Notice>}

          <div className="actions">
            <button
              className={toggleConfirm.active ? 'danger' : 'primary'}
              disabled={busy}
              onClick={handleToggleActive}
            >
              {busy
                ? t('جارٍ التنفيذ…', 'Processing…')
                : toggleConfirm.active
                ? t('نعم، قم بالتعطيل', 'Yes, Deactivate')
                : t('نعم، قم بالتفعيل', 'Yes, Activate')}
            </button>
            <button type="button" onClick={() => setToggleConfirm(null)}>
              {t('إلغاء', 'Cancel')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
