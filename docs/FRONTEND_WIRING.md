# توصيل الواجهة بالباك إند (FRONTEND_WIRING)

يصف هذا الملف كيف صارت واجهة `front/` موصولة فعلياً بنقاط الـ API، والصفحة التي تستدعي أي نقطة، ونوع الرمز (token) المستخدم. آخر تحديث: ختام **Step 3** (دمج الإدارة + إكمال صفحات الإدارة).

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
- `GET /api/admin/volunteers` لا يوفّر فلترة بـ`top_rank`؛ لذلك لا يوجد فلتر «الأولوية» في صفحة المتطوعين (غير مطلوب أصلاً).
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
