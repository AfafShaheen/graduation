# قائمة مهام تحديث صيغة ملف شؤون الطلبة

آخر تحديث: **اكتمال الجزء A و الجزء B بالكامل (B0–B16)، ونُفِّذت بوابة دفع الجزء B ودُفع إلى `origin/dev` (HEAD = `3afa0fe`).**

صيغة ملف شؤون الطلبة الثابتة (بالترتيب): الاسم، الكنية، اسم الأب، اسم الأم، الجنس، الكلية، التخصص، الرقم الجامعي، حالة الطالب من الأوائل، المعدل، رقم التواصل.

## خط الأساس (Baseline) — قبل أي تعديل
- الخلفية: `pytest -q` = **304 passed**، 29 تحذيراً.
- الواجهة: `npm ci` = 0 ثغرات؛ `npm run build` = ناجح؛ `npm run lint` = **41 تحذيراً / 0 أخطاء**.
- ملاحظة بيئة (لوحظت، لم تُلمَس — S1): `back/tests/conftest.py` يستبدل `redis:6379` بـ `localhost:6379`، لذا أمر README `docker compose exec back sh -c "pytest -q"` يفشل داخل الحاوية (503). التشغيل الصحيح: تمرير عنوان Redis بعنوان IP للحاوية عبر متغير `REDIS_URL`.

## مفتاح الحالة
- ⬜ لم تبدأ
- ⏳ قيد التنفيذ
- ✅ مكتملة (مع اختبار ناجح + hash الالتزام + دليل سطر واحد)
- ⛔ محجوبة + السبب

## القرارات المرجعية (D1–D12)
- D1: تُطابَق الحقول التالية بالضبط: الاسم، الكنية، اسم الأب، اسم الأم، الجنس، الكلية، التخصص، الرقم الجامعي، وحالة الأوائل. لا يُطابَق المعدل ولا رقم التواصل من الملف أبداً.
- D2: الطالب يُدخل المعدل في النموذج لكنه اختياري ولا يُطابَق؛ إن كان صالحاً يُخزَّن في `graduates.gpa` وإلا يُخزَّن معدل الملف.
- D3: حالة الأوائل تُقرأ من الملف عند وجود العمود (مرجعية)؛ وإلا يُرجع للترتيب الكثيف حسب المعدل.
- D4: الأسماء تُخزَّن منفصلة (`first_name`, `last_name`) مع الحفاظ على `full_name` كعمود عرض مُشتق؛ ويُقبل العمود القديم كحل احتياطي.
- D5: مُتحقّقات الهاتف/كلمة المرور في الواجهة تُطابق الخلفية بالضبط.
- D6: يُخفى زر إعادة إرسال الدفع في صفحة الطلب المرفوض عند إغلاق التسجيل.
- D7: تحسين محركات البحث يقتصر على صفحة الهبوط العامة؛ وكل صفحة خاصة `noindex`.
- D8: الجنس قائمة `<select>` بخياري "ذكر"/"أنثى"؛ وتُوحَّد إملاءات شؤون الطلبة قبل المقارنة/التخزين.
- D9: قيود التفرد في قاعدة البيانات تبقى كما هي (لا UNIQUE مركّب على حقول الهوية).
- D10: الكليات ليست قائمة ثابتة (يُدخلها المدير لكل حفل).
- D11: خطأ الأوائل الخاص (الترتيب): 1) وجود السجل؛ 2) تطابق الاسم/الكنية/الأب/الأم/الجنس/الكلية/التخصص/الرقم الجامعي وإلا فشل عام؛ 3) مقارنة اختيار الأوائل مع المتوقع؛ 4) "مسجّل مسبقاً" أخيراً. الجسم `{"detail": {"message": "<نص عربي>", "code": "<CODE>"}}` بنفس حالة الفشل العامة. الرموز: `TOP_RANK_NOT_HONOR`، `TOP_RANK_SHOULD_BE_HONOR`، `TOP_RANK_MISMATCH`.
- D12: `GET /api/graduates/me/ticket` يُرجِع `top_rank` (1/2/3/null)، وتُظهر `MyTicket.jsx` شارة "من الأوائل" + الترتيب.

---

## الجزء A — الخلفية (backend)

