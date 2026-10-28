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

- كلمة سر المدير: **12 محرفاً على الأقل في `production`** و**4 محارف على الأقل في `development`/`test`** (لسماح كلمات سر التطوير القصيرة)، ويُرفض إنشاء مدير ثانٍ (SRS FR-13)، ولا يوجد endpoint HTTP لإنشاء المديرين. يمكن تمرير كلمة السر عبر `--password`. (المصدر: `scripts/create_admin.py`، المرحلة 4.2.)

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

# الإصلاح F6 (Fix F6): ترويسات ملف الجامعة العربية

المستورد `POST /api/admin/events/{event_id}/university-records` (FR-15 / القسم 4.4) صار يقبل **الترويسات العربية** إلى جانب الإنجليزية. **عقد النقطة لم يتغيّر**: نفس المسار والطريقة والمعاملات وشكل الاستجابة (HTTP 200 مع `{added, updated, skipped, errors}`) ورموز الحالة والرسائل. التغيير في قراءة الملف فقط.

## 11.1 الترويسات المقبولة

| الحقل القانوني (canonical) | الترويسة العربية | الترويسة الإنجليزية |
|---|---|---|
| `university_id` | الرقم الجامعي | `university_id` |
| `full_name` | الاسم الكامل | `full_name` |
| `father_name` | اسم الأب | `father_name` |
| `mother_name` | اسم الأم | `mother_name` |
| `college` | الكلية | `college` |
| `gender` | الجنس | `gender` |
| `gpa` | المعدل | `gpa` |
| `major` | التخصص | `major` |

- يمكن استخدام الترويسات العربية أو الإنجليزية أو **خليط منهما في الملف نفسه**؛ يُعيد المستورد تسمية كل عمود مطابق إلى اسمه القانوني (`university_id`, `full_name`, ...) قبل التحقق.
- المطابقة **متسامحة**: تتجاهل حالة الأحرف (case)، والفرق بين صور الهمزة (أ/إ/آ/ا)، والتاء المربوطة/الهاء (ة/ه)، والألف المقصورة/الياء (ى/ي)، وعلامات الاتجاه والعرض الصفري غير المرئية (BOM `\ufeff`، `\u200b-\u200f`، `\u202a-\u202e`، `\u2066-\u2069`)، ومسافة NBSP، والمسافات الزائدة. لذا «اسم الأب» تُطابق «اسم الاب»، و«الكلية» تُطابق «الكليه»، و«University_ID» تُطابق «university_id».
- الأعمدة غير المطابقة تُتجاهَل كما كان (تُقلَّم وتُصغَّر الأحرف فقط).

## 11.2 رسالة الأعمدة المفقودة (أصبحت عربية وحتمية الترتيب)

عند غياب أعمدة مطلوبة تعود الرسالة داخل `errors` بالصيغة:

```
الأعمدة التالية مفقودة في الملف: <الأسماء العربية بالترتيب القانوني مفصولة بـ «، »>
```

مثال: `الأعمدة التالية مفقودة في الملف: اسم الأب، اسم الأم، الكلية، الجنس، المعدل`. (سابقاً كانت الأسماء الإنجليزية وبترتيب غير حتمي من `set`. عمود «التخصص» اختياري فلا يظهر في هذه الرسالة.)

## 11.3 خطأ تطابق عمودين مع الحقل نفسه

إذا تطابق مصدران (مثلاً «الاسم الكامل» و`full_name`) مع الحقل القانوني نفسه، تُعاد **HTTP 400** برسالة عربية تُسمّي الحقل والترويسين، مثال:

```
عمودان في الملف يمثلان الحقل نفسه "الاسم الكامل": "الاسم الكامل" و "full_name".
```

## 11.4 قراءة ملفات CSV العربية (F6.2)

لملفات `.csv` فقط:

- **الترميز**: يُجرَّب `utf-8-sig` أولاً (يتعامل مع BOM)، وعند فشل الفك يُجرَّب `cp1256` (Windows-1256 الشائع في تصدير Excel العربي)؛ إن فشل الاثنان تبقى رسالة 400 الحالية «فشل في قراءة الملف: ...». الملفات الثنائية (تحتوي بايت `NUL`) تُرفض بـ 400.
- **الفاصل**: يُكتشف من السطر الأول بين `,` و`;` وTab (الأكثر تكراراً، والافتراضي `,`)، فيُقرأ الملف بالفاصل المكتشف. يدعم ذلك ملفات Excel العربية المفصولة بـ `;`.
- معالجة `.xlsx`/`.xls` لم تتغيّر.

**ما يجب على الزملاء فعله بعد السحب:** لا شيء؛ المستورد يقبل الترويسات القديمة والجديدة معاً، وقالب الواجهة بالترويسات العربية صار يعمل مباشرة.

---

# المرحلة 4.2 (إصلاح حزمة اختبارات الباك إند ومزامنة العقد)

هدف هذه المرحلة: جعل مجموعة اختبارات الباك إند خضراء بالكامل، وإضافة نقطة واحدة فقط إلى عقد الـ API. لم تتغيّر أي نقطة قائمة (المسار/الطريقة/شكل الاستجابة)؛ الإضافة فقط (D23).

## 12.1 نقطة جديدة في العقد (Phase 4.2)

