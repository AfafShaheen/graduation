# توصيل الواجهة بالباك إند (FRONTEND_WIRING)

يصف هذا الملف كيف صارت واجهة `front/` موصولة فعلياً بنقاط الـ API، والصفحة التي تستدعي أي نقطة، ونوع الرمز (token) المستخدم. آخر تحديث: **الجزء B** (B0–B15: صيغة شؤون الطلبة، الأوائل، SEO، إصلاحات الواجهة).

---

## 1. طبقة الطلب (request layer)

| الملف | الدور |
|---|---|
| `front/src/api/client.js` | `request(path,{method,body,token})` و`requestBlob(path,{token})` و`downloadBlob` وصنف `ApiError(status,message,data,fieldErrors)`. عند تمرير `token` يُضاف ترويسة `Authorization: Bearer <token>`. قبل كل طلب محمي يُنفَّذ `proactiveCheck` للتحقق من انتهاء صلاحية الرمز. حقول 422 (مصفوفة FastAPI) تُحوَّل إلى `fieldErrors` بمفتاح = آخر عنصر في `loc`. |
| `front/src/api/graduate.js` | نقاط الخريج العامة/المحمية (كل دوال الطلاب والماسح تمر من هنا أو من `client`). |
| `front/src/api/admin.js` | نقاط الإدارة + مغلّفات: `adminRequest` (JSON)، `adminForm` (multipart)، `adminBlob` (تنزيل ثنائي)، مع إعادة تصدير `ApiError` و`downloadBlob`. |
| `front/src/api/session.js` | مصدر الحقيقة الوحيد للجلسات في `localStorage` (المفاتيح أدناه). |

---

## 2. مفاتيح الجلسات (session keys)

| المفتاح | الصفحة/الدور | المدة |
|---|---|---|
| `registration_token` | نموذج التسجيل (Step1→Step2) | 15 دقيقة |
| `verification_token` | تحقق OTP بعد التسجيل | 30 دقيقة |
| `graduate_access_token` + `graduate_expires_at` | الخريج | حسب الخادم |
| `scanner_access_token` + `scanner_expires_at` + `scanner_event` | الماسح | حسب الخادم |
| `admin_access_token` + `admin_expires_at` + `admin_username` | المدير | حسب الخادم |
| `reset_email` / `reset_code` | استعادة كلمة السر | مؤقت |
| `graduate_email` | عرض بريد التسجيل/التحقق | مؤقت |

> لا توجد نسخ مكرّرة لحالة التذكرة في `sessionStorage` (حُذفت `grad.ticket` و`grad.payment`)؛ حالة التذكرة تُقرأ دائماً من الخادم عبر `useMyTicket`.

---

## 3. الحُرّاس (guards)

| الحارس | الملف | يتحقق |
|---|---|---|
| حارس التذكرة | `front/src/components/TicketGuard.jsx` | وجود جلسة خريج صالحة، ويوجّه حسب حالة التذكرة (`routeForTicket`): لا تذكرة → `/tickets`، `PROCESSING` → `/payment-submitted`، `REJECTED` → `/payment-rejected`، `CONFIRMED` → `/my-ticket`. |
| حُرّاس المسارات | `front/src/App.jsx` | `/register` (رمز تسجيل)، `/otp` (رمز تحقق)، `/reset-otp`، `/reset-password`، صفحات `/admin/*` (`hasValidAdmin`)، الماسح (`scanner_access_token`). |
| وضع المعاينة | `import.meta.env.VITE_PREVIEW === 'true'` | يفتح الصفحات مباشرةً بدون شروط (للتصميم فقط). |

---

## 4. مسارات الطلاب

| المسار | الصفحة | النقاط المستدعاة | الرمز |
|---|---|---|---|
| `/` | `GraduationFormStep1` | `GET /api/registration/colleges`، `POST /api/graduates/verify-step1` | عام → تسجيل |
| `/register` | `GraduationFormStep2` | `GET /api/colleges`، `POST /api/graduates/register` | تسجيل |
| `/otp` | `Otp` (register) | `POST /api/auth/verify-otp`، `POST /api/auth/resend-otp`، `POST /api/auth/change-email` | تحقق |
| `/questions` | `GraduateQuestions` | `GET /api/graduates/me/volunteer-answers`، `PUT /api/graduates/me/volunteer-answers` | خريج |
| `/login` | `Login` | `POST /api/auth/graduate/login`؛ واستعادة كلمة السر: `POST /api/auth/forgot-password` | عام |
| `/reset-otp` | `Otp` (mode=reset) | `POST /api/auth/forgot-password` (إعادة إرسال)، `POST /api/auth/verify-otp` | عام |
| `/reset-password` | `ResetPassword` | `POST /api/auth/reset-password` | تحقق |
| `/tickets` | `SelectTicket` | `GET /api/graduates/me/ticket-options`، `POST /api/graduates/me/ticket` | خريج |
| `/payment` | `ShamCashPayment` | `GET /api/graduates/me/payment-info`، `GET /api/settings/shamcash-qr`، `POST /api/graduates/me/payment` | خريج/عام |
| `/payment-submitted` | `OrderStatus` | `GET /api/graduates/me/ticket` (عبر `useMyTicket`) | خريج |
| `/payment-rejected` | `OrderRejected` | `GET /api/graduates/me/ticket` (عبر `useMyTicket`) | خريج |
| `/my-ticket` | `MyTicket` | `GET /api/graduates/me/ticket` (عبر `useMyTicket`) + `GET /api/graduates/me` | خريج |

