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
  scripts/
    create_admin.py        # إنشاء/تعديل حساب المسؤول الوحيد
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

## تشغيل الاختبارات

يجب تشغيل الاختبارات داخل حاوية `back` (تحتاج PostgreSQL و Redis). تستخدم
قاعدة بيانات مخصّصة اسمها `graduation_test` وقاعدة Redis رقم 15، وترفض العمل
إذا لم يكن اسم قاعدة البيانات منتهياً بـ `_test`.

```sh
docker compose exec back sh -c "pip install -r requirements-dev.txt && pytest -q"
```
