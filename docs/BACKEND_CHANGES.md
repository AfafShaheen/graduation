# تغييرات الباك إند (BACKEND_CHANGES)

يُحدَّث هذا الملف في نهاية كل مرحلة، ويصف فقط ما تغيّر فعلياً في تلك المرحلة وما تراكم منها.

المرحلة الحالية: **Phase 3.5** (سجل تدقيق قابل للعرض، إجابات المتطوعين، إصلاح تصدير الأرقام وقفل محاولات OTP). تبقى تغييرات المراحل السابقة (حتى Phase 3 / M3) كما هي أدناه.

---

## 1. تغييرات عقد الـ API (API contract changes)

هذه أهم التغييرات التي يجب أن يعرفها مطوّر الواجهة:

| المسار | الشكل القديم | الشكل الجديد |
|---|---|---|
| `PATCH /api/graduates/me` | تعديل ذاتي بدون مصادقة، يأخذ `graduate_id` من الـ query | **حُذف** (يعيد 404). لا يوجد تعديل ذاتي للخريج في السير. |
| `PATCH /api/graduates/admin/{grad_id}` | تعديل بدون مصادقة إطلاقاً، ويقبل `email_verified` | **حُذف** (يعيد 404). تعديل بريد الخريج المثبَّت فقط عبر FR-22. |
| `POST /api/graduates/register` | يعيد `{status, message, graduate_id}` | يعيد أيضاً `verification_token` (JWT صلاحيته 30 دقيقة، `purpose=email_verification`) و`otp_sent` (bool). عند فشل الإرسال: 201 مع `otp_sent=false` ورسالة جزئية. |
| `POST /api/auth/verify-otp` | الجسم: `{graduate_id, code, purpose}` بدون مصادقة | الجسم: `{code}` فقط، مع `Authorization: Bearer <verification_token>`. عند النجاح يعيد `access_token` و`token_type` و`expires_in` (دخول مباشر بعد التأكيد، UC-1). |
| `POST /api/auth/resend-otp` | الجسم: `{graduate_id, purpose}` | **بدون جسم**، مع `Authorization: Bearer <verification_token>`. |
| `POST /api/auth/change-email` | الجسم: `{graduate_id, new_email}` | الجسم: `{new_email}` فقط، مع `Authorization: Bearer <verification_token>`. |
| `POST /api/auth/graduate/login` | عند بريد غير مؤكَّد: 403 برسالة نصية | عند بريد غير مؤكَّد: 403 والتفصيل كائن `{message, verification_token}` ليستكمل المستخدم التأكيد. |
| `GET /health` | `{"status": "healthy"}` ثابت | يفحص قاعدة البيانات و Redis: 200 مع `{"status":"healthy","details":{...}}` أو 503 `{"status":"unhealthy","details":{...}}`. |

**المرحلة 3 / M1 — نقاط جديدة:**

| المسار | النوع | الوصف |
|---|---|---|
| `GET /api/colleges` | عام (بدون مصادقة) | قائمة الكليات `[{id, name}]` مرتبة بالاسم لتعبئة نموذج التسجيل (FR-1، FR-3). |
| `GET /api/settings/public` | عام (بدون مصادقة) | `{contact_phone}` فقط؛ لا يكشف أي إعداد آخر (FR-2). |
| `GET /api/settings/shamcash-qr` | عام (بدون مصادقة) | `{shamcash_qr_image, shamcash_receiver_name, shamcash_account_number}` لعرض معلومات الدفع للخريج (FR-21). |
| `GET /api/admin/settings` | مدير | `{contact_phone, shamcash_receiver_name, shamcash_account_number, shamcash_qr_image}` (القيم الغائبة `null`). |
| `PUT /api/admin/settings` | مدير | جسم جزئي `{contact_phone?, shamcash_receiver_name?, shamcash_account_number?}`؛ القيمة الفارغة/المسافات تمسح الإعداد. يعيد الإعدادات بعد التحديث مع `message`. |
| `PUT /api/admin/settings/shamcash-qr` | مدير (multipart، الحقل `file`) | يتحقق من نوع الصورة ببايتات السحر (PNG/JPEG/WEBP) وحجم ≤ 1 ميغابايت، ويخزّنها كـ data URI. يعيد `{message, shamcash_qr_image}`. عند الفشل 400 برسالة `INVALID_IMAGE`. |
| `DELETE /api/admin/settings/shamcash-qr` | مدير | يحذف صورة رمز الدفع. يعيد `{message}`. |

**المرحلة 3 / M2 — نقاط جديدة:**

| المسار | المصادقة | الجسم/المعاملات | الاستجابة | الأخطاء |
|---|---|---|---|---|
| `GET /api/graduates/me/ticket-options` | خريج | — | `{event:{id,name,event_date}, registration:{is_open,start,end}, has_ticket, info_text, options:[{ticket_type,companions_count,price}]}` (خيار الـ3 مرافقين يظهر فقط عند تفعيله) | 403 `REGISTRATION_NOT_OPEN` |
| `POST /api/graduates/me/ticket` | خريج | `{ticket_type, confirm}` (حقول زائدة مرفوضة) | 201 ملخّص التذكرة (status `AWAITING_PAYMENT`) | 400 `TICKET_CHOICE_NOT_CONFIRMED`، 400 `THREE_COMPANIONS_DISABLED`، 403 `REGISTRATION_*`، 409 `TICKET_ALREADY_EXISTS` |
| `GET /api/graduates/me/payment-info` | خريج | — | `{amount, receiver_name, account_number, qr_image_url\|null, note_instruction}` | 404 `NO_TICKET`، 409 `PAYMENT_NOT_ALLOWED` |
| `POST /api/graduates/me/payment` | خريج | `{transaction_number, amount, sender_name}` (حقول زائدة مرفوضة) | 201 `{status:"PROCESSING", message}` | 422 (صيغة)، 404 `NO_TICKET`، 409 `PAYMENT_NOT_ALLOWED`/`TRANSACTION_ALREADY_USED`، 403 `REGISTRATION_*` |
| `GET /api/graduates/me/ticket` | خريج | — | بدون تذكرة: `{has_ticket:false, registration}`. مع تذكرة: `{has_ticket, ticket, event, message, payment_info?}` + عند `CONFIRMED` فقط: `qr_codes:[{id,code_type,code_value,is_activated,scanned}]` و`whatsapp_group_link` | — |
| `GET /api/admin/events/{event_id}/payments` | مدير | `status=PROCESSING` (أحد الحالات الأربع)، `limit` (1–200)، `offset` | `{total, items:[{ticket_id, graduate:{id,full_name,university_id,college_name}, ticket_type, price, status, payment:{transaction_number,amount,sender_name,submitted_at}\|null, amount_mismatch}]}` مرتبة زمنياً تصاعدياً | 404 (حفل غير موجود) |
| `GET /api/admin/tickets/{ticket_id}` | مدير | — | تفاصيل التذكرة والخريج وكامل سجلّ المدفوعات | 404 |
| `POST /api/admin/tickets/{ticket_id}/confirm` | مدير | — | `{status, message}`؛ يثبّت الدفع ويصدر الرموز في نفس المعاملة | 404، 409 `REQUEST_NOT_PROCESSING` |
| `POST /api/admin/tickets/{ticket_id}/reject` | مدير | `{reason}` (3–255 بعد التشذيب) | `{status, message}` | 400 `REJECT_REASON_REQUIRED`، 404، 409 `REQUEST_NOT_PROCESSING` |

**المرحلة 3 / M3 — نقاط جديدة:**