مصدر حالة التذكرة الموحّد: `front/src/hooks/useMyTicket.js` → `getMyTicket` (`GET /api/graduates/me/ticket`)، ويعيد `{status, ...}`. الباك ما زال يرجّع `seat` عند التأكيد، لكن الواجهة ما عادت تعرضه (انظر قسم «إخفاء المقاعد من الواجهة» بآخر الملف).

---

## 4. الماسح (Scanner)

| المسار | الصفحة | النقاط |
|---|---|---|
| `/scanner` | `ScannerLogin` | `POST /api/scanner/auth/login` |
| `/scanner/scan` | `ScannerCamera` | `POST /api/scanner/scan`، `POST /api/scanner/auth/logout` |
| `/scanner/result` · `/scanner/error` · `/scanner/wrong-ceremony` | صفحات النتيجة | تعتمد على حمولة نتيجة المسح المخزّنة + `getScannerEvent` |

---

## 5. الإدارة (Admin)

| المسار | الصفحة | النقاط الرئيسية | جديد في هذه المرحلة |
|---|---|---|---|
| `/admin` | `AdminLogin` | `POST /api/admin/auth/login` | — |
| `/admin/dashboard` | `AdminDashboard` | `GET /api/admin/stats`، `GET /api/admin/export` | — |
| `/admin/ceremonies` | `AdminCeremonies` | `GET /api/admin/events`، `DELETE /api/admin/events/{id}` | زر حذف + نافذة تأكيد داخلية |
| `/admin/ceremonies/new` | `AdminAddCeremony` | `POST /api/admin/events`، `PUT /api/admin/events/{id}`، `POST /api/admin/events/{id}/university-records` | إرسال `event_time` و`seat_prefix`، وربط أخطاء 422 بالحقول |
| `/admin/ceremonies/{id}/edit` | `AdminEditCeremonyRoute` | `GET /api/admin/events/{id}` + مدير التخصصات: `GET/POST /api/admin/colleges/{id}/majors`، `PUT/DELETE /api/admin/majors/{id}` | مكوّن `MajorsManager` لكل كلية |
| `/admin/payments` | `AdminPaymentRequests` | `GET /api/admin/events/{id}/payments`، `POST /api/admin/tickets/{id}/confirm`، `POST /api/admin/tickets/{id}/reject`، `GET /api/admin/export` | — |
| `/admin/scanners` | `AdminScannersSettings` | `GET/POST/DELETE /api/admin/scanners`، `GET/PUT /api/admin/settings`، `PUT/DELETE /api/admin/settings/shamcash-qr` | — |
| `/admin/actions` | `AdminExceptions` | `GET /api/admin/graduates`، `GET /api/admin/graduates/{id}`، `POST .../manual-check-in`، `.../revert-scan`، `.../revert-payment`، `PUT /api/admin/graduates/{id}/email` (تعديل البريد)، `GET /api/admin/audit-logs` | إظهار فئة التذكرة/المقاعد/سبب الرفض/تاريخ التثبيت/سجل الدفعات/حالة وماسح الـ QR |
| `/admin/volunteers` | `AdminVolunteers` | `GET /api/admin/volunteers`، `GET /api/admin/volunteers/export` | — |

> شارة طلبات الدفع في الشريط الجانبي تُغذّى من `AdminStatsProvider` (`GET /api/admin/stats` → `tickets.processing`) وليس من قيمة ثابتة.

---

## 6. ملاحظات وثغرات الباك إند (Backend gaps / notes)

- لا توجد نقطة `refresh` لأي رمز؛ الواجهة تفحص الانتهاء استباقياً (`proactiveCheck`) وتعيد التوجيه لتسجيل الدخول عند الانتهاء.
- `GET /api/admin/volunteers` يدعم فلترة `top_rank` (`1`/`2`/`3`/`any`/`none`)؛ وفلتر «الأولوية» غير معروض في الصفحة (غير مطلوب أصلاً). الحد الأقصى للصفحة `limit ≤ 200`.
- لا توجد نقاط «تجميد ماسح» أو «تغيير كلمة سر ماسح»؛ خصائصها محذوفة عمداً من صفحة الإعدادات.
- `seat` و`confirmed_at` وحقول الماسح في الـ QR تكون غالباً `null` لغير التذاكر المؤكَّدة/غير الممسوحة؛ الواجهة تعرض «—» في هذه الحالة.
- حقل `seat_prefix` يُقفل (422) بعد إسناد أي مقعد، و`event_time` يبقى قابلاً للتعديل.

