# قائمة المهام — مسار الرفض (branch: `fix/rejection-flow`)

الحالة: ⬜ لم تبدأ | ⏳ جارية | ✅ منجزة | ⛔ متوقفة

| ID | المهمة | الحالة | Commit | الدليل (Evidence) |
|----|--------|--------|--------|-------------------|
| A1.1 | إضافة سبب الرفض إلى `details` في سجل التدقيق `PAYMENT_REJECTED` | ✅ | 9d3d199 + commit A1 | `pytest tests/test_admin_payment_review.py` → 24 passed |
| A1.2 | اختبارات backend لحالات السبب (400/حدود 3..255/trim/رؤية الخريج/إعادة الإرسال/409/سجل التدقيق) | ✅ | commit A1 | أُضيفت 6 اختبارات؛ الاختبارات الموجودة مسبقاً: test_reject_requires_reason، test_reject_success_and_graduate_sees_reason، test_resubmission_with_new_number_after_reject (test_payment_submission)، test_my_ticket_rejected_shows_reason (test_my_ticket) |
| A1.3 | فاحص العقد `check_openapi_additive` + كامل حزمة backend + ملاحظة عربية في `docs/BACKEND_CHANGES.md` + تقرير Part A | ✅ | هذا الالتزام | `python -m scripts.check_openapi_additive` → OK 0 إضافات/0 كسر؛ الحزمة الكاملة `python -m pytest -q -p no:libtmux` → 459 passed / 2 failed (نفس فشلي خط الأساس، خارج النطاق)؛ أُضيف قسم A1 إلى `docs/BACKEND_CHANGES.md`؛ تقرير `docs/REPORT_PART_A_rejection-flow.md` |
| B1.1 | `front/src/config/rejectReasons.js` (`REJECT_REASON_PRESETS`) + `front/src/pages/admin/RejectReasonPresets.jsx` | ✅ | هذا الالتزام | ملفان جديدان؛ 5 أسباب (انظر ملاحظة D1 في التقرير) |
| B1.2 | استخدام الإعدادات الجاهزة في نافذة رفض `AdminPaymentRequests.jsx` + جملة D2 + عدّاد `n/255` + `aria-label` | ✅ | هذا الالتزام | presets فوق الـ textarea، جملة «سيظهر هذا السبب للخريج كما كُتب.»، عدّاد `n/255`، التحقق القديم 3..255 لم يُمس |
| B1.3 | اختبارات B1 (تفرّد الإعدادات، أطوالها، SSR render، فحص ثابت للنافذة) | ✅ | هذا الالتزام | `node --test tests/rejectReasonPresets.test.mjs` → 3 passed؛ الحزمة الكاملة `node --test tests/` → 124 passed / 0 failed؛ build ✓؛ oxlint 43 warnings = خط الأساس |
| B2.1 | `front/src/utils/rejection.js`: `supportHref` / `rejectionReasonText` / `rejectionActions` | ✅ | هذا الالتزام | ملف جديد نقي؛ قاعدة الهاتف `PHONE_REGEX` المعاد استخدامها من validators.js |
| B2.2 | اختبارات B2.1 (هواتف صحيحة/غير صحيحة، تسجيل مغلق، بلا هاتف، مسافات في السبب) | ✅ | هذا الالتزام | `node --test tests/rejectionUtils.test.mjs` → 9 passed / 0 failed؛ build ✓؛ oxlint 43 = خط الأساس |
| B3.1 | `front/src/components/RejectionOptions.jsx` (عنوان + زر إعادة الدفع + رابط الدعم + عبارات D5) | ✅ | هذا الالتزام | مكوّن جديد + أصناف CSS جديدة قليلة فوق or-* الموجودة؛ build ✓ oxlint 43 = خط الأساس |
| B3.2 | إعادة كتابة `OrderRejected.jsx` وفق D6/D5 مع الحفاظ على HelpFooter مرة واحدة وحالات التحميل/الخطأ | ✅ | هذا الالتزام | عبارات D6 الجديدة، حُذفت الدعوتان القديمتان، HelpFooter مرة واحدة، header/footer/loading/error/reload محفوظة |
| B3.3 | اختبارات B3 (SSR لأربع حالات + فحص ثابت لـ OrderRejected) | ✅ | هذا الالتزام | `node --test tests/rejectionOptions.test.mjs` → 5 passed؛ الحزمة الكاملة → 138 passed / 0 failed |
| B4.1 | ملاحظة عربية في `docs/FRONTEND_WIRING.md` (المسار، الملفات، القرارات D1-D6، كيفية التعديل) | ✅ | هذا الالتزام | قسم «مسار الرفض» مضاف في نهاية docs/FRONTEND_WIRING.md |
| B4.2 | فحوص نهائية (`npm ci`, `npm test`, `npm run build`, `npx oxlint src`) + `git diff --stat origin/dev` + تقرير Part B + التسليم per S11 | ✅ | هذا الالتزام | `npm ci` نجح؛ `node --test tests/` → 138 pass / 0 fail؛ `npm run build` → ✓ built؛ `npx oxlint src` → 43 warnings / 0 errors (= خط الأساس)؛ backend كامل → 459 passed / 2 failed (نفس فشلي خط الأساس، خارج النطاق)؛ contract checker → OK 0 إضافات/0 كسر؛ `git diff --stat` ضمن النطاق المسموح؛ تقرير `docs/REPORT_PART_B_rejection-flow.md` |

## Baseline (قبل أي تعديل)
- Backend full suite: `python -m pytest -q -p no:libtmux` → **453 passed, 2 failed** (فشلان موجودان أصلاً في البيئة: `test_get_graduates_me_unauthorized` و `test_endpoints_require_verification_token` — كلاهما 403 بدل 401، خارج نطاق العمل).
- Backend targeted (`test_admin_payment_review.py test_my_ticket.py test_payment_submission.py test_admin_graduate_details_enriched.py`): **46 passed**.
- Frontend: `npm ci` نجح؛ `node --test tests/` → **121 pass / 0 fail** (ملاحظة: سكربت `npm test` الحالي `node --test "tests/**/*.test.mjs"` يفشل على Node 20 لأنه لا يدعم glob — لم نعدّل package.json التزاماً بـ S7/S10، نشغّل `node --test tests/`).
- Frontend build: `npm run build` → **✓ built** (نجاح).
- Lint: `npx oxlint src` → **43 warnings, 0 errors** (Baseline).
