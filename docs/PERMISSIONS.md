# الصلاحيات

المنع هو الافتراضي. القواعد تطبق في API والبحث والتقارير والمرفقات؛ إخفاء زر ليس آلية حماية. أدوار البداية: Super Admin، Warehouse Manager، Storekeeper، Purchasing، Quality، Production، Finance، Auditor. لا أرصدة أو مستخدمون فعليون ضمن seed؛ أول مدير ينشأ بأمر محلي على الخادم.

صلاحيات مستقلة: catalog.read/write، stock.read، receipt، issue، transfer، reserve، custody، quality، count، purchase، approve، reverse، cost.read، reports، users، settings، import. نطاق المخازن/الأقسام يُراجع لكل مستند ولكل استعلام. الحساب الجديد لا يحصل على جميع المخازن ضمنيًا.

حركات التسوية والإعدام والعكس تتطلب اعتماد مستخدم آخر بصلاحية approve؛ منشئ الحركة لا يعتمدها بنفسه. التكلفة لا تُرسل في JSON أو Excel أو print أو الكاش لمن ليس له cost.read. إلغاء الحساب والجلسة فعال في الطلب التالي للخادم.