| المسار | المصادقة | الاستجابة | الأخطاء |
|---|---|---|---|
| `GET /api/graduates/me` | خريج (`Bearer`) | `{full_name, university_id, college_name, major_name\|null, gpa\|null, top_rank\|null, unique_graduate_code}` | 401 بلا رمز صالح، 403 لخريج غير مؤكَّد البريد |

- تُعاد بيانات الخريج الأساسية مع اسم الكلية واسم التخصص (إن وُجد). أُعيد توليد لقطة الـ OpenAPI بعد الإضافة عبر `docker compose exec back python -m scripts.update_openapi_baseline`.

## 12.2 تغييرات السلوك (Phase 4.2)

- **سجل التدقيق للتخصصات**: تمرّ كتابات تدقيق إنشاء/تعديل/حذف التخصص الآن عبر `app.services.audit_log.record_audit` (لا helper منفصل)، بأفعال `CREATE_MAJOR`/`UPDATE_MAJOR`/`DELETE_MAJOR` وعرض عربي «إنشاء تخصص»/«تعديل تخصص»/«حذف تخصص»، مع تعبئة `event_id` من كلية التخصص.
- **تصدير Excel**: عمود «المعدل» أصبح خلية رقمية (بدل نص) ليمكن جمعه في Excel؛ الأعمدة الثلاثة الخاصة بالتخصص/المعدل/الترتيب تبقى متوافقة مع تحييد حقن الصيغ (D17).
- **منع كشف الرقم الجامعي المسجَّل مسبقاً**: في `POST /api/graduates/verify-step1` نُقل فحص «الرقم الجامعي مسجَّل مسبقاً» ليكون آخر فحص قبل إصدار رمز التسجيل، فلا يُكشف التسجيل المسبق إلا بعد التحقق الكامل من مطابقة السجل الجامعي؛ وكل إخفاقات التحقق تعود برسالة عامة واحدة بنفس الحالة (FR-2، D3، FR-2).
- **`/health`**: صار يعيد فعلياً 503 و`status="unhealthy"` عند فشل فحص قاعدة البيانات أو Redis (كان يبتلع الأخطاء ويعيد 200 دائماً). الكود الآن مطابق لما هو موثّق أصلاً في القسم 1.
- **كلمة سر المدير**: الطول الأدنى مرتبط الآن بـ `APP_ENV` — **4 محارف** في `development`/`test` و**12 محرفاً** في `production` (SRS FR-13)، ويُفرض الحد حتى عند تمرير `--password`.

## 12.3 ملاحظات (Phase 4.2)

- تغييرات الاختبارات فقط: عُدّلت اختبارات `test_admin_export` و`test_admin_auth` (توقيع سكربت إنشاء المدير `_run(username, password, reset)`)، وأُضيفت اختبارات لنقطة `/api/graduates/me` ولقاعدة كلمة سر المدير حسب البيئة. أُزيلت علامات `@pytest.mark.anyio` من ملف اختبارات الخريج لأن الإعداد يستخدم حلقة حدث واحدة للجلسة (`asyncio_mode=auto`)، ووجودها كان يكسر حلقة الحدث المشتركة.
- ملاحظة توثيقية: أسماء أفعال التدقيق الفعلية في الكود هي `CREATE_MAJOR`/`UPDATE_MAJOR`/`DELETE_MAJOR` (وليس `MAJOR_CREATED`/`MAJOR_UPDATED`/`MAJOR_DELETED`).
- إعادة توليد لقطة OpenAPI: بسبب ترقية إصدارات FastAPI/pydantic (غير مثبّتة) صار مخطط خطأ التحقق 422 يتضمّن خاصيتين إضافيتين (`ctx`, `input`)؛ أُعيد توليد اللقطة داخل الحاوية لتعكس المخطط الحيّ.

---

# المرحلة 4.3 (وقت الحفل، مقاعد الحضور، وتفاصيل المدير الموسّعة)

تُجمِّع هذه المرحلة ما يلي: وقت الحفل الاختياري، بادئة مقاعد الحفل الاختيارية، تخصيص **مقعدٍ تسلسليّ** لكل خريج عند تأكيد الدفع (يُعرض بجوار رمز QR ولا يدخله أبداً)، إغناء تفاصيل الخريج في صفحة الإجراءات الاستثنائية، إزالة التخزين المؤقت القديم لقوائم/تفاصيل الخريجين، وأعمدة المقاعد ووقت الحفل في تقرير Excel.

قاعدة التجويد (استمرارًا لـ D23): **لم تتغيّر أي نقطة قائمة** في مسارها أو طريقتها أو رموز حالتها أو رسائلها؛ كل تغييرات العقد **إضافية** عبر خصائص اختيارية جديدة فقط. الاستثناء الوحيد سلوكي وليس عقديًا: إزالة تخزين مؤقت قديم (البند 13.3-ج).

## 13.1 تغييرات عقد الـ API (المرحلة 4.3)

### أ) الحفل: وقت الحفل وبادئة المقاعد

