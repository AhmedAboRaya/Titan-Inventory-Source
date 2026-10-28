import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row } from './api';
import { useApp, useText, useData, usePermission, DataState, Empty, Table, Notice, Modal, Icon, date, n, title } from './ui';
import { MotionDiv, staggerItem } from './motion';

export function Dashboard() {
  const t = useText();
  const app = useApp();
  const navigate = useNavigate();
  const canCost = usePermission('cost.read');
  const canPurchase = usePermission('purchase');
  const canIssue = usePermission('issue');

  const queryPath = useMemo(() => {
    return 'dashboard' + (app.warehouse ? `?warehouse_id=${encodeURIComponent(app.warehouse)}` : '');
  }, [app.warehouse]);

  const dashRes = useData<Row>(queryPath);
  const data = dashRes.data || {};

  // Extract metrics & lists
  const activeSkus = Number(data.active_skus || 0);
  const inspectionPositions = Number(data.inspection_positions || 0);
  const expiringPositions = Number(data.expiring_positions || 0);
  const pendingDocs = Number(data.pending_documents || 0);
  const stockValuation = data.financial?.stock_value ? Number(data.financial.stock_value) : null;
  const custodyValuation = data.financial?.custody_value ? Number(data.financial.custody_value) : null;

  const lowStockItems: Row[] = data.low_stock_items || [];
  const categoryDist: Row[] = data.category_distribution || [];
  const recentActivity: Row[] = data.recent_activity || [];
  const topMoving: Row[] = data.top_moving_items || [];
  const movementHistory: Row[] = data.movement || [];

  // Low stock breakdown
  const criticalItems = useMemo(() => {
    return lowStockItems.filter(i => Number(i.available) <= Number(i.minimum));
  }, [lowStockItems]);

  const warningItems = useMemo(() => {
    return lowStockItems.filter(i => Number(i.available) > Number(i.minimum) && Number(i.available) <= Number(i.reorder));
  }, [lowStockItems]);

  // Aggregate 30-day movement history into daily chart points
  const chartData = useMemo(() => {
    if (!movementHistory.length) return [];
    const dateMap = new Map<string, { date: string; receipts: number; issues: number; returns: number }>();
    
    // Sort and fill
    for (const m of movementHistory) {
      const d = String(m.document_date || '').slice(0, 10);
      if (!d) continue;
      if (!dateMap.has(d)) {
        dateMap.set(d, { date: d, receipts: 0, issues: 0, returns: 0 });
      }
      const entry = dateMap.get(d)!;
      const qty = Math.abs(Number(m.quantity) || 0);
      if (m.type === 'receipt' || m.type === 'opening') entry.receipts += qty;
      else if (m.type === 'issue') entry.issues += qty;
      else if (m.type === 'return' || m.type === 'supplier_return') entry.returns += qty;
    }

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [movementHistory]);

  const totalReceiptsQty = useMemo(() => chartData.reduce((s, c) => s + c.receipts, 0), [chartData]);
  const totalIssuesQty = useMemo(() => chartData.reduce((s, c) => s + c.issues, 0), [chartData]);

  // Max value for SVG scale
  const maxDayQty = useMemo(() => {
    return Math.max(...chartData.map(c => Math.max(c.receipts, c.issues)), 10);
  }, [chartData]);

  return (
    <div className="dashboard-container">
      {/* Top Hero Header with Quick Launchpad */}
      <section className="dashboard-hero-header">
        <div className="hero-titles">
          <span className="eyebrow">FACTORY OPERATIONS DASHBOARD</span>
          <h1>{t('لوحة التحكم والمؤشرات التشغيلية للمخزن', 'Executive Inventory Dashboard')}</h1>
          <p>
            {t(
              'متابعة حية لرصيد الأمان، استهلاك خطوط الإنتاج، المشتريات، وتنبيهات إعادة الطلب بالمصنع.',
              'Live monitoring of safety stock, production line usage, purchasing, and factory reorder points.'
            )}
          </p>
        </div>

        <div className="dashboard-launchpad">
          {canIssue && (
            <button
              className="btn-launch issue-btn"
              onClick={() => navigate('/issues/new')}
              title={t('إخراج إذن صرف خامات للتشغيل', 'Issue raw materials')}
            >
              <span>+</span>
              <b>{t('إذن صرف خامات', 'New Issue')}</b>
            </button>
          )}

          {canPurchase && (
            <button
              className="btn-launch purchase-btn"
              onClick={() => navigate('/purchases/new')}
              title={t('استلام وتوريد شحنة مشتريات', 'Receive purchases')}
            >
              <span>+</span>
              <b>{t('استلام مشتريات', 'New Receipt')}</b>
            </button>
          )}

          <button
            className="btn-launch return-btn"
            onClick={() => navigate('/returns/new')}
            title={t('استرجاع مواد أو مرتجع لمورد', 'Returns & reversals')}
          >
            <span>↩</span>
            <b>{t('إذن استرجاع', 'New Return')}</b>
          </button>

          <button
            className="btn-launch transfer-btn"
            onClick={() => navigate('/transfers/new')}
            title={t('نقل أصناف بين المخازن', 'Warehouse transfer')}
          >
            <span>⇄</span>
            <b>{t('تحويل مخزني', 'Transfer')}</b>
          </button>

          <button
            className="btn-launch refresh-btn"
            onClick={() => app.refresh()}
            title={t('تحديث البيانات', 'Refresh')}
          >
            <Icon name="sync" />
          </button>
        </div>
      </section>

      <DataState resource={dashRes} />

      {/* KPI Stats Cards Grid */}
      <section className="dashboard-kpi-grid">
        {/* KPI 1: Valuation */}
        <MotionDiv className="kpi-card valuation-card" {...staggerItem(0, 0.05, 0.25)}>
          <div className="kpi-header">
            <span className="kpi-title">{t('إجمالي قيمة المخزون التقديرية', 'Total Inventory Valuation')}</span>
            <span className="kpi-badge currency">EGP</span>
          </div>
          <div className="kpi-body">
            <div className="kpi-metric">
              {canCost ? (
                stockValuation != null ? (
                  <>
                    <b className="val-number">{n(Math.round(stockValuation))}</b>
                    <span className="val-unit">جنيه مصري</span>
                  </>
                ) : (
                  <b className="val-number">—</b>
                )
              ) : (
                <small className="kpi-restricted">{t('مخصص للإدارة المالية', 'Finance restricted')}</small>
              )}
            </div>
            <p className="kpi-subtext">
              {t('قيمة الخامات والمنتجات المسعّرة المتاحة بالمخزن', 'Valued raw materials & goods in warehouse')}
            </p>
          </div>
        </MotionDiv>

        {/* KPI 2: Active SKUs */}
        <MotionDiv className="kpi-card skus-card" {...staggerItem(1, 0.05, 0.25)} onClick={() => navigate('/catalogue')}>
          <div className="kpi-header">
            <span className="kpi-title">{t('إجمالي الأصناف النشطة', 'Active Registered SKUs')}</span>
            <span className="kpi-icon"><Icon name="box" /></span>
          </div>
          <div className="kpi-body">
            <div className="kpi-metric">
              <b className="val-number">{activeSkus}</b>
              <span className="val-unit">{t('صنف مسجل', 'SKUs')}</span>
            </div>
            <p className="kpi-subtext">
              {t('موزعة على كافة خطوط الإنتاج والأقسام', 'Across all production lines and departments')}
            </p>
          </div>
        </MotionDiv>

        {/* KPI 3: Reorder & Low Stock Alerts */}
        <MotionDiv
          className={`kpi-card alert-card ${lowStockItems.length > 0 ? 'has-critical-alerts' : ''}`}
          {...staggerItem(2, 0.05, 0.25)}
          onClick={() => {
            const el = document.getElementById('reorder-alerts-table');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          <div className="kpi-header">
            <span className="kpi-title">{t('أصناف تحت حد الأمان / نقطة الطلب', 'Safety Stock & Reorder Alerts')}</span>
            {lowStockItems.length > 0 ? (
              <span className="kpi-badge pulsing-alarm">🚨 {lowStockItems.length}</span>
            ) : (
              <span className="kpi-badge safe">🟢 {t('آمن', 'Safe')}</span>
            )}
          </div>
          <div className="kpi-body">
            <div className="kpi-metric">
              <b className="val-number">{lowStockItems.length}</b>
              <span className="val-unit">{t('صنف يحتاج متابعة', 'items')}</span>
            </div>
            <div className="kpi-alerts-breakdown">
              <span className="tag-crit">🔴 {criticalItems.length} {t('تحت حد الأمان', 'below min')}</span>
              <span className="tag-warn">🟡 {warningItems.length} {t('عند نقطة الطلب', 'at reorder')}</span>
            </div>
          </div>
        </MotionDiv>

        {/* KPI 4: Pending Authorizations */}
        <MotionDiv className="kpi-card pending-card" {...staggerItem(3, 0.05, 0.25)} onClick={() => navigate('/documents')}>
          <div className="kpi-header">
            <span className="kpi-title">{t('أذونات تنتظر الاعتماد', 'Pending Authorizations')}</span>
            <span className="kpi-icon"><Icon name="docs" /></span>
          </div>
          <div className="kpi-body">
            <div className="kpi-metric">
              <b className="val-number">{pendingDocs}</b>
              <span className="val-unit">{t('إذن معلق', 'pending')}</span>
            </div>
            <p className="kpi-subtext">
              {pendingDocs > 0
                ? t('أذونات صرف/استلام تحتاج اعتماد المشرف للترحيل', 'Awaiting supervisor approval')
                : t('لا توجد أذونات معلقة حالياً', 'All movements are approved and posted')}
            </p>
          </div>
        </MotionDiv>

        {/* KPI 5: Under Inspection */}
        <MotionDiv className="kpi-card inspection-card" {...staggerItem(4, 0.05, 0.25)}>
          <div className="kpi-header">
            <span className="kpi-title">{t('أرصدة قيد الفحص (Quality)', 'Under Inspection (QC)')}</span>
            <span className="kpi-icon">🔍</span>
          </div>
          <div className="kpi-body">
            <div className="kpi-metric">
              <b className="val-number">{inspectionPositions}</b>
              <span className="val-unit">{t('موضع فحص', 'lots')}</span>
            </div>
            <p className="kpi-subtext">
              {t('بضائع مستلمة في انتظار اعتماد مراقبة الجودة', 'Awaiting quality control inspection')}
            </p>
          </div>
        </MotionDiv>

        {/* KPI 6: Expiring LOTs */}
        <MotionDiv className="kpi-card expiring-card" {...staggerItem(5, 0.05, 0.25)}>
          <div className="kpi-header">
            <span className="kpi-title">{t('تشغيلات تقترب صلاحيتها', 'Expiring LOTs (< 30 days)')}</span>
            <span className="kpi-icon">⏳</span>
          </div>
          <div className="kpi-body">
            <div className="kpi-metric">
              <b className="val-number">{expiringPositions}</b>
              <span className="val-unit">{t('لوت قريب الانتهاء', 'lots')}</span>
            </div>
            <p className="kpi-subtext">
              {expiringPositions > 0
                ? t('تشغيلات خامات يلزم استهلاكها أولوياً بالمصنع', 'Prioritize for production consumption')
                : t('جميع التواريخ في النطاق الآمن', 'All batches within safe expiry margin')}
            </p>
          </div>
        </MotionDiv>
      </section>

      {/* Charts & Analytical Section */}
      <section className="dashboard-charts-grid">
        {/* Chart 1: 30-Day Movement Activity (Inflow vs Outflow) */}
        <div className="panel chart-panel">
          <div className="chart-header">
            <div>
              <h3>📈 {t('حركة تداول المخزون (المشتريات والاستلام مقابل المنصرف للإنتاج)', 'Stock Inflow vs Outflow (30 Days)')}</h3>
              <p className="chart-desc">
                {t(
                  'مقارنة كميات استلام المشتريات (Inflow) مع صرف الخامات للورش والأقسام (Outflow).',
                  'Comparison between purchases received and materials issued to workshop lines.'
                )}
              </p>
            </div>
            <div className="chart-legend">
              <span className="legend-item receipt">
                <i /> {t('استلام وتوريد مشتريات', 'Receipts')}: <b>{n(Math.round(totalReceiptsQty))}</b>
              </span>
              <span className="legend-item issue">
                <i /> {t('صرف مواد للتشغيل', 'Issues')}: <b>{n(Math.round(totalIssuesQty))}</b>
              </span>
            </div>
          </div>

          {chartData.length > 0 ? (
            <div className="svg-chart-wrapper">
              <svg className="movement-bar-chart" viewBox="0 0 800 200" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="receiptGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.2" />
                  </linearGradient>
                  <linearGradient id="issueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.2" />
                  </linearGradient>
                </defs>

                {/* Grid guidelines */}
                <line x1="0" y1="50" x2="800" y2="50" stroke="#e2e8f0" strokeDasharray="3 3" />
                <line x1="0" y1="100" x2="800" y2="100" stroke="#e2e8f0" strokeDasharray="3 3" />
                <line x1="0" y1="150" x2="800" y2="150" stroke="#e2e8f0" strokeDasharray="3 3" />
                <line x1="0" y1="190" x2="800" y2="190" stroke="#cbd5e1" strokeWidth="1.5" />

                {chartData.map((d, idx) => {
                  const x = 30 + (idx / Math.max(chartData.length - 1, 1)) * 740;
                  const barW = Math.max(8, Math.min(22, 700 / (chartData.length * 2.5)));
                  
                  const receiptH = (d.receipts / maxDayQty) * 160;
                  const issueH = (d.issues / maxDayQty) * 160;

                  return (
                    <g key={d.date} className="chart-bar-group">
                      {/* Receipt bar (green) */}
                      {d.receipts > 0 && (
                        <rect
                          x={x - barW - 1}
                          y={190 - receiptH}
                          width={barW}
                          height={receiptH}
                          fill="url(#receiptGrad)"
                          rx="3"
                        >
                          <title>{`${d.date} | توريدات: ${n(d.receipts)}`}</title>
                        </rect>
                      )}

                      {/* Issue bar (blue) */}
                      {d.issues > 0 && (
                        <rect
                          x={x + 1}
                          y={190 - issueH}
                          width={barW}
                          height={issueH}
                          fill="url(#issueGrad)"
                          rx="3"
                        >
                          <title>{`${d.date} | صرف تشغيل: ${n(d.issues)}`}</title>
                        </rect>
                      )}

                      {/* Date label (sample every few points) */}
                      {(idx % Math.ceil(chartData.length / 8) === 0 || idx === chartData.length - 1) && (
                        <text
                          x={x}
                          y="198"
                          fontSize="9"
                          fill="#64748b"
                          textAnchor="middle"
                        >
                          {d.date.slice(5)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          ) : (
            <div className="chart-empty-state">
              <p>{t('لا توجد حركات مسجلة خلال الثلاثين يومًا الماضية', 'No movements recorded in the last 30 days')}</p>
            </div>
          )}
        </div>

        {/* Chart 2: Category Breakdown */}
        <div className="panel category-panel">
          <h3>📦 {t('توزيع المخزون حسب الأقسام والتصنيفات', 'Stock Breakdown by Category')}</h3>
          <p className="chart-desc">
            {t('حجم الأصناف والكميات المتوفرة بكل تصنيف رئيسي', 'Item diversity and volume per main category')}
          </p>

          <div className="category-bars-list">
            {categoryDist.map((cat, idx) => {
              const maxCatItems = Math.max(...categoryDist.map(c => Number(c.item_count || 1)), 1);
              const pct = Math.round((Number(cat.item_count || 0) / maxCatItems) * 100);

              return (
                <div key={cat.id || idx} className="category-bar-row">
                  <div className="cat-info">
                    <span className="cat-name">{cat[app.lang === 'ar' ? 'name_ar' : 'name_en'] || cat.name_ar}</span>
                    <span className="cat-counts">
                      <b>{cat.item_count}</b> {t('صنف', 'SKUs')} · <b>{n(Math.round(cat.total_qty))}</b> {t('وحدة', 'units')}
                      {canCost && cat.category_value && (
                        <span className="cat-val"> · {n(Math.round(Number(cat.category_value)))} EGP</span>
                      )}
                    </span>
                  </div>
                  <div className="cat-progress-track">
                    <div
                      className={`cat-progress-fill cat-color-${idx % 5}`}
                      style={{ width: `${Math.max(pct, 6)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Critical Reorder Alarm Table */}
      <section id="reorder-alerts-table" className="panel reorder-alerts-section">
        <div className="section-heading-row">
          <div>
            <div className="heading-with-badge">
              <h2>🚨 {t('أصناف وصلت لنقطة إعادة الطلب وحد الأمان', 'Urgent Reorder & Safety Stock Alarms')}</h2>
              {lowStockItems.length > 0 && (
                <span className="urgent-badge">{lowStockItems.length} {t('صنف مطلوب توريده', 'items to reorder')}</span>
              )}
            </div>
            <p className="section-subtitle">
              {t(
                'هذه الأصناف هبط رصيدها المتاح لأقل من حد الأمان أو نقطة الطلب المحددة، ويلزم إصدار أمر شراء توريد لتفادي توقف الإنتاج.',
                'Stock on hand dropped below minimum safety threshold or reorder point. Immediate purchase order recommended.'
              )}
            </p>
          </div>

          {canPurchase && lowStockItems.length > 0 && (
            <button
              className="primary btn-bulk-order"
              onClick={() => navigate('/purchases/new')}
            >
              + {t('إصدار أمر شراء جديد', 'Create Purchase Order')}
            </button>
          )}
        </div>

        {lowStockItems.length === 0 ? (
          <div className="safe-stock-state">
            <span className="safe-icon">✅</span>
            <h4>{t('مستوى المخزون ممتاز وكافي!', 'Stock levels are completely healthy!')}</h4>
            <p>{t('جميع الأصناف النشطة تقع أعلى من نقطة إعادة الطلب وحد الأمان.', 'All active items are safely above minimum thresholds.')}</p>
          </div>
        ) : (
          <div className="table-scroll reorder-table-wrapper">
            <table className="reorder-table">
              <thead>
                <tr>
                  <th>{t('الصنف وكود SKU', 'Item & SKU')}</th>
                  <th>{t('التصنيف', 'Category')}</th>
                  <th>{t('الرصيد المتاح حالياً', 'Available Stock')}</th>
                  <th>{t('حد الأمان (Min)', 'Safety Min')}</th>
                  <th>{t('نقطة الطلب (ROP)', 'Reorder Point')}</th>
                  <th>{t('حالة الخطر', 'Risk Status')}</th>
                  <th>{t('الإجراء السريع الموصى به', 'Quick Action')}</th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.map((item, idx) => {
                  const avail = Number(item.available || 0);
                  const min = Number(item.minimum || 0);
                  const rop = Number(item.reorder || 0);
                  const isCrit = avail <= min;

                  return (
                    <tr key={item.id || idx} className={isCrit ? 'row-critical-stock' : 'row-warning-stock'}>
                      <td>
                        <button
                          className="link reorder-item-link"
                          onClick={() => navigate(`/catalogue/item/${encodeURIComponent(item.sku)}`)}
                        >
                          <b dir="ltr" className="reorder-sku">{item.sku}</b>
                          <span className="reorder-name">{title(item, app.lang)}</span>
                        </button>
                      </td>
                      <td>
                        <span className="reorder-cat">{item.category_name || '—'}</span>
                      </td>
                      <td>
                        <b className={`reorder-qty ${isCrit ? 'text-critical' : 'text-warning'}`}>
                          {n(avail)}
                        </b>{' '}
                        <small>{item.base_unit}</small>
                      </td>
                      <td>
                        <span className="threshold-val">{n(min)}</span> <small>{item.base_unit}</small>
                      </td>
                      <td>
                        <span className="threshold-val">{n(rop)}</span> <small>{item.base_unit}</small>
                      </td>
                      <td>
                        {isCrit ? (
                          <span className="status-pill status-danger">
                            🔴 {t('خطر حرج: أقل من حد الأمان', 'Critical: Below Min')}
                          </span>
                        ) : (
                          <span className="status-pill status-warning">
                            🟡 {t('وصل نقطة الطلب', 'Reorder Required')}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="action-buttons-cell">
                          {canPurchase && (
                            <button
                              className="btn-quick-reorder"
                              onClick={() => navigate(`/purchases/new?item_id=${item.id}&sku=${encodeURIComponent(item.sku)}`)}
                              title={t('فتح إذن استلام مشتريات لهذا الصنف مباشرة', 'Open purchase receipt for this item')}
                            >
                              + {t('طلب شراء الآن', 'Reorder Now')}
                            </button>
                          )}
                          <button
                            className="btn-inspect-item"
                            onClick={() => navigate(`/catalogue/item/${encodeURIComponent(item.sku)}`)}
                          >
                            {t('فحص الصنف', 'View')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Split Section: Recent Activity & Top Moving Items */}
      <section className="dashboard-split-grid">
        {/* Recent Movements Activity Feed */}
        <div className="panel recent-feed-panel">
          <div className="feed-header">
            <h3>📋 {t('أحدث الحركات المنفذة بالمصنع', 'Recent Operational Movements')}</h3>
            <button className="link" onClick={() => navigate('/documents')}>
              {t('عرض كل الحركات ←', 'View all movements →')}
            </button>
          </div>

          {recentActivity.length === 0 ? (
            <p className="empty-sub">{t('لا توجد حركات مسجلة حديثاً', 'No recent documents recorded')}</p>
          ) : (
            <div className="recent-docs-feed">
              {recentActivity.map(doc => {
                const isIssue = doc.type === 'issue';
                const isReceipt = doc.type === 'receipt' || doc.type === 'production_receipt';
                const isReturn = doc.type === 'return' || doc.type === 'supplier_return';

                return (
                  <div
                    key={doc.id}
                    className="feed-doc-card"
                    onClick={() => {
                      if (isIssue) navigate(`/issues/${doc.id}`);
                      else if (isReceipt) navigate(`/purchases/${doc.id}`);
                      else if (isReturn) navigate(`/returns/${doc.id}`);
                      else navigate(`/documents/${doc.id}`);
                    }}
                  >
                    <div className="feed-doc-type">
                      <span className={`doc-type-icon ${doc.type}`}>
                        {isIssue ? '📤' : isReceipt ? '📥' : isReturn ? '↩' : '📄'}
                      </span>
                      <div>
                        <b className="doc-num">#{doc.number}</b>
                        <span className="doc-type-label">
                          {isIssue
                            ? t('إذن صرف مواد', 'Material Issue')
                            : isReceipt
                            ? t('استلام مشتريات', 'Purchase Receipt')
                            : isReturn
                            ? t('إذن استرجاع', 'Return')
                            : doc.type}
                        </span>
                      </div>
                    </div>

                    <div className="feed-doc-party">
                      <span className="party-name">{doc.party_name}</span>
                      <small className="creator-by">{doc.creator_name}</small>
                    </div>

                    <div className="feed-doc-meta">
                      <span className="doc-lines-count">
                        {doc.lines_count} {t('أصناف', 'items')}
                      </span>
                      <span className="doc-date">{String(doc.document_date).slice(0, 10)}</span>
                    </div>

                    <div className="feed-doc-status">
                      <span className={`status-pill status-${String(doc.status).toLowerCase().replace(/\s+/g, '-')}`}>
                        {doc.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Moving Materials (High Consumption) */}
        <div className="panel top-moving-panel">
          <h3>🔥 {t('الخامات الأكثر تداولاً وحركة بالمصنع', 'Top Moving Raw Materials')}</h3>
          <p className="chart-desc">
            {t('أعلى الأصناف سحبًا واستهلاكًا خلال آخر 30 يومًا', 'Highest consumed items in the last 30 days')}
          </p>

          {topMoving.length === 0 ? (
            <p className="empty-sub">{t('لا توجد بيانات حركة كافية', 'Not enough movement history')}</p>
          ) : (
            <div className="top-moving-list">
              {topMoving.map((m, idx) => (
                <div
                  key={m.id || idx}
                  className="top-moving-item"
                  onClick={() => navigate(`/catalogue/item/${encodeURIComponent(m.sku)}`)}
                >
                  <span className="rank-num">#{idx + 1}</span>
                  <div className="moving-identity">
                    <b dir="ltr" className="moving-sku">{m.sku}</b>
                    <span className="moving-name">{m.name_ar}</span>
                  </div>
                  <div className="moving-metrics">
                    <b className="moving-qty">{n(Math.round(Number(m.moved_qty)))}</b>
                    <small>{m.base_unit} · {m.doc_count} {t('حركة', 'moves')}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