| ID | المهمة | الحالة | commit | الدليل |
|----|--------|--------|--------|--------|
| A1.1 | إضافة ثوابت رؤوس الأعمدة الجديدة | ✅ | 585b0c8 | رؤوس الاسم/الكنية/حالة الأوائل/رقم التواصل في `ARABIC_HEADERS` |
| A1.2 | توسيع `_header_aliases` للأسماء البديلة | ✅ | 585b0c8 | `_EXTRA_HEADER_ALIASES` مُدمجة |
| A1.3 | قاعدة الاسم: فصل أو الاسم الكامل القديم | ✅ | 585b0c8 | `split_full_name` + شرط (first+last) أو full_name |
| A1.4 | تحديث الأعمدة المطلوبة والتحقق من الترتيب | ✅ | 585b0c8 | `validate_records` + رسالة الترتيب القديمة محفوظة |
| A2.1 | توحيد الجنس | ✅ | 585b0c8 | `normalize_gender` (انثى/انثي/male/female → ذكر/أنثى) |
| A2.2 | تحسين `parse_gpa` لقبول "72،79٪" | ✅ | 585b0c8 | اختبار gpa "٧٢،٧٩٪" → 72.79 |
| A2.3 | تحليل حالة الأوائل من الملف | ✅ | 585b0c8 | `parse_top_status_from_file` (None/0/-1/1/2/3) |
| A2.4 | توحيد رقم التواصل وتخزينه دون مطالبة | ✅ | 585b0c8 | `normalize_phone` + تخزين؛ لا مطابقة |
| A2.5 | التحقق من التعامل مع التخصص كما هو | ✅ | 585b0c8 | سلوك التخصص دون تغيير |
| A2.6 | ربط المُوحِّدات بمسار معالجة الصفوف | ✅ | 585b0c8 | `upsert_records` يكتب الحقول الجديدة |
| A3.1 | ترحيل Alembic 0007 | ✅ | 8885511 | `0007_names_and_top_rank` |
| A3.2 | تحديث نماذج SQLAlchemy | ✅ | 8885511 | أعمدة جديدة + قيد `chk_uni_records_top_from_file` |
| A4.1 | مخطط `UserVerifyStep1` | ✅ | d7a356c | first_name/last_name/full_name + مدقّق الاسم |
| A4.2 | `verify_step1`: أسماء منفصلة، بلا معدل/هاتف | ✅ | d7a356c | `_names_match`؛ إزالة مطابقة المعدل |
| A4.3 | المتوقع لحالة الأوائل من الملف مع الرجوع | ✅ | d7a356c | منطق `top_rank_from_file` + `compute_top_rank` |
| A4.4 | أخطاء D11 + الترتيب + الرسائل | ✅ | d7a356c | `_top_rank_error` + رموز/رسائل في `core/messages.py` |
| A4.5 | تضمين `top_rank` في الرمز وتخزينه | ✅ | d7a356c | `token_payload` + `register_step2` |
| A4.6 | الحقول الجديدة في تفاصيل/تصدير الإدارة | ✅ | d7a356c | `admin_graduate_service` + `export_service` (الاسم/الكنية) |
| A4.7 | `ticket_service`: إرجاع `top_rank` | ✅ | d7a356c | في الحالتين (وجود/غياب تذكرة) |
| A5.1 | إضافة `summary` لاستجابة الرفع | ✅ | 585b0c8 | `UniversityRecordUploadSummary` |
| A6.1 | اختبارات `tests/test_affairs_file_format.py` | ✅ | c9652e9 | 20 اختباراً ناجحاً |
| A6.2 | تحديث الاختبارات القائمة المتأثرة | ✅ | c9652e9 | `test_admin_export` + `test_verify_step1_academic` (سبب: D2) |
| A7.1 | `tests/test_db_uniqueness.py` | ✅ | c9652e9 | إثبات عدم وجود قيد مركّب |
| A8.1 | تشغيل `check_openapi_additive.py` | ✅ | — | OK: إضافتان، 0 كسر |
| A8.3 | تحديث `openapi_baseline.json` | ✅ | 8e8ea68 | التزام منفصل |
| A9.1 | تحديث `docs/BACKEND_CHANGES.md` | ✅ | التوثيق | قسم المرحلة 4.4 |
| A9.2 | مقترح تحديث SRS | ✅ | — | `docs/SRS_UPDATE_affairs-format.md` |
| A9.3 | تقرير الجزء A | ✅ | — | `docs/REPORT_PART_A_affairs-format.md` |

## الجزء B — الواجهة + SEO

