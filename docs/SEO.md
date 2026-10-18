# SEO — الفهرسة العامة

الهدف (القرار D7): **صفحة الهبوط العامة فقط (`/`) قابلة للفهرسة**، وكل الصفحات الخاصة `noindex`.

## المكوّنات
- `front/seo.config.json`: الإعداد المركزي (اسم الموقع، العنوان الافتراضي، القالب `%s | ...`، الوصف، الكلمات المفتاحية، اللغة/الاتجاه، والمسارات العامة). حالياً مسار عام واحد فقط: `/`.
- `front/scripts/generate-seo.mjs`: يُنفَّذ تلقائياً قبل البناء (`prebuild`) فيولّد `front/public/sitemap.xml` و`front/public/robots.txt` اعتماداً على `seo.config.json` وعلى `VITE_SITE_URL`/`SITE_URL` (افتراضياً `http://localhost:5173`). ملفان مُولّدان ومُستثنيان من Git.
- `front/index.html`: `<html lang="ar" dir="rtl">` مع عنوان افتراضي عربي.
- `front/vite.config.js`: مُلحق `seoPlugin` يحوّل `transformIndexHtml` فيحقن في وقت البناء: `description`، `keywords`، `robots` (index, follow)، وسوم og/twitter، ورابط `canonical` (عند توفّر عنوان الموقع).
- `front/src/hooks/usePageMeta.js`: يضبط `document.title` ووسم `robots` و`description` وقت التشغيل؛ الافتراضي `noindex, nofollow`.
- `front/src/App.jsx`: يستدعي `usePageMeta({ robots: pathname === "/" ? "index, follow" : "noindex, nofollow" })` — نقطة التكامل الوحيدة التي تجعل كل المسارات غير `/` غير مفهرسة.
- `front/nginx.conf`: وسم `X-Robots-Tag: noindex, nofollow` للمسارات الخاصة ولـ`/api/`، مع تخزين مؤقت مؤقت لـ`robots.txt` و`sitemap.xml`.

## التشغيل
```bash
cd front
npm run build      # يستدعي prebuild ثم يبني ويحقن الوسوم
```
ينتج `front/public/sitemap.xml` و`front/public/robots.txt` (يُنسخان إلى `dist/`).

## المتغيّرات
- `VITE_SITE_URL` (أو `SITE_URL`): الأصل العام للموقع، يُستخدم في `sitemap.xml` ورابط `canonical`. مثال: `https://grad.example.sy`.

## القاعدة
عند إضافة مسار عام جديد قابل للفهرسة، أضِفه إلى `publicRoutes` في `seo.config.json` **واستثنِه** من قائمة `noindex` في `App.jsx`/`nginx.conf`.