| النقطة | التغيير (إضافي) |
|---|---|
| `POST /api/admin/events` (جسم الطلب) | يقبل الحقلين الاختياريين `event_time` و`seat_prefix`. |
| `PUT /api/admin/events/{event_id}` (جسم الطلب) | كما سبق؛ كلٌّ منهما اختياري. |
| `GET /api/admin/events` و`GET /api/admin/events/{event_id}` (الاستجابة) | يُعاد `event_time` (نص `HH:MM:SS` أو `null`) و`seat_prefix` (`null` عند غيابه). |
| `GET /api/graduates/me/ticket-options` و`GET /api/graduates/me/ticket` و`POST /api/scanner/auth/login` (داخل كائن `event`) | يُضاف `event_time`. |

قواعد المدخلات:
- `event_time`: وقت بصيغة 24 ساعة `HH:MM:SS`؛ اختياري.
- `seat_prefix`: من **1 إلى 3 حروف فقط** (عربي أو لاتيني) دون أرقام أو رموز؛ يُشذَّب الفراغ ويُحوَّل اللاتيني إلى أحرف كبيرة؛ القيمة الفارغة/المسافات تعني `null`. عند المخالفة يُعاد **422** برسالة: «بادئة المقاعد يجب أن تكون من 1 إلى 3 أحرف فقط دون أرقام أو رموز.»
- **قفل البادئة**: بعد تخصيص أول مقعد لتذكرة في الحفل يصبح تغيير `seat_prefix` مرفوضًا بـ **409** ورسالة «لا يمكن تعديل بادئة المقاعد بعد تخصيص مقاعد لتذاكر هذا الحفل». أما `event_time` فيبقى قابلًا للتعديل في أي وقت.

مثال جسم تحديث حفل:
```json
{ "event_time": "18:30:00", "seat_prefix": "E" }
```

### ب) مقعد الحضور في «تذكرتي» (يُعرض بجوار رمز QR، لا داخله)

عند حالة `CONFIRMED` فقط، تُضاف إلى `GET /api/graduates/me/ticket` المفتاح `seat`:

```json
"seat": {
  "graduate": "E-4",
  "companions": ["E-5", "E-6"],
  "range": "E-4 → E-6"
}
```

- `range` يربط مقعد الخريج بآخر مرافق؛ بلا بادئة تعود الأرقام وحدها (مثل `"graduate": "4"` و`"companions": ["5","6"]`). الرمز `seat` يُغيّب تمامًا قبل التأكيد (الاستجابة تُقدَّم بـ `response_model_exclude_none=true`).
- `GET /api/admin/tickets/{ticket_id}` يضيف أيضًا `seat` بنفس الشكل (أو `null`).
- **مهم**: المقعد يُعرض **بجوار** صورة رمز QR، ولا يُدرج أبدًا داخل قيمة الرمز (`code_value`)؛ قيم الرموز تبقى عشوائية وغير قابلة للتخمين (FR-12).

### ب) تفاصيل الخريج الموسّعة (صفحة الإجراءات الاستثنائية)

`GET /api/admin/graduates/{graduate_id}` (بلا `response_model`) يحتفظ بكل المفاتيح السابقة ويضيف (دواخل اختيارية):
- `tickets[]` يضيف: `ticket_type`، `companions_count`، `rejection_reason`، `confirmed_at`، `created_at`، و`seat` (بنية المقعد أعلاه أو `null`).
- `payments[]` يضيف: `sender_name`، `submitted_at`، `reviewed_at`.
- `qr_codes[]` يضيف: `scanned` (منطقي)، `scanned_at`، `scanned_by_username` (`null` إن لم يُمسح الرمز أو كان المسح يدويًّا أو حُذف الماسح)، مع ترتيب رمز الخريج أولًا ثم رموز المرافقين بالمعرّف.
- كل حقول التاريخ/الوقت تُعاد بصيغة ISO. تُجمع أسماء الماسحين وبادئات مقاعد الحفلات باستعلامين مجمّعين (بلا N+1).

### ج) تقرير Excel: أعمدة المقاعد ووقت الحفل

أُضيفت ثلاثة أعمدة نصية في نهاية ورقة «المتخرجون» بعد الأعمدة الـ23 القائمة: «مقعد الخريج»، «مقاعد المرافقين» (مفصولة بفاصلة)، «وقت الحفل». تبقى المواضع والأنواع والعناوين السابقة كما هي، وتبقى كل الخلايا نصية مع تحييد حقن الصيغ (D17).

### د) مدقّق العقد الإضافي (OpenAPI)

- سكربت جديد `back/scripts/check_openapi_additive.py`: يقارن مخطط التطبيق الحيّ بلقطة `back/tests/contract/openapi_baseline.json` ويسمح **فقط** بالإضافة:
  - يفشل على: حذف عملية، حذف/تغيير نوع خاصية قائمة، جعل خاصية طلب إلزامية، إضافة خاصية طلب إلزامية، حذف/تغيير رمز حالة استجابة، إضافة وسيط إلزامي.
  - ينجح (مع طباعة الإضافات) على: عمليات جديدة وخصائص اختيارية جديدة.
  - يُشغَّل: `docker compose exec back python -m scripts.check_openapi_additive`.
- أُعيد توليد لقطة الـ OpenAPI بقصد بعد كل التغييرات الإضافية أعلاه عبر `docker compose exec back python -m scripts.update_openapi_baseline`. لا تُعدّل اللقطة يدويًّا.