| المسار | المصادقة | الجسم/المعاملات | الاستجابة | الأخطاء |
|---|---|---|---|---|
| `POST /api/admin/scanners` | مدير | `{username, password, event_id}` | 201 `{id, username, event_id, created_at}` (لا كلمة سر ولا هاش) | 404 حفل غير موجود، 409 `SCANNER_USERNAME_TAKEN`، 422 (صيغة) |
| `GET /api/admin/scanners` | مدير | `event_id?` | قائمة الحسابات (بلا هاش) | — |
| `DELETE /api/admin/scanners/{scanner_id}` | مدير | — | `{message}`؛ يلغي الحساب مع إبقاء سجل المسح | 404 |
| `POST /api/scanner/auth/login` | عام | `{username, password}` | `{access_token, token_type, expires_in, event:{id,name,event_date}}` (الرمز صالح 12 ساعة) | 401 `SCANNER_LOGIN_FAILED`، 429 (تحديد معدل) |
| `POST /api/scanner/auth/logout` | ماسح | — | `{status, message}`؛ يلغي الرمز | 401/403 |
| `POST /api/scanner/scan` | ماسح | `{code}` (1–64) | 200 `{valid, decision, message, code_type\|null}` حيث `decision ∈ SUCCESS/NOT_FOUND/WRONG_EVENT/TICKET_NOT_CONFIRMED/ALREADY_USED/NOT_ACTIVATED` | 401 (ماسح غير موجود) |
| `GET /api/admin/stats` | مدير | `event_id?` | `{scope, graduates, tickets, ticket_types, expected_attendance, by_college, per_event?}` (بلا `per_event` عند تحديد حفل) | 404 حفل غير موجود |
| `GET /api/admin/export` | مدير | `event_id?` | ملف `.xlsx` (ورقة RTL واحدة، ترويسة عربية، صف لكل خريج مسجَّل) | 404 حفل غير موجود |

ملاحظات M3 للواجهة:
- نقطة المسح تعيد **200 دائماً** لكل نتيجة عمل مع العلم `valid`، ولا تحتوي أي بيانات شخصية للخريج (D13).
- رمز الماسح يحمل `role="scanner"` وصالح **12 ساعة** (وليس ساعتين كرموز الدخول الأخرى)؛ حفل الماسح يُقرأ من قاعدة البيانات دائماً ولا يُوثق به من الرمز (D11). حذف الماسح يُبطل رمزه فوراً.
- تصدير Excel يعيد `Content-Disposition: attachment` باسم ASCII مثل `graduation_export_<event_id|all>_<YYYYMMDD>.xlsx`، وكل الخلايا **نصوص** (تُحيَّد حقن الصيغ، D17).

قاعدة صارمة (FR-10، FR-22-c): في `GET /api/graduates/me/ticket` لا تُعاد أي قيم رموز QR ولا رابط واتساب لأي حالة غير `CONFIRMED`، حتى إن وُجدت صفوف رموز (بعد إرجاع تأكيد إداري).

ملاحظة للواجهة: كل مبالغ الدفع/الأسعار تُعاد **نصوصاً** (مثل `"100000.00"`) في عقود الخريج وفي نقاط مراجعة المدير.

لم يتغيّر عقد `POST /api/auth/forgot-password` و`POST /api/auth/reset-password` (يبقيان `email + code + new_password` في نداء واحد). ملاحظة للواجهة: شاشة «reset-otp» المنفصلة لا يمكنها التحقق من الرمز وحدها؛ يجب حمل الرمز إلى النداء النهائي. تغيّر سلوك `forgot-password` داخلياً فقط (إصدار الرمز في مهمة خلفية) — التفاصيل في القسم 4.

كما صار التحقق من سياسة كلمة السر مطبَّقاً على `password` في التسجيل و`new_password` في الاستعادة، ويعيد 422 عند المخالفة.

**المرحلة 2 (QR)**: منطق المسح الذرّي في `app.services.qr_service.scan_qr_code`؛ رُبط بنقطة HTTP موحّدة `POST /api/scanner/scan` في المرحلة 3 / M3. عقد نقاط إجراءات المدير الاستثنائية (القسم 6، FR-22) لم يتغيّر شكله لكن تغيّرت دلالاته: تفاصيل في القسم 4.

## 2. تغييرات قاعدة البيانات (Database changes)

أُدخل Alembic وأصبح تطور المخطط مُداراً بترقيات:

- `back/migrations/0001_init_schema.sql` ما زال يُنشئ المخطط الأساسي عند تهيئة حجم Postgres (لا يُعدَّل يدوياً).
- الترقية `0001_baseline` تمثّل حالة مخطط `0001_init_schema.sql` تماماً (فارغة)، لتختم قواعد البيانات الموجودة دون إعادة إنشاء.
- الترقية `0002_qr_constraints` تفرض دورة حياة رمز QR على مستوى القاعدة: تعبئة `is_activated=true` لرموز الخريجين الموجودين، إسقاط القيد القديم `chk_qr_scanned_fields`، وإضافة:
  - `chk_qr_scanned_at_requires_activation`: `scanned_at IS NULL OR is_activated` (لا وقت مسح لرمز غير مفعَّل).
  - `chk_qr_scanned_by_requires_scanned_at`: `scanned_by_scanner_id IS NULL OR scanned_at IS NOT NULL` (لا ماسح دون وقت مسح).
  - فهرس فريد جزئي `uq_qr_codes_graduate_ticket` على `qr_codes(ticket_id)` حيث `code_type='GRADUATE'` (رمز خريج واحد لكل تذكرة).
- تُشغَّل الترقيات تلقائياً عند إقلاع الحاوية (`alembic upgrade head` قبل `uvicorn`) وقبل اختبارات pytest.
- الـ downgrade يستعيد القيد القديم لكنه يفقد حالة «مفعَّل بلا مسح» (موثّق داخل ملف الترقية).

**المرحلة 3 / M1**: لا تغييرات مخطط؛ تُستخدم جداول `settings` و`colleges` و`audit_logs` القائمة.

**المرحلة 3 / M2**: لا تغييرات مخطط (D15)؛ تُستخدم جداول `tickets` و`payments` و`qr_codes` القائمة. المدفوعات بلا عمود حالة: الدفعة الحالية للتذكرة هي أحدث صف بحسب المعرّف (D16).

**المرحلة 3 / M3**: لا تغييرات مخطط (D15)؛ تُستخدم جداول `scanners` و`qr_codes` و`audit_logs` و`university_records` و`graduates` القائمة. حذف حساب الماسح آمن لسجل المسح لأن `qr_codes.scanned_by_scanner_id` مضبوط على `ON DELETE SET NULL`.

## 3. تغييرات البيئة والتشغيل (Environment / operations)

### متغيرات جديدة في نموذج متغيرات البيئة (من Phase 0)

| المتغير | القيمة الافتراضية | الوصف |
|---|---|---|
| `DATABASE_HOST_PORT` | `5433` | منفذ قاعدة البيانات على المضيف فقط، لتوجيه المنفذ المنشور. |
| `JWT_SECRET_KEY` | (بدون قيمة افتراضية) | مفتاح توقيع JWT. إلزامي وغير قابل للافتراض. |
| `APP_ENV` | `development` | بيئة التشغيل (`development` / `test` / `production`). |
| `CORS_ORIGINS` | `http://localhost:5173` | أصول مسموحة مفصولة بفواصل. |
| `SQL_ECHO` | `false` | طباعة استعلامات SQL في السجل. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | فارغة / `587` | إعدادات إرسال رمز التحقق عبر البريد. |

لا متغيرات بيئة جديدة في المرحلة 1. الجديد التشغيلي الوحيد: أُضيف `healthcheck` لخدمة `back` في `docker-compose.yml` باستخدام مكتبة بايثون القياسية (لا يوجد curl في الصورة).

