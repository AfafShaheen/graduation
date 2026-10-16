# دليل تكامل الواجهة الأمامية للخطوة الأولى (Frontend Integration - Step 1: Major, GPA, Rank)

يهدف هذا الدليل إلى توضيح كيفية دمج متطلبات التخصص (Major)، المعدل (GPA)، والترتيب (Top-3 Rank) في نموذج تسجيل الخريجين بالواجهة الأمامية.

---

## 1. جلب بيانات النموذج (Load Form Data)
قبل عرض نموذج التسجيل، يجب جلب قائمة الكليات والتخصصات المتاحة للحفلات المفتوحة عبر نقطة النهاية العامة (لا تتطلب أي مصادقة):
- **الرابط:** `GET /api/registration/colleges`
- **الاستجابة المتوقعة:**
```json
[
  {
    "id": 1,
    "name": "كلية الهندسة المعلوماتية",
    "event_id": 10,
    "majors": [
      {"id": 101, "name": "هندسة برمجيات"},
      {"id": 102, "name": "شبكات حاسوبية"}
    ]
  }
]
```

---

## 2. هيكل طلب التحقق (Exact Verify-Step1 Body with Example)
عند إرسال البيانات للتحقق في الخطوة الأولى، يجب تضمين الحقول الأكاديمية الجديدة (`major_id`, `gpa`, `top_rank`):

- **الرابط:** `POST /api/graduates/verify-step1`
- **مثال على الجسم (JSON Body):**
```json
{
  "college_id": 1,
  "university_id": "20201234",
  "full_name": "محمد أحمد علي",
  "father_name": "أحمد",
  "mother_name": "سعاد",
  "gender": "ذكر",
  "major_id": 101,
  "gpa": "95.50",
  "top_rank": 1
}
```

---

## 3. جدول مطابقة الحقول (Form → API Mapping Table)

| حقل النموذج (Form Field) | حقل طلب API (`verify-step1`) | النوع والقيود | ملاحظات الواجهة |
|---|---|---|---|
| اختيار الكلية | `college_id` | عدد صحيح (`int`, gt=0) | يُختار من قائمة `GET /api/registration/colleges` |
| الرقم الجامعي | `university_id` | نص (`str`, 1–100 حرف) | مطابق للسجل الجامعي |
| الاسم الكامل | `full_name` | نص (`str`, أحرف ومسافات) | مطابق للسجل الجامعي |
| اسم الأب | `father_name` | نص (`str`, أحرف ومسافات) | مطابق للسجل الجامعي |
| اسم الأم | `mother_name` | نص (`str`, أحرف ومسافات) | مطابق للسجل الجامعي |
| الجنس | `gender` | نص (`str`, "ذكر" أو "أنثى") | يُطابق بعد تطبيع الحروف العربية |
| التخصص | `major_id` | عدد صحيح اختيارى (`int`, gt=0) | اختياري (null إذا لم يكن للكلية تخصصات) |
| المعدل التراكمي | `gpa` | نص أو رقم (`Decimal`, 0–100, بحد أقصى منزلتين عشريتين) | يُقبل الفاصلة `,` أو النقطة `.` والأرقام العربية/الشرقية |
| الترتيب الأول/الثاني/الثالث | `top_rank` | عدد صحيح اختيارى (`Literal[1, 2, 3]` أو `null`) | يُحدد إن كان الخريج من الثلاثة الأوائل على التخصص |

---

## 4. استجابات الأخطاء (Error Responses)

1. **فشل التحقق العام (أي خطأ في البيانات أو عدم مطابقة المعدل/التخصص/الترتيب):**
   - **رمز الحالة:** `400 Bad Request`
   - **الاستجابة:** `{"detail": "فشل التحقق من البيانات. يرجى التأكد من صحة المدخلات. رقم التواصل: +963..."}` (أو الرسالة العامة دون رقم التواصل إن لم يُضبط الإعداد).
   - **ملاحظة أمنية:** لا تكشف الواجهة الباك إند أي حقل تسبّب في الفشل لمنع التخمين (Information Leakage).

2. **إغلاق نافذة التسجيل أو عدم فتحها بعد:**
   - **رمز الحالة:** `403 Forbidden`
   - **الاستجابة:** `{"detail": "التسجيل مغلق لهذا الحفل."}` أو `{"detail": "لم تبدأ فترة التسجيل بعد."}`

3. **أخطاء التحقق من صحة الصيغة (مثل معدل سالب أو أكثر من منزلتين عشريتين):**
   - **رمز الحالة:** `422 Unprocessable Entity`
   - **الاستجابة:** تفاصيل خطأ Pydantic.

---

## 5. الخطوة الثانية وانتهاء صلاحية الرمز (Step 2 & Token Expiry)
- عند نجاح الخطوة الأولى (`200 OK`)، يعيد الخادم `registration_token` (صلاحيته 15 دقيقة).
- يُرسل هذا الرمز مع البريد والهاتف وكلمة السر إلى `POST /api/graduates/register`.
- في حال انقضاء 15 دقيقة، سيعيد الخادم خطأ `401 Unauthorized` برسالة: *"Registration session expired. Please redo Step 1 (انتهت جلسة التسجيل. يرجى إعادة الخطوة الأولى.)"*، ويجب على الواجهة توجيه المستخدم لإعادة الخطوة الأولى.

---

## 6. مقطع جافاسكريبت جاهز للاستخدام (Ready-to-Paste JS Snippet)

```javascript
async function verifyGraduateStep1(formData) {
  try {
    // 1. Fetch colleges and majors
    const collegesRes = await fetch('/api/registration/colleges');
    if (!collegesRes.ok) throw new Error('فشل جلب الكليات');
    const colleges = await collegesRes.json();

    // 2. Submit Step 1 verification payload
    const response = await fetch('/api/graduates/verify-step1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        college_id: Number(formData.collegeId),
        university_id: formData.universityId.trim(),
        full_name: formData.fullName.trim(),
        father_name: formData.fatherName.trim(),
        mother_name: formData.motherName.trim(),
        gender: formData.gender,
        major_id: formData.majorId ? Number(formData.majorId) : null,
        gpa: formData.gpa.toString(),
        top_rank: formData.top_rank ? Number(formData.top_rank) : null
      })
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.detail || 'حدث خطأ أثناء التحقق');
      return null;
    }

    console.log('نجاح التحقق! رمز التسجيل:', data.registration_token);
    return data.registration_token; // Proceed to Step 2
  } catch (error) {
    console.error('خطأ الشبكة أو الخادم:', error);
    alert('تعذر الاتصال بالخادم.');
    return null;
  }
}
```