## 13.2 تغييرات قاعدة البيانات (المرحلة 4.3)

ترقية Alembic `0006_event_time_and_seats` (نزولها الصحيح `0005_majors_gpa_rank`):
- `events.event_time` (Time، قابل للـ `null`).
- `events.seat_prefix` (String(3)، قابل للـ `null`).
- `tickets.seat_start` (Integer، قابل للـ `null`).
- قيد `chk_ticket_seat_start_positive`: `seat_start IS NULL OR seat_start >= 1`.
- فهرس فريد جزئي `uq_tickets_event_seat_start` على `tickets(event_id, seat_start)` حيث `seat_start IS NOT NULL` (منع تداخل الكتل).
- **تعبئة رجعية**: كل تذاكر `CONFIRMED` القائمة تُمنح كتلًا تسلسلية بحسب `(confirmed_at, id)`، وكل تذكرة تحجز `1 + companions_count` رقمًا متتاليًّا (الخريج يأخذ الرقم الأول ثم المرافقون).
- تُشغَّل الترقيات تلقائيًّا عند `docker compose up --build` (`alembic upgrade head` قبل `uvicorn`) بلا خطوات يدوية وبلا فقدان بيانات.

## 13.3 تغييرات السلوك (المرحلة 4.3)

أ) **تخصيص المقعد عند تأكيد الدفع**: عند `POST /api/admin/tickets/{ticket_id}/confirm`، وبعد إصدار رموز QR وكل شيء داخل **نفس المعاملة**، تُخصَّص كتلة المقاعد: تُقفل تذكرة ثم يُقفل صف الحفل (`FOR UPDATE`)، ويُحسب أعلى نهاية مستخدمة في الحفل ثم يُمنح الخريج الرقم التالي ومرافقوه الأرقام التالية. `assign_seat_block` آمن للتكرار (لا يعيد التخصيص إن وُجد `seat_start`).
- **إرجاع الدفع (`revert-payment`) لا يلمس المقعد**: يبقى `seat_start` كما هو بعد الإرجاع.
ب) **قفل بادئة المقاعد**: أول تخصيص مقعد يُقفل تغيير `seat_prefix` (409) كما في 13.1-أ.
ج) **إزالة التخزين المؤقت القديم**: أُزيل قراءة/كتابة Redis من `search_graduates_service` و`get_graduate_full_details_service` (كان مفتاحاهما `admin:graduates:list:*` و`admin:graduates:detail:*`)، لتفادي إظهار بيانات قديمة في قوائم/تفاصيل المدير بعد تغييرات التذاكر/المدفوعات/المسح. أُبقي `invalidate_admin_cache()` كما هو (يُنادى من كاتبي التذاكر والمدفوعات والمتطوعين) وأُبقي استخدام Redis في بقية المسارات. لا تغيير في شكل الاستجابة، فقط أنها صارت محدَّثة دائمًا.

## 13.4 ملاحظات لمطوّر الواجهة (المرحلة 4.3)

- **نماذج الحفل**: أضف حقلَي `event_time` (منتقي وقت) و`seat_prefix` (مدخل من 1–3 حروف) إلى نموذج الإنشاء/التعديل.
- **صفحة «تذكرتي»**: اعرض وقت الحفل، واعرض المقعد **بجوار** صورة رمز QR (وليس داخله)، مستعملًا `seat.graduate` و`seat.companions` و`seat.range`.
- **صفحة الإجراءات الاستثنائية**: اقرأ المفاتيح الجديدة (نوع التذكرة، سبب الرفض، وقت التأكيد/الإنشاء، حالة المسح ومن مسح، بيانات الدفع الكاملة) بدل استنتاجها.
- تبقى كل مبالغ/أسعار الدفع نصوصًا في العقود كما سبق.

## 13.5 نص SRS مقترح (امتدادات لم تُضف إلى ملف SRS)

ملاحظة: لم يُعدَّل ملف SRS؛ فيما يلي نص مقترح يغطي الامتدادات المتراكمة.

- **FR-26 (إجابات المتطوعين)** — كما في البند 9.4 (سؤالا الرغبة بالمسؤولية والخبرة السابقة، اختياريان ومستقلان، لوحة وقائمة وتصدير للمدير فقط ومُدقَّق).
- **FR-27 (وقت الحفل)** — يستطيع المدير تحديد وقت الحفل (اختياري) ويُعرض للخريج في «تذكرتي» وفي كائن الحفل، ويظهر في تقرير Excel.
- **FR-28 (بادئة المقاعد)** — يستطيع المدير تحديد بادئة حروف للمقاعد (1–3 حروف، اختيارية) قبل تخصيص المقاعد؛ تُقفل بعد تخصيص أول مقعد.
- **FR-29 (مقعد الحضور)** — عند تأكيد الدفع تُخصَّص كتلة مقاعد تسلسلية (رقم الخريج ثم مرافقوه)؛ يُتاح كل رقم بجوار رمز QR أو في «تذكرتي» ولا يُدمج داخل قيمة الرمز أبدًا (يلتزم بروح FR-12: القيم عشوائية وغير قابلة للتخمين).
- **FR-30 (البيانات الأكاديمية والتحقق عند التسجيل)** — يُتحقق من المعدل التراكمي والتخصص والترتيب على التخصص ضمن بيانات السجل الجامعي عند التسجيل، مع إدارة المدير للتخصصات.
- **FR-31 (ملف الجامعة: أعمدة جديدة)** — يقبل المستورد عمودَي «المعدل» (إلزامي) و«التخصص» (اختياري) بترويسات عربية أو إنجليزية (خليط مسموح)، ويطابق التخصص بالتنطبيع العربي ضمن الكلية فقط دون إنشاء تخصصات جديدة.
- **FR-32 (وصف موقع الحفل)** — يُرسَل رابط/موقع الحفل عبر مجموعة واتساب عند التأكيد، ولا يُخزَّن في النظام؛ ما يُخزَّن هو رابط المجموعة فقط.

