# تقرير Part B — مسار رفض الدفع (branch: `fix/rejection-flow`)

## 1) الأرقام: خط الأساس مقابل النهائي
| الفحص | خط الأساس | النهائي | النتيجة |
|---|---|---|---|
| Backend كامل (`python -m pytest -q -p no:libtmux`) | 453 passed / 2 failed | **459 passed / 2 failed** | لا فشل جديد (الفشلان الموجودان أصلاً: `test_get_graduates_me_unauthorized` و `test_endpoints_require_verification_token` — 403 بدل 401، خارج النطاق ولم نُمسّ auth) |
| Backend مستهدف (`test_admin_payment_review.py test_my_ticket.py test_payment_submission.py test_admin_graduate_details_enriched.py`) | 46 passed | **52 passed** | ✅ |
| فاحص العقد (`python -m scripts.check_openapi_additive`) | OK | **OK: 0 إضافات / 0 كسر** | لا تغيير في العقد (كما هو متوقع) |
| Frontend tests (`node --test tests/`) | 121 pass / 0 fail | **138 pass / 0 fail** | +17 اختباراً جديداً، كل الحراس (graduateFlowGuard/helpFooter/brandConsistency/authWiring/transactionDisplay/adminUxRemovals) خضراء |
| `npm ci` | نجح | **نجح** | بدون اعتماديات جديدة (S7) |
| `npm run build` | ✓ built | **✓ built in 1.26s** | أخضر |
| `npx oxlint src` | 43 warnings / 0 errors | **43 warnings / 0 errors** | لا زيادة (مساوٍ لخط الأساس)، 0 أخطاء |

ملاحظة تشغيلية: سكربت `npm test` الحالي (`node --test "tests/**/*.test.mjs"`) لا يعمل على Node 20 (لا يدعم الـ glob) منذ خط الأساس؛ لم نعدّل `package.json` التزاماً بـ S7/S10، وأجرينا الاختبارات بـ `node --test tests/`.

## 2) قائمة المهام (النهائية)
| ID | المهمة | الحالة |
|---|---|---|
| A1.1 | سبب الرفض داخل `details` في سجل التدقيق PAYMENT_REJECTED | ✅ |
| A1.2 | اختبارات backend للسبب (400/حدود/trim/رؤية الخريج/إعادة إرسال/409/السجل) | ✅ |
| A1.3 | فاحص العقد + الحزمة الكاملة + BACKEND_CHANGES.md + تقرير Part A | ✅ |
| B1.1 | `config/rejectReasons.js` + `pages/admin/RejectReasonPresets.jsx` | ✅ |
| B1.2 | الربط في نافذة الرفض + جملة D2 + عدّاد n/255 + aria-labels | ✅ |
| B1.3 | اختبارات B1 (تفرّد/أطوال/SSR/فحص ثابت) | ✅ |
| B2.1 | `utils/rejection.js` (supportHref/rejectionReasonText/rejectionActions) | ✅ |
| B2.2 | اختبارات B2.1 | ✅ |
| B3.1 | `components/RejectionOptions.jsx` | ✅ |
| B3.2 | إعادة كتابة `OrderRejected.jsx` وفق D6/D5 | ✅ |
| B3.3 | اختبارات B3 (SSR لأربع حالات + فحص ثابت) | ✅ |
| B4.1 | ملاحظة `docs/FRONTEND_WIRING.md` | ✅ |
| B4.2 | الفحوص النهائية + نطاق git diff + هذا التقرير + التسليم | ✅ |

## 3) الاختبارات: ماذا كان موجوداً وماذا أُضيف
- موجودة مسبقاً (backend): `test_reject_requires_reason`، `test_reject_success_and_graduate_sees_reason` (test_admin_payment_review)، `test_resubmission_with_new_number_after_reject` (test_payment_submission)، `test_my_ticket_rejected_shows_reason` (test_my_ticket).
- أُضيف (backend، ضمن A1.2): فراغ-only و2 حرف → 400 بنفس رسالة `REJECT_REASON_REQUIRED`؛ 3 و255 حرفاً تمرّ و256 يُرفض؛ trim قبل الحفظ؛ رؤية الخريج للسبب كما كُتب عبر `GET /api/graduates/me/ticket`؛ إعادة الدفع تُرجع PROCESSING وتمحو السبب؛ غير PROCESSING → 409؛ `details` في سجل التدقيق يحوي السبب.
- أُضيف (frontend): `tests/rejectReasonPresets.test.mjs` (3)، `tests/rejectionUtils.test.mjs` (9)، `tests/rejectionOptions.test.mjs` (5) — SSR عبر نمط Vite `ssrLoadModule` + `react-dom/server` بدون أي dependency جديد.

