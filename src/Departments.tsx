import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mutate, Row } from './api';
import { useApp, useText, useData, DataState, Empty, Modal, Notice, Icon, date } from './ui';
import { typeName } from './Documents';
import { MotionTr, staggerItem } from './motion';

export function Departments() {
  const t = useText();
  const app = useApp();
  const navigate = useNavigate();
  const { deptId, empId } = useParams();

  // Load masters (both active and inactive) so user can manage all records
  const masters = useData<Row[]>('masters?all=true');

  // Modals state
  const [editingDept, setEditingDept] = useState<Row | null>(null);
  const [editingEmp, setEditingEmp] = useState<Row | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string; kind: 'department' | 'employee' } | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [busy, setBusy] = useState(false);

  // Tab & search state
  const [mainTab, setMainTab] = useState<'departments' | 'staff'>('departments');
  const [deptTab, setDeptTab] = useState<'staff' | 'withdrawals'>('staff');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('');

  const canWrite = app.session.actor.permissions.includes('catalog.write');

  // Separate departments and employees
  const departments = useMemo(() => {
    return (masters.data || []).filter(m => m.kind === 'department');
  }, [masters.data]);

  const employees = useMemo(() => {
    return (masters.data || []).filter(m => m.kind === 'employee');
  }, [masters.data]);

  // Current department and employee (if route params present)
  const currentDept = useMemo(() => {
    if (!deptId) return null;
    return departments.find(d => d.id === deptId) || null;
  }, [departments, deptId]);

  const currentEmp = useMemo(() => {
    if (!empId) return null;
    return employees.find(e => e.id === empId) || null;
  }, [employees, empId]);

  // Movements queries
  const deptMovements = useData<Row[]>(
    currentDept ? `documents?department_id=${currentDept.id}${movementTypeFilter ? '&type=' + movementTypeFilter : ''}` : null
  );

  const empMovements = useData<Row[]>(
    currentEmp ? `documents?recipient_id=${currentEmp.id}${movementTypeFilter ? '&type=' + movementTypeFilter : ''}` : null
  );

  // Employee count per department
  const empCountByDept = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of employees) {
      const dId = e.data?.department_id;
      if (dId) counts[dId] = (counts[dId] || 0) + 1;
    }
    return counts;
  }, [employees]);

  // Stats
  const activeStaffCount = useMemo(() => employees.filter(e => e.active).length, [employees]);
  const inactiveStaffCount = useMemo(() => employees.filter(e => !e.active).length, [employees]);

  // Filtered lists
  const filteredDepartments = useMemo(() => {
    return departments.filter(d => {
      if (statusFilter === 'active' && !d.active) return false;
      if (statusFilter === 'inactive' && d.active) return false;
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      const code = String(d.data?.code || '').toLowerCase();
      return d.name.toLowerCase().includes(s) || code.includes(s);
    });
  }, [departments, search, statusFilter]);

  const filteredEmployees = useMemo(() => {
    const list = currentDept
      ? employees.filter(e => e.data?.department_id === currentDept.id)
      : employees;
    return list.filter(e => {
      if (statusFilter === 'active' && !e.active) return false;
      if (statusFilter === 'inactive' && e.active) return false;
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      const badge = String(e.data?.badge || '').toLowerCase();
      const job = String(e.data?.job_title || '').toLowerCase();
      const phone = String(e.data?.phone || '').toLowerCase();
      return e.name.toLowerCase().includes(s) || badge.includes(s) || job.includes(s) || phone.includes(s);
    });
  }, [employees, currentDept, search, statusFilter]);

  // Safe delete handler
  async function confirmDelete() {
    if (!deleteConfirm) return;
    setBusy(true);
    setDeleteError('');
    try {
      await mutate(`masters/${deleteConfirm.id}/delete`, {});
      app.notify(t('تم حذف السجل بنجاح.', 'Record deleted successfully.'));
      setDeleteConfirm(null);
      if (deleteConfirm.kind === 'employee' && currentEmp) {
        navigate(currentDept ? `/departments/${currentDept.id}` : '/departments');
      } else if (deleteConfirm.kind === 'department' && currentDept) {
        navigate('/departments');
      }
      app.refresh();
    } catch (e: any) {
      setDeleteError(e.message || t('تعذر الحذف.', 'Delete failed.'));
    } finally {
      setBusy(false);
    }
  }

  // Toggle active/inactive
  async function toggleActive(item: Row) {
    try {
      await mutate(`masters/${item.id}`, {
        kind: item.kind,
        name: item.name,
        data: item.data || {},
        active: !item.active,
        version: item.version
      });
      app.notify(
        item.active
          ? t('تم إيقاف التفعيل.', 'Deactivated.')
          : t('تم إعادة التفعيل بنجاح.', 'Reactivated successfully.')
      );
      app.refresh();
    } catch (e: any) {
      app.notify(e.message);
    }
  }

  // Quick shortcut: create new issue movement for department/employee
  function startIssue(deptId?: string, employeeId?: string) {
    window.dispatchEvent(
      new CustomEvent('inventory:new-document', {
        detail: {
          type: 'issue',
          document_date: new Date().toLocaleDateString('en-CA'),
          warehouse_id: app.warehouse || '',
          department_id: deptId || '',
          recipient_id: employeeId || '',
          reason: '',
          notes: '',
          lines: [{ item_id: '', quantity: '', unit: 'Piece', quality: 'Accepted', condition: 'New', notes: '' }]
        }
      })
    );
  }

  // ==========================================
  // VIEW 3: EMPLOYEE PROFILE & MOVEMENTS
  // ==========================================
  if (currentEmp) {
    const parentDept = departments.find(d => d.id === currentEmp.data?.department_id);
    return (
      <section className="departments-view">
        <div className="breadcrumbs">
          <button onClick={() => navigate('/departments')}>{t('الأقسام', 'Departments')}</button>
          <span>/</span>
          {parentDept ? (
            <button onClick={() => navigate(`/departments/${parentDept.id}`)}>{parentDept.name}</button>
          ) : (
            <span>{t('عام', 'General')}</span>
          )}
          <span>/</span>
          <b>{currentEmp.name}</b>
        </div>

        <section className="panel">
          <div className="section-heading">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span className="avatar-letter" style={{ width: '56px', height: '56px', fontSize: '24px' }}>
                {currentEmp.name.slice(0, 1)}
              </span>
              <div>
                <span className="eyebrow">
                  {currentEmp.data?.badge ? `ID: ${currentEmp.data.badge} · ` : ''}
                  {parentDept ? parentDept.name : t('بدون قسم محدد', 'No department')}
                </span>
                <h2>{currentEmp.name}</h2>
                <small style={{ fontSize: '13px', color: 'var(--muted)' }}>
                  {currentEmp.data?.job_title || t('موظف', 'Staff')}
                </small>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className={`status ${currentEmp.active ? 'posted' : 'inactive'}`}>
                {currentEmp.active ? t('نشط', 'Active') : t('متوقف', 'Inactive')}
              </span>
            </div>
          </div>

          <dl className="detail-grid" style={{ marginTop: '20px' }}>
            <div>
              <dt>{t('كود الموظف / ID', 'Employee ID / Badge')}</dt>
              <dd><b>{currentEmp.data?.badge || '—'}</b></dd>
            </div>
            <div>
              <dt>{t('القسم التابع له', 'Department')}</dt>
              <dd>{parentDept ? parentDept.name : '—'}</dd>
            </div>
            <div>
              <dt>{t('المسمى الوظيفي', 'Job title')}</dt>
              <dd>{currentEmp.data?.job_title || '—'}</dd>
            </div>
            <div>
              <dt>{t('رقم الهاتف', 'Phone')}</dt>
              <dd dir="ltr" style={{ textAlign: app.lang === 'ar' ? 'right' : 'left' }}>
                {currentEmp.data?.phone || '—'}
              </dd>
            </div>
            <div>
              <dt>{t('الرقم القومي', 'National ID')}</dt>
              <dd>{currentEmp.data?.national_id || '—'}</dd>
            </div>
            <div>
              <dt>{t('ملاحظات', 'Notes')}</dt>
              <dd>{currentEmp.data?.notes || '—'}</dd>
            </div>
          </dl>

          <div className="actions" style={{ marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            {app.session.actor.permissions.includes('issue') && (
              <button className="primary" onClick={() => startIssue(parentDept?.id, currentEmp.id)}>
                + {t('صرف صنف جديد لهذا الموظف', 'Issue item to this staff')}
              </button>
            )}
            {canWrite && (
              <>
                <button onClick={() => setEditingEmp(currentEmp)}>
                  {t('تعديل البيانات', 'Edit staff')}
                </button>
                <button onClick={() => toggleActive(currentEmp)}>
                  {currentEmp.active ? t('إيقاف الموظف', 'Deactivate') : t('تفعيل الموظف', 'Activate')}
                </button>
                <button
                  className="danger"
                  onClick={() => setDeleteConfirm({ id: currentEmp.id, name: currentEmp.name, kind: 'employee' })}
                >
                  {t('حذف الموظف', 'Delete staff')}
                </button>
              </>
            )}
            <button onClick={() => navigate(parentDept ? `/departments/${parentDept.id}` : '/departments')}>
              ← {t('رجوع للقسم', 'Back to department')}
            </button>
          </div>
        </section>

        {/* Staff Movement History */}
        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t('سجل الحركات المسجلة باسم الموظف', 'Movements history')}</span>
              <h2>{t('عمليات الصرف والسحب والعهد', 'Issues, Custody & Withdrawals')}</h2>
            </div>
            <div className="toolbar" style={{ marginBottom: 0 }}>
              <label>
                {t('نوع الحركة', 'Movement type')}
                <select value={movementTypeFilter} onChange={e => setMovementTypeFilter(e.target.value)}>
                  <option value="">{t('جميع الحركات', 'All movements')}</option>
                  <option value="issue">{t('صرف استهلاك', 'Consumption issue')}</option>
                  <option value="custody">{t('تسليم عهدة', 'Custody issue')}</option>
                  <option value="custody_return">{t('رد عهدة', 'Custody return')}</option>
                  <option value="return">{t('مرتجع صرف', 'Issue return')}</option>
                </select>
              </label>
            </div>
          </div>

          <DataState resource={empMovements} />

          {empMovements.data && (
            empMovements.data.length === 0 ? (
              <Empty>{t('لا توجد حركات مسجلة باسم هذا الموظف حتى الآن', 'No movements recorded for this staff member yet')}</Empty>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t('رقم المستند', 'Document #')}</th>
                      <th>{t('نوع الحركة', 'Type')}</th>
                      <th>{t('التاريخ', 'Date')}</th>
                      <th>{t('عدد البنود', 'Lines')}</th>
                      <th>{t('السبب', 'Reason')}</th>
                      <th>{t('الحالة', 'Status')}</th>
                      <th>{t('المسؤول', 'Created by')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empMovements.data.map((doc, idx) => (
                      <MotionTr key={doc.id} {...staggerItem(idx, 0.05, 0.28)}>
                        <td>
                          <button className="link" onClick={() => navigate(`/documents/${doc.id}`)}>
                            #{doc.number}
                          </button>
                        </td>
                        <td>{typeName(doc.type, app.lang)}</td>
                        <td>{String(doc.document_date).slice(0, 10)}</td>
                        <td>{doc.lines_count ?? '—'}</td>
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

        {/* Edit Employee Modal */}
        {editingEmp && (
          <EmployeeModal
            initial={editingEmp}
            departments={departments}
            defaultDeptId={parentDept?.id}
            close={() => setEditingEmp(null)}
            done={() => { setEditingEmp(null); app.refresh(); }}
          />
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <DeleteModal
            item={deleteConfirm}
            error={deleteError}
            busy={busy}
            close={() => { setDeleteConfirm(null); setDeleteError(''); }}
            confirm={confirmDelete}
          />
        )}
      </section>
    );
  }

  // ==========================================
  // VIEW 2: DEPARTMENT DETAILS & STAFF & WITHDRAWALS
  // ==========================================
  if (currentDept) {
    const deptEmployees = employees.filter(e => e.data?.department_id === currentDept.id);
    return (
      <section className="departments-view">
        <div className="breadcrumbs">
          <button onClick={() => navigate('/departments')}>{t('الأقسام', 'Departments')}</button>
          <span>/</span>
          <b>{currentDept.name}</b>
        </div>

        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{currentDept.data?.code ? `CODE: ${currentDept.data.code}` : t('قسم', 'Department')}</span>
              <h2>{currentDept.name}</h2>
              <small style={{ fontSize: '13px', color: 'var(--muted)' }}>
                {deptEmployees.length} {t('موظف مسجل بالقسم', 'registered staff')}
              </small>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className={`status ${currentDept.active ? 'posted' : 'inactive'}`}>
                {currentDept.active ? t('نشط', 'Active') : t('متوقف', 'Inactive')}
              </span>
            </div>
          </div>

          {currentDept.data?.notes && (
            <p style={{ marginTop: '14px', color: 'var(--muted)', fontSize: '13px' }}>
              {currentDept.data.notes}
            </p>
          )}

          <div className="actions" style={{ marginTop: '18px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            {canWrite && (
              <button className="primary" onClick={() => setEditingEmp({ data: { department_id: currentDept.id } })}>
                + {t('إضافة موظف جديد لهذا القسم', 'Add staff to department')}
              </button>
            )}
            {app.session.actor.permissions.includes('issue') && (
              <button onClick={() => startIssue(currentDept.id)}>
                + {t('صرف صنف جديد للقسم', 'Issue item to department')}
              </button>
            )}
            {canWrite && (
              <>
                <button onClick={() => setEditingDept(currentDept)}>
                  {t('تعديل بيانات القسم', 'Edit department')}
                </button>
                <button onClick={() => toggleActive(currentDept)}>
                  {currentDept.active ? t('إيقاف القسم', 'Deactivate') : t('تفعيل القسم', 'Activate')}
                </button>
                <button
                  className="danger"
                  onClick={() => setDeleteConfirm({ id: currentDept.id, name: currentDept.name, kind: 'department' })}
                >
                  {t('حذف القسم', 'Delete department')}
                </button>
              </>
            )}
            <button onClick={() => navigate('/departments')}>
              ← {t('جميع الأقسام', 'All departments')}
            </button>
          </div>
        </section>

        {/* Tabs for Department View */}
        <div className="tabs">
          <button
            className={deptTab === 'staff' ? 'active' : ''}
            onClick={() => setDeptTab('staff')}
          >
            {t('موظفو القسم', 'Department Staff')} ({deptEmployees.length})
          </button>
          <button
            className={deptTab === 'withdrawals' ? 'active' : ''}
            onClick={() => setDeptTab('withdrawals')}
          >
            {t('سحوبات وحركات القسم', 'Department Withdrawals')}
          </button>
        </div>

        {deptTab === 'staff' ? (
          <section className="panel">
            <div className="toolbar">
              <div className="search">
                <Icon name="search" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('بحث بالاسم، كود الموظف، المسمى...', 'Search by name, ID, job...')}
                />
                {search && <button onClick={() => setSearch('')}>×</button>}
              </div>
              <div className="actions" style={{ margin: 0 }}>
                <label>
                  {t('الحالة', 'Status')}
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
                    <option value="all">{t('الكل', 'All')}</option>
                    <option value="active">{t('النشط فقط', 'Active only')}</option>
                    <option value="inactive">{t('المتوقف فقط', 'Inactive only')}</option>
                  </select>
                </label>
                {canWrite && (
                  <button className="primary" onClick={() => setEditingEmp({ data: { department_id: currentDept.id } })}>
                    + {t('إضافة موظف', 'Add staff')}
                  </button>
                )}
              </div>
            </div>

            {filteredEmployees.length === 0 ? (
              <Empty>{t('لا يوجد موظفون مطابقون في هذا القسم', 'No matching staff in this department')}</Empty>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t('كود الموظف / ID', 'Badge / ID')}</th>
                      <th>{t('اسم الموظف', 'Name')}</th>
                      <th>{t('المسمى الوظيفي', 'Job title')}</th>
                      <th>{t('رقم الهاتف', 'Phone')}</th>
                      <th>{t('الرقم القومي', 'National ID')}</th>
                      <th>{t('الحالة', 'Status')}</th>
                      <th>{t('إجراءات', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((emp, idx) => (
                      <MotionTr key={emp.id} {...staggerItem(idx, 0.05, 0.28)}>
                        <td>
                          <button
                            className="link"
                            style={{ fontWeight: 700 }}
                            onClick={() => navigate(`/departments/${currentDept.id}/employee/${emp.id}`)}
                          >
                            {emp.data?.badge || '—'}
                          </button>
                        </td>
                        <td>
                          <button
                            className="link"
                            onClick={() => navigate(`/departments/${currentDept.id}/employee/${emp.id}`)}
                          >
                            {emp.name}
                          </button>
                        </td>
                        <td>{emp.data?.job_title || '—'}</td>
                        <td dir="ltr" style={{ textAlign: app.lang === 'ar' ? 'right' : 'left' }}>
                          {emp.data?.phone || '—'}
                        </td>
                        <td>{emp.data?.national_id || '—'}</td>
                        <td>
                          <span className={`status ${emp.active ? 'posted' : 'inactive'}`}>
                            {emp.active ? t('نشط', 'Active') : t('متوقف', 'Inactive')}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              style={{ padding: '4px 8px', fontSize: '11px', minHeight: '30px' }}
                              onClick={() => navigate(`/departments/${currentDept.id}/employee/${emp.id}`)}
                            >
                              {t('عرض الحركات', 'Movements')}
                            </button>
                            {canWrite && (
                              <>
                                <button
                                  style={{ padding: '4px 8px', fontSize: '11px', minHeight: '30px' }}
                                  onClick={() => setEditingEmp(emp)}
                                >
                                  {t('تعديل', 'Edit')}
                                </button>
                                <button
                                  style={{ padding: '4px 8px', fontSize: '11px', minHeight: '30px' }}
                                  onClick={() => toggleActive(emp)}
                                >
                                  {emp.active ? t('إيقاف', 'Stop') : t('تفعيل', 'Activate')}
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
        ) : (
          <section className="panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{t('حركات مخزنية خاصة بهذا القسم', 'Department movements')}</span>
                <h2>{t('عمليات الصرف والسحب المسجلة باسم القسم', 'Issues & Withdrawals')}</h2>
              </div>
              <div className="toolbar" style={{ marginBottom: 0 }}>
                <label>
                  {t('نوع الحركة', 'Movement type')}
                  <select value={movementTypeFilter} onChange={e => setMovementTypeFilter(e.target.value)}>
                    <option value="">{t('جميع الحركات', 'All movements')}</option>
                    <option value="issue">{t('صرف استهلاك', 'Consumption issue')}</option>
                    <option value="custody">{t('تسليم عهدة', 'Custody issue')}</option>
                    <option value="return">{t('مرتجع صرف', 'Issue return')}</option>
                  </select>
                </label>
              </div>
            </div>

            <DataState resource={deptMovements} />

            {deptMovements.data && (
              deptMovements.data.length === 0 ? (
                <Empty>{t('لا توجد حركات مسجلة لهذا القسم حتى الآن', 'No movements recorded for this department yet')}</Empty>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('رقم المستند', 'Document #')}</th>
                        <th>{t('نوع الحركة', 'Type')}</th>
                        <th>{t('التاريخ', 'Date')}</th>
                        <th>{t('المستلم / الشخص', 'Recipient / Staff')}</th>
                        <th>{t('عدد البنود', 'Lines')}</th>
                        <th>{t('السبب', 'Reason')}</th>
                        <th>{t('الحالة', 'Status')}</th>
                        <th>{t('المسؤول', 'Created by')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deptMovements.data.map((doc, idx) => (
                        <MotionTr key={doc.id} {...staggerItem(idx, 0.05, 0.28)}>
                          <td>
                            <button className="link" onClick={() => navigate(`/documents/${doc.id}`)}>
                              #{doc.number}
                            </button>
                          </td>
                          <td>{typeName(doc.type, app.lang)}</td>
                          <td>{String(doc.document_date).slice(0, 10)}</td>
                          <td>
                            {doc.recipient_name ? (
                              <button
                                className="link"
                                onClick={() => {
                                  if (doc.recipient_id) navigate(`/departments/${currentDept.id}/employee/${doc.recipient_id}`);
                                }}
                              >
                                {doc.recipient_badge ? `[${doc.recipient_badge}] ` : ''}
                                {doc.recipient_name}
                                {doc.recipient_job ? ` (${doc.recipient_job})` : ''}
                              </button>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>{doc.lines_count ?? '—'}</td>
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

        {/* Edit Department Modal */}
        {editingDept && (
          <DepartmentModal
            initial={editingDept}
            close={() => setEditingDept(null)}
            done={() => { setEditingDept(null); app.refresh(); }}
          />
        )}

        {/* Edit Employee Modal */}
        {editingEmp && (
          <EmployeeModal
            initial={editingEmp}
            departments={departments}
            defaultDeptId={currentDept.id}
            close={() => setEditingEmp(null)}
            done={() => { setEditingEmp(null); app.refresh(); }}
          />
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <DeleteModal
            item={deleteConfirm}
            error={deleteError}
            busy={busy}
            close={() => { setDeleteConfirm(null); setDeleteError(''); }}
            confirm={confirmDelete}
          />
        )}
      </section>
    );
  }

  // ==========================================
  // VIEW 1: ALL DEPARTMENTS & STAFF ROOT VIEW
  // ==========================================
  return (
    <section className="departments-view">
      {/* Top Stats Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '22px' }}>
        <div className="panel" style={{ margin: 0, padding: '18px 22px' }}>
          <span className="eyebrow">{t('الهيكل الإداري', 'Structure')}</span>
          <b style={{ fontSize: '26px', color: 'var(--text)' }}>{departments.length}</b>
          <small style={{ display: 'block', color: 'var(--muted)', marginTop: '4px' }}>
            {t('أقسام مسجلة بالنظام', 'Registered departments')}
          </small>
        </div>
        <div className="panel" style={{ margin: 0, padding: '18px 22px' }}>
          <span className="eyebrow">{t('القوة العاملة', 'Staff')}</span>
          <b style={{ fontSize: '26px', color: '#32634b' }}>{activeStaffCount}</b>
          <small style={{ display: 'block', color: 'var(--muted)', marginTop: '4px' }}>
            {t('موظف نشط ومخول بالاستلام', 'Active staff members')}
          </small>
        </div>
        {inactiveStaffCount > 0 && (
          <div className="panel" style={{ margin: 0, padding: '18px 22px' }}>
            <span className="eyebrow">{t('موقوف مؤقتًا', 'Inactive')}</span>
            <b style={{ fontSize: '26px', color: '#aa3131' }}>{inactiveStaffCount}</b>
            <small style={{ display: 'block', color: 'var(--muted)', marginTop: '4px' }}>
              {t('موظف تم إيقاف تفعيله', 'Deactivated staff')}
            </small>
          </div>
        )}
      </div>

      {/* Main Navigation Tabs */}
      <div className="tabs">
        <button
          className={mainTab === 'departments' ? 'active' : ''}
          onClick={() => { setMainTab('departments'); setSearch(''); }}
        >
          {t('الأقسام', 'Departments')} ({departments.length})
        </button>
        <button
          className={mainTab === 'staff' ? 'active' : ''}
          onClick={() => { setMainTab('staff'); setSearch(''); }}
        >
          {t('جميع الموظفين', 'All Staff')} ({employees.length})
        </button>
      </div>

      {/* Toolbar: Search, Filters, New Actions */}
      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={
              mainTab === 'departments'
                ? t('بحث باسم القسم أو الكود...', 'Search departments...')
                : t('بحث باسم الموظف، الكود، المسمى، الهاتف...', 'Search staff by name, ID, phone...')
            }
          />
          {search && <button onClick={() => setSearch('')}>×</button>}
        </div>

        <div className="actions" style={{ margin: 0 }}>
          <label>
            {t('الحالة', 'Status')}
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
              <option value="all">{t('الكل', 'All')}</option>
              <option value="active">{t('النشط فقط', 'Active only')}</option>
              <option value="inactive">{t('المتوقف فقط', 'Inactive only')}</option>
            </select>
          </label>
          {canWrite && (
            <>
              {mainTab === 'departments' ? (
                <button className="primary" onClick={() => setEditingDept({})}>
                  + {t('إضافة قسم جديد', 'Add department')}
                </button>
              ) : (
                <button className="primary" onClick={() => setEditingEmp({})}>
                  + {t('إضافة موظف جديد', 'Add staff member')}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <DataState resource={masters} />

      {mainTab === 'departments' ? (
        <section className="panel">
          {filteredDepartments.length === 0 ? (
            <Empty>{t('لا توجد أقسام مسجلة مطابقة للبحث', 'No matching departments found')}</Empty>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t('كود القسم', 'Code')}</th>
                    <th>{t('اسم القسم', 'Department name')}</th>
                    <th>{t('عدد الموظفين', 'Staff count')}</th>
                    <th>{t('ملاحظات', 'Notes')}</th>
                    <th>{t('الحالة', 'Status')}</th>
                    <th>{t('إجراءات', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDepartments.map((dept, idx) => {
                    const count = empCountByDept[dept.id] || 0;
                    return (
                      <MotionTr key={dept.id} {...staggerItem(idx, 0.05, 0.28)}>
                        <td>
                          <button
                            className="link"
                            style={{ fontWeight: 700 }}
                            onClick={() => navigate(`/departments/${dept.id}`)}
                          >
                            {dept.data?.code || '—'}
                          </button>
                        </td>
                        <td>
                          <button
                            className="link"
                            style={{ fontSize: '13px', fontWeight: 600 }}
                            onClick={() => navigate(`/departments/${dept.id}`)}
                          >
                            {dept.name}
                          </button>
                        </td>
                        <td>
                          <button
                            className="link"
                            onClick={() => navigate(`/departments/${dept.id}`)}
                          >
                            {count} {t('موظف', 'staff')}
                          </button>
                        </td>
                        <td>{dept.data?.notes || '—'}</td>
                        <td>
                          <span className={`status ${dept.active ? 'posted' : 'inactive'}`}>
                            {dept.active ? t('نشط', 'Active') : t('متوقف', 'Inactive')}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              style={{ padding: '4px 9px', fontSize: '11px', minHeight: '30px' }}
                              onClick={() => navigate(`/departments/${dept.id}`)}
                            >
                              {t('عرض القسم', 'View')}
                            </button>
                            {canWrite && (
                              <>
                                <button
                                  style={{ padding: '4px 9px', fontSize: '11px', minHeight: '30px' }}
                                  onClick={() => setEditingDept(dept)}
                                >
                                  {t('تعديل', 'Edit')}
                                </button>
                                <button
                                  style={{ padding: '4px 9px', fontSize: '11px', minHeight: '30px' }}
                                  onClick={() => toggleActive(dept)}
                                >
                                  {dept.active ? t('إيقاف', 'Stop') : t('تفعيل', 'Activate')}
                                </button>
                                <button
                                  className="danger"
                                  style={{ padding: '4px 9px', fontSize: '11px', minHeight: '30px' }}
                                  onClick={() => setDeleteConfirm({ id: dept.id, name: dept.name, kind: 'department' })}
                                >
                                  {t('حذف', 'Delete')}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </MotionTr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="panel">
          {filteredEmployees.length === 0 ? (
            <Empty>{t('لا يوجد موظفون مطابقون للبحث', 'No matching staff found')}</Empty>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t('كود الموظف / ID', 'Badge / ID')}</th>
                    <th>{t('اسم الموظف', 'Name')}</th>
                    <th>{t('القسم التابع له', 'Department')}</th>
                    <th>{t('المسمى الوظيفي', 'Job title')}</th>
                    <th>{t('رقم الهاتف', 'Phone')}</th>
                    <th>{t('الحالة', 'Status')}</th>
                    <th>{t('إجراءات', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((emp, idx) => {
                    const dept = departments.find(d => d.id === emp.data?.department_id);
                    return (
                      <MotionTr key={emp.id} {...staggerItem(idx, 0.05, 0.28)}>
                        <td>
                          <button
                            className="link"
                            style={{ fontWeight: 700 }}
                            onClick={() => navigate(dept ? `/departments/${dept.id}/employee/${emp.id}` : `/departments`)}
                          >
                            {emp.data?.badge || '—'}
                          </button>
                        </td>
                        <td>
                          <button
                            className="link"
                            onClick={() => navigate(dept ? `/departments/${dept.id}/employee/${emp.id}` : `/departments`)}
                          >
                            {emp.name}
                          </button>
                        </td>
                        <td>
                          {dept ? (
                            <button
                              className="link"
                              onClick={() => navigate(`/departments/${dept.id}`)}
                            >
                              {dept.name}
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{emp.data?.job_title || '—'}</td>
                        <td dir="ltr" style={{ textAlign: app.lang === 'ar' ? 'right' : 'left' }}>
                          {emp.data?.phone || '—'}
                        </td>
                        <td>
                          <span className={`status ${emp.active ? 'posted' : 'inactive'}`}>
                            {emp.active ? t('نشط', 'Active') : t('متوقف', 'Inactive')}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              style={{ padding: '4px 8px', fontSize: '11px', minHeight: '30px' }}
                              onClick={() => navigate(dept ? `/departments/${dept.id}/employee/${emp.id}` : `/departments`)}
                            >
                              {t('عرض الحركات', 'Movements')}
                            </button>
                            {canWrite && (
                              <>
                                <button
                                  style={{ padding: '4px 8px', fontSize: '11px', minHeight: '30px' }}
                                  onClick={() => setEditingEmp(emp)}
                                >
                                  {t('تعديل', 'Edit')}
                                </button>
                                <button
                                  style={{ padding: '4px 8px', fontSize: '11px', minHeight: '30px' }}
                                  onClick={() => toggleActive(emp)}
                                >
                                  {emp.active ? t('إيقاف', 'Stop') : t('تفعيل', 'Activate')}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </MotionTr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Edit Department Modal */}
      {editingDept && (
        <DepartmentModal
          initial={editingDept}
          close={() => setEditingDept(null)}
          done={() => { setEditingDept(null); app.refresh(); }}
        />
      )}

      {/* Edit Employee Modal */}
      {editingEmp && (
        <EmployeeModal
          initial={editingEmp}
          departments={departments}
          close={() => setEditingEmp(null)}
          done={() => { setEditingEmp(null); app.refresh(); }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <DeleteModal
          item={deleteConfirm}
          error={deleteError}
          busy={busy}
          close={() => { setDeleteConfirm(null); setDeleteError(''); }}
          confirm={confirmDelete}
        />
      )}
    </section>
  );
}

// ==========================================
// MODAL: ADD / EDIT DEPARTMENT
// ==========================================
function DepartmentModal({
  initial,
  close,
  done
}: {
  initial: Row;
  close: () => void;
  done: () => void;
}) {
  const t = useText();
  const [name, setName] = useState(initial.name || '');
  const [code, setCode] = useState(initial.data?.code || '');
  const [notes, setNotes] = useState(initial.data?.notes || '');
  const [active, setActive] = useState(initial.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const body: Row = {
        kind: 'department',
        name: name.trim(),
        data: {
          code: code.trim(),
          notes: notes.trim()
        },
        active
      };
      if (initial.id) {
        body.version = initial.version;
        await mutate(`masters/${initial.id}`, body);
      } else {
        await mutate('masters', body);
      }
      done();
    } catch (err: any) {
      setError(err.message || t('حدث خطأ أثناء الحفظ', 'Error saving department'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={initial.id ? t('تعديل بيانات القسم', 'Edit department') : t('إضافة قسم جديد', 'New department')}
      close={close}
    >
      <form onSubmit={submit}>
        <div className="fields">
          <label className="wide">
            <span>{t('اسم القسم', 'Department name')} *</span>
            <input
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('مثال: قسم التشغيل والماكينات CNC', 'e.g. CNC Department')}
            />
          </label>
          <label>
            <span>{t('كود القسم / رمز مختصر', 'Department code')}</span>
            <input
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="e.g. CNC, QA, PKG"
            />
          </label>
          {initial.id && (
            <label className="inline-check" style={{ marginTop: '22px' }}>
              <input
                type="checkbox"
                checked={active}
                onChange={e => setActive(e.target.checked)}
              />
              {t('قسم نشط (متاح في حركات الصرف)', 'Active department')}
            </label>
          )}
          <label className="wide">
            <span>{t('ملاحظات', 'Notes')}</span>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder={t('ملاحظات إضافية حول مسؤوليات القسم وموقعه...', 'Additional notes...')}
            />
          </label>
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
// MODAL: ADD / EDIT EMPLOYEE
// ==========================================
function EmployeeModal({
  initial,
  departments,
  defaultDeptId,
  close,
  done
}: {
  initial: Row;
  departments: Row[];
  defaultDeptId?: string;
  close: () => void;
  done: () => void;
}) {
  const t = useText();
  const [name, setName] = useState(initial.name || '');
  const [badge, setBadge] = useState(initial.data?.badge || '');
  const [deptId, setDeptId] = useState(initial.data?.department_id || defaultDeptId || '');
  const [jobTitle, setJobTitle] = useState(initial.data?.job_title || '');
  const [phone, setPhone] = useState(initial.data?.phone || '');
  const [nationalId, setNationalId] = useState(initial.data?.national_id || '');
  const [notes, setNotes] = useState(initial.data?.notes || '');
  const [active, setActive] = useState(initial.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const body: Row = {
        kind: 'employee',
        name: name.trim(),
        data: {
          badge: badge.trim(),
          department_id: deptId,
          job_title: jobTitle.trim(),
          phone: phone.trim(),
          national_id: nationalId.trim(),
          notes: notes.trim()
        },
        active
      };
      if (initial.id) {
        body.version = initial.version;
        await mutate(`masters/${initial.id}`, body);
      } else {
        await mutate('masters', body);
      }
      done();
    } catch (err: any) {
      setError(err.message || t('حدث خطأ أثناء حفظ بيانات الموظف', 'Error saving staff'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={initial.id ? t('تعديل بيانات الموظف', 'Edit staff member') : t('إضافة موظف جديد', 'New staff member')}
      close={close}
    >
      <form onSubmit={submit}>
        <div className="fields">
          <label>
            <span>{t('الاسم الكامل للموظف', 'Full name')} *</span>
            <input
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('مثال: أحمد أبو راية', 'e.g. John Doe')}
            />
          </label>
          <label>
            <span>{t('كود الموظف / ID', 'Employee ID / Badge')} *</span>
            <input
              required
              value={badge}
              onChange={e => setBadge(e.target.value)}
              placeholder="e.g. EMP-101"
            />
          </label>
          <label>
            <span>{t('القسم التابع له', 'Department')} *</span>
            <select
              required
              value={deptId}
              onChange={e => setDeptId(e.target.value)}
            >
              <option value="">{t('اختر القسم…', 'Select department…')}</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.data?.code ? `(${d.data.code})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('المسمى الوظيفي', 'Job title')}</span>
            <input
              value={jobTitle}
              onChange={e => setJobTitle(e.target.value)}
              placeholder={t('مثال: فني تشغيل ماكينات / أمين مخزن / مهندس جودة', 'e.g. CNC Operator')}
            />
          </label>
          <label>
            <span>{t('رقم الهاتف', 'Phone')}</span>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              dir="ltr"
              placeholder="010xxxxxxxx"
            />
          </label>
          <label>
            <span>{t('الرقم القومي', 'National ID')}</span>
            <input
              value={nationalId}
              onChange={e => setNationalId(e.target.value)}
              maxLength={14}
              placeholder="14 رقماً"
            />
          </label>
          {initial.id && (
            <label className="inline-check wide">
              <input
                type="checkbox"
                checked={active}
                onChange={e => setActive(e.target.checked)}
              />
              {t('موظف نشط ومتاح في حركات الصرف والاستلام', 'Active staff member')}
            </label>
          )}
          <label className="wide">
            <span>{t('ملاحظات', 'Notes')}</span>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
            />
          </label>
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
// MODAL: DELETE CONFIRMATION
// ==========================================
function DeleteModal({
  item,
  error,
  busy,
  close,
  confirm
}: {
  item: { id: string; name: string; kind: 'department' | 'employee' };
  error?: string;
  busy: boolean;
  close: () => void;
  confirm: () => Promise<void>;
}) {
  const t = useText();
  const isDept = item.kind === 'department';

  return (
    <Modal
      title={isDept ? t('تأكيد حذف القسم', 'Confirm department deletion') : t('تأكيد حذف الموظف', 'Confirm staff deletion')}
      close={close}
    >
      <p>
        {isDept
          ? t(`هل أنت متأكد من حذف القسم «${item.name}» نهائيًا؟`, `Are you sure you want to delete department "${item.name}"?`)
          : t(`هل أنت متأكد من حذف الموظف «${item.name}» نهائيًا؟`, `Are you sure you want to delete staff "${item.name}"?`)}
      </p>
      <Notice>
        {t(
          'تنبيه: إذا كان هذا السجل مرتبطًا بحركات مخزنية أو موظفين سابقين، فلن يسمح النظام بالحذف لحفظ سجل المراجعة، ويمكنك بدلاً من ذلك إيقاف تفعيله.',
          'Notice: If this record is linked to stock documents or staff, the system will prevent deletion to preserve audit history. You may deactivate it instead.'
        )}
      </Notice>

      {error && <Notice error>{error}</Notice>}

      <div className="actions">
        <button className="danger" disabled={busy} onClick={confirm}>
          {busy ? t('جارٍ الحذف…', 'Deleting…') : t('تأكيد الحذف', 'Confirm delete')}
        </button>
        <button type="button" onClick={close}>
          {t('إلغاء', 'Cancel')}
        </button>
      </div>
    </Modal>
  );
}