## 13.6 ما لم يُنجَز بعد (المرحلة 4.3)

- **إدارة سعة المقاعد**: لا يوجد حدّ أقصى لعدد المقاعد أو منع تجاوز السعة.
- **بوابة الماسح كموضع مخصَّص**: صفحة/جهاز الماسح في الواجهة، واختبار حمل حقيقي لمسار المسح/التصدير، ما زال ضمن مرحلة النشر.
- **HTTPS/وسيط عكسي، النسخ الاحتياطي المُجدول، إشعارات البريد**: كما في المراحل السابقة.

---

# المرحلة 4.4 (الصيغة الثابتة لملف شؤون الطلبة: الاسم/الكنية، حالة الأوائل، رقم التواصل)

يُبنى هذا على ترتيب ملف شؤون الطلبة الثابت: الاسم، الكنية، اسم الأب، اسم الأم، الجنس، الكلية، التخصص، الرقم الجامعي، حالة الطالب من الأوائل، المعدل، رقم التواصل.

قاعدة التجويد (استمرارًا لـ D23): **لم تتغيّر أي نقطة قائمة**؛ كل تغييرات العقد **إضافية** (خصائص طلب/استجابة اختيارية جديدة). الاستثناء سلوكي فقط: لم يُعد يُطابَق المعدل المُدخل في النموذج (D2).

## 14.1 تغييرات عقد الـ API (المرحلة 4.4)

| النقطة | التغيير (إضافي) |
|---|---|
| `POST /api/graduates/verify-step1` (جسم الطلب) | يقبل الحقلين الاختياريين `first_name` و`last_name` (مع بقاء `full_name` حلًّا احتياطيًا). يجب إرسال (`first_name` و`last_name`) أو `full_name`. |
| `POST /api/admin/events/{event_id}/university-records` (الاستجابة) | يُضاف `summary` اختياري: `{total, added, updated, skipped, error_count}`. |
| `GET /api/graduates/me/ticket` (الاستجابة) | يُضاف `top_rank` (1/2/3/null) في الحالتين (وجود/غياب تذكرة). |

## 14.2 تغييرات قاعدة البيانات (المرحلة 4.4)

ترقية Alembic `0007_names_and_top_rank` (نزولها `0006_event_time_and_seats`):
- `university_records.first_name`, `last_name` (String(120)، nullable).
- `university_records.top_rank_from_file` (SmallInteger، nullable) مع قيد `chk_uni_records_top_from_file`: `top_rank_from_file IS NULL OR top_rank_from_file IN (-1,0,1,2,3)`.
- `university_records.phone` (String(50)، nullable).
- `graduates.first_name`, `last_name` (String(120)، nullable).
- لا قيد UNIQUE مركّب جديد على حقول الهوية (D9).

## 14.3 تغييرات السلوك (المرحلة 4.4)

- **المستورد**: يقبل الرؤوس الاسم/الكنية وحالة الطالب من الأوائل/رقم التواصل (وأشكالًا بديلة) مع الحفاظ على «الاسم الكامل» القديم؛ يوحّد الجنس (انثى/انثي/انثى/male/female → ذكر/أنثى)، ويحسّن `parse_gpa` لقبول «72،79٪» والأرقام العربية-الهندية، ويحلّل حالة الأوائل (لا = غير أول، عبارات الأول/الثاني/الثالث، نعم/من الأوائل = أول بلا ترتيب)، ويوحّد رقم التواصل ويخزّنه دون مطابقة.
- **التحقق (Step 1)**: يُطابق الاسم والكنية منفصلين (أو `full_name` القديم)، ولا يُطابق المعدل المُدخل في النموذج ولا رقم التواصل (D1/D2)؛ يُخزَّن معدل الملف إن لم يُدخل الطالب قيمة صالحة.
- **حالة الأوائل (D3)**: عند وجود عمود الحالة في الملف يكون مرجعيًّا؛ وإلا يُرجع للترتيب الكثيف حسب المعدل.
- **الترتيب والأخطاء (D11)**: ترتيب الفحص: وجود السجل → مطابقة الاسم/الكنية/الأب/الأم/الجنس/الكلية/التخصص/الرقم الجامعي (وإلا فشل عام) → مقارنة اختيار الأوائل → «مسجّل مسبقًا» أخيرًا. لا يُكشف الترتيب الحقيقي.
- **الرمز والتذكرة**: يُضمَّن `top_rank` في رمز التسجيل ويُخزَّن في `graduates.top_rank`، ويُعاد في «تذكرتي».
- **الإدارة**: بحث/تفاصيل الخريج يُضيفان `first_name`/`last_name`، وتقرير Excel يُضيف عمودَي «الاسم» و«الكنية» في النهاية (بعد 26 عمودًا سابقًا).