**المرحلة 2**: لا متغيرات بيئة جديدة. صار إقلاع الحاوية يشغّل `alembic upgrade head` قبل `uvicorn` (عبر `command` في `docker-compose.yml` و`CMD` في `Dockerfile`)، لذا تُطبَّق الترقيات تلقائياً. عنوان قاعدة البيانات لا يُخزَّن في `alembic.ini`؛ يُقرأ من `app.core.database.DATABASE_URL`.

**المرحلة 3 / M1**: لا متغيرات بيئة جديدة ولا ترقيات قاعدة بيانات جديدة (جدول `settings` موجود من المرحلة 0).

**المرحلة 3 / M2**: لا متغيرات بيئة جديدة ولا تغييرات تشغيلية.

**المرحلة 3 / M3**: لا متغيرات بيئة جديدة ولا تغييرات تشغيلية. لا حزم زمن تشغيل جديدة (يُستخدم `openpyxl` الموجود مسبقاً للتصدير).

### ما يجب على كل زميل فعله بعد سحب `dev`

1. تأكد من أن ملف متغيرات البيئة المحلي يحتوي `JWT_SECRET_KEY` صالحاً (بلا مفتاح لن يقلع الباك إند).
2. أعد البناء: `docker compose up --build`، وتأكد أن `GET /health` يعيد 200.
3. أنشئ حساب المدير مرة واحدة إن لم يكن موجوداً (انظر القسم 5). لا يُنشأ أي مدير عبر HTTP.

## 4. تغييرات السلوك (Behaviour changes)

