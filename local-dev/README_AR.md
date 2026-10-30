# تشغيل المشروع عاللوكال على ويندوز (بدون Docker وبدون WSL)

## مرة وحدة: نزّلي 4 برامج
1. **Python 3.12 أو 3.13** من python.org. وقت التثبيت علّمي على ✅ *Add python.exe to PATH*.
2. **Node.js 20 LTS أو أحدث** من nodejs.org.
3. **PostgreSQL 16** (EDB installer):
   - احفظي كلمة السر يلي بتحطيها لمستخدم `postgres`.
   - خلي البورت 5432.
   - ما في داعي لـ Stack Builder.
4. **Redis لويندوز**:
   - افتحي https://github.com/tporadowski/redis/releases ونزّلي `Redis-x64-5.0.14.1.zip`.
   - فكّي الضغط بمجلد `C:\redis`، لازم يكون فيه `C:\redis\redis-server.exe`.

## مرة وحدة: الإعداد
1. انسخي مجلد `local-dev` لجذر الريبو (جنب `back` و `front`).
2. دبل كليك على `local-dev\setup_local.bat`. أول مرة بيفتحلك Notepad:
   - بدّلي `CHANGE_ME` بكلمة سر postgres.
   - احفظي وسكّري.
   - شغّليه مرة تانية.
3. السكربت بيعمل لحاله:
   - venv للباك وتنزيل الحزم،
   - قاعدة `graduation_dev`،
   - كل الـ migrations،
   - داتا تجريبية كاملة،
   - `npm install` للفرونت.

## كل يوم
- دبل كليك على **`local-dev\start_local.bat`**. بيفتح Redis والباك والفرونت، وبيفتح المتصفح على https://localhost:5173.
- أول مرة المتصفح بيقول إنو الشهادة مو آمنة. اختاري *Advanced → Proceed*، هي شهادة محلية للتطوير، ولازمة كرمال كاميرا السكانر.
- إذا بدك الفرونت لحاله: `start_front.bat`. بس صفحات بدها API ما رح تشتغل إلا والباك شغّال.
- توثيق الـ API: http://localhost:8000/docs

## حسابات التجربة (بعد الداتا التجريبية)
| الدور | الدخول | كلمة السر |
|---|---|---|
| أدمن | `admin` | `admin-dev-2026!` |
| سكانر حفل 1 | `scanner_main` | `scanner-dev-2026!` |
| خريجين | `student1@example.com` … `student8@example.com` | `graduate-dev-2026!` |

- كل خريج بحالة مختلفة: 1 بلا تذكرة، 2 بانتظار الدفع، 3 و4 قيد المراجعة، 5 و6 مؤكدة، 7 مرفوضة، 8 إيميل غير مؤكد. تفاصيلهم بملف `back\seed_manifest.json`.
- رمز OTP التجريبي `123456`.
- الإيميل ما بينبعت عاللوكال: أي رمز OTP جديد بيطلع مكتوب بنافذة الـ Backend.

## إذا خربت الداتا
`reset_demo_data.bat`: بيمسح قاعدة **اللوكال بس** وبيرجّع الداتا التجريبية.

## قواعد أمان
- `local-dev\local.env` للوكال بس وما بيترفع على git (موجود بـ .gitignore).
- **ممنوع** تحطي فيه رابط قاعدة السيرفر أو أي باسورد حقيقي.
- سكربت الداتا بيرفض أي قاعدة اسمها ما بيخلص بـ `_dev` أو `_test`، يعني ما بيقدر يلمس الإنتاج.

## مشاكل شائعة
| الرسالة | الحل |
|---|---|
| `password authentication failed for user "postgres"` | كلمة السر غلط بـ `local.env` |
| `connection refused ... 5432` | خدمة PostgreSQL مطفية: Services → postgresql-x64-16 → Start |
| `/health` بيقول `redis: error`، أو تسجيل الدخول بيعطي 500 | Redis مو شغّال: شغّلي `start_redis.bat` (التوكنات بتنحفظ بـ Redis) |
| `'py' is not recognized` و `'python' is not recognized` | رجعي ثبتي Python مع *Add to PATH* |
| البورت 8000 أو 5173 مستخدم | سكّري النوافذ القديمة للباك/الفرونت |
