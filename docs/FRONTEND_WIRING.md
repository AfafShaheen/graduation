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

مصدر حالة التذكرة الموحّد: `front/src/hooks/useMyTicket.js` → `getMyTicket` (`GET /api/graduates/me/ticket`)، ويعيد `{status, seat:{graduate,companions[],range}, ...}` عند التأكيد.

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

1. تسجيل كامل: `/` → `/register` → `/otp` → `/questions` → `/tickets` → `/payment` → `/payment-submitted` → (تأكيد من الإدارة) → `/my-ticket` مع ظهور المقعد والوقت.
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