- **انتهاء صلاحية OTP**: صُحّح الحساب من `now.replace(minute=...)` (كان ينهار عند الدقيقة ≥ 50) إلى `now + timedelta(minutes=10)`.
- **مسار إصدار واحد**: `auth_service.issue_and_send_otp` يستخدمه التسجيل وإعادة الإرسال وتغيير البريد ونسيان كلمة السر. يضبط مدة الانتظار (60 ثانية) فقط بعد نجاح الإرسال، ويصفّر عدّاد المحاولات. لذا صار إعادة الإرسال مباشرة بعد التسجيل مرفوضة (429).
- **إرسال البريد**: لم يعد يُطبع الرمز في السجل. عند غياب SMTP: في `development`/`test` يُسجَّل الرمز بمستوى INFO ويعتبر الإرسال ناجحاً، وفي غير ذلك يفشل. عند `SMTPException`/`OSError` يفشل الإرسال دون كشف الرمز.
- **فشل الإرسال**: إعادة الإرسال وتغيير البريد يعيدان 503 برسالة عامة دون تثبيت مدة انتظار؛ التسجيل يعيد 201 مع `otp_sent=false` (يبقى الحساب منشأً)؛ نسيان كلمة السر يعيد النجاح العام دائماً (حتى لا يُكشف وجود البريد).
- **ملكية الرموز**: نقاط `verify-otp`/`resend-otp`/`change-email` تأخذ هوية الخريج من `verification_token` فقط، وترفض رموز الدخول ورموز التسجيل (401).
- **منع تسريب المعلومات**: فشل التحقق من بيانات الخريج (سجل غير موجود / كلية خاطئة / حقل غير مطابق / رقم جامعي مسجَّل) يعيد رسالة عامة واحدة بنفس الحالة؛ تسجيل بريد مكرَّر يعيد رسالة عامة ويلتقط `IntegrityError`؛ استعادة كلمة السر بريداً غير معروف تعيد نفس رد الرمز الخاطئ؛ تسجيل دخول الخريج يجري فحص bcrypt وهمياً للبريد المجهول. وعند وجود إعداد `contact_phone` يُضاف «رقم التواصل: ...» إلى رسالتي التحقق والتسجيل.
- **Redis**: فحص قائمة الرموز الملغاة يفشل مغلقاً (503 برسالة «الخدمة غير متاحة مؤقتاً»)؛ محدِّدات المعدل تفشل مفتوحة مع تسجيل WARNING. ملاحظة: `set_redis_cooldown` الجديد يسجّل تحذيراً؛ دوال كتابة الإلغاء في logout ما زالت تتجاهل أخطاء Redis بصمت (لم تُلمس).
- **سياسة كلمة السر (D4)**: 8 أحرف على الأقل، حرف ورقم على الأقل، 72 بايت UTF-8 كحد أقصى، عبر `validate_password_policy`.
- **مقارنة رموز OTP** صارت عبر `hmac.compare_digest`.
- **دورة حياة QR (D2، FR-12/24/25)**: أُعيدت كتابة `app.services.qr_service` بالكامل بشكل async. `issue_qr_codes_for_ticket` يعمل للتذكرة المؤكَّدة فقط (`CONFIRMED`) وداخل قفل `FOR UPDATE`: يُصدر رمز خريج واحد مفعَّل + رموز مرافقين غير مفعَّلة (2 أو 3 حسب `ticket_type`)، ويعيد قائمة الرموز (الموجودة إن أُصدرت سابقاً، أو الجديدة) — idempotent بلا تكرار. إن لم توجد التذكرة أو لم تكن `CONFIRMED` يرفع `TicketNotEligibleError` بدل إرجاع 0. `scan_qr_code` يمسح ذرّياً ويعيد `ScanResult` بترتيب قرار واضح: `NOT_FOUND` / `WRONG_EVENT` / `TICKET_NOT_CONFIRMED` / `ALREADY_USED` / `NOT_ACTIVATED` / `SUCCESS`؛ عند مسح رمز الخريج تُفعَّل رموز مرافقيه. لا يمكن مسح رمز مرافق قبل رمز الخريج. مسح برمز ماسح غير موجود يرفع `ScannerNotFoundError` (لا يتخطى فحص «الحفل الخاطئ» أبداً).
- **إجراءات المدير الاستثنائية (FR-22)**: `manual_check_in` يتطلب تذكرة `CONFIRMED` (وإلا 400 «التذكرة غير مؤكدة، لا يمكن تسجيل الدخول اليدوي»)، ويعيد 400 «تم تسجيل دخول الخريج مسبقاً» إن كان مسحوقاً، وإلا يفعّل رمز الخريج ومرافقيه مع ضبط حقول المسح. `revert_scan` يعيد 400 «لا يوجد مسح لإلغائه» إن لم يكن هناك مسح، وإلا يمسح حقول مسح رمز الخريج ويُبقي رمزه مفعَّلاً (ليُمسح مجدداً)، ويعيد مسح كل المرافقين ويلغي تفعيلهم (D5). `revert_payment` يعمل على تذكرة `CONFIRMED` فقط (وإلا 400)، ويعيدها `PROCESSING` مع `confirmed_at=NULL`.
- **سجل التدقيق (NFR)**: `app.services.audit_log.record_audit` async يُسجّل صفاً لكل محاولة مسح (`action='qr_scanned'`، `actor_type=SCANNER`، والتفصيل = قرار النتيجة)، إضافة إلى صفوف إجراءات المدير (`MANUAL_CHECK_IN` / `REVERT_SCAN` / `REVERT_PAYMENT` / `UPDATE_EMAIL`).
- **نسيان كلمة السر (مهمة خلفية)**: `forgot_password_service` يعيد رد النجاح العام فوراً لكل الحالات دون أي انتظار، ويؤجّل البحث عن الخريج وفحص مدة الانتظار وإصدار الرمز إلى مهمة خلفية تفتح جلسة `AsyncSessionLocal` خاصة بها (لأن جلسة الطلب تُغلق بعد الرد). لا ترفع المهمة الخلفية أي خطأ، وتُسجَّل الأعطال دون كشف الرمز. النتيجة: زمن الرد متطابق لبريد مسجَّل أو غير مسجَّل.
- **نافذة التسجيل (FR-3، FR-15، UC-1 alt-c)**: يُستنتج الحدث من الكلية المختارة في `verify-step1` و`register`؛ إن لم تكن الكلية مرتبطة بحدث نشط يُعاد فشل التحقق العام، وإن لم يبدأ التسجيل 403 `REGISTRATION_NOT_OPEN`، وإن انتهى 403 `REGISTRATION_CLOSED`.  الفحص يجري قبل مقارنة البيانات الشخصية.
- **ربط الكلية بحفل واحد (FR-14، UC-6 alt-a)**: عند إنشاء حفل، يُرفض أي اسم كلية مرتبط بحفل آخر بـ 400 `COLLEGE_LINKED_TO_OTHER_EVENT` (المقارنة بعد تطبيع الاسم العربي)، وتُدمج الأسماء المكررة داخل الحفل نفسه إلى كلية واحدة.
- **كشف أخطاء رمز التحقق**: صار كل فشل في `reset-password` (رمز خاطئ/منتهٍ/محاولات متجاوزة) يعيد 400 برسالة عامة واحدة `OTP_INVALID_GENERIC` دون كشف السبب.
- **تزامن OTP**: يجري جلب صف رمز التحقق بـ `SELECT ... FOR UPDATE` قبل التحقق/الاستهلاك في `verify-otp` و`reset-password` لمنع الاستخدام المزدوج تحت التزامن.
- **إعدادات المدير (FR-21، D12)**: نقاط المدير تقرأ وتعدّل رقم التواصل واسم وأرقام حساب الشام كاش، وترفع/تحذف صورة رمز الدفع (data URI، تُتحقق ببايتات السحر وحد 1 ميغابايت). كل تعديل يُسجَّل في سجل التدقيق (`SETTINGS_UPDATED` / `SHAMCASH_QR_UPDATED` / `SHAMCASH_QR_DELETED`).
- **اختيار التذكرة (FR-7، FR-8، D9، D10)**: `GET /api/graduates/me/ticket-options` يعرض نوعي التذكرة وسعريهما بحسب إعدادات الحفل (يُخفى خيار الـ3 مرافقين عند تعطيله) ونصّ توضيحي (`TICKET_INFO_TEXT`). الاختيار يتطلب `confirm=true` (وإلا 400)، ولا يعمل إلا داخل نافذة التسجيل (403)، وتذكرة واحدة لكل خريج (409، ويُلتقط سباق القيد الفريد ويعاد 409 أيضاً). السعر يُجمَّد لحظة الاختيار في التذكرة (لقطة). لا تُطلب أسماء المرافقين، فقط العدد (2 أو 3).
- **إرسال الدفع (FR-9، D16)**: `POST /api/graduates/me/payment` يقبل ثلاثة حقول فقط (رقم العملية، المبلغ، اسم المرسل). يُشذَّب رقم العملية ويُحوَّل لأحرف كبيرة ويطابق `^[A-Z0-9-]{4,100}$`؛ المبلغ `Decimal` موجب بمنزلتين عشريتين كحد أقصى؛ الاسم حروف ومسافات فقط (عربي/لاتيني). التذكرة تُقفل بـ `FOR UPDATE` أولاً. رقم عملية مسجَّل لتذكرة أخرى يعيد 409 `TRANSACTION_ALREADY_USED`، أما إعادة إرسال الرقم نفسه لنفس التذكرة فيُحدِّث صف الدفعة (المبلغ/المرسل و`reviewed_at=NULL`) دون صف جديد (D16). عند النجاح تصبح الحالة `PROCESSING` و`rejection_reason=NULL`. المبلغ المخالف للسعر يُعلَّم فقط (`amount_mismatch`) ولا يُمنع (D18).
- **«تذكرتي» (FR-5، FR-10، FR-12، FR-22-c)**: `GET /api/graduates/me/ticket` يعيد رسالة عربية بحسب الحالة، ومعلومات الدفع في حالتي `AWAITING_PAYMENT`/`REJECTED`، ورموز QR ورابط واتساب في حالة `CONFIRMED` فقط (رمز الخريج أولاً). أي حالة أخرى لا تكشف أي رمز أو رابط حتى لو وُجدت صفوف رموز.
- **مراجعة المدير (FR-17، FR-12)**: قائمة الطلبات تُصفّى بالحالة (افتراضياً `PROCESSING`) وتُرصّف زمنياً؛ `amount_mismatch` يوضّح اختلاف المبلغ عن سعر التذكرة. التأكيد يقفل التذكرة، ويتطلب حالة `PROCESSING` مع دفعة قائمة (وإلا 409 `REQUEST_NOT_PROCESSING`)، ويضبط `CONFIRMED`+`confirmed_at` و`reviewed_at`، ثم يصدر الرموز في **نفس المعاملة** (الفشل يُرجِع كل شيء، لا تذكرة نصف مؤكَّدة). الرفض يتطلب سبباً (3–255). كلاهما مسموح بعد انتهاء نافذة التسجيل، ويُسجَّل في التدقيق (`PAYMENT_CONFIRMED` / `PAYMENT_REJECTED`) مع إبطال مخزن بيانات المدير (`invalidate_admin_cache`).
- **حسابات الماسح (FR-20)**: `POST /api/admin/scanners` ينشئ حساباً (اسم بسيط `^[A-Za-z0-9_.-]{3,50}$`، كلمة سر عبر `validate_password_policy`، مُهشَّر بـ bcrypt، مرتبط بحفل واحد، و`created_by_admin_id` من رمز المدير)؛ اسم المستخدم فريد عالمياً (409 ويُلتقط سباق القيد الفريد). القائمة لا تكشف الهاش إطلاقاً. الحذف يُلغي الحساب فوراً ويسجّل `SCANNER_CREATED`/`SCANNER_DELETED` في التدقيق.
- **دخول الماسح (FR-23، D11)**: `POST /api/scanner/auth/login` يحدّد المعدل لكل اسم مستخدم (5 إخفاقات/15 دقيقة، فشل مفتوح مع تحذير)، ويجري فحص bcrypt وهمياً للاسم المجهول، ويعيد خطأً عاماً واحداً `SCANNER_LOGIN_FAILED` للاسم المجهول وكلمة السر الخاطئة. الرمز JWT بدور `scanner` صالح 12 ساعة، وحفل الماسح يُقرأ من صف قاعدة البيانات دائماً (لا يُوثق من الرمز)، ويُرفض فوراً عند حذف الحساب. تسجيل الخروج يُدرج الرمز في القائمة الملغاة.
- **المسح الموحّد (FR-24، FR-25، D13)**: `POST /api/scanner/scan` يمسح ذرّياً (`FOR UPDATE`) رمز الخريج أو المرافق ويعيد **دائماً 200** مع `{valid, decision, message, code_type}` دون أي بيانات شخصية. رمز المرافق قبل رمز الخريج يعيد `NOT_ACTIVATED`، ومسح رمز الخريج يفعّل رموز مرافقيه، وإعادة المسح `ALREADY_USED`؛ رمز حفل آخر `WRONG_EVENT`، ورمز غير معروف/مشوّه `NOT_FOUND`. كل محاولة تُسجَّل صف تدقيق واحداً (`qr_scanned`).
- **الإحصاءات (FR-18)**: `GET /api/admin/stats` يحسب بستعلامات تجميعية (بلا حلقات لكل صف، وبلا تخزين مؤقت، D14): المتوقّع/المسجَّل/غير المسجَّل، أعداد الدفع المؤكَّد/المرفوض/قيد المعالجة/بانتظار الدفع/لم يدفع، عدد كل نوع تذكرة ومؤكَّدها، الحضور المتوقّع (خريج + مرافقون) مقسّماً إلى «مؤكَّد» و«قيد المعالجة»، والتوزيع لكل كلية. عند تحديد `event_id` لا يُعاد مفتاح `per_event`؛ وعند حذفه تُعاد كتلة عامة إضافة إلى `per_event`. حفل بلا بيانات يعيد أصفاراً وقوائم فارغة (UC-9 alt).
- **تصدير Excel (FR-19، D17)**: `GET /api/admin/export` يبني ملف `.xlsx` بورقة واحدة RTL وترويسة عربية وصف لكل خريج مسجَّل (بيانات الخريج + التذكرة + الدفعة الحالية)؛ الخريج بلا تذكرة يظهر بخلايا تذكرة/دفع فارغة، وملف بلا بيانات يحتوي الترويسة فقط. **كل الخلايا نصوص**، وتُحيَّد حقن الصيغ (نصوص تبدأ بـ `=`/`+`/`-`/`@` تبقى نصاً خالصاً). العملية للمدير فقط ومُدقَّقة (`DATA_EXPORTED` بالنطاق وعدد الصفوف).

