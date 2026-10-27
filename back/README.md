# نظام تسجيل وتذاكر حفلات التخرج — الواجهة الخلفية (Backend)

واجهة خلفية مبنية بـ FastAPI و SQLAlchemy 2 (async) و PostgreSQL 15 و Redis 7.
المنتج عربي بالكامل، والمستند المرجعي هو ملف SRS الموجود في هذا المجلد.

## بنية المشروع

```
back/
  app/
    core/        # database.py, redis.py, security.py, deps.py
    models/      # جداول قاعدة البيانات (SQLAlchemy models)
    schemas/     # نماذج Pydantic للطلبات والردود
    routers/     # نقاط الـ API
    services/    # منطق الأعمال
    main.py      # تطبيق FastAPI (نقطة الدخول)
  migrations/
    0001_init_schema.sql   # مخطط قاعدة البيانات الأولي (لا يُعدَّل، تغييرات المخطط عبر Alembic)
  alembic/
    env.py                 # بيئة Alembic (async) — يقرأ الـ URL من app.core.database
    versions/              # مراجعات الترحيل (migrations)
  alembic.ini              # إعدادات Alembic (بدون الـ URL؛ يُؤخذ من التطبيق)
  scripts/
    create_admin.py        # إنشاء/تعديل حساب المسؤول الوحيد
    seed_data.py           # زرع بيانات التطوير (قاعدة بيانات اختبار فقط)
    check_endpoints.py     # فحص كل نقاط الـ API (وضع قراءة + وضع كتابة اختياري)
  tests/                   # الاختبارات (pytest)
  requirements.txt         # اعتماديات التشغيل
  requirements-dev.txt     # اعتماديات الاختبار فقط
```

## التشغيل عبر Docker

من جذر المستودع:

```sh
cp .env.example .env      # عدّل القيم ثم استخدمها
docker compose up --build
```

- الـ API متاح على `http://localhost:8000`، والتوثيق التفاعلي على `/docs`.
- فحص الصحة: `curl http://localhost:8000/health`.
- داخل شبكة Compose يتصل الـ backend دائماً بـ Postgres على `db:5432`.
  المتغيّران `DATABASE_HOST` و `DATABASE_PORT` مخصّصان فقط لتشغيل الـ backend
  خارج Docker مقابل المنفذ المنشور.

## إنشاء حساب المسؤول

النظام يحتوي على حساب مسؤول واحد فقط (SRS FR-13)، ولا توجد صفحة تسجيل ولا
نقطة API لإنشائه. أنشئه يدوياً من داخل الحاوية:

```sh
docker compose exec back python -m scripts.create_admin --username admin
```

- يُطلب إدخال كلمة السر مرّتين (لا تُمرَّر كوسيط سطري)، بحد أدنى 12 حرفاً.
- السكربت يرفض إنشاء مسؤول ثانٍ ويعيد رمز خروج غير صفري.
- لتغيير كلمة سر المسؤول الموجود: أضف `--reset-password`.

## ترحيل قاعدة البيانات (Alembic)

تُدار تغييرات المخطط عبر Alembic (async). المراجعة `0001_baseline` تمثّل
المخطط الذي يُنشئه `0001_init_schema.sql`، ويُطبَّق `alembic upgrade head`
تلقائياً عند إقلاع حاوية الـ backend وقبل تشغيل الاختبارات.

```sh
# ترقية قاعدة البيانات إلى أحدث مراجعة
docker compose exec back python -m alembic upgrade head

# إنشاء مراجعة جديدة بفارق تلقائي (autogenerate) بعد تعديل نماذج SQLAlchemy
docker compose exec back python -m alembic revision --autogenerate -m "وصف التغيير"

# الرجوع خطوة واحدة (تنفيذ الدالة downgrade)
docker compose exec back python -m alembic downgrade -1
```

مُلاحظة: لا تُخزَّن بيانات الاتصال في `alembic.ini` — يأخذ Alembic URL قاعدة
البيانات من `app.core.database.DATABASE_URL` نفسها التي يستخدمها التطبيق.

## تشغيل الاختبارات

يجب تشغيل الاختبارات داخل حاوية `back` (تحتاج PostgreSQL و Redis). تستخدم
قاعدة بيانات مخصّصة اسمها `graduation_test` وقاعدة Redis رقم 15، وترفض العمل
إذا لم يكن اسم قاعدة البيانات منتهياً بـ `_test`.

```sh
docker compose exec back sh -c "pip install -r requirements-dev.txt && pytest -q"
```

## بيانات التطوير وفحص النقاط

يوفّر `scripts/` أداتين للتطوير والاختبار فقط. الأداتان تتعاملان مع **قاعدة
بيانات اختبار** (`graduation_test` أو أي قاعدة ينتهي اسمها بـ `_test` / `_dev`)
ولا تمسّان بيانات الإنتاج إطلاقاً.

| السكربت | الوظيفة |
| --- | --- |
| `scripts/seed_data.py` | يزرع بيانات تطوير واقعية: كليات وتخصصات، حفلات، خريجون بحالات مختلفة (مسجَّل، بانتظار الدفع، قيد المعالجة، مؤكد، مرفوض، بريد غير مُتحقَّق)، تذاكر ومدفوعات ورموز QR ومقاعد، سجلات الجامعة، أكواد OTP، ومسؤول وحسابات ماسح. |
| `scripts/check_endpoints.py` | يفحص كل نقاط الـ API ويطبع جدول `OK / FAIL / SKIP` مع سبب لكل نتيجة. يعمل بمكتبة بايثون القياسية فقط (بلا أي اعتمادية جديدة في `requirements.txt`). |

