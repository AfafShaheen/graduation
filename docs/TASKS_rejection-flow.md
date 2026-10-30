# قائمة المهام — مسار الرفض (branch: `fix/rejection-flow`)

الحالة: ⬜ لم تبدأ | ⏳ جارية | ✅ منجزة | ⛔ متوقفة

| ID | المهمة | الحالة | Commit | الدليل (Evidence) |
|----|--------|--------|--------|-------------------|
| A1.1 | إضافة سبب الرفض إلى `details` في سجل التدقيق `PAYMENT_REJECTED` | ⬜ | - | - |
| A1.2 | اختبارات backend لحالات السبب (400/حدود 3..255/trim/رؤية الخريج/إعادة الإرسال/409/سجل التدقيق) | ⬜ | - | - |
| A1.3 | فاحص العقد `check_openapi_additive` + كامل حزمة backend + ملاحظة عربية في `docs/BACKEND_CHANGES.md` + تقرير Part A | ⬜ | - | - |
| B1.1 | `front/src/config/rejectReasons.js` (`REJECT_REASON_PRESETS`) + `front/src/pages/admin/RejectReasonPresets.jsx` | ⬜ | - | - |
| B1.2 | استخدام الإعدادات الجاهزة في نافذة رفض `AdminPaymentRequests.jsx` + جملة D2 + عدّاد `n/255` + `aria-label` | ⬜ | - | - |
| B1.3 | اختبارات B1 (تفرّد الإعدادات، أطوالها، SSR render، فحص ثابت للنافذة) | ⬜ | - | - |
| B2.1 | `front/src/utils/rejection.js`: `supportHref` / `rejectionReasonText` / `rejectionActions` | ⬜ | - | - |
| B2.2 | اختبارات B2.1 (هواتف صحيحة/غير صحيحة، تسجيل مغلق، بلا هاتف، مسافات في السبب) | ⬜ | - | - |
| B3.1 | `front/src/components/RejectionOptions.jsx` (عنوان + زر إعادة الدفع + رابط الدعم + عبارات D5) | ⬜ | - | - |
| B3.2 | إعادة كتابة `OrderRejected.jsx` وفق D6/D5 مع الحفاظ على HelpFooter مرة واحدة وحالات التحميل/الخطأ | ⬜ | - | - |
| B3.3 | اختبارات B3 (SSR لأربع حالات + فحص ثابت لـ OrderRejected) | ⬜ | - | - |
| B4.1 | ملاحظة عربية في `docs/FRONTEND_WIRING.md` (المسار، الملفات، القرارات D1-D6، كيفية التعديل) | ⬜ | - | - |
| B4.2 | فحوص نهائية (`npm ci`, `npm test`, `npm run build`, `npx oxlint src`) + `git diff --stat origin/dev` + تقرير Part B + التسليم per S11 | ⬜ | - | - |

## Baseline (قبل أي تعديل)
- Backend full suite: `python -m pytest -q -p no:libtmux` → **453 passed, 2 failed** (فشلان موجودان أصلاً في البيئة: `test_get_graduates_me_unauthorized` و `test_endpoints_require_verification_token` — كلاهما 403 بدل 401، خارج نطاق العمل).
- Backend targeted (`test_admin_payment_review.py test_my_ticket.py test_payment_submission.py test_admin_graduate_details_enriched.py`): **46 passed**.
- Frontend: `npm ci` نجح؛ `node --test tests/` → **121 pass / 0 fail** (ملاحظة: سكربت `npm test` الحالي `node --test "tests/**/*.test.mjs"` يفشل على Node 20 لأنه لا يدعم glob — لم نعدّل package.json التزاماً بـ S7/S10، نشغّل `node --test tests/`).
- Frontend build: `npm run build` → **✓ built** (نجاح).
- Lint: `npx oxlint src` → **43 warnings, 0 errors** (Baseline).