## 5. كيفية تشغيل الاختبارات

```bash
docker compose exec back sh -c "pip install -r requirements-dev.txt && pytest -q"
```

- قاعدة بيانات الاختبار `graduation_test` و Redis رقم 15 معزولتان تماماً. يوجد حاجز يمنع تشغيل الاختبارات على قاعدة لا ينتهي اسمها بـ `_test`.
- إعدادات التوافق: `asyncio_mode = auto`، وحلقة حدث واحدة للجلسة كاملة.
- آخر تشغيل: 184 اختباراً ناجحاً (145 حتى نهاية M2 + 9 لحسابات الماسح + 14 لدخول/مسح الماسح + 5 للإحصاءات + 6 لتصدير Excel + 5 للاختبارات العرضية والتكامل الشامل في M3).

### أوامر إنشاء المدير (من Phase 0)

```bash
docker compose exec back python -m scripts.create_admin --username admin
docker compose exec back python -m scripts.create_admin --username admin --reset-password
```

- كلمة سر المدير 12 محرفاً على الأقل، ويُرفض إنشاء مدير ثانٍ (SRS FR-13)، ولا يوجد endpoint HTTP لإنشاء المديرين.

## 6. القرارات (D1–D18)

- **D1**: Redis يبقى (تحديد المعدل، قائمة الرموز الملغاة، الـ cache). مقبول من المالك ولا يُزال.
- **D2**: دلالات QR: العمود `is_activated` يعني «مسموح له بالمسح»، والمرافقون يُفعَّلون بعد مسح رمز الخريج. لا إعادة تسمية ولا أعمدة جديدة (المرحلة 2).
- **D3**: لا يكشف أي endpoint إن كان الرقم الجامعي أو البريد مسجلاً؛ الرسائل عامة (نُفِّذ في المرحلة 1).
- **D4**: سياسة كلمة السر (8/حرف/رقم/72 بايت) — نُفِّذت في المرحلة 1.
- **D5**: `revert_scan` يمسح حقول مسح الخريج وكل المرافقين، ويُلغي تفعيل المرافقين فقط مع إبقاء رمز الخريج مفعَّلاً ليُمسح مجدداً (صُحّح في 2.5-1).
- **D6**: Redis: فحص قائمة الرموز يفشل مغلقاً (503)، ومحدِّدات المعدل تفشل مفتوحة مع WARNING (نُفِّذ في المرحلة 1).
- **D7**: كل رسالة للمستخدم عربية فقط، ورسائل المرحلة 1 في `app/core/messages.py`.
- **D8**: تغييرات عقد الـ API موثّقة هنا (القسم 1).
- **D12 (Phase 3)**: تُخزَّن صورة رمز دفع الشام كاش في جدول الإعدادات كـ data URI واحد (`data:image/...;base64,...`) بدل ملفات على القرص؛ يُتحقق من نوعها ببايتات السحر ومن حجمها (≤ 1 ميغابايت) قبل التخزين.
- **D9 (Phase 3)**: اختيار التذكرة وإرسال/(إعادة إرسال) الدفع مسموحان فقط داخل نافذة تسجيل الحفل (`ensure_registration_open`). مراجعة المدير (تأكيد/رفض) والدخول وعرض التذكرة و«تذكرتي» متاحة في أي وقت.
- **D10 (Phase 3)**: نوع التذكرة نهائي بعد الاختيار؛ أي اختيار ثانٍ يعيد 409.
- **D11 (Phase 3)**: رموز الماسح JWT بدور `scanner` صالحة 12 ساعة (لا ساعتين) مع `jti`؛ حفل الماسح يُقرأ من صف قاعدة البيانات دائماً ولا يُوثق به من الرمز؛ الماسح المحذوف يُرفض فوراً.
- **D13 (Phase 3)**: نقطة المسح تعيد 200 لكل نتيجة عمل مع علم `valid` دون أي بيانات شخصية للخريج (نُفِّذت في M3).
- **D14 (Phase 3)**: النقاط الجديدة غير مخزَّنة مؤقتاً؛ بعد أي تغيير في التذاكر/المدفوعات/رموز QR يُنادى `invalidate_admin_cache()`.
- **D15 (Phase 3)**: لا تغييرات مخطط ولا ترقية Alembic جديدة.
- **D16 (Phase 3)**: الدفعة الحالية للتذكرة هي أحدث صف `payments` بحسب المعرّف. إعادة إرسال رقم العملية نفسه لنفس التذكرة تُحدِّث ذلك الصف (`reviewed_at=NULL`) بدل إدراج صف جديد؛ الرقم نفسه لتذكرة أخرى مكرَّر (409).
- **D17 (Phase 3)**: تصدير Excel للمدير فقط ومُدقَّق، ويُحيّد حقن الصيغ (نصوص تبدأ بـ `=`/`+`/`-`/`@` تُكتب نصاً خالصاً) (نُفِّذت في M3).
- **D18 (Phase 3)**: تُستخدم `Decimal` للمبالغ. المبلغ المخالف لسعر التذكرة يُعلَّم للمدير (`amount_mismatch`) ولا يُمنع.

## 7. تتبّع متطلبات SRS (SRS traceability)