### 1) زرع بيانات التطوير

```sh
# على خادم cPanel
cd /home/sunionhomsuni/graduation_back
./virtualenv/graduation_back/3.11/bin/python -m scripts.seed_data

# أو داخل Docker
docker compose exec back python -m scripts.seed_data
```

- ينشئ قاعدة البيانات ومخططها إن لم تكونا موجودتين مع `--create-db`
  (إنشاء القاعدة ← تطبيق `migrations/0001_init_schema.sql` ← `alembic stamp
  0001_baseline` ← `alembic upgrade head`).
- **حماية**: يرفض السكربت العمل إذا كان `APP_ENV=production` أو إذا لم يكن اسم
  قاعدة البيانات منتهياً بـ `_test` / `_dev`، ولا يُتجاوز ذلك إلا مع
  `--i-know-this-is-dangerous`.
- ينتج ملف `seed_manifest.json` (معرّفات السجلات وبيانات دخول التطوير). الملف
  يحتوي بيانات حسّاسة، لذلك هو مُتجاهَل في `.gitignore` ولا يُرفع إلى Git.
- الزرع **idempotent**: إعادة تشغيله آمنة، وتُعاد القيم الأصلية لكل سجل.
- بيانات الدخول المطبوعة (تطوير فقط): `admin / admin-dev-2026!`،
  `scanner_main / scanner-dev-2026!`، وكل الخريجين بكلمة `graduate-dev-2026!`.
- الخيارات: `--database`، `--create-db`، `--reset`، `--wipe`، `--manifest`،
  `--env-file`، `--admin-username` / `--admin-password`،
  `--scanner-username` / `--scanner-password`، `--graduate-password`، `--quiet`.

```sh
# حذف الصفوف التي زرعها السكربت فقط (يحتاج ملف seed_manifest.json)
./virtualenv/graduation_back/3.11/bin/python -m scripts.seed_data --reset

# تفريغ كل جداول التطبيق (تبقى حسابات الإدارة)
./virtualenv/graduation_back/3.11/bin/python -m scripts.seed_data --wipe
```

### 2) فحص كل نقاط الـ API

```sh
# الوضع الافتراضي: قراءة فقط — آمن على الإنتاج
./virtualenv/graduation_back/3.11/bin/python -m scripts.check_endpoints \
    --base-url https://sunion-homs-uni.sy/gradapi

# الفحص الكامل: ينشئ سجلات مؤقتة (بادئة chk-) ثم يحذفها — على خادم الاختبار فقط
./virtualenv/graduation_back/3.11/bin/python -m scripts.check_endpoints \
    --base-url http://127.0.0.1:8000 --write-checks
```

- الوضع الافتراضي **قراءة فقط**: يقرأ المسارات العامة، يختبر دخول/تحديث/خروج
  الأدوار الثلاثة، كل مسارات القراءة، ويضيف فحوصات سلبية (بدون توكن، توكن
  خاطئ، دور خاطئ، جسم طلب غير صالح) — ولا يكتب أي بيانات.
- `--write-checks` يضيف فحوصات تُنشئ أو تُعدّل بيانات (تسجيل خريج، تذكرة،
  دفعة، مسح QR، ملفات، أكواد OTP). الفحوصات التي تعتمد على بيانات مزروعة
  تُتخطّى بـ `SKIP` إن لم يوجد `seed_manifest.json`، ونتائج الفحص هي
  `OK` / `FAIL` / `SKIP` (لا تُحتسب `SKIP` فشلاً).
- يرفض السكربت تشغيل `--write-checks` على خادم بعيد ما لم يُضَف
  `--allow-remote-writes`، حمايةً من لمس بيانات الإنتاج.
- خيارات أخرى: `--manifest`، `--timeout`، `--insecure`، `--json` (للمعالجة
  الآلية)، `--only "/api/admin"` (تصفية العرض فقط)، `--quiet`.
- كود الخروج `0` عند نجاح كل الفحوصات، و`1` عند وجود أي فشل.

### 3) ترتيب العمل المعتاد

```sh
# 1) ازرع بيانات التطوير
./virtualenv/graduation_back/3.11/bin/python -m scripts.seed_data

# 2) افحص النقاط (قراءة فقط ثم فحص كامل على قاعدة الاختبار)
./virtualenv/graduation_back/3.11/bin/python -m scripts.check_endpoints \
    --base-url http://127.0.0.1:8000
./virtualenv/graduation_back/3.11/bin/python -m scripts.check_endpoints \
    --base-url http://127.0.0.1:8000 --write-checks

# 3) بعد الفحص الكامل أعد الزرع لاستعادة الحالة الأصلية للبيانات المزروعة
./virtualenv/graduation_back/3.11/bin/python -m scripts.seed_data
```

> **تحذير**: لا تُشغّل `seed_data` أو `check_endpoints --write-checks` على قاعدة
> بيانات الإنتاج. الوضع الافتراضي لـ `check_endpoints` آمن على الإنتاج لأنه
> قراءة فقط.