## 4) الالتزامات (git log على origin/dev..HEAD)
- `2f080da feat(A1.1): include rejection reason in PAYMENT_REJECTED audit details` (+A1.2/A1.3 فعلياً في نفس العمل التوثيقي)
- `be6badd docs(A1.3): document rejection audit change and Part A results`
- `d8fbb00` snapshot (احتوى عمل B1.1–B1.3)
- `cbbc5f5 feat(B2.1): add pure rejection helpers for graduate rejection page`
- `a47afd9 feat(B3.1,B3.2): rebuild graduate rejection page wording and options`
- `7b9e049 test(B3.3): cover rejection options SSR and page wiring`
- `2ab31bb docs(B4.1): document rejection flow wiring and wording in frontend docs`
- هذا الالتزام: `chore(B4.2): final verification, task list completion and Part B report`

## 5) النطاق (S1/S2/S10)
`git diff --stat 245bbed..HEAD` يظهر فقط: `back/app/services/payment_review_service.py`، `back/tests/test_admin_payment_review.py`، ملفات `docs/`، وضمن `front/`: `AdminPaymentRequests.jsx` (نافذة الرفض فقط)، `RejectReasonPresets.jsx`، `rejectReasons.js`، `rejection.js`، `RejectionOptions.jsx`، `OrderRejected.jsx`، `OrderRejected.css`، `AdminPaymentRequests.css`، وثلاثة ملفات tests جديدة. لم تُمس: auth/session، roster، scanner، منطق polling في OrderStatus.jsx، TicketGuard.jsx، api/client.js، api/session.js، docker-compose، requirements، Alembic.

## 6) الافتراضات وملاحظات الانحراف
- **D1**: النص المعطى في المواصفات مبتور («سعر .» و«غير صحيح أو غير موجود» بلا نقطة) وقوائم 3 أسباب فقط بينما المطلوب «five». اعتمدنا 5 أسباب كاملة ومتسقة لغوياً (الرابع والخامس صيغانا بأسلوب نفسه): انظر `front/src/config/rejectReasons.js`. لتغييرها: عدّل هذا الملف وحده.
- قاعدة الهاتف في `supportHref`: `+` اختياري ثم 7–15 رقماً، تُزال المسافات والشرطات قبل الفحص؛ رقم غير مطابق → لا رابط (نص المكتب حسب D5).
- بيئة الاختبار المحلية (Postgres+Redis محليان) بدلاً من `docker compose exec` لأن Docker غير متوفر هنا؛ النتائج أعلاه من تشغيل فعلي.

## 7) noticed, not touched
- `npm test` script لا يعمل على Node 20 (glob) — مشكلة موجودة قبل فرعنا.
- فشلان مزمنان في حزمة backend related إلى 401/403 في مسارات auth — خارج النطاق (S10).
- تحذيرات `[INEFFECTIVE_DYNAMIC_IMPORT]` في mtime build حول `api/session.js`/`api/admin.js` — موجودة في خط الأساس.
- `back/dump.rdb`, `app_errors.log` موجودان في شجرة back — غير متتبَّعين، لم نمسّهما.

## 8) قائمة الاختبار اليدوي للمالك
1. كإداري: افتح طلب دفع بحالة «قيد المراجعة» واضغط **رفض**: تظهر الأسباب الجاهزة الخمسة، اختيار واحد يملأ الصندوق (قابل للتعديل)، الفراغ أو حرفان يُرفضان برسالة عربية، والعدّاد يتحدث `n/255`، وتظهر جملة «سيظهر هذا السبب للخريج كما كُتب.»
2. الخريج المنتظر على «بانتظار المراجعة» ينتقل تلقائياً (خلال ~15 ثانية) لصفحة الرفض ويرى السبب **كما كتبه الإداري تماماً**.
3. الصفحة تعرض «ماذا تريد أن تفعل؟» مع زرين: **إعادة الدفع** يفتح `/payment`، و**تواصل مع الدعم** يطلب الرقم المُعدّ (tel) على الهاتف مع عرض الرقم `dir="ltr"`.
4. أغلق التسجيل من إعدادات الأدمن: يبقى خيار الدعم وحده مع جملة «انتهت فترة التسجيل، لم يعد إعادة الدفع متاحاً.»
5. امسح رقم الدعم (`contact_phone`): يختفي الزر ويظهر «تواصل مع مكتب الاتحاد.» بدون رابط.
6. بعد إعادة الدفع يعود التذكرة «قيد المعالجة» ويختفي السبب القديم.
7. سجل التدقيق يعرض `PAYMENT_REJECTED` مع `(reason: ...)` كاملاً.
