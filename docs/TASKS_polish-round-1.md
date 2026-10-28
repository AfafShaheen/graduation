# قائمة المهام — جولة التحسينات polish-round-1

الحالة: ⬜ pending | ⏳ in progress | ✅ done | ⛔ blocked/skipped (مع السبب)

## PART A — الخلفية (Backend)

| ID | المهمة | الحالة | Commit | الدليل |
|----|--------|--------|--------|-------|
| A1.1 | مدقّقات حقول إعدادات الشام كاش الثلاثة في AdminSettingsUpdate (D1, D2, D3) مع رسائل عربية في core/messages.py | ✅ | b7bde76 | pytest tests/test_admin_settings_validation.py → 23 passed (مع A1.2) |
| A1.2 | اختبار جديد tests/test_admin_settings_validation.py + تحديث اختبارات الإعدادات القديمة فقط إن استخدمت قيمًا لم تعد صالحة | ✅ | 8d3e4a5→b7bde76 | test_admin_settings_validation.py: 23 passed؛ اختبارات الإعدادات القديمة لم تحتاج تعديلاً |
| A2.1 | مدقّق رقم العملية: trim فقط، الحفاظ على حالة الأحرف، [A-Za-z0-9-]{4,100} | ✅ | ab004ff | test_payment_submission.py::test_submit_keeps_transaction_number_as_typed + test_submit_validation_cases |
| A2.2 | الموديل: استبدال UniqueConstraint بفهرس وظيفي فريد upper(transaction_number) باسم uq_payments_transaction_number_ci | ✅ | 8919ce6 | models/payment.py: Index(uq_payments_transaction_number_ci, func.upper(...), unique=True) + فحص بنية في test_migrations |
| A2.3 | هجرة 0013_transaction_number_ci_unique (down_revision = 0012_university_record_file) مع downgrade عامل | ✅ | 8919ce6 | test_migrations.py::test_transaction_ci_migration_round_trip + applies_expected_schema (up/down يعملان فعلياً على PG) |
| A2.4 | ticket_service: بحث مكرر غير حساس لحالة الأحرف؛ إعادة الإرسال لنفس التذكرة تحدّث النص المحفوظ؛ مسار IntegrityError يبقى عاملًا | ✅ | 8919ce6 | ticket_service: func.upper lookup + تحديث النص؛ IntegrityError محفوظ |
| A2.5 | اختبارات A2.5 (التخزين كما كُتب، 409 عبر تذكرتين، تحديث النص عند إعادة الإرسال، رفض DB لسطرين يختلفان بالحالة فقط، العرض في الإدارة/الخريج/Excel، up/down للهجرة) | ✅ | 8919ce6 + ab004ff | payment_submission 17 passed، migrations 3 new passed، admin_export::test_export_shows_transaction_number_as_typed (11 passed) |
| A2.6 | تحديث test_submit_normalizes_transaction_number إلى السلوك الجديد (مدرج في التقرير مع السبب) | ✅ | ab004ff | test_submit_normalizes_transaction_number عدّل ليتوقع "ab-1234" بدل "AB-1234" (السبب موثق في BACKEND_CHANGES §15.3) |
| A3.1 | فاحص العقد + الحزمة الكاملة + docs/BACKEND_CHANGES.md بالعربية | ✅ | (هذا الكوميت) | check_openapi_additive: الفرق على الفرع = الفرق على dev بالضبط (117 سابقاً لا جديد)؛ الحزمة الكاملة: 430 passed / 3 failed (نفس فشل dev السابق — لا انحدار)؛ docs/BACKEND_CHANGES.md §15 أُضيف |
| A3.2 | تقرير Part A وبوابة الدفع | ⛔ |  | بوابة الدفع الكاملة (push إلى origin) غير ممكنة من هذه البيئة: remote عاملا مشفر بالـ token وانتهت صلاحيته؛ الفروع الدافعة تتم محلياً والـ push يُنفَّذ من عند المالك |

## PART B — الواجهة (Frontend)

| ID | المهمة | الحالة | Commit | الدليل |
|----|--------|--------|--------|-------|
| B1.1 | front/src/config/brand.js بثوابت D7 و D8 | ✅ | f25865e | ملف الثوابت موجود ويُستورد في كل الصفحات |
| B1.2 | استبدال كل الصياغات القديمة في الجرد (عناوين، شارات، تذييلات، fallbacks، placeholder، عنوان المشاركة) بالثوابت | ✅ | e0841fb, 9a2f8e7 | grep: لا عبارة قديمة متبقية في src/index.html/seo.config.json |
| B1.3 | SEO: index.html title وكل حقول seo.config.json | ✅ | 44d2320 | brandConsistency يتحقق من الجملة الجديدة؛ build مع generate-seo أخضر |
| B1.4 | أمان التخطيط لعنوان الطويل (التفاف سطرين، بلا nowrap/ellipsis/ارتفاع ثابت) | ✅ | 1433bb8 | BrandHeader.css مستورد في 16 ملفاً؛ لا صفحة missing |
| B1.5 | اختبار front/tests/brandConsistency.test.mjs | ✅ | (هذا الكوميت) | node --test: 3/3 pass — العبارات القديمة غائبة، SEO يحوي الجملة الجديدة، كل الصفحات تستورد brand |
| B2.1 | مكوّن HelpFooter.jsx + نمط مشترك صغير | ✅ | (هذا الكوميت) | front/src/components/HelpFooter.jsx + style/HelpFooter.css |
| B2.2 | استخدام HelpFooter مرة واحدة في كل صفحات الخريجين وإزالة النسخ اليدوية | ✅ | (هذا الكوميت) | grep -L "HelpFooter" pages/student/*.jsx → فارغ (12/12 صفحة)؛ أزيلت نسخ Otp/OrderRejected/GraduateGuide وContactPhoneLink من Step1/Step2/Login/MyTicket |
| B2.3 | اختبار: كل ملف student/*.jsx يستورد ويرندر HelpFooter مرة واحدة بالضبط + سطر/سطران حسب الهاتف | ✅ | (هذا الكوميت) | node --test tests/helpFooter.test.mjs → 8 pass؛ والحزمة 50 pass / 0 fail |
| B3.1 | إزالة رقاقة +963 والحشو التعويضي في GraduationFormStep2 + اختبار غياب +963 في front/src | ✅ | (هذا الكوميت) | node --test tests/brandConsistency.test.mjs → 4 pass (اختبار جديد: لا +963 في src) |
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