| المتطلب | الحالة | البند المسؤول |
|---|---|---|
| FR-1 (حقول الحساب، تخزين كلمة السر) | محقق | سياسة كلمة السر 1.6؛ قائمة الكليات العامة (`GET /api/colleges`) في M1. |
| FR-2 (تحقق عام دون كشف الحقل الخاطئ) | محقق | 1.4 (+ رقم التواصل من الإعدادات). |
| FR-3 (استنتاج الحدث من الكلية + فحص نافذة التسجيل) | محقق | M1: فحص النافذة في `verify-step1`/`register` ونقاط الكليات العامة. |
| FR-14 (إنشاء الحفل وربط الكليات بحفل واحد) | محقق | M1: رفض ربط كلية بحفلين (`COLLEGE_LINKED_TO_OTHER_EVENT`) ودمج الأسماء المكررة. |
| FR-15 (رسائل التسجيل غير مفتوح/مغلق) | محقق | M1: `REGISTRATION_NOT_OPEN` / `REGISTRATION_CLOSED`. |
| FR-21 (إعدادات المدير: رقم التواصل، صورة وبيانات دفع الشام كاش) | محقق | M1: نقاط `/api/admin/settings*` والنقاط العامة `GET /api/settings/public` و`GET /api/settings/shamcash-qr`. |
| FR-4 (OTP: 6 أرقام، 10 دقائق، مرة واحدة، قفل بعد 5، إعادة إرسال بعد دقيقة، تعديل البريد قبل التأكيد) | محقق | 1.2 + 1.3. |
| FR-5 (دخول بالبريد وكلمة السر مع تحديد المعدل) | محقق | 1.2/1.3/1.5؛ بيانات «تذكرتي» في M2 (`GET /api/graduates/me/ticket`). |
| FR-6 (استعادة كلمة السر عبر OTP بنفس الخصائص) | محقق | 1.2 + 1.4 (رد عام). |
| FR-7 (شرح أهمية التذكرة وشروطها قبل الاختيار) | محقق | M2: `TICKET_INFO_TEXT` في `GET /api/graduates/me/ticket-options`. |
| FR-8 (اختيار النوع/السعر مع تأكيد الاختيار، العدد دون الأسماء) | محقق | M2: `POST /api/graduates/me/ticket` (+ `companions_count` دون أسماء مرافقين). |
| FR-9 (بيانات دفع الشام كاش وإرسال ثلاثة حقول ورفض الرقم المكرر) | محقق | M2: `GET /api/graduates/me/payment-info` و`POST /api/graduates/me/payment` (D16/D18). |
| FR-10 (إظهار رابط واتساب عند التأكيد فقط) | محقق | M2: رابط المجموعة يُعاد في «تذكرتي» عند `CONFIRMED` فقط. |
| FR-11 (معرّف فريد لكل خريج) | موجود مسبقاً | المخطط. |
| FR-12 (QR فريد...) | محقق | 2.2 + 2.3 + 2.4 + إصدار الرموز عند تأكيد الدفع في M2 (`POST /api/admin/tickets/{id}/confirm`). |
| FR-13 (دخول المدير محدود المعدل) | محقق جزئياً | 0.3؛ الحساب الواحد مفروض في السكربت. |
| FR-17 (مراجعة طلبات الدفع ومطابقتها والتأكيد/الرفض) | محقق | M2: نقاط `/api/admin/events/{event_id}/payments` و`/api/admin/tickets/{id}` و`confirm`/`reject`. |
| FR-22 (إجراءات المدير الاستثنائية) | محقق | 2.5 + إصلاحات المراجعة 2.5-1/2.5-2 (مع 2.2/2.3 لدعم قيود المسح). |
| FR-18 (الإحصاءات لكل حفل أو كل الحفلات) | محقق | M3: `GET /api/admin/stats` (تجميعات SQL، بلا حجب بسعة القاعة، أصفار عند غياب البيانات). |
| FR-19 (تصدير Excel) | محقق | M3: `GET /api/admin/export` (openpyxl، RTL، ترويسة عربية، تحييد حقن الصيغ D17). |
| FR-20 (إنشاء حسابات الماسح وربطها بحفل) | محقق | M3: `POST/GET/DELETE /api/admin/scanners` (اسم فريد، bcrypt، مرتبط بحفل واحد). |
| FR-23 (دخول الماسح من متصفح الهاتف وربطه بحفل) | محقق | M3: `POST /api/scanner/auth/login` (رمز 12 ساعة، الحفل من قاعدة البيانات). |
| FR-24/25 (رسائل الماسح الموحّدة، مسح ذرّي مرة واحدة) | محقق | 2.4 (قفل `FOR UPDATE` + ترتيب القرار) + 2.6 (تدقيق كل محاولة) + M3: `POST /api/scanner/scan` عبر HTTP (200 دائماً + `valid`، بلا بيانات شخصية، D13). |
| NFR (bcrypt/argon2) | محقق | 0.3 للمدير؛ التسجيل والعودة يستخدمان bcrypt. |
| NFR (OTP مخزَّن مُهشَّراً، قصير الأجل، مرة واحدة) | محقق | موجود مسبقاً + 1.2 (انتهاء صحيح). |
| NFR (عدم كشف وجود بريد/رقم) | محقق | 0.3 + 1.4. |
| NFR (تحديد المعدل للدخول وإدخال OTP) | محقق | موجود مسبقاً + 1.5 (فشل مفتوح مع تحذير). |
| NFR (سجل تدقيق لإجراءات المدير والمسح) | محقق | 2.6 (مع 2.5 لإجراءات المدير). |
| CORS + Health | محقق | 0.4 + 1.5. |

## 8. ما لم يُنجَز بعد (Still not done)

- **HTTPS / وسيط عكسي (reverse proxy)**: ضمن مرحلة النشر خارج نطاق الباك إند الحالي.
- **النسخ الاحتياطي المُجدول لقاعدة البيانات**: ضمن مرحلة النشر.
- **اختبار حمل لمسار المسح** (عدة أجهزة في اللحظة نفسها): لم يُنفَّذ اختبار حمل، وقد اختُبر التزامن على مستوى الاختبارات فقط.
- **ربط شاشة/جهاز الماسح بالواجهة (front/)**: منطق المسح جاهز عبر HTTP، لكن شاشة الماسح في الواجهة الأمامية مسؤولية مطوّر الواجهة.
- **إشعارات البريد**: خارج نطاق المرحلة 3 (لا إشعارات بريدية بعد التسجيل).

---

# المرحلة 3.5 (Phase 3.5)

قاعدة صارمة (D23 — تجميد العقد): **لم تتغيّر أي نقطة قائمة** (المسار، الطريقة، حقول الطلب/الاستجابة، رموز الحالة، الرسائل). المرحلة 3.5 **تُضيف** نقاطاً فقط.

## 9.1 نقاط جديدة في عقد الـ API (Phase 3.5)

| المسار | المصادقة | المعاملات/الجسم | الاستجابة | الأخطاء |
|---|---|---|---|---|
| `GET /api/admin/audit-logs` | مدير | `event_id`، `action` (يمكن تكراره)، `actor_type` (`ADMIN`\|`SCANNER`)، `graduate_id`، `ticket_id`، `q` (اسم الخريج أو رقمه الجامعي، ≤ 100 محرف)، `date_from`، `date_to` (ISO، شاملان)، `exceptional_only` (bool)، `include_scans` (bool، افتراضي `false`)، `limit` (1–200، افتراضي 50)، `offset` | `{total, items:[...]}` مرتبة `created_at` تنازلياً ثم `id` تنازلياً؛ كل عنصر: `{id, created_at, actor:{type, id, username\|null, role_label}, action, action_label, target, details, event_id, ticket_id, graduate:{id, full_name, university_id}\|null}` | 422 عند `actor_type` غير معروف أو تواريخ مشوّهة |
| `GET /api/graduates/me/volunteer-answers` | خريج | — | `{answered, wants_responsibility, has_experience}` حيث القيمتان `"yes"`\|`"no"`\|`null` | 403 لخريج غير مؤكَّد البريد |
| `PUT /api/graduates/me/volunteer-answers` | خريج | `{wants_responsibility, has_experience}` (القيم `"yes"`\|`"no"`، حقول زائدة مرفوضة) | 200 بنفس شكل `GET` | 422 (قيمة/حقل غير صالح) |
| `GET /api/admin/volunteers` | مدير | `event_id`، `college_id`، `q` (اسم/رقم جامعي/هاتف)، `wants_responsibility`، `has_experience`، `sort` (`newest` افتراضي\|`name`\|`college`)، `limit` (1–200، افتراضي 10)، `offset` | `{stats:{all, wants, experienced, both}, total, items:[{id, graduate_id, full_name, university_id, college_id, college_name, phone, wants_responsibility, has_experience, registered_at}]}` | 404 حفل غير موجود |
| `GET /api/admin/volunteers/export` | مدير | نفس مرشّحات القائمة بدون ترقيم الصفحات | ملف `.xlsx` (RTL، ترويسة عربية) | 404 حفل غير موجود |