| ID | المهمة | الحالة | commit | الدليل |
|----|--------|--------|--------|--------|
| B0 | تجهيز بيئة الاختبار (`node --test`) + سكربتات `package.json` | ✅ | 693ac95 | `npm test` ناجح |
| B1.1 | `extractVerificationToken` | ✅ | 0cfe7dc | 5 اختبارات ناجحة |
| B1.2 | استخدامه في `Login.jsx` | ✅ | 0cfe7dc | يمرّر `err.data` للدالة |
| B2.1 | `utils/amount.js` | ✅ | 1e8c0a3 | 5 اختبارات ناجحة |
| B2.2 | إصلاح مبلغ `ShamCashPayment` | ✅ | 1e8c0a3 | لا مضاعفة ×100 |
| B3.1 | `utils/validators.js` | ✅ | 1452fa8 | 4 اختبارات؛ lint 41/0 |
| B4.1 | حقلان للاسم والكنية | ✅ | b41d45b | يُرسل first_name/last_name |
| B4.2 | الجنس قائمة منسدلة | ✅ | b41d45b | `<select>` ذكر/أنثى |
| B4.3 | المعدل اختياري | ✅ | b41d45b | gpa = null عند الفراغ |
| B4.5 | خطأ D11 تحت اختيار الأوائل | ✅ | b41d45b | بواسطة `detail.code` |
| B5.1 | حالة التسجيل في OrderRejected | ✅ | a78435d | من `registration.is_open` |
| B5.2 | إخفاء إعادة الإرسال عند الإغلاق | ✅ | a78435d | الزر مشروط بإغلاق التسجيل |
| B6.1 | أخطاء 422 في OTP/reset | ✅ | f8478e9 | عرض خطأ الحقل الفعلي |
| B7.1 | تصدير PDF لكل الصفوف | ✅ | 3262635 | تصفّح كل الصفحات (حد 200) |
| B8.1 | طلب تذكرة مشترك (in-flight) | ✅ | f720b17 | `utils/ticketRequest.js` |
| B8.2 | استخدامه في useMyTicket/TicketGuard | ✅ | f720b17 | guard+page = طلب واحد |
| B9.1 | قالب/رقائق/مساعدة + summary الرفع | ✅ | dd3f1e2 | ترتيب شؤون الطلبة + نتيجة الرفع |
| B10.1 | `front/seo.config.json` | ✅ | f2e831f | إعداد مركزي + publicRoutes |
| B10.2 | `generate-seo.mjs` + prebuild | ✅ | f2e831f | يولّد sitemap.xml وrobots.txt |
| B10.3 | وسوم index.html + Vite transformIndexHtml | ✅ | f2e831f | حقن og/canonical/robots |
| B10.4 | `usePageMeta` | ✅ | f2e831f | index فقط للمسار / |
| B10.5 | nginx noindex + docs/SEO.md | ✅ | f2e831f | X-Robots-Tag للمسارات الخاصة |
| B11.1 | مكوّن CollegeNamesField | ✅ | 87832ef | رقائق معروفة + إضافة أسماء حرّة |
| B11.2 | `src/pages/admin/facultyOptions.js` | ✅ | 87832ef | FACULTY_OPTIONS + أدوات |
| B11.3 | استخدامه للقراءة فقط في التعديل | ✅ | 87832ef | collegeNames في مسار التعديل |
| B12.1 | `front/Dockerfile` ARG/ENV | ✅ | 2fe3dc2 | ARG/ENV VITE_SITE_URL قبل build |
| B12.2 | وسائط build للواجهة + `.env.example` | ✅ | 2fe3dc2 | front.build.args + متغير |
| B13.1 | تحديث `docs/FRONTEND_WIRING.md` | ✅ | 5324221 | توثيق توصيلات الجزء B (B0–B15) |
| B14.1 | أداة تحليل التخصصات دفعة واحدة | ✅ | 6ee717f | parseMajorsBatch + resolveBatchGroups + اختبارات |
| B14.2 | واجهة الإضافة الجماعية | ✅ | 6ee717f | MajorsManager batch UI |
| B15.1 | `utils/topRank.js` | ✅ | 013e3cc | topRankLabel + TOP_STUDENT_TITLE (+ اختبار) |
| B15.2 | شارة الأوائل في MyTicket | ✅ | 013e3cc | شارة فوق رمز QR؛ دعم الخلفية 3f75191 |
| B16.1 | الفحوص النهائية | ✅ | — | خلفية 324/0، الواجهة 33/0، بناء + لينت ناجح |
| B16.2 | تقرير الجزء B | ✅ | — | `docs/REPORT_PART_B_affairs-format.md` |

## بوابة الدفع لكل جزء
(a) نجاح اختبارات الجزء، (b) كل مهمة ✅/⛔ بسبب، (c) نجاح `docker compose build`، (d) بدء خدمة back وترحيلات + `/health` = 200، (e) `git status` نظيف؛ ثم `git pull --rebase origin dev` وإعادة الاختبار عند تغيّر شيء، ثم `git push origin dev`.