## 14.3.1 رسائل الأخطاء الجديدة (D11) في `app/core/messages.py`

| الرمز | الرسالة |
|---|---|
| `TOP_RANK_NOT_HONOR` | يظهر لنا حسب البيانات من شؤون الطلبة أنك لست من الأوائل، يرجى التأكد، وفي حال التأكد يرجى مراجعة اتحاد الطلبة. |
| `TOP_RANK_SHOULD_BE_HONOR` | يظهر لنا حسب البيانات من شؤون الطلبة أنك من الأوائل، يرجى التأكد من اختيارك، وفي حال التأكد يرجى مراجعة اتحاد الطلبة. |
| `TOP_RANK_MISMATCH` | المرتبة التي اخترتها لا تطابق بيانات شؤون الطلبة، يرجى التأكد، وفي حال التأكد يرجى مراجعة اتحاد الطلبة. |

الجسم: `{"detail": {"message": "<نص>", "code": "<CODE>"}}` بنفس حالة الفشل العامة (400).

## 14.4 ملاحظات لمطوّر الواجهة (المرحلة 4.4)

- نموذج Step 1: حقلان للاسم والكنية، الجنس قائمة منسدلة (ذكر/أنثى)، والمعدل اختياري.
- اعرض رسالة D11 تحت حقل اختيار الأوائل عند وصول `detail.code`.
- «تذكرتي»: اعرض شارة «من الأوائل» + الترتيب عند وجود `top_rank`.
- استخدم قالب ملف شؤون الطلبة بالترتيب الثابت أعلاه.

## 14.5 نص SRS مقترح (امتدادات لم تُضف إلى ملف SRS)

- **FR-33 (صيغة ملف شؤون الطلبة)** — يُدعم الترتيب الثابت: الاسم، الكنية، اسم الأب، اسم الأم، الجنس، الكلية، التخصص، الرقم الجامعي، حالة الطالب من الأوائل، المعدل، رقم التواصل.
- **FR-34 (حالة الأوائل)** — تُقرأ من الملف عند توفّرها وتكون مرجعية عند التسجيل.
- **FR-35 (فصل الاسم والكنية)** — يُخزَّنان منفصلين مع إبقاء الاسم الكامل للعرض.

## 14.6 ما لم يُنجَز بعد (المرحلة 4.4)

- لم يُعدَّل ملف SRS الأصلي (docx/pdf)؛ النص أعلاه مقترح.
- ملاحظة عملية (S16): حُدِّث ملف المهام `docs/TASKS_affairs-format.md` في التزام أدلّة واحد في نهاية الجزء A (لأن كثيرًا من البنود تلمس الملفات نفسها) بدل تحديثه مع كل بند.


---

## 15. جولة التحسينات polish-round-1 — الجزء A (الخلفية)

هذا القسم يوثّق تغييرات فرع `fix/polish-round-1` (الجزء A فقط). لا تغيير في أي مسار API ولا في أي عقد (فاحص العقد أظهر العدد نفسه من الفروقات قبل وبعد التعديل — وهي فروقات سابقة منشؤها إصدار FastAPI/pydantic الذي وُلّد به `openapi_baseline.json`).

### 15.1 مدقّقات حقول إعدادات الشام كاش الثلاثة (`PUT /api/admin/settings`)

أُضيفت field validators إلى `AdminSettingsUpdate` في `app/schemas/settings_admin.py`. القواعد:

| الحقل | القاعدة | أمثلة مقبولة | أمثلة مرفوضة (422) | رسالة الخطأ العربية |
|---|---|---|---|---|
| `shamcash_account_number` | حروف إنجليزية وأرقام فقط، بلا مسافات أو رموز، من 4 إلى 100 خانة (D1) | `AB12cd34`، `7f3a9c1e0b` | `AB 12`، `12-34`، `abc`، 101 خانة، `حساب1` | `SETTINGS_ACCOUNT_INVALID` = «رقم الحساب يقبل أحرفاً وأرقاماً إنجليزية فقط (من 4 إلى 100 خانة) بدون مسافات أو رموز» |
| `shamcash_receiver_name` | حروف عربية أو إنجليزية ومسافات والنقاط والشرطة والفصلة العليا، بلا أرقام، من 2 إلى 200 بعد trim (D2) | `محمد أحمد`، `Mohammad Ahmad`، `O'Brien-Smith Jr.` | `محمد 123`، `A`، 201 حرفاً، `<script>` | `SETTINGS_RECEIVER_INVALID` = «اسم المستفيد يقبل حروفاً عربية أو إنجليزية ومسافات فقط (من حرفين إلى 200)» |
| `contact_phone` | نفس قاعدة هاتف الخريج `PHONE_REGEX` (مستوردة من `schemas/graduate.py`، غير منسوخة): + اختيارية ثم 7 إلى 15 رقماً (D3) | `0933123456`، `+963933123456` | `12345`، `abc1234567`، `0933-123-456`، 16 رقماً | `SETTINGS_PHONE_INVALID` = «رقم الهاتف يجب أن يتكون من أرقام فقط (من 7 إلى 15 رقماً) ويمكن أن يبدأ بعلامة +» |