تفاصيل مهمة لسجل التدقيق:
- `role_label`: `ADMIN` → «مسؤول الاتحاد»، `SCANNER` → «ماسح».
- `action_label` عربي من `app/core/messages.py`؛ إن كان الإجراء غير معروف يُعاد رمزه الخام كما هو دون فشل.
- افتراضياً تُستبعد محاولات المسح `qr_scanned`؛ لإظهارها يُمرَّر `include_scans=true` (D22).
- `exceptional_only=true` يحصر النتائج في الإجراءات الاستثنائية: `MANUAL_CHECK_IN`، `REVERT_SCAN`، `REVERT_PAYMENT`، `UPDATE_EMAIL`.
- أسماء الفاعلين والخريجين تُحلّ بدفعات (بلا N+1)؛ الفاعل أو الخريج المحذوف يظهر `null` (الصف يبقى لأن المرجع بلا مفتاح أجنبي، D21).
- حرفا `%` و`_` في `q` يُطابقان حرفياً (escaping).

## 9.2 تغييرات قاعدة البيانات (Phase 3.5)

- `0003_audit_log_refs`: تُضيف إلى `audit_logs` ثلاثة أعمدة صحيحة قابلة للـ `NULL`: `event_id` و`graduate_id` و`ticket_id`، مع فهارس عليها. **بلا مفاتيح أجنبية** (D21) ليبقى الأثر بعد حذف الكيان، و**بلا تعبئة رجعية** (الصفوف القديمة تبقى `NULL`). الـ downgrade يسقط الفهارس ثم الأعمدة.
- `0004_volunteer_answers`: تُنشئ جدول `volunteer_answers`: `id` (PK)، `graduate_id` (عدد صحيح `NOT NULL`، فريد، مفتاح أجنبي إلى `graduates(id)` على `ON DELETE CASCADE`)، `wants_responsibility` (bool `NOT NULL`)، `has_experience` (bool `NOT NULL`)، `created_at` و`updated_at` (`timestamptz NOT NULL DEFAULT now()`). الـ downgrade يسقط الجدول.
- **الترقية تلقائية**: عند `docker compose up --build` تُشغَّل `alembic upgrade head` قبل `uvicorn`، فترتفع قاعدة بيانات قائمة (مثلاً عند `0002_qr_constraints`) إلى `0004` بلا فقدان بيانات وبلا أي خطوة يدوية.

## 9.3 تغييرات السلوك (Phase 3.5)

- **توحيد سجل التدقيق**: صارت كل كتابات التدقيق تمرّ عبر `app.services.audit_log.record_audit` (لا يوجد `write_audit_log` منفصل بعد الآن)، وتُعبّأ المراجع `event_id`/`graduate_id`/`ticket_id` عند توفّر المعلومة. أُضيف `ticket_id` إلى `ScanResult` وسجّلت محاولات المسح مرجع حفل الماسح.
- **تصدير Excel — أرقام حقيقية**: في `GET /api/admin/export` تُكتب `companions_count` و`price` و`amount` كخلايا **رقمية** (يمكن لـ Excel جمعها)، بينما يبقى كل نص يتحكّم به المستخدم خلية نصية صريحة (حقن الصيغ مُحيَّد، D17) والتواريخ تبقى نصاً بصيغة ISO.
- لا متغيرات بيئة جديدة ولا حزم زمن تشغيل جديدة.

## 9.4 ميزة المتطوعين — امتداد SRS (FR-26)

هذه الميزة **ليست** في ملف SRS الأصلي؛ هي امتداد مقترح بمعرّف **FR-26** (لم يُعدَّل ملف SRS). النص العربي المقترح للمتطلب:

> **FR-26 (إجابات المتطوعين)** — يستطيع الخريج، بعد تأكيد بريده، تسجيل رغبته في تولّي مسؤولية في الحفل وما إذا كان لديه خبرة سابقة، عبر سؤالين بقيمتين نعم/لا لكلٍّ منهما. الإجابة اختيارية ومستقلة تماماً عن مسار التذكرة والدفع، ويمكن تعديلها في أي وقت (تحديث واحد لكل خريج). تعرض لوحة المدير قائمة المتطوعين مع إحصاءات مجمّعة (الكل، الراغبون بالمسؤولية، أصحاب الخبرة، الراغبون وذوو الخبرة) وتتيح تصديرها إلى Excel. بيانات المتطوعين شخصية، لذا فهي متاحة للمدير فقط والتصدير مُدقَّق.

- النقاط الأربع: `GET/PUT /api/graduates/me/volunteer-answers`، `GET /api/admin/volunteers`، `GET /api/admin/volunteers/export`.
- القيم في الـ API حصراً `"yes"`/`"no"` (تُخزَّن منطقياً كـ boolean)، والإجابة تُحدَّث upsert (D20)، و`updated_at` يتغيّر مع كل تحديث.
- `stats` تعتمد على `event_id` فقط (تتجاهل بقية المرشّحات)، بينما `total` هو عدد الصفوف بعد كل المرشّحات.
- تصدير المتطوعين: ورقة RTL بترويسة عربية (`الاسم الكامل، الرقم الجامعي، الكلية، الهاتف، يرغب بتولي مسؤولية، لديه خبرة، تاريخ التسجيل`)، القيم نصية صريحة (تحييد حقن الصيغ)، نتيجة فارغة → ملف بالترويسة فقط، والتصدير مُدقَّق `DATA_EXPORTED` بنطاق `scope=volunteers` وملخّص المرشّحات وعدد الصفوف دون أي بيانات شخصية. تصدير PDF يبقى من جهة الواجهة.

## 9.5 ملاحظات لمطوّر الواجهة (Phase 3.5)

- **صفحة المتطوعين**: تُبنى أعمدة الكلية من معرّفات/أسماء الكليات القادمة من `GET /api/colleges`، لا من قائمة كليات ثابتة في الواجهة.
- قيم `wants_responsibility`/`has_experience` عبر الـ API هي `"yes"`/`"no"` (وليست `true`/`false`).
- في `GET /api/admin/volunteers` تظل `stats` مستقلة عن المرشّحات؛ لا تعِد حسابها محلياً من الصفحة الحالية.
- تصدير PDF للمتطوعين مسؤولية الواجهة (الباك إند يوفّر `.xlsx` فقط).
- **جدول سجل التدقيق** (`GET /api/admin/audit-logs`) يجب أن يعرض: `actor.username` مع `role_label`، و`action_label`، و`details`، و`graduate.full_name`، و`ticket_id` كرقم (لا نص).
- **حقول واجهة لا وجود لها في الباك إند ويجب حذفها/استبدالها**: «القسم/الشعبة» (department)، «السنة» (year)، «عدد المقاعد» (seats)، «رقم الاستمارة» (form number)، «بوابة المسح» (scan gate)، وأكواد تذاكر بأسلوب `ENG-88291` (المعرّف الفعلي رقمي `ticket_id`).

## 9.6 تجميد العقد وإعادة توليد لقطة الـ OpenAPI

- يوجد حاجز آلي `back/tests/test_openapi_contract.py` يقارن مخطط التطبيق الحيّ بلقطة مجمّدة في `back/tests/contract/openapi_baseline.json`؛ **يفشل فقط** إذا تغيّرت نقطة قائمة أو اختفت. إضافة نقطة جديدة لا تفشل (لكن اللقطة تتغيّر).
- عند إضافة/تغيير نقاط **بقصد** وبعد اجتياز كل الاختبارات، أعد التوليد داخل الحاوية ثم التزم:
  ```bash
  docker compose exec back python -m scripts.update_openapi_baseline
  ```
  فيُعاد كتابة `back/tests/contract/openapi_baseline.json` (يُلتزم بالتغيير). لا تُعدّل اللقطة يدوياً.

## 9.7 القرارات (D19–D24)