---

## 7. قائمة اختبار يدوي مختصرة

1. تسجيل كامل: `/` → `/register` → `/otp` → `/questions` → `/tickets` → `/payment` → `/payment-submitted` → (تأكيد من الإدارة) → `/my-ticket` مع ظهور وقت الحفل.
2. استعادة كلمة السر: `/login` «نسيت كلمة السر» → `/reset-otp` → `/reset-password` → دخول.
3. الإدارة: `/admin` دخول → `/admin/ceremonies` (بحث، حذف بتأكيد، إنشاء/تعديل مع `event_time`/`seat_prefix` وتخصصات) → `/admin/payments` (تأكيد/رفض) → `/admin/scanners` (ماسح + إعدادات + QR) → `/admin/actions` (تفاصيل غنية) → `/admin/volunteers` (فلترة + تصدير).
4. الماسح: `/scanner` دخول → مسح تذكرة صحيحة/مستخدمة/مرافق قبل الخريج.
5. لا أخطاء حمراء في الكونسول ولا شاشة بيضاء في أي مسار أعلاه.

---

## 8. تحديثات الجزء B (توصيل صيغة شؤون الطلبة، الأوائل، SEO، إصلاحات)

### 8.1 أدوات جديدة (`front/src/utils/`)
| الملف | الدور |
|---|---|
| `extractVerificationToken.js` | يستخرج `verification_token` من جسم خطأ 403 للدخول (يقبل `detail.verification_token` وأشكالاً متداخلة) — يُستخدم في `Login.jsx`. |
| `amount.js` | `parseAmount`/`formatAmount`/`normalizeDigits`: تُصلح تضاعف مبلغ شام كاش ×100 (الخلفية ترسل السعر كنص `"100000.00"`). |
| `validators.js` | يطابق متحقّقات الخلفية بالضبط (D5): `NAME_REGEX`، `PHONE_REGEX = /^\+?[0-9]{7,15}$/`، سياسة كلمة السر (≥8 محارف، حرف ورقم، ≤72 بايت UTF-8) + دوال `nameError/phoneError/passwordError`. |
| `ticketRequest.js` | `createTicketRequest(fetchTicket)` يمنع الطلب المكرّر `GET /api/graduates/me/ticket` بين الحارس والصفحة (طلب واحد أثناء الطيران لكل رمز، مع `force`). |
| `topRank.js` | `TOP_STUDENT_TITLE` و`topRankLabel(1/2/3)` لعرض شارة الأوائل. |

### 8.2 تغييرات الاتصال بالباك إند
- `Login.jsx`: يقرأ رمز التحقق عبر `extractVerificationToken(err.data)` عند 403 (إصلاح ضياع الرمز للبريد غير المُتحقَّق).
- `GraduationFormStep1.jsx`: يقبل حقلَي `first_name`/`last_name` (بدل `full_name`)، الجنس قائمة منسدلة (ذكر/أنثى)، المعدل اختياري، ويعرض خطأ الأوائل الخاص تحت حقل الاختيار عند `detail.code` من أوامر D11؛ الحمولة ترسل `top_rank` رقمياً.
- `GraduationFormStep2.jsx` و`ResetPassword.jsx`: مُتحقّقات الهاتف/كلمة السر من `utils/validators.js`؛ `Otp.jsx`/`ResetPassword.jsx` يعرضان أول خطأ حقل من 422 (`err.fieldErrors`).
- `ShamCashPayment.jsx`: يستخدم `parseAmount`/`formatAmount` للمبلغ بدل تجريد الأرقام (كان يضاعف ×100).
- `OrderRejected.jsx`: يخفي زر إعادة إرسال الدفع ويغيّر النص عند إغلاق التسجيل (`registration.is_open`).
- `MyTicket.jsx`: يعرض شارة «من الأوائل» + الترتيب فوق رمز QR عند وجود `top_rank` (D12).
- `useMyTicket.js`: تشارك طلب التذكرة عبر `createTicketRequest` (طلب واحد فقط مع `TicketGuard`).
- `AdminVolunteers.jsx`: زر PDF يجلب كل الصفوف المطابقة (تقسيم صفحات `limit=200`) بدل الصفحة الحالية فقط.
- `AdminAddCeremony.jsx`: يعرض ترتيب أعمدة شؤون الطلبة الثابت (11 عموداً) في الرقائق وقالب CSV، ويعرض `summary` الرفع بعد الرفع.
- `CollegeNamesField.jsx` + `facultyOptions.js`: الكليات ليست قائمة ثابتة (D10) — رقائق مقترحة + إضافة أسماء حرّة، وقراءة فقط في شاشة التعديل (`AdminEditCeremonyRoute.jsx` يمرّر `collegeNames` من `event.colleges`).

