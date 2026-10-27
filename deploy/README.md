# رفع النظام على cPanel بكبسة وحدة

| الملف | شو بيعمل |
|---|---|
| `deploy_front.bat` | بيعمل build للفرونت وبيرفعو على `public_html/graduation` |
| `deploy_back.bat` | بيرفع ملفات الباك المتغيّرة على `graduation_back`، وبيعمل restart |
| `check_site.bat` | بيفحص الموقع والـ API بس، بدون ما يرفع شي |
| `deploy.config.json` | الإعدادات (انسخيه من `deploy.config.example.json`) |
| `deploy.py` | الكود يلي بينفّذ كل شي |

## أول مرة بس

1. حطي مجلد `deploy` بجذر الريبو، جنب `front` و`back`.
2. انسخي `deploy.config.example.json` لملف اسمو `deploy.config.json`، وحطي فيه اسم مستخدم الـ FTP.
3. ضيفي هالسطرين لـ `.gitignore` بجذر الريبو:
   ```
   deploy/deploy.config.json
   deploy/.deploy_cache.json
   ```
4. **باسورد الـ FTP ما بتنحط بأي ملف.** السكريبت بيسألك عنها كل مرة. وإذا ما بدك تكتبيها كل مرة، حطيها بمتغير البيئة `DEPLOY_FTP_PASSWORD` على جهازك.

## كل مرة بدك ترفعي

دبل كليك على `deploy_front.bat` أو `deploy_back.bat`، واكتبي باسورد الـ FTP، واكبسي `y`.

## شو بيعمل وراء الكواليس

**الفرونت:**
- بيعمل build بنفس المتغيرات يلي بالإعدادات.
- بيتأكد إنو `index.html` فيه `/graduation/assets/` وإنو `.htaccess` موجود. إذا لا، **بيوقف وما بيرفع شي**.
- بيرفع الملفات على `graduation__new`، وبعدين بيبدّل المجلدات. هيك الموقع ما بيكون نص مرفوع ولا لحظة.
- النسخة القديمة بتضل باسم `graduation__old`. إذا طلع شي غلط، شغّلي `python deploy.py rollback-front` وبترجع.
- بالآخر بيفحص `/graduation/` و`/graduation/login`.

**الباك:**
- بيرفع **بس الملفات يلي تغيّرت** من آخر رفع. بيعرفها من الـ hash، والسجل محفوظ بـ `.deploy_cache.json`. وإذا بدك يرفع كل شي من جديد، استخدمي `--full`.
- ما بيرفع أبداً: `.env*` و`tests` و`__pycache__` وملفات الـ SRS وأي شي بقائمة `skip`.
- `passenger_wsgi.py` محطوط بـ `skip`، لأنو النسخة الشغّالة على السيرفر هي المصلّحة (يلي فيها lazy a2wsgi). شيليه من `skip` بس بعد ما ينحط نفس الإصلاح بالريبو.
- بيعمل restart عن طريق `tmp/restart.txt`، وبيستنى لحد 60 ثانية لـ `/gradapi/health`.
- إذا تغيّر `requirements.txt`، بيطبعلك أمر الكرون الجاهز يلي بينصّب المكتبات.
- إذا انرفع migration جديد، بيذكّرك تشغّلي `run_migrations`. السكريبت آمن إذا انعاد.

## الحماية

- بيرفض يستبدل أو يحذف `public_html` نفسو، أو `app` أو `api` أو `guide` أو `yawmi` أو `gradapi` أو `wijhatak` أو `virtualenv`.
- ما بيحذف أي ملف من الباك على السيرفر. بيضيف وبيكتب فوق بس.
- ما بيلمس `.env` ولا `stderr.log` على السيرفر.