- **D19**: واجهة الخريج للمتطوعين تستخدم قيم نصية `"yes"`/`"no"` وتخزّنها منطقياً كـ boolean.
- **D20**: إجابات المتطوعين اختيارية ومستقلة عن مسار التذكرة، والإجابة الثانية تُحدِّث الصف نفسه (upsert) لا تُنشئ صفاً جديداً.
- **D21**: أعمدة مراجع سجل التدقيق (`event_id`/`graduate_id`/`ticket_id`) أعداد صحيحة قابلة للـ `NULL` **بلا مفاتيح أجنبية** وبلا تعبئة رجعية.
- **D22**: عارض سجل التدقيق يستبعد `qr_scanned` افتراضياً، مع `include_scans` لإظهارها و`exceptional_only` لحصر الإجراءات الاستثنائية.
- **D23**: تجميد العقد — لا تتغيّر أي نقطة قائمة في هذه المرحلة؛ الإضافة فقط.
- **D24**: بيانات المتطوعين شخصية، لذا نقاطها ولوحة عرضها وتصديرها للمدير فقط، والتصدير مُدقَّق.

## 9.8 ما لم يُنجَز بعد (Phase 3.5)

- **مُبقي بقصد ولم يُلمس**: قيمة إجراء المسح المطبوعة `qr_scanned` (حرف صغير) كما هي في قاعدة البيانات، وبعض النصوص العربية المضمَّنة خارج `app/core/messages.py`، وتحذيرات `setex` المهملة (كلها في مرحلة تنظيف لاحقة).
- **تصدير PDF**: يبقى من جهة الواجهة (الباك إند يوفّر `.xlsx` فقط).
- **اختبار حمل حقيقي لمسار المسح/التصدير**: ما زال ضمن مرحلة النشر.

---

# المرحلة 4.1 (Admin Filters for Top-3 Graduates & Volunteers)

## 11.1 معاملات التصفية الجديدة لـ الإداري (Admin Filters)

### 1. المتطوعون (`GET /api/admin/volunteers` & `/export`)
- `top_rank`: تصفية بحسب الترتيب (`1`, `2`, `3`, `any` للأول والثاني والثالث، أو `none` لغير الأوائل).

### 2. الخريجون (`GET /api/admin/graduates`)
- `top_rank`: نفس قيم المتطوعين (`1`, `2`, `3`, `any`, `none`).
- `wants_responsibility`: `"yes"` أو `"no"`.
- `has_experience`: `"yes"` أو `"no"`.
- `volunteer_answered`: `true` (من أجاب) أو `false` (من لم يجب).
- `event_id`: معرّف الحفل (يعيد 404 إن لم يوجد).
- `major_id`: معرّف التخصص.

> **قاعدة «لا صف مقابل لا» (No row vs. Answered No):**  
> عند التصفية بـ `wants_responsibility=no` أو `has_experience=no`، يتم مطابقة الخريجين الذين أجابوا صراحةً بـ «لا» فقط، ولا يتم تضمين الخريجين الذين لم يسجلوا إجابة قط (أصحاب السجل الفارغ/Null). لمعرفة من لم يجب، تُستخدم `volunteer_answered=false`.

### أمثلة على الروابط (Example URLs):
1. `/api/admin/graduates?top_rank=any&event_id=3` (جميع الأوائل الثلاثة لحفل معيّن).
2. `/api/admin/volunteers?wants_responsibility=yes&top_rank=1` (متطوعون راغبون بالمسؤولية من الحاصلين على المركز الأول).
3. `/api/admin/graduates?volunteer_answered=false&event_id=3` (الخريجون الذين لم يسجلوا إجابات تطوع بعد لحفل معيّن).

## 11.2 واجهة الإدارة الأمامية (Admin Frontend Query Strings)
أمثلة على خيوط الاستعلام (Query Strings) للقوائم المنسدلة:
- تصفية الأوائل: `?top_rank=1`, `?top_rank=any`, `?top_rank=none`
- تصفية إجابات المتطوعين: `?volunteer_answered=true&wants_responsibility=yes`
- تصفية بحفل وتخصص: `?event_id=1&major_id=101`


---

# المرحلة 4 (Major / GPA / Top-3 Rank)

تُضيف هذه المرحلة دعم التخصصات الأكاديمية (Majors)، المعدل التراكمي (GPA)، وحساب الترتيب على التخصص (Top-3 Rank).

## 10.1 النقاط الجديدة والمُعدّلة في عقد الـ API

| المسار | المصادقة | المعاملات/الجسم | الاستجابة | الأخطاء |
|---|---|---|---|---|
| `GET /api/registration/colleges` | عام | — | قائمة الكليات مع التخصصات المرتبة (`id`, `name`, `event_id`, `majors:[{id,name}]`) للحفلات المفتوحة (مؤقتة في Redis لمدة 60 ثانية). | — |
| `GET /api/admin/colleges/{college_id}/majors` | مدير | — | قائمة تخصصات الكلية (`[{id, name, college_id}]`) مرتبة بالاسم. | 404 الكلية غير موجودة |
| `POST /api/admin/colleges/{college_id}/majors` | مدير | `{name}` | 201 `{id, name, college_id}` | 400 تخصص موجود مسبقاً، 404 الكلية غير موجودة |
| `PUT /api/admin/majors/{major_id}` | مدير | `{name}` | `{id, name, college_id}` | 400 تخصص موجود مسبقاً، 404 التخصص غير موجود |
| `DELETE /api/admin/majors/{major_id}` | مدير | — | `{status, message}` | 400 لا يمكن الحذف لارتباطه بخريجين أو سجلات جامعية، 404 |
| `POST /api/graduates/verify-step1` | عام | `..., major_id?, gpa, top_rank?` | `{valid: true, registration_token}` | 400 فشل تحقق عام (عند أي عدم مطابقة للبيانات، المعدل، التخصص، أو الترتيب)، 403 (إغلاق التسجيل) |

## 10.2 تغييرات قاعدة البيانات (Phase 4)
- جدول `majors`: `id` (PK)، `name` (varchar 255)، `college_id` (FK إلى `colleges.id` على `ON DELETE CASCADE`)، مع قيد فريد مركب على `(college_id, name)` وفهرس على `college_id`.
- جدول `graduates`: إضافة أعمدة `major_id` (FK إلى `majors.id`), `gpa` (Numeric 5,2), `top_rank` (SmallInt)، مع قيود `chk_graduate_gpa_range` (0–100) و`chk_graduate_top_rank` (NULL أو 1,2,3) وفهرس على `major_id`.
- جدول `university_records`: إضافة أعمدة `major_id` (FK) و`gpa` (Numeric 5,2)، مع قيد `chk_uni_record_gpa_range` (0–100) وفهرس مركب `idx_uni_records_ranking` على `(event_id, college_id, major_id, gpa DESC)`.
- ترقية Alembic: `0005_majors_gpa_rank`.

## 10.3 السلوك وتغييرات التحقق (Phase 4)
- **رفع السجلات الجامعية**: عمود `gpa` أصبح إجبارياً وصحيحاً (0–100، بحد أقصى منزلتين عشريتين، يقبل الأرقام العربية-الهندية والفاصلة `,` أو `٫`). عمود `major` اختياري يُطابق بالتطبيع العربي ضمن الكلية حصراً (لا يُنشئ أي تخصص جديد من الملف).
- **التحقق (Step 1)**: يتحقق مطابقة `major_id` (يجب أن ينتمي لنفس الكلية ويتطابق مع السجل)، ومطابقة `gpa` (تقريب لمنزلتين عشريتين)، وحساب الترتيب بدقة عبر الترتيب الكثيف (`compute_top_rank`). أي اختلاف يعيد فشل التحقق العام دون كشف الحقل المخالف.
- **تصدير Excel**: أُضيفَت أعمدة «التخصص»، «المعدل»، و«الترتيب» (الأول/الثاني/الثالث) في نهاية تقرير المتخرجين.