### 8.3 SEO (D7: صفحة الهبوط `/` وحدها قابلة للفهرسة)
- `front/seo.config.json` (المصدر)، `front/scripts/generate-seo.mjs` يُنفَّذ عبر `prebuild` فيولّد `public/sitemap.xml` و`public/robots.txt` وقت البناء.
- `front/vite.config.js`: إضافة `seoPlugin` تحقن وسم description/keywords/robots/og/twitter/canonical في `index.html`.
- `front/src/hooks/usePageMeta.js` يُستخدم في `App.jsx`: `robots = pathname === '/' ? 'index, follow' : 'noindex, nofollow'`.
- `front/nginx.conf`: ترويسة `X-Robots-Tag: noindex, nofollow` لمسارات التطبيق الخاصة و`/api/`، مع تخزين `robots.txt`/`sitemap.xml`.
- عنوان الموقع يُضبط وقت البناء عبر `VITE_SITE_URL` (وسيطة build في Docker + `.env.example`).

### 8.4 اختبارات الواجهة
اختبارات `node --test` في `front/tests/*.test.mjs` تُشغَّل بـ`npm test` (استُحدث سكربت `test` و`prebuild` في `package.json`).


---

## صفحة «الخريجون والإجراءات» (`/admin/actions`)

الصفحة (ملف `pages/admin/AdminExceptions.jsx`) فيها **تابين**:

| التاب | المحتوى |
|---|---|
| **الخريجون** | القائمة الشاملة (`GET /api/admin/roster`) مع الفلاتر والترقيم وتصدير Excel، وبكبس أي صف بتفتح نافذة جانبية فيها التفاصيل والإجراءات |
| **سجل الإجراءات** | سجل التدقيق للإجراءات الاستثنائية (`GET /api/admin/audit-logs?exceptional_only=true`) مع ترقيم |

**الفلاتر:** بحث (اسم أو رقم جامعي، بتتطبّق بعد توقف الكتابة 350ms)، الملف المرفوع، الكلية، التسجيل، الأوائل، التذكرة، الدفع، الدخول، نوع التذكرة، وزر «إعادة الضبط». أي تغيير بفلتر بيرجّع للصفحة الأولى.

**الترقيم (Pagination):** السابق / التالي، وأرقام الصفحات (الأولى والأخيرة وما حول الحالية مع «…»)، واختيار عدد الصفوف (25 / 50 / 100)، ونص «عرض 1–50 من 237». إذا فرغت الصفحة بعد إجراء (صفوف خرجت من الفلتر) بترجع تلقائياً لآخر صفحة صالحة.

**الإجراءات الثلاثة** (بالنافذة الجانبية، وكل واحد بيطلب تأكيداً قبل التنفيذ): تسجيل دخول يدوي، وإلغاء المسح، وإرجاع الدفع لقيد المعالجة. تفعيل الأزرار بيجي من `actions` بالرد (القواعد بالباك). الشخص غير المسجّل بيعرض بياناته بدون إجراءات.

**الملفات:** `pages/admin/roster/` (`RosterTab`, `RosterFilters`, `RosterTable`, `RosterDrawer`, `AuditTab`, `Pagination`)، و`hooks/useAdminRoster.js`، و`utils/roster.js` (دوال نقية)، و`style/AdminRoster.css`.

**الاختبارات (`npm test`):** `roster.test.mjs` (الفلاتر والترقيم والتسميات) و`rosterContract.test.mjs` (بيقارن أسماء الفلاتر وقيمها وأحجام الصفحات مع ملف العقد `back/tests/contract/openapi_baseline.json`، فأي اختلاف بين الواجهة والباك بيفشل الاختبار).

اسم عنصر القائمة الجانبية صار «الخريجون والإجراءات».

---

## ملاحظات polish-round-1 (الجزء B)

### ملف العلامة التجارية `src/config/brand.js`
كل صياغة الحفل الثابتة في مكان واحد: `CEREMONY_TITLE` («اتحاد الطلبة جامعة حمص حفل تخريج الدفعة 3»)، `BATCH_BADGE` («الدفعة 3»)، `HELP_QUESTION` و`HELP_EMERGENCY_LABEL`. عناوين الصفحات والشارات والتذييلات والنصوص البديلة وعنوان SEO كلها تُبنى من هذه الثوابت؛ أي تعديل مستقبلي للصياغة يحصل في ملف واحد. اختبار `tests/brandConsistency.test.mjs` يمنع رجوع العبارات القديمة. عنوان الرأس الطويل يلتف على سطرين بأمان عبر `style/BrandHeader.css` (بلا nowrap/ellipsis/ارتفاع ثابت).

