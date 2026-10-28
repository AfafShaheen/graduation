# قائمة المهام — جولة التحسينات polish-round-1

الحالة: ⬜ pending | ⏳ in progress | ✅ done | ⛔ blocked/skipped (مع السبب)

## PART A — الخلفية (Backend)

| ID | المهمة | الحالة | Commit | الدليل |
|----|--------|--------|--------|-------|
| A1.1 | مدقّقات حقول إعدادات الشام كاش الثلاثة في AdminSettingsUpdate (D1, D2, D3) مع رسائل عربية في core/messages.py | ⬜ | | |
| A1.2 | اختبار جديد tests/test_admin_settings_validation.py + تحديث اختبارات الإعدادات القديمة فقط إن استخدمت قيمًا لم تعد صالحة | ⬜ | | |
| A2.1 | مدقّق رقم العملية: trim فقط، الحفاظ على حالة الأحرف، [A-Za-z0-9-]{4,100} | ⬜ | | |
| A2.2 | الموديل: استبدال UniqueConstraint بفهرس وظيفي فريد upper(transaction_number) باسم uq_payments_transaction_number_ci | ⬜ | | |
| A2.3 | هجرة 0013_transaction_number_ci_unique (down_revision = 0012_university_record_file) مع downgrade عامل | ⬜ | | |
| A2.4 | ticket_service: بحث مكرر غير حساس لحالة الأحرف؛ إعادة الإرسال لنفس التذكرة تحدّث النص المحفوظ؛ مسار IntegrityError يبقى عاملًا | ⬜ | | |
| A2.5 | اختبارات A2.5 (التخزين كما كُتب، 409 عبر تذكرتين، تحديث النص عند إعادة الإرسال، رفض DB لسطرين يختلفان بالحالة فقط، العرض في الإدارة/الخريج/Excel، up/down للهجرة) | ⬜ | | |
| A2.6 | تحديث test_submit_normalizes_transaction_number إلى السلوك الجديد (مدرج في التقرير مع السبب) | ⬜ | | |
| A3.1 | فاحص العقد + الحزمة الكاملة + docs/BACKEND_CHANGES.md بالعربية | ⬜ | | |
| A3.2 | تقرير Part A وبوابة الدفع | ⬜ | | |

## PART B — الواجهة (Frontend)

| ID | المهمة | الحالة | Commit | الدليل |
|----|--------|--------|--------|-------|
| B1.1 | front/src/config/brand.js بثوابت D7 و D8 | ⬜ | | |
| B1.2 | استبدال كل الصياغات القديمة في الجرد (عناوين، شارات، تذييلات، fallbacks، placeholder، عنوان المشاركة) بالثوابت | ⬜ | | |
| B1.3 | SEO: index.html title وكل حقول seo.config.json | ⬜ | | |
| B1.4 | أمان التخطيط لعنوان الطويل (التفاف سطرين، بلا nowrap/ellipsis/ارتفاع ثابت) | ⬜ | | |
| B1.5 | اختبار front/tests/brandConsistency.test.mjs | ⬜ | | |
| B2.1 | مكوّن HelpFooter.jsx + نمط مشترك صغير | ⬜ | | |
| B2.2 | استخدام HelpFooter مرة واحدة في كل صفحات الخريجين وإزالة النسخ اليدوية | ⬜ | | |
| B2.3 | اختبار: كل ملف student/*.jsx يستورد ويرندر HelpFooter مرة واحدة بالضبط + سطر/سطران حسب الهاتف | ⬜ | | |
| B3.1 | إزالة رقاقة +963 والحشو التعويضي في GraduationFormStep2 + اختبار غياب +963 في front/src | ⬜ | | |
| B3.2 | إزالة remember me من AdminLogin و CSS + اختبار | ⬜ | | |
| B3.3 | إزالة بحث رأس لوحة التحكم وحالته ومرشحه ومعالجه و CSS + اختبار | ⬜ | | |
| B4.1 | utils/payments.js — validateTransactionId نقيّة بالرسائل العربية واستخدامها في ShamCashPayment | ⬜ | | |
| B4.2 | خصائص حقل رقم العملية (inputMode=text، autoCapitalize=off، dir=ltr، maxLength=100، placeholder مثال، تلميح) بلا تuppercase قسري | ⬜ | | |
| B4.3 | عرض رقم العملية كما ورد تمامًا في كل الواجهة (إزالة أي toUpperCase/text-transform uppercase) | ⬜ | | |
| B4.4 | اختبارات B4.1 (جدول القيم) + فحص ثابت بلا تحويل حالة في الملفات المعدّلة | ⬜ | | |
| B5.1 | مدقّقات إعدادات الإدارة في validators.js مطابقة حرفيًا لرسائل Backend + ربطها بتبويب الإعدادات | ⬜ | | |
| B5.2 | اختبارات B5.1 بجدول صدق مطابق لـ A1.2 | ⬜ | | |
| B6.1 | تسجيل دخول الماسح: زر واحد تسجيل الدخول، إزالة زر المنتقي، تعطيل حتى اختيار فعالية، مسح الاختيار عند تعديل الحقول | ⬜ | | |
| B6.2 | اختبار: زر scan-login-submit-btn واحد static + فحص رندر مؤقت | ⬜ | | |
| B7.1 | شاشات نتائج الماسح داخل الكاميرا: class بدل inline style، ارتفاع 100% بدل vh/dvh، تمرير المحتوى فقط، footer ثابت، hero مضغوط للشاشات القصيرة | ⬜ | | |
| B7.2 | تحقق B7.1: screenshots إن وُجد headless browser، وإلا فحص CSS ثابت + قائمة يدوية للمالك | ⬜ | | |
| B8.1 | docs/FRONTEND_WIRING.md بالعربية | ⬜ | | |
| B8.2 | الفحوص النهائية (npm ci/test/build/lint + git diff --stat) وتقرير Part B وبوابة الدفع | ⬜ | | |

## سجل Baseline (S4)

### بيئة التنفيذ
- لا يوجد Docker في هذه البيئة؛ تعمل الاختبارات محليًا مقابل PostgreSQL و Redis محليين:
  `DATABASE_URL=postgresql+asyncpg://postgres:secret123@localhost:5432/graduation_test REDIS_URL=redis://localhost:6379/0 pytest -q ...`
- Python 3.12.10 / FastAPI 0.115.12 / pydantic 2.11.7 / SQLAlchemy 2.1.6 / Node v20.20.2

### Backend baseline (قبل أي تعديل)
- `pytest tests/test_admin_settings.py tests/test_payment_submission.py tests/test_migrations.py tests/test_openapi_contract.py -q`
  → **39 passed, 1 failed**
- الفشل الوحيد: `tests/test_openapi_contract.py::test_openapi_contract_is_frozen` — **سابق لهذه الحزمة**:
  تم توليد `openapi_baseline.json` بإصدار FastAPI/pydantic مختلف، فتظهر فروق توثيقية (117 عملية "changed")
  على فرع `dev` نفسه قبل لمس أي ملف. القاعدة: لن نحدّث الـ baseline؛ نثبت أن عدد الفروقات لا يزداد بسبب تعديلاتنا.

### Frontend baseline (يُسجَّل أول تنفيذ Part B)
- يُنفَّذ: `npm ci`, `npm test`, `npm run build`, `npm run lint` (مرجع سابق معروف: 46 warning، 0 error)