سلوك محفوظ كما هو: الحقل الغائب أو `null` = «بدون تغيير»، والسلسلة الفارغة أو المسافات فقط = «مسح القيمة». القيمة المُرسلة تُخزَّن بعد trim. الرسائل الجديدة في `app/core/messages.py`. لم يُضف أي `pattern=` إلى الحقول كي لا يتغير مخطط OpenAPI.

اختبارات: ملف جديد `tests/test_admin_settings_validation.py` (جدول صدق كامل + فحص عدم تغيّر قاعدة البيانات عند الرفض). لم تحتاج اختبارات الإعدادات القديمة أي تعديل (كل قيمها كانت صالحة تحت القواعد الجديدة).

### 15.2 رقم العملية يُخزَّن ويُعرض كما كتبه الخريج تماماً (D4)

- **المدقّق** (`schemas/ticket.py` → `_normalize_transaction_number`): الآن `strip()` فقط مع الحفاظ على حالة الأحرف، والمسموح `[A-Za-z0-9-]{4,100}`، والخطأ `رقم العملية غير صالح`. السلوك القديم كان `.strip().upper()`.
- **الفهرس الفريد**: أُزيل `UniqueConstraint("transaction_number", name="unique_transaction_number")` من نموذج `payments` واستُبدل بفهرس وظيفي فريد على `upper(transaction_number)` باسم `uq_payments_transaction_number_ci`؛ بقي الفهرس العادي للعمود. النتيجة: التفرد عالمي لكنه غير حساس لحالة الأحرف (`abc-1` و`ABC-1` رقم واحد)، بينما يُعرض النص كما خُزّن.
- **الهجرة**: `alembic/versions/0013_transaction_number_ci_unique.py` بـ `down_revision = 0012_university_record_file`. upgrade: إسقاط القيد `unique_transaction_number` وإنشاء الفهرس الفريد على `upper(...)` (الصفوف القديمة كلها uppercase فلا تصادم). downgrade: إسقاط الفهرس وإعادة إنشاء القيد (آمن لأن السجل الصحيح لا يحتمل سطرين متطابقين تجاهلاً الحالة). تعمل بالاتجاهين (مختبَرة).
- **خدمة الدفع** (`services/ticket_service.py`): البحث عن تكرار صار `func.upper(PaymentModel.transaction_number) == data.transaction_number.upper()`؛ إعادة إرسال الرقم نفسه (بأي حالة) لنفس التذكرة تحدّث النص المحفوظ بما كُتب للتو؛ باقي المنطق (409 `TRANSACTION_ALREADY_USED`، قواعد الحالات، نافذة الدفع، `IntegrityError` عند التسابق) كما هو حرفياً.
- **العرض**: لا كود في الخلفية يحوّل حالة الرقم — `payment_review_service` و`admin_graduate_service` و`export_service` يعيدون النص المخزّن كما هو (`roster_service` لا يتناول رقم العملية أصلاً).

اختبارات Part A2:
- `tests/test_payment_submission.py`: التخزين كما كُتب مع trim (`"  ab-1234  "` → `"ab-1234"`)، تكرار بحالة مختلفة عبر تذكرتين = 409 بالرسالة المطابقة، إعادة الإرسال لنفس التذكرة بحالة مختلفة يحدّث النص، العرض في صفحة الإدارة وتفاصيل الخريج كما خُزّن، حالات المدقّق.
- `tests/test_migrations.py`: بنية الهجرة (drop constraint / create index) + round trip up/down + فرض التفرد غير الحساس للحالة من قاعدة البيانات نفسها (سطران يختلفان بالحالة فقط يُرفضان).
- `tests/test_admin_export.py::test_export_shows_transaction_number_as_typed`: خلية Excel تحوي `ab-Cd12` كما هي.

### 15.3 الاختبار الموجود الذي عُدّل (S5)

| الاختبار | التعديل | السبب |
|---|---|---|
| `tests/test_payment_submission.py::test_submit_normalizes_transaction_number` | أصبح يتوقع تخزين `"  ab-1234  "` كما هي (`"ab-1234"`) بدل `"AB-1234"` | المهمة A2.6 تغيّر هذا السلوك صراحةً (D4: حفظ الرقم كما كُتب مع trim فقط). لم تُخفَّف أي assertion أخرى. |

### 15.4 نتائج الفحوص (Part A)

- الحزمة الكاملة: `pytest -q` → **430 passed, 3 failed**. الفشل الثلاثة موجود على `dev` نفسه قبل أي تعديل (اثنان بسبب اختلاف بيئة HTTP 403/401، وواحد من كسر baseline العقد السابق) — لا انحدار جديد من هذه الحزمة.
- فاحص العقد `python -m scripts.check_openapi_additive`: عدد الفروقات على الفرع = عددها على `dev` بالضبط (117 تغييراً توثيقياً سابقاً + 3 إضافات مسموحة من عمل roster) — لم تضف هذه الحزمة أي فرق.
- migrations tests + payment submission + admin settings validation + admin export: **73 passed** مجتمعة.

---

## القائمة الشاملة للخريجين (Roster)