### تذييل المساعدة `components/HelpFooter.jsx`
يُعرض مرة واحدة فوق التذييل المؤسسي في كل صفحات الخريجين الـ12: السطر الأول (سؤال المساعدة) دائماً، والسطر الثاني (label الطوارئ + رابط `tel:` بـ dir=ltr) فقط إذا وُجد هاتف من `useContactPhone` (أو من prop `phone` للاختبارات). النسخ اليدوية أزيلت من Otp/OrderRejected/GraduateGuide/Step1/Step2/Login/MyTicket؛ وبقي `ContactPhoneLink` لصفحة دخول الماسح فقط كما هو محدد.

### مدققات الحقول `utils/validators.js` و`utils/payments.js`
- `validateTransactionId`: نقيّة؛ trim فقط بلا تغيير حالة الأحرف، رسائل عربية مطابقة للباك (فارغ/قصير/غير صالح، 4-100 حرف `[A-Za-z0-9-]`). تُستخدم في ShamCashPayment مع خصائص حقل تحافظ على ما يُكتب حرفياً (`inputMode=text`, `dir=ltr`, `autoCapitalize=off`, maxLength=100)، وكل مواضع العرض تعرض القيمة كما وصلت (لا toUpperCase ولا text-transform).
- `validateShamCashAccount` / `validateReceiverName` / `validateSupportPhone`: تطابق قواعد A1 وقواعد الهاتف نفسها، والرسائل حرفياً مثل رسائل الباك؛ مربوطة بتبويب إعدادات الإدارة مع خطأ تحت كل حقل و`aria-invalid` ومنع الحفظ أثناء الخطأ، ورسائل 422 من السيرفر تُعرض تحت الحقل الصحيح.

### أزرار وتسجيلات مبسطة
- دخول الماسح: زر submit واحد «تسجيل الدخول» («جاري الدخول...» أثناء العمل)؛ منتقي الحفل (409 SCANNER_EVENT_REQUIRED) يكتمل بنفس الزر ويُعطَّل حتى اختيار فعالية؛ تعديل المستخدم/كلمة المرور يمسح المنتقي. منطق performLogin والجلسة لم يُمس.
- أُزيلت: رقاقة ‎+963‎ من حقل هاتف الخريج، checkbox «تذكرني» من دخول المدير، وصندوق البحث العلوي من لوحة التحكم (مع حالته ومرشحه وCSS الخاص به).

### طبقة نتائج الماسح داخل الكاميرا (D10)
الطبقة صارت كلاس `.scan-cam-result-overlay` في `ScannerCamera.css` (بدل inline style): `position:absolute; inset:0; z-index:40; display:flex; column; overflow:hidden` مع خلفية حسب نوع النتيجة (`--error` أحمر، `--success`/`--wrong_ceremony` كريمي). داخلها الشاشات الثلاث تحجّم نفسها بالحاوية (`height:100%` بلا vh/dvh)، منطقة المحتوى وحدها تمرر (`overflow-y:auto; overscroll-behavior:contain; scrollbar-width:thin`)، والهيدر والفوتر `flex-shrink:0` والفوتر يحتفظ بحشو safe-area. على الشاشات القصيرة (`max-height:700px`) يُضغط الـ hero. المسارات المستقلة `/scanner/error|result|wrong-ceremony` بقيت بـ 100dvh كما هي. التحقق: `tests/scannerOverlayFit.test.mjs` (ثوابت CSS ثابتة) + قائمة الفحص اليدوية في `docs/TASKS_polish-round-1.md`.


---

## الجلسات وتجديد التوكن، وتحديث صفحة الخريج تلقائياً

**المشاكل يلي انحلت:**
1. حراس الصفحات (`App.jsx` و`TicketGuard` و`useMyTicket` وحارس الماسح) كانوا يفحصوا التوكن القصير (ساعتين) فقط، فبعد ساعتين أو عند إعادة تحميل الصفحة كانوا يرجعوا المستخدم لصفحة الدخول قبل ما يتجدد التوكن. صاروا يستعملوا `hasAdminSession()` و`hasGraduateSession()` و`hasScannerSession()` (بـ `api/session.js`): الجلسة صالحة إذا التوكن القصير صالح **أو** عنده توكن تجديد لسا ما انتهت جلسته.
2. الجلسات كانت بـ `sessionStorage` (بتروح لما بيسكّر التبويب أو يفتح تبويب جديد). صارت جلسات الأدمن والخريج والماسح بـ `localStorage` (جلسة قديمة بـ sessionStorage بتنفهم وبتنمسح عند الخروج). خطوات التسجيل القصيرة (تأكيد البريد، واستعادة كلمة السر) بقيت بـ sessionStorage.
3. عدة طلبات متزامنة كانت تجدّد التوكن بنفس اللحظة، والباك بيدوّر التوكن وبيلغي الجلسة كلها إذا رجع توكن مستعمل. صار التجديد **مرة وحدة بالمرة** (`utils/singleFlight.js`) وبين التبويبات (Web Locks API)، وإذا تبويب تاني جدّد قبلنا بنستعمل توكنه (`reuseFreshToken`).
4. انقطاع الإنترنت أو خطأ 5xx أثناء التجديد ما بيطلّع المستخدم من حسابه: بس رفض توكن التجديد (400/401/403) بينهي الجلسة.

