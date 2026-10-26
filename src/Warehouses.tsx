import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mutate, Row } from './api';
import { useApp, useText, useData, DataState, Empty, Modal, Notice, Icon, n } from './ui';
import { MotionTr, staggerItem } from './motion';
import { typeName } from './Documents';

export function Warehouses() {
  const t = useText();
  const app = useApp();
  const navigate = useNavigate();
  const { id: paramId } = useParams();

  // Load all warehouses (both active and inactive)
  const warehousesRes = useData<Row[]>('warehouses?all=true');
  const mastersRes = useData<Row[]>('masters?kind=site');

  // Modals state
  const [editingWh, setEditingWh] = useState<Row | null>(null);
  const [toggleConfirm, setToggleConfirm] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Filters & Tabs state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [activeTab, setActiveTab] = useState<'items' | 'locations' | 'movements'>('items');

  const canWrite = app.session.actor.permissions.includes('settings');

  const allWarehouses = useMemo(() => {
    return warehousesRes.data || [];
  }, [warehousesRes.data]);

  // Current selected warehouse (if route param present)
  const currentWh = useMemo(() => {
    if (!paramId) return null;
    return allWarehouses.find(w => w.id === paramId) || null;
  }, [allWarehouses, paramId]);

  // Warehouse specific queries
  const whItems = useData<Row[]>(
    currentWh ? `reports/balances?warehouse_id=${currentWh.id}` : null
  );
  const whLocations = useData<Row[]>(
    currentWh ? `locations?warehouse_id=${currentWh.id}` : null
  );
  const whMovements = useData<Row[]>(
    currentWh ? `documents?warehouse_id=${currentWh.id}` : null
  );

  // Stats
  const activeCount = useMemo(() => allWarehouses.filter(w => w.active).length, [allWarehouses]);
  const inactiveCount = useMemo(() => allWarehouses.filter(w => !w.active).length, [allWarehouses]);
  const totalItemsCount = useMemo(() => {
    return allWarehouses.reduce((acc, w) => acc + (Number(w.item_count) || 0), 0);
  }, [allWarehouses]);

  // Filtered warehouses list
  const filteredWarehouses = useMemo(() => {
    return allWarehouses.filter(w => {
      if (statusFilter === 'active' && !w.active) return false;
      if (statusFilter === 'inactive' && w.active) return false;
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return w.name.toLowerCase().includes(s);
    });
  }, [allWarehouses, search, statusFilter]);

  // Toggle active/inactive handler
  async function performToggle() {
    if (!toggleConfirm) return;
    setBusy(true);
    setError('');
    try {
      await mutate(`warehouses/${toggleConfirm.id}`, {
        name: toggleConfirm.name,
        site_id: toggleConfirm.site_id || null,
        active: !toggleConfirm.active,
        version: toggleConfirm.version
      });
      app.notify(
        toggleConfirm.active
          ? t('تم إيقاف المخزن بنجاح ومنع أي عمليات سحب أو إيداع عليه.', 'Warehouse stopped. Movements are blocked.')
          : t('تم إعادة تفعيل المخزن بنجاح وأصبح متاحًا للعمليات.', 'Warehouse reactivated successfully.')
      );
      setToggleConfirm(null);
      app.refresh();
    } catch (err: any) {
      setError(err.message || t('تعذر تغيير حالة المخزن', 'Failed to toggle warehouse status'));
    } finally {
      setBusy(false);
    }
  }

  // Quick action: start issue from warehouse
  function startIssue(whId: string) {
    window.dispatchEvent(
      new CustomEvent('inventory:new-document', {
        detail: {
          type: 'issue',
          document_date: new Date().toLocaleDateString('en-CA'),
          warehouse_id: whId,
          lines: [{ item_id: '', quantity: '', unit: 'Piece', quality: 'Accepted', condition: 'New' }]
        }
      })
    );
  }

  // Quick action: start receipt in warehouse
  function startReceipt(whId: string) {
    window.dispatchEvent(
      new CustomEvent('inventory:new-document', {
        detail: {
          type: 'receipt',
          document_date: new Date().toLocaleDateString('en-CA'),
          warehouse_id: whId,
          lines: [{ item_id: '', quantity: '', unit: 'Piece', quality: 'Accepted', condition: 'New' }]
        }
      })
    );
  }

  // ==========================================
  // VIEW 2: WAREHOUSE DETAILS VIEW
  // ==========================================
  if (currentWh) {
    return (
      <section className="warehouses-view">
        <div className="breadcrumbs">
          <button onClick={() => navigate('/warehouses')}>{t('المخازن', 'Warehouses')}</button>
          <span>/</span>
          <b>{currentWh.name}</b>
        </div>

        <section className="panel">
          <div className="section-heading">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span className="avatar-letter" style={{ width: '56px', height: '56px', fontSize: '24px', background: currentWh.active ? '#253d49' : '#883131' }}>
                <Icon name="box" />
              </span>
              <div>
                <span className="eyebrow">
                  {currentWh.active ? t('مخزن نشط معتمد', 'Active Warehouse') : t('مخزن متوقف مؤقتًا', 'Inactive Warehouse')}
                </span>
                <h2>{currentWh.name}</h2>
                <small style={{ fontSize: '13px', color: 'var(--muted)' }}>
                  ID: <code style={{ fontSize: '11px' }}>{currentWh.id}</code>
                </small>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className={`status ${currentWh.active ? 'posted' : 'inactive'}`} style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600 }}>
                {currentWh.active ? t('نشط (متاح للعمليات)', 'Active') : t('متوقف (محظور الصرف والإيداع)', 'Inactive')}
              </span>
            </div>
          </div>

          {!currentWh.active && (
            <div className="notice error" style={{ marginTop: '18px' }}>
              <b>{t('⚠️ تنبيه أمني: هذا المخزن موقوف حالياً.', 'Security Warning: This warehouse is stopped.')}</b>
              <p style={{ margin: '4px 0 0', fontSize: '12px' }}>
                {t(
                  'تم إيقاف هذا المخزن لمنع أي حركة مخزنية جديدة. أي محاولة لإنشاء أو ترحيل أذون صرف (سحب)، أذون استلام (إيداع)، تحويلات، أو جرد على هذا المخزن سيتم رفضها تلقائيًا من النظام.',
                  'Movements on this warehouse are locked. Any issue, receipt, transfer, or count will be rejected until reactivated.'
                )}
              </p>
            </div>
          )}

          <dl className="detail-grid" style={{ marginTop: '20px' }}>
            <div>
              <dt>{t('اسم المخزن', 'Warehouse Name')}</dt>
              <dd><b>{currentWh.name}</b></dd>
            </div>
            <div>
              <dt>{t('حالة المخزن', 'Operating Status')}</dt>
              <dd>
                <b style={{ color: currentWh.active ? '#32634b' : '#ab3434' }}>
                  {currentWh.active ? t('نشط ومتاح للتشغيل', 'Active') : t('متوقف عن العمليات', 'Stopped')}
                </b>
              </dd>
            </div>
            <div>
              <dt>{t('عدد الأصناف المتوفرة', 'Stock Items')}</dt>
              <dd><b>{currentWh.item_count ?? 0} {t('صنف', 'items')}</b></dd>
            </div>
            <div>
              <dt>{t('مواضع وأرفف التخزين', 'Locations / Racks')}</dt>
              <dd><b>{currentWh.location_count ?? 0} {t('موضع', 'locations')}</b></dd>
            </div>
            <div>
              <dt>{t('إجمالي الحركات والمستندات', 'Document History')}</dt>
              <dd><b>{currentWh.document_count ?? 0} {t('مستند', 'docs')}</b></dd>
            </div>
          </dl>

          <div className="actions" style={{ marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            {currentWh.active ? (
              <>
                {app.session.actor.permissions.includes('issue') && (
                  <button className="primary" onClick={() => startIssue(currentWh.id)}>
                    + {t('إذن صرف جديد (سحب من المخزن)', 'New Issue')}
                  </button>
                )}
                {app.session.actor.permissions.includes('receipt') && (
                  <button onClick={() => startReceipt(currentWh.id)}>
                    + {t('إذن استلام جديد (إيداع في المخزن)', 'New Receipt')}
                  </button>
                )}
              </>
            ) : (
              <span style={{ fontSize: '12px', color: '#ab3434', fontWeight: 600 }}>
                {t('لا يمكن إنشاء أذون جديدة لأن المخزن متوقف.', 'Movements disabled while warehouse is stopped.')}
              </span>
            )}

            {canWrite && (
              <>
                <button onClick={() => setEditingWh(currentWh)}>
                  {t('تعديل البيانات', 'Edit Details')}
                </button>
                <button
                  className={currentWh.active ? 'danger' : 'primary'}
                  onClick={() => setToggleConfirm(currentWh)}
                >
                  {currentWh.active ? t('إيقاف المخزن مؤقتًا', 'Deactivate Warehouse') : t('إعادة تفعيل المخزن', 'Reactivate Warehouse')}
                </button>
              </>
            )}

            <button onClick={() => navigate('/warehouses')}>
              ← {t('جميع المخازن', 'All Warehouses')}
            </button>
          </div>
        </section>

        {/* Tabs for Warehouse Detail View */}
        <div className="tabs">
          <button
            className={activeTab === 'items' ? 'active' : ''}
            onClick={() => setActiveTab('items')}
          >
            {t('الأصناف المخزنة والأرصدة', 'Stored Items & Stock')} ({currentWh.item_count ?? 0})
          </button>
          <button
            className={activeTab === 'locations' ? 'active' : ''}
            onClick={() => setActiveTab('locations')}
          >
            {t('مواضع وأرفف التخزين', 'Storage Locations')} ({currentWh.location_count ?? 0})
          </button>
          <button
            className={activeTab === 'movements' ? 'active' : ''}
            onClick={() => setActiveTab('movements')}
          >
            {t('سجل الحركات على المخزن', 'Movement History')}
          </button>
        </div>

        {/* Tab 1: Items & Stock */}
        {activeTab === 'items' && (
          <section className="panel">
            <div className="section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <span className="eyebrow">{t('مخزون فعلي', 'On-hand Stock')}</span>
                <h2>{t('الأرصدة الحالية في هذا المخزن', 'Current Balances')}</h2>
              </div>
              <button
                className="primary"
                onClick={() => navigate(`/transfers/new?source=${currentWh.id}`)}
              >
                ⇆ {t('إجراء تحويل مخزني من هذا المخزن', 'Transfer from this warehouse')}
              </button>
            </div>

            <DataState resource={whItems} />

            {whItems.data && (
              whItems.data.length === 0 ? (
                <Empty>{t('لا توجد أرصدة مخزنة في هذا المخزن حاليًا', 'No stock in this warehouse currently')}</Empty>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>{t('اسم الصنف', 'Item Name')}</th>
                        <th>{t('المتاح', 'Available')}</th>
                        <th>{t('المحجوز', 'Reserved')}</th>
                        <th>{t('الوحدة', 'Unit')}</th>
                        <th>{t('الموضع', 'Location')}</th>
                        <th>LOT</th>
                        <th>{t('الحالة', 'Condition')}</th>
                        <th>{t('إجراءات', 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {whItems.data.map((b, idx) => (
                        <MotionTr key={b.position_key || idx} {...staggerItem(idx, 0.04, 0.25)}>
                          <td>
                            <button
                              className="link"
                              style={{ fontWeight: 700 }}
                              onClick={() => navigate(`/catalogue/item/${b.item_id}`)}
                            >
                              {b.sku || '—'}
                            </button>
                          </td>
                          <td>
                            <button
                              className="link"
                              onClick={() => navigate(`/catalogue/item/${b.item_id}`)}
                            >
                              {b.name_ar || b.name_en || '—'}
                            </button>
                          </td>
                          <td>
                            <b style={{ color: Number(b.quantity) > 0 ? '#32634b' : 'var(--text)' }}>
                              {n(b.quantity)}
                            </b>
                          </td>
                          <td>{n(b.reserved || 0)}</td>
                          <td>{b.base_unit || 'Piece'}</td>
                          <td>{b.location_name || '—'}</td>
                          <td><code>{b.lot_code || '—'}</code></td>
                          <td>{b.condition || 'New'}</td>
                          <td>
                            {Number(b.quantity) > 0 && (
                              <button
                                className="btn-action-small primary-subtle"
                                style={{ padding: '3px 8px', fontSize: '11px', whiteSpace: 'nowrap', borderRadius: '6px' }}
                                title={t('نقل هذا الصنف لمخزن آخر', 'Transfer to another warehouse')}
                                onClick={() => navigate(`/transfers/new?source=${currentWh?.id}&item=${b.item_id}${b.lot_id ? '&lot=' + b.lot_id : ''}`)}
                              >
                                ⇆ {t('تحويل لمخزن', 'Transfer')}
                              </button>
                            )}
                          </td>
                        </MotionTr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </section>
        )}

        {/* Tab 2: Storage Locations */}
        {activeTab === 'locations' && (
          <section className="panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{t('التقسيم الداخلي', 'Organization')}</span>
                <h2>{t('مواضع التخزين والأرفف والخانات', 'Storage Locations & Racks')}</h2>
              </div>
            </div>

            <DataState resource={whLocations} />

            {whLocations.data && (
              whLocations.data.length === 0 ? (
                <Empty>{t('لا توجد مواضع تخزين مسجلة لهذا المخزن بعد', 'No storage locations defined for this warehouse yet')}</Empty>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('اسم الموضع', 'Location Name')}</th>
                        <th>{t('الرف الرئيسي (Rack)', 'Rack')}</th>
                        <th>{t('الرف الفرعي (Shelf)', 'Shelf')}</th>
                        <th>{t('الخانة (Bin)', 'Bin')}</th>
                        <th>{t('الحالة', 'Status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {whLocations.data.map((loc, idx) => (
                        <MotionTr key={loc.id} {...staggerItem(idx, 0.04, 0.25)}>
                          <td><b>{loc.name}</b></td>
                          <td>{loc.rack || '—'}</td>
                          <td>{loc.shelf || '—'}</td>
                          <td>{loc.bin || '—'}</td>
                          <td>
                            <span className={`status ${loc.active ? 'posted' : 'inactive'}`}>
                              {loc.active ? t('نشط', 'Active') : t('معطل', 'Disabled')}
                            </span>
                          </td>
                        </MotionTr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </section>
        )}

        {/* Tab 3: Movements History */}
        {activeTab === 'movements' && (
          <section className="panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{t('سجل القيود', 'Audit Trail')}</span>
                <h2>{t('الحركات المسجلة على هذا المخزن', 'Warehouse Movements')}</h2>
              </div>
            </div>

            <DataState resource={whMovements} />

            {whMovements.data && (
              whMovements.data.length === 0 ? (
                <Empty>{t('لا توجد حركات مسجلة لهذا المخزن حتى الآن', 'No movements recorded for this warehouse yet')}</Empty>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('رقم المستند', 'Doc #')}</th>
                        <th>{t('النوع', 'Type')}</th>
                        <th>{t('التاريخ', 'Date')}</th>
                        <th>{t('المستلم / القسم', 'Beneficiary')}</th>
                        <th>{t('السبب', 'Reason')}</th>
                        <th>{t('الحالة', 'Status')}</th>
                        <th>{t('المسؤول', 'Created By')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {whMovements.data.map((doc, idx) => (
                        <MotionTr key={doc.id} {...staggerItem(idx, 0.04, 0.25)}>
                          <td>
                            <button className="link" onClick={() => navigate(`/documents/${doc.id}`)}>
                              #{doc.number}
                            </button>
                          </td>
                          <td>{typeName(doc.type, app.lang)}</td>
                          <td>{String(doc.document_date).slice(0, 10)}</td>
                          <td>{doc.recipient_name || doc.department_name || '—'}</td>
                          <td>{doc.reason || '—'}</td>
                          <td>
                            <span className={`status ${doc.status.toLowerCase().replaceAll(' ', '-')}`}>
                              {doc.status}
                            </span>
                          </td>
                          <td>{doc.creator_name || '—'}</td>
                        </MotionTr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </section>
        )}

        {/* Edit Warehouse Modal */}
        {editingWh && (
          <WarehouseModal
            initial={editingWh}
            sites={mastersRes.data || []}
            close={() => setEditingWh(null)}
            done={() => { setEditingWh(null); app.refresh(); }}
          />
        )}

        {/* Deactivate/Reactivate Confirmation Modal */}
        {toggleConfirm && (
          <ToggleStatusModal
            warehouse={toggleConfirm}
            error={error}
            busy={busy}
            close={() => { setToggleConfirm(null); setError(''); }}
            confirm={performToggle}
          />
        )}
      </section>
    );
  }

  // ==========================================
  // VIEW 1: ALL WAREHOUSES ROOT VIEW
  // ==========================================
  return (
    <section className="warehouses-view">
      {/* Top Stats Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px', marginBottom: '22px' }}>
        <div className="panel" style={{ margin: 0, padding: '18px 22px' }}>
          <span className="eyebrow">{t('الهيكل التخزيني', 'Storage Structure')}</span>
          <b style={{ fontSize: '26px', color: 'var(--text)' }}>{allWarehouses.length}</b>
          <small style={{ display: 'block', color: 'var(--muted)', marginTop: '4px' }}>
            {t('إجمالي المخازن المسجلة', 'Total Registered Warehouses')}
          </small>
        </div>
        <div className="panel" style={{ margin: 0, padding: '18px 22px' }}>
          <span className="eyebrow">{t('المخازن المشغّلة', 'Active Warehouses')}</span>
          <b style={{ fontSize: '26px', color: '#32634b' }}>{activeCount}</b>
          <small style={{ display: 'block', color: 'var(--muted)', marginTop: '4px' }}>
            {t('مخازن نشطة ومتاحة للصرف والإيداع', 'Active & Accepting Movements')}
          </small>
        </div>
        <div className="panel" style={{ margin: 0, padding: '18px 22px' }}>
          <span className="eyebrow">{t('مخازن موقوفة', 'Stopped Warehouses')}</span>
          <b style={{ fontSize: '26px', color: inactiveCount > 0 ? '#aa3131' : 'var(--muted)' }}>
            {inactiveCount}
          </b>
          <small style={{ display: 'block', color: 'var(--muted)', marginTop: '4px' }}>
            {t('مخازن مقفلة محظور عليها أي حركة', 'Locked & Movements Blocked')}
          </small>
        </div>
        <div className="panel" style={{ margin: 0, padding: '18px 22px' }}>
          <span className="eyebrow">{t('الأصناف بالمخازن', 'Stored Items')}</span>
          <b style={{ fontSize: '26px', color: '#b25c1e' }}>{totalItemsCount}</b>
          <small style={{ display: 'block', color: 'var(--muted)', marginTop: '4px' }}>
            {t('إجمالي الأصناف التي بها رصيد', 'Items with positive balance')}
          </small>
        </div>
      </div>

      {/* Security Rule Notice Banner */}
      <div className="notice" style={{ background: '#f5f7f8', borderColor: '#d0dce0', color: '#273c46', marginBottom: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <span style={{ fontSize: '20px' }}>🛡️</span>
          <div>
            <b>{t('قاعدة أمان وحماية القيود المخزنية:', 'Ledger Protection Policy:')}</b>
            <p style={{ margin: '4px 0 0', fontSize: '12px', lineHeight: '1.6' }}>
              {t(
                'وفقاً لمعايير تايتن للمخزون، لا يمكن حذف أي مخزن من النظام منعاً لكسر سلامة دفتر الأستاذ التاريخي (Ledger) أو تشويه الحركات القديمة. ولكن يمكنك إيقاف المخزن (Deactivate) في أي وقت؛ وعند إيقافه يتم حظر ومنع أي عملية سحب أو إيداع أو صرف أو جرد عليه تلقائياً.',
                'Warehouses cannot be deleted to protect ledger integrity. However, you can deactivate any warehouse to immediately block all future issues, receipts, and movements.'
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar: Search, Filter, New Warehouse */}
      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('بحث باسم المخزن أو الموقع...', 'Search warehouses...')}
          />
          {search && <button onClick={() => setSearch('')}>×</button>}
        </div>

        <div className="actions" style={{ margin: 0 }}>
          <label>
            {t('الحالة', 'Status')}
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
              <option value="all">{t('جميع المخازن', 'All Warehouses')}</option>
              <option value="active">{t('النشطة فقط (المتاحة)', 'Active Only')}</option>
              <option value="inactive">{t('المتوقفة فقط (المحظورة)', 'Inactive Only')}</option>
            </select>
          </label>

          {canWrite && (
            <button className="primary" onClick={() => setEditingWh({})}>
              + {t('إضافة مخزن جديد', 'New Warehouse')}
            </button>
          )}
        </div>
      </div>

      <DataState resource={warehousesRes} />

      <section className="panel">
        {filteredWarehouses.length === 0 ? (
          <Empty>{t('لا توجد مخازن مطابقة للبحث', 'No matching warehouses found')}</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('اسم المخزن', 'Warehouse Name')}</th>
                  <th>{t('الحالة', 'Status')}</th>
                  <th>{t('الأصناف المخزنة', 'Stored Items')}</th>
                  <th>{t('المواضع والأرفف', 'Locations')}</th>
                  <th>{t('سجل الحركات', 'Movements')}</th>
                  <th>{t('العمليات المسموحة', 'Allowed Operations')}</th>
                  <th>{t('إجراءات', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredWarehouses.map((wh, idx) => (
                  <MotionTr key={wh.id} {...staggerItem(idx, 0.05, 0.28)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: wh.active ? '#32634b' : '#ab3434' }}>
                          <Icon name="box" />
                        </span>
                        <div>
                          <button
                            className="link"
                            style={{ fontWeight: 700, fontSize: '13px' }}
                            onClick={() => navigate(`/warehouses/${wh.id}`)}
                          >
                            {wh.name}
                          </button>
                          <small style={{ display: 'block', fontSize: '10px', color: 'var(--muted)' }}>
                            ID: {wh.id.slice(0, 8)}…
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`status ${wh.active ? 'posted' : 'inactive'}`} style={{ fontWeight: 600 }}>
                        {wh.active ? t('نشط (متاح)', 'Active') : t('متوقف (محظور)', 'Stopped')}
                      </span>
                    </td>
                    <td>
                      <button
                        className="link"
                        onClick={() => navigate(`/warehouses/${wh.id}`)}
                      >
                        <b>{wh.item_count ?? 0}</b> {t('صنف', 'items')}
                      </button>
                    </td>
                    <td>
                      <button
                        className="link"
                        onClick={() => navigate(`/warehouses/${wh.id}`)}
                      >
                        {wh.location_count ?? 0} {t('موضع', 'locations')}
                      </button>
                    </td>
                    <td>
                      <button
                        className="link"
                        onClick={() => navigate(`/warehouses/${wh.id}`)}
                      >
                        {wh.document_count ?? 0} {t('حركة', 'docs')}
                      </button>
                    </td>
                    <td>
                      {wh.active ? (
                        <span style={{ fontSize: '11px', color: '#32634b', fontWeight: 600 }}>
                          ✓ {t('سحب وإيداع وجرد متاح', 'Full Operations Enabled')}
                        </span>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#ab3434', fontWeight: 600 }}>
                          ✕ {t('محظور أي سحب أو إيداع', 'Movements Blocked')}
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          style={{ padding: '4px 10px', fontSize: '11px', minHeight: '30px' }}
                          onClick={() => navigate(`/warehouses/${wh.id}`)}
                        >
                          {t('عرض المخزن', 'View')}
                        </button>
                        {canWrite && (
                          <>
                            <button
                              style={{ padding: '4px 10px', fontSize: '11px', minHeight: '30px' }}
                              onClick={() => setEditingWh(wh)}
                            >
                              {t('تعديل', 'Edit')}
                            </button>
                            <button
                              style={{ padding: '4px 10px', fontSize: '11px', minHeight: '30px' }}
                              className={wh.active ? 'danger' : 'primary'}
                              onClick={() => setToggleConfirm(wh)}
                            >
                              {wh.active ? t('إيقاف', 'Stop') : t('تفعيل', 'Activate')}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </MotionTr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add / Edit Warehouse Modal */}
      {editingWh && (
        <WarehouseModal
          initial={editingWh}
          sites={mastersRes.data || []}
          close={() => setEditingWh(null)}
          done={() => { setEditingWh(null); app.refresh(); }}
        />
      )}

      {/* Deactivate/Reactivate Confirmation Modal */}
      {toggleConfirm && (
        <ToggleStatusModal
          warehouse={toggleConfirm}
          error={error}
          busy={busy}
          close={() => { setToggleConfirm(null); setError(''); }}
          confirm={performToggle}
        />
      )}
    </section>
  );
}

// ==========================================
// MODAL: ADD / EDIT WAREHOUSE
// ==========================================
function WarehouseModal({
  initial,
  sites,
  close,
  done
}: {
  initial: Row;
  sites: Row[];
  close: () => void;
  done: () => void;
}) {
  const t = useText();
  const [name, setName] = useState(initial.name || '');
  const [siteId, setSiteId] = useState(initial.site_id || '');
  const [active, setActive] = useState(initial.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const payload: Row = {
        name: name.trim(),
        site_id: siteId || null,
        active
      };
      if (initial.id) {
        payload.version = initial.version;
        await mutate(`warehouses/${initial.id}`, payload);
      } else {
        await mutate('warehouses', payload);
      }
      done();
    } catch (err: any) {
      setError(err.message || t('حدث خطأ أثناء حفظ بيانات المخزن', 'Error saving warehouse'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={initial.id ? t('تعديل بيانات المخزن', 'Edit Warehouse') : t('إضافة مخزن جديد', 'New Warehouse')}
      close={close}
    >
      <form onSubmit={submit}>
        <div className="fields">
          <label className="wide">
            <span>{t('اسم المخزن', 'Warehouse Name')} *</span>
            <input
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('مثال: مخزن الخامات الرئيسي، مخزن الغرف النظيفة...', 'e.g. Main Medical Warehouse')}
            />
          </label>

          {sites.length > 0 && (
            <label className="wide">
              <span>{t('الموقع الجغرافي / الفرع', 'Site / Location')}</span>
              <select value={siteId} onChange={e => setSiteId(e.target.value)}>
                <option value="">{t('بدون موقع محدد', 'No specific site')}</option>
                {sites.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          )}

          {initial.id && (
            <label className="inline-check wide" style={{ marginTop: '10px' }}>
              <input
                type="checkbox"
                checked={active}
                onChange={e => setActive(e.target.checked)}
              />
              <span>
                <b>{t('مخزن نشط', 'Active Warehouse')}</b>
                <small style={{ display: 'block', color: 'var(--muted)', marginTop: '2px' }}>
                  {t('عند إلغاء التفعيل، يتم حظر أي عملية سحب أو إيداع جديدة على المخزن فوراً.', 'When unchecked, all movements on this warehouse are locked.')}
                </small>
              </span>
            </label>
          )}
        </div>

        {error && <Notice error>{error}</Notice>}

        <div className="actions">
          <button className="primary" disabled={busy} type="submit">
            {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ البيانات', 'Save')}
          </button>
          <button type="button" onClick={close}>
            {t('إلغاء', 'Cancel')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ==========================================
// MODAL: CONFIRM TOGGLE ACTIVE / INACTIVE
// ==========================================
function ToggleStatusModal({
  warehouse,
  error,
  busy,
  close,
  confirm
}: {
  warehouse: Row;
  error: string;
  busy: boolean;
  close: () => void;
  confirm: () => void;
}) {
  const t = useText();
  const willDeactivate = warehouse.active;

  return (
    <Modal
      title={willDeactivate ? t('تأكيد إيقاف المخزن', 'Confirm Deactivate Warehouse') : t('تأكيد تفعيل المخزن', 'Confirm Activate Warehouse')}
      close={close}
    >
      <div style={{ lineHeight: '1.6' }}>
        <p>
          {willDeactivate ? (
            <>
              {t('هل أنت متأكد من رغبتك في إيقاف المخزن', 'Are you sure you want to deactivate')} <b>«{warehouse.name}»</b>؟
            </>
          ) : (
            <>
              {t('هل تريد إعادة تفعيل المخزن', 'Do you want to reactivate')} <b>«{warehouse.name}»</b>؟
            </>
          )}
        </p>

        {willDeactivate ? (
          <div className="notice error">
            <b>{t('النتيجة المترتبة على الإيقاف:', 'Consequence:')}</b>
            <ul style={{ margin: '6px 0 0', paddingInlineStart: '20px', fontSize: '12px' }}>
              <li>{t('سيتم حظر أي عملية سحب (صرف) جديدة من هذا المخزن.', 'Any new withdrawal (issue) will be blocked.')}</li>
              <li>{t('سيتم حظر أي عملية إيداع (استلام مشتريات أو توريد) جديدة في هذا المخزن.', 'Any new deposit (receipt) will be blocked.')}</li>
              <li>{t('سيختفي المخزن من قوائم الاختيار في شاشات الصرف والمشتريات.', 'Warehouse will be hidden from movement selection dropdowns.')}</li>
              <li>{t('لن يفقد المخزن أرصدته التاريخية؛ ويمكنك إعادة تفعيله في أي وقت بنقرة واحدة.', 'Historical data remains 100% safe. Can be reactivated anytime.')}</li>
            </ul>
          </div>
        ) : (
          <div className="notice" style={{ background: '#eaf4ee', borderColor: '#b6dec1', color: '#275836' }}>
            <p style={{ margin: 0, fontSize: '12px' }}>
              {t('سيتم إعادة إتاحة المخزن فوراً في كافة شاشات الصرف والمشتريات والتحويلات المخزنية.', 'The warehouse will immediately become available for issues, receipts, and transfers.')}
            </p>
          </div>
        )}

        {error && <Notice error>{error}</Notice>}

        <div className="actions" style={{ marginTop: '20px' }}>
          <button
            className={willDeactivate ? 'danger' : 'primary'}
            disabled={busy}
            onClick={confirm}
          >
            {busy ? t('جارٍ التنفيذ…', 'Processing…') : willDeactivate ? t('نعم، أوقف المخزن الآن', 'Yes, Deactivate Now') : t('نعم، فعّل المخزن الآن', 'Yes, Activate Now')}
          </button>
          <button type="button" onClick={close} disabled={busy}>
            {t('إلغاء التراجع', 'Cancel')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