صفحة «الخريجون» بالأدمن بتعرض **كل شخص موجود بملفات الجامعة المرفوعة** (مسجّل أو لا) مع حالة التسجيل والتذكرة والدفع والدخول.

### نقاط جديدة (للأدمن فقط، إضافية بدون كسر)

| النقطة | الوظيفة |
|---|---|
| `GET /api/admin/roster` | القائمة مع الفلاتر والترقيم |
| `GET /api/admin/roster/export` | ملف Excel بنفس الفلاتر (بدون ترقيم، بحد أعلى 20,000 صف) |

**الفلاتر** (كلها اختيارية وبتشتغل مع بعضها): `search` (اسم أو رقم جامعي)، `file_id`، `event_id`، `college_id`، `registration`، `top_rank`، `ticket`، `payment`، `entry`، `ticket_type`، و`skip` / `limit` (الافتراضي 50، الأقصى 200).

| الفلتر | القيم |
|---|---|
| `registration` | `not_registered` (لم يسجّل بعد) · `unverified` (سجّل — بانتظار تأكيد البريد) · `verified` (سجّل — تم تأكيد البريد بالـ OTP) |
| `top_rank` | `none` · `any` · `1` · `2` · `3` |
| `ticket` | `none` · `awaiting_payment` · `processing` · `confirmed` · `rejected` |
| `payment` | `none` · `pending` · `confirmed` · `rejected` · `mismatch` (مبلغ الدفعة لا يطابق سعر التذكرة) |
| `entry` | `entered` · `not_entered` |
| `ticket_type` | `two` (مرافقان) · `three` (ثلاثة مرافقين) |

**الرد (لكل صف):**

```json
{
  "total": 237,
  "items": [{
    "record_id": 12, "event_id": 1, "event_name": "حفل 2026",
    "university_id": "1005", "full_name": "ريم حسن",
    "father_name": "حسن", "mother_name": "سعاد", "gender": "أنثى",
    "college_id": 1, "college_name": "كلية الهندسة",
    "major_id": null, "major_name": null, "gpa": "71.00",
    "top_rank": null, "is_top": false,
    "file_id": 3, "file_name": "graduates.xlsx",
    "registration": {"state": "verified", "graduate_id": 9, "email": "a@b.com", "email_verified": true},
    "ticket": {"id": 5, "status": "CONFIRMED", "companions_count": 2, "type": "two", "price": "100000.00", "seat": "E-1 → E-3"},
    "payment": {"state": "confirmed", "amount": "100000.00", "submitted_at": "2026-10-20T10:00:00+00:00", "mismatch": false},
    "entry": {"entered": false, "at": null, "manual": false},
    "actions": {"revert_payment": true, "manual_entry": true, "cancel_scan": false}
  }]
}
```

### قواعد مهمة

- **صف لكل سجل جامعي (لكل حفل):** الشخص الموجود بحفلين بيظهر بصفّين، وكل صف بتذكرة حفله.
- **«الأوائل»** بتنحسب مثل التسجيل بالضبط: قيمة الملف إذا كان فيه عمود الأوائل، وإلا الترتيب (dense) من المعدل. `is_top` يشمل «من الأوائل بدون ترتيب معروف».
- **حالة الدفع** مشتقة من آخر دفعة وحالة التذكرة. `mismatch` مستقلة عنها.
- **`actions`**: هل الإجراء الاستثنائي مسموح الآن؟ القواعد تبقى بالباك (`admin_graduate_service`)، والواجهة بس بتعرض. `revert_payment`: التذكرة مؤكدة. `manual_entry`: مؤكدة والخريج لم يدخل. `cancel_scan`: الخريج دخل. التنفيذ بالنقاط الموجودة: `POST /api/admin/tickets/{id}/revert-payment` و`POST /api/admin/graduates/{id}/manual-check-in` و`POST /api/admin/graduates/{id}/revert-scan`.
- **التصدير** بيسجّل `ROSTER_EXPORTED` بسجل التدقيق مع أسماء الفلاتر المفعّلة فقط (بدون قيمها، لأن كلمة البحث ممكن تكون اسم شخص). وإذا زادت النتائج عن الحد: 400 مع رسالة بتطلب تضييق الفلاتر.
- خلايا النصوص بالتصدير نصوص صريحة (لا تتحول لمعادلات)، والأرقام أرقام.

### تغيير بقاعدة البيانات (ترقية `0012_university_record_file`)

- عمود جديد `university_records.file_id` (يقبل NULL، `ON DELETE SET NULL`، مفهرس).
- بيتعبّى عند ربط ملف بحفل (الاستيراد من «ملفات البيانات»). **السجلات القديمة** (والمرفوعة مباشرة بدون ملف) بتبقى `NULL` وبتظهر «—» بعمود الملف.
- حذف الملف **ما بيحذف الأشخاص**، بس بيمسح معرفة مصدرهم.

### حدود معروفة

- **ملف مرفوع وغير مربوط بحفل ما بيظهر بالقائمة**: لأنو ما بينقرا لقاعدة البيانات إلا عند الربط. بيظهر أشخاصه مباشرة بعد ما ينربط.
- فلتر «الملف» يعتمد على `file_id`، فأشخاص السجلات القديمة ما بيطلعوا عند اختيار ملف.