**تحديث صفحة «بانتظار المراجعة» تلقائياً (`OrderStatus.jsx`):** بتسأل السيرفر كل **15 ثانية** (والتبويب ظاهر)، وفوراً لما يرجع الخريج للتبويب أو يرجع الاتصال. التحديث صامت (`refresh()` من `useMyTicket`): ما بيظهر «جارٍ التحميل» وما بيستبدل الصفحة بخطأ. لما تتغير الحالة، `routeForTicket` (بـ `utils/ticketRoute.js`) بينقله لصفحته: قُبل ← `/my-ticket`، رُفض ← `/payment-rejected`.

**الاختبارات:** `sessionPersistence` و`singleFlight` و`ticketRoute` و`authWiring` (19 اختبار).


---

## مسار الرفض: من نافذة رفض الإدارة إلى صفحة الخريج (fix/rejection-flow)

**المشكلة يلي انحلت:** لما ترفض الإدارة طلب دفع كان الخريج يشوف نصاً ثابتاً قديماً («وجود خطأ في مطابقة الإشعار» وتلميح إعادة كتابة رقم العملية) لا يطابق أسباب الإدارة الحقيقية. الآن السبب يظهر كما كُتب، والخريج يختار إعادة الدفع عند توفرها، والتواصل معنا عبر واتساب.

**المسار الكامل:**
1. الإدارة: `pages/admin/AdminPaymentRequests.jsx` → نافذة الرفض فيها الآن أزرار أسباب جاهزة فوق مربع النص (`pages/admin/RejectReasonPresets.jsx`) + جملة «سيظهر هذا السبب للخريج كما كُتب.» (D2) + عدّاد `n/255`. التحقق القديم (3..255 بعد trim) لم يُمس؛ اختيار سبب يملأ المربع ويبقى قابلاً للتعديل. الإرسال عبر `rejectTicket(ticketId, reason)` (hook `useAdminPayments.js`) بلا تغيير.
2. الباك: `POST /api/admin/tickets/{id}/reject` يخزّن `rejection_reason` ويكتبها ضمن `details` في سجل التدقيق `PAYMENT_REJECTED` (A1.1/D3). الخريج يراها عبر `GET /api/graduates/me/ticket` (حقل `rejection_reason` موجود أصلاً في `TicketSummary`).
3. الخريج: صفحة «بانتظار المراجعة» تتحدث تلقائياً كل 15 ثانية وتنقله إلى `/payment-rejected` (منطق `OrderStatus.jsx` و`ticketRoute` لم يُمس). هناك `pages/student/OrderRejected.jsx` تعرض السبب عبر `rejectionReasonText` مع fallback للطلبات القديمة بلا سبب، ومكوّن `components/RejectionOptions.jsx` يطبّق D5.

**الملفات:**
- `src/config/rejectReasons.js` — قائمة الأسباب الجاهزة `REJECT_REASON_PRESETS` (المصدر الوحيد، D1). **ملاحظة انحراف:** قرار D1 ذكر ثلاث strings فقط بينما المهمة B1.1 تشترط خمسة؛ اعتمدنا خمسة (الثلاثة الأولى هي strings D1 نفسها مع إتمام الأولى الناقصة «…سعر الباقة.» و«…غير موجود.» + سببين إضافيين). لتغيير الأسباب كلها تُعدَّل هذه القائمة فقط (كل سبب يجب أن يبقى بين 3 و255 حرفاً ومتميزاً — اختبار `rejectReasonPresets.test.mjs` يفرض ذلك).
- `src/pages/admin/RejectReasonPresets.jsx` — أزرار تختار سبباً وتستدعي `onPick(text)`.
- `src/utils/rejection.js` — دوال نقية: `supportHref(phone)` (تحويل رقم الدعم إلى رابط واتساب بعد التحقق)، `rejectionReasonText(ticket)` (السبب بعد trim أو fallback D6)، `rejectionActions({registrationOpen, phone})` → `{canResubmit, callHref, showClosedNotice, showOfficeText}`.
- `src/components/RejectionOptions.jsx` — عنوان «ماذا تريد أن تفعل؟» وزر «إعادة الدفع» فقط أثناء فتح التسجيل. تم توحيد التواصل عبر واتساب في `HelpFooter` مع عرض أيقونة واتساب.
- `src/pages/student/OrderRejected.jsx` — صياغة D6 (badge «الطلب مرفوض»، headline «تم رفض طلب الدفع»، subtext جديد، «سبب الرفض:»، fallback «لم يُرفق سبب للرفض. تواصل معنا على الواتساب للاستفسار.»)؛ بقيت الهيدر و`HelpFooter` والتذييل وحالات التحميل/الخطأ وزر إعادة المحاولة.

**عبارات الصفحة والسبب:** نصوص الخريج كلها في `utils/rejection.js` و`RejectionOptions.jsx` و`OrderRejected.jsx` أعلاه؛ نصوص نافذة الإدارة حول المربع في `AdminPaymentRequests.jsx`؛ الأسباب الجاهزة في `config/rejectReasons.js` وحدها. الاختبارات: `rejectReasonPresets` و`rejectionUtils` و`rejectionOptions` (SSR عبر Vite + react-dom/server، بلا أي dependency جديد).


---

## صفحة الإحصائيات الجديدة (`/admin/dashboard`)

أُعيد بناؤها: `pages/admin/AdminDashboard.jsx` (الإطار والفلتر والتحديث) و`pages/admin/stats/StatsView.jsx` (الأقسام) و`hooks/useAdminStatsV2.js` و`utils/stats.js` (دوال نقية) و`config/statsHelp.js` (تعريف كل رقم لنافذة ⓘ) و`style/AdminStats.css` (بألوان الواجهة فقط، وهذا مختبَر).

- **الفلتر العلوي** (حفل محدد / كل الحفلات) يشمل كل أقسام الصفحة.
- **التحديث:** تلقائي كل 30 ثانية (10 يوم الحفل) والتبويب ظاهر، وفوراً عند العودة له، وزر «تحديث» و«آخر تحديث». التحديث بالخلفية لا يستبدل الصفحة بحالة تحميل أو خطأ. السيرفر يخزّن الجواب 30 ثانية فالضغط ثابت.
- **كل رقم قابل للضغط** وبيفتح صفحة الخريجين بالفلتر المقابل (`actions?event_id=..&registration=verified&ticket=confirmed`). صفحة الخريجين صار فيها فلتر «الحفل» وبتقرأ الفلاتر من الرابط (القيم الغلط بتنتجاهل).
- **الأقسام:** الدخول (بارز دائماً) ← حالة الخريجين المسجلين + شريط المتابعة تحتها (بانتظار المراجعة وأقدمها، ومرفوضة، وبانتظار تأكيد البريد، وطلب تم تأكيده) | الحضور المتوقع ← المالية، والأوائل، وتمثيل الدفعة ← حسب الكلية (ترتيب، وعرض الكل) ← الحسابات المؤكدة، وإغلاق التسجيل، ومتوسط المراجعة.
- حُذف جدول «سجل التدقيق للخريجين» (صار تبويب الخريجين)، وكلام «مهلة السداد 48 ساعة» و«تم إشعار المرفوضين» (غير صحيحين).
- **الاختبارات:** `stats` (الدوال، ومطابقة الروابط لعقد صفحة الخريجين)، و`statsView` (رسم الصفحة بجوابين حقيقيين من الـ API: حفل واحد وكل الحفلات، وحالة فارغة)، و`statsPageWiring` (الفلتر، وسرعة التحديث، والألوان، وعدم تداخل الأزرار).


---

## تحسينات الأدمن (admin-polish-2) — فرع `fix/admin-polish-2`

### 1) صفحة الخريجين: حذف «الملف المرفوع» من الواجهة فقط (D1)
- حُذف من `RosterFilters.jsx` فلتر «الملف المرفوع»، ومن `RosterTable.jsx` عمود الملف (و`colSpan` الحالة الفارغة)، ومن `RosterDrawer.jsx` سطر الملف، ومن `RosterTab.jsx` استدعاء `listUniversityFiles` وتمرير `files`.
- أُزيل `fileId` من `EMPTY_FILTERS`/`QUERY_KEYS`/`SEARCH_IDS` في `utils/roster.js`. **لم يُمس** العمود في قاعدة البيانات ولا بارامتر API `file_id` ولا حقلا الرد `file_id`/`file_name` ولا عمود «الملف المرفوع» في تصدير Excel (صفحة الملفات والمستورد ما زالوا يستخدمونها). فلتر الكلية وعمودها موجودان كما هما.
- الاختبارات: `roster.test.mjs` (محدَّث) و`rosterNoFile.test.mjs` (ثابت: لا ذكر لـ fileId/file_name/«الملف المرفوع» في ملفات الواجهة، والكلية باقية)؛ `rosterContract.test.mjs` بقي أخضر (الصفحة ترسل بارامترات أقل مما يقبله API — مسموح).

### 2) تأكيد الإيميل بدون OTP (A1/B2، D3-D5)
- API جديد: `POST /api/admin/graduates/{id}/verify-email` → الخدمة `verify_email_service` (404 غير معروف، 400 مؤكَّد مسبقاً، يستهلك كل رموز OTP المفتوحة، صفّر عدّاد Redis، سجل تدقيق `VERIFY_EMAIL` بلا البريد في التفاصيل، مسح كاش الإحصائيات). رسالة النجاح: «تم تأكيد البريد الإلكتروني للخريج، ويمكنه تسجيل الدخول الآن.»
- Roster: علم جديد `actions.verify_email` = حساب موجود وغير مؤكَّد (`roster.py` + `_item`)؛ العقد additive ومُحدَّث في `openapi_baseline.json`.
- Drawer: زر «تأكيد الإيميل» بعد «إرجاع الدفع لقيد المعالجة» وقبل تعديل البريد؛ نافذة التأكيد تعرض البريد بـ `dir="ltr"` + جملة D3 الحرفية؛ معطَّل مع تلميح «متاح فقط لحساب لم يؤكد بريده بعد.»؛ لا يظهر إطلاقاً لغير المسجلين؛ نص النجاح = رسالة السيرفر. Hook: `verifyGraduateEmail(id)` في `useAdminGraduates.js`.
- الاختبارات: باك `tests/test_admin_verify_email.py` (9 حالات تشمل الدخول المباشر بعد التأكيد وهبوط `unverified_accounts`)؛ فرونت `rosterDrawerVerifyEmail.test.mjs` (SSR ثلاث حالات + فحص أن مفاتيح `ACTIONS` كلها في `RosterActions` من العقد).

### 3) العدّاد الموحّد لطلبات الدفع بانتظار المراجعة (B3، D2)
- `App.jsx`: `refreshPendingPayments` صار يقرأ `GET /api/admin/stats/v2` (بدون event_id) ← `attention.processing` عبر الدوال النقية في `utils/pendingPayments.js` (`fetchPendingPaymentsTotal`, `readAttentionProcessing`, `PENDING_PAYMENTS_POLL_MS = 30000`). تحديث كل 30 ثانية أثناء ظهور التبويب وفوراً عند استعادة التركيز (مع تنظيف المؤقتات والمستمعات). **API الكونتكست لم يتغير**: `pendingPayments` / `refreshPendingPayments`.
- شارة الشريط الجانبي ورأس صفحة طلبات الدفع يعرضان نفس الرقم بالضبط؛ عنوان الرأس: «بانتظار التدقيق في كل الحفلات: N» مع title إرشادي. بطاقات كل حفل بقيت لكل حفل لكن صارت موسومة باسم الحفل: «قيد التدقيق والمعالجة (اسم الحفل)» حتى لا يُخلط الرقمان. القائمة والفلاتر والإجراءات واستدعاءات `onPendingChanged` بعد القبول/الرفض كما هي بلا تغيير.
- لا قراءة لإحصائيات `/api/admin/stats` القديمة في هذا المسار إطلاقاً.
- الاختبار: `pendingCounter.test.mjs` (الدوال النقية + ثابت: المصدر stats/v2 وليس stats القديم، الرأس يستخدم رقم الكونتكست وعبارة «في كل الحفلات»، فترة التحديث ≥ 20 ثانية).
---

## إخفاء المقاعد من الواجهة (hide-seats)

**القرار:** الباك إند بيضل يخصّص المقعد عند تأكيد الدفع ويرجّعه بالـ API (حقل `seat` بـ `GET /api/graduates/me/ticket` وتفاصيل التذكرة والخريج، وأعمدة المقاعد بتصدير Excel) بدون أي تغيير. الواجهة بس ما عادت تعرضه.

| الملف | التغيير |
|---|---|
| `pages/student/MyTicket.jsx` | حذف صندوق «رقم مقعدك» ومتغير `seat`؛ سطر التعريف بصورة QR المنزّلة صار اسم الحفل دائماً بدل رقم المقعد |
| `pages/student/GraduateGuide.jsx` | حذف قسم «رقم مقعدك» من مرحلة `paid` |
| `pages/admin/AdminPaymentRequests.jsx` | حذف `seat` من الصفوف، وسطر «المقعد: ...» من الجدول، وإشعار «تم التأكيد. المقعد: ...» بعد التأكيد |

**ملاحظات:**
- أصناف `.tk-seat-*` بـ `MyTicket.css` بقيت بدون استخدام (عمداً، ما عدّلنا على التصميم).
- للرجوع لعرض المقعد: البيانات موجودة بالـ API، يكفي إعادة العرض بالواجهة.