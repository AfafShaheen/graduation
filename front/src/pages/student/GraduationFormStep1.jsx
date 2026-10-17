import React, { useState, useEffect, useCallback } from 'react';
import '../../style/GraduationForm.css';
import universityLogo from '../../assets/homs-university-white.png';
import unionLogo from '../../assets/only-logo.png';
import { getRegistrationColleges, verifyStep1 } from '../../api/graduate';
import { setRegistrationToken } from '../../api/session';

/* حروف عربية ومسافات فقط (بدون أرقام أو رموز) */
const ARABIC_ONLY = /^[\u0621-\u064A\u064B-\u0652\s]+$/;
/* أرقام فقط، بدون تحديد عدد معين */
const DIGITS_ONLY = /^[0-9]+$/;

const TOP_RANK_MAP = { none: null, first: 1, second: 2, third: 3 };
const GENDER_MAP = { male: "ذكر", female: "أنثى" };

export function toVerifyStep1Payload(formData, colleges) {
  const college = colleges.find((c) => String(c.id) === String(formData.faculty));
  const major = college?.majors?.find((m) => String(m.id) === String(formData.major));
  return {
    college_id: college?.id || null,
    major_id: major?.id || null,
    university_id: formData.studentId.trim(),
    full_name: formData.fullName.trim(),
    father_name: formData.fatherName.trim(),
    mother_name: formData.motherName.trim(),
    gender: GENDER_MAP[formData.gender] || "ذكر",
    gpa: Number(formData.gpa),
    top_rank: TOP_RANK_MAP[formData.topRank] ?? null,
  };
}

/* الترتيب بين الثلاثة الأوائل */
const TOP_RANK_OPTIONS = [
  { value: 'none', label: 'لا يوجد' },
  { value: 'first', label: 'الأول' },
  { value: 'second', label: 'الثاني' },
  { value: 'third', label: 'الثالث' },
];

/* كل دالة ترجع نص الخطأ، أو نص فاضي إذا القيمة صحيحة */
const validators = {
  fullName: (v) => {
    const t = v.trim().replace(/\s+/g, ' ');
    if (!t) return 'الاسم والكنية مطلوبان';
    if (!ARABIC_ONLY.test(t)) return 'يرجى كتابة الاسم بحروف عربية فقط';
    if (t.split(' ').length < 2) return 'يرجى كتابة الاسم والكنية (كلمتان على الأقل)';
    return '';
  },
  faculty: (v) => (v ? '' : 'اختر الكلية'),
  studentId: (v) => {
    const t = v.trim();
    if (!t) return 'الرقم الجامعي مطلوب';
    if (!DIGITS_ONLY.test(t)) return 'يجب أن يكون الرقم الجامعي أرقاماً فقط';
    return '';
  },
  gpa: (v) => {
    const t = String(v).trim();
    if (!t) return 'المعدل مطلوب';
    const n = Number(t);
    if (Number.isNaN(n)) return 'يرجى إدخال المعدل كرقم';
    if (n < 0 || n > 100) return 'المعدل يجب أن يكون بين 0 و 100';
    return '';
  },
  fatherName: (v) => {
    const t = v.trim();
    if (!t) return 'اسم الأب مطلوب';
    if (!ARABIC_ONLY.test(t)) return 'يجب أن يتكون اسم الأب من حروف عربية فقط';
    if (t.length < 2) return 'اسم الأب قصير جداً';
    return '';
  },
  motherName: (v) => {
    const t = v.trim();
    if (!t) return 'اسم الأم مطلوب';
    if (!ARABIC_ONLY.test(t)) return 'يجب أن يتكون اسم الأم من حروف عربية فقط';
    if (t.length < 2) return 'اسم الأم قصير جداً';
    return '';
  },
};

function FieldError({ message }) {
  if (!message) return null;
  return (
    <p className="error-text" role="alert">
      {message}
    </p>
  );
}

export default function GraduationFormStep1({ onNext, onNavigateToLogin }) {
  const [formData, setFormData] = useState({
    fullName: '',
    gender: 'male',
    faculty: '',
    major: 'none',
    studentId: '',
    topRank: 'none',
    gpa: '',
    fatherName: '',
    motherName: '',
  });

  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [colleges, setColleges] = useState([]);
  const [collegesLoading, setCollegesLoading] = useState(true);
  const [collegesError, setCollegesError] = useState('');

  useEffect(() => {
    let mounted = true;
    setCollegesLoading(true);
    setCollegesError('');
    getRegistrationColleges()
      .then((data) => {
        if (mounted) setColleges(data || []);
      })
      .catch((err) => {
        if (mounted) setCollegesError(err.message || 'تعذّر تحميل الكليات');
      })
      .finally(() => {
        if (mounted) setCollegesLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const selectedCollege = colleges.find((c) => String(c.id) === String(formData.faculty));
  const majors = selectedCollege?.majors || [];

  const handleInputChange = (e) => {
    let { name, value } = e.target;

    if (name === 'gpa') {
      value = value
        .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)) // الأرقام العربية → إنجليزية
        .replace(/٫/g, '.')
        .replace(/[^0-9.]/g, ''); // أرقام ونقطة فقط
      const [whole, ...rest] = value.split('.');
      value = rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole; // نقطة وحدة، ومنزلتين عشريتين
      if (Number(value) > 100) return; // ما بنقبل أكتر من 100
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
      // تغيير الكلية بيرجّع التخصص لـ "لا يوجد" لأن الاختصاصات تابعة للكلية
      ...(name === 'faculty' ? { major: 'none' } : {}),
    }));
    // بعد أول ضغطة على الزر، الخطأ بيتحدّث مباشرة أثناء الكتابة
    if (submitted && validators[name]) {
      setErrors((prev) => ({ ...prev, [name]: validators[name](value) }));
    }
  };

  const handleGenderSelect = (gender) => {
    setFormData((prev) => ({ ...prev, gender }));
  };

  const handleNextStep = async (e) => {
    e.preventDefault();
    if (isLoading) return;

    const newErrors = {};
    Object.keys(validators).forEach((name) => {
      newErrors[name] = validators[name](formData[name]);
    });
    setErrors(newErrors);
    setSubmitted(true);

    const firstInvalid = Object.keys(newErrors).find((k) => newErrors[k]);
    if (firstInvalid) {
      document.getElementsByName(firstInvalid)[0]?.focus();
      return;
    }

    setIsLoading(true);
    try {
      const payload = toVerifyStep1Payload(formData, colleges);
      const { registration_token } = await verifyStep1(payload);
      setRegistrationToken(registration_token);
      if (onNext) onNext(formData);
    } catch (err) {
      if (err.fieldErrors) {
        setErrors((prev) => ({ ...prev, ...err.fieldErrors }));
        const firstField = Object.keys(err.fieldErrors)[0];
        document.getElementsByName(firstField)?.[0]?.focus();
      } else if (err.status === 400 || err.status === 403) {
        setErrors({ general: err.message });
      } else if (err.status === 429) {
        setErrors({ general: 'تم تجاوز الحد المسموح من المحاولات، يرجى الانتظار' });
      } else {
        setErrors({ general: err.message || 'حدث خطأ غير متوقع' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <main className="mobile-shell">
        {/* الهيدر العلوي */}
        <header className="header-main">
          <div className="header-top">
            <button className="icon-btn" aria-label="الرجوع للخلف" type="button">
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
            <h1 className="header-title">حفل تخرج جامعة حمص</h1>
            <div className="icon-btn">
              <img className="header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            </div>
          </div>
          <div className="header-subband">
            <span className="subband-title">إنشاء حساب</span>
            <span className="badge-batch">دفعة 2026</span>
          </div>
        </header>

        {/* شريط التقدم */}
        <section className="progress-section">
          <div className="progress-labels">
            <span className="progress-title">خطوة 1 من 4: معلومات التخرج الأساسية</span>
            <span className="progress-percent">25%</span>
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill"></div>
            <div className="progress-bar-empty"></div>
            <div className="progress-bar-empty"></div>
            <div className="progress-bar-empty"></div>
          </div>
        </section>

        {/* بطاقة النموذج */}
        <div className="form-card">
          <div className="card-header">
            <div className="logo-circle">
              <img src={universityLogo} alt="شعار جامعة حمص" />
            </div>
            <div>
              <h2 className="card-title">ألف مبروك التخرج! 🎓</h2>
              <p className="card-subtitle">سجّل بياناتك لتأكيد حجز مقعدك وتذكرتك الرقمية</p>
            </div>
          </div>

          <form onSubmit={handleNextStep} noValidate>
            {/* الاسم والكنية */}
            {errors.general && (
              <div className="form-group">
                <div className="info-box" style={{ margin: 0, borderColor: '#ba1a1a', background: '#fff5f5' }}>
                  <p className="info-text" style={{ color: '#ba1a1a' }}>{errors.general}</p>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">
                الاسم والكنية <span className="required-star">*</span>
              </label>
              <div className="input-wrapper">
                <input
                  type="text"
                  name="fullName"
                  className={`form-input input-with-icon ${errors.fullName ? 'error' : ''}`}
                  placeholder="مثلاً: مجد العلي"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  aria-invalid={!!errors.fullName}
                />
                <span className="material-symbols-outlined input-icon">badge</span>
              </div>
              <FieldError message={errors.fullName} />
            </div>

            {/* الجنس */}
            <div className="form-group">
              <label className="form-label">
                الجنس <span className="required-star">*</span>
              </label>
              <div className="gender-grid">
                <button
                  type="button"
                  className={`gender-btn ${formData.gender === 'male' ? 'active' : 'inactive'}`}
                  onClick={() => handleGenderSelect('male')}
                >
                  <span className="material-symbols-outlined">
                    {formData.gender === 'male' ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                  <span>ذكر</span>
                </button>
                <button
                  type="button"
                  className={`gender-btn ${formData.gender === 'female' ? 'active' : 'inactive'}`}
                  onClick={() => handleGenderSelect('female')}
                >
                  <span className="material-symbols-outlined">
                    {formData.gender === 'female' ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                  <span>أنثى</span>
                </button>
              </div>
            </div>

            {/* الكلية */}
            <div className="form-group">
              <label className="form-label">
                الكلية <span className="required-star">*</span>
              </label>
              <div className="input-wrapper">
                {collegesLoading ? (
                  <div className="form-select select-with-icon" style={{ display: 'flex', alignItems: 'center', color: '#725b51' }}>
                    جارٍ تحميل الكليات...
                  </div>
                ) : collegesError ? (
                  <div>
                    <div className="error-text" style={{ marginBottom: 8 }}>{collegesError}</div>
                    <button type="button" className="submit-btn" style={{ padding: '8px 16px', fontSize: 13 }} onClick={() => { setCollegesLoading(true); setCollegesError(''); getRegistrationColleges().then(setColleges).catch((e) => setCollegesError(e.message)).finally(() => setCollegesLoading(false)); }}>
                      إعادة المحاولة
                    </button>
                  </div>
                ) : colleges.length === 0 ? (
                  <div className="info-box" style={{ margin: 0 }}>
                    <p className="info-text">التسجيل غير مفتوح حالياً</p>
                  </div>
                ) : (
                  <>
                    <select
                      name="faculty"
                      className={`form-select select-with-icon ${errors.faculty ? 'error' : ''}`}
                      value={formData.faculty}
                      onChange={handleInputChange}
                      aria-invalid={!!errors.faculty}
                    >
                      <option value="" disabled>اختر كليتك من القائمة...</option>
                      {colleges.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined input-icon">expand_more</span>
                  </>
                )}
              </div>
              <FieldError message={errors.faculty} />
            </div>

            {/* التخصص (تابع للكلية) */}
            <div className="form-group">
              <label className="form-label">التخصص</label>
              <div className="input-wrapper">
                <select
                  name="major"
                  className="form-select select-with-icon"
                  value={formData.major}
                  onChange={handleInputChange}
                  disabled={!formData.faculty}
                >
                  <option value="none">لا يوجد</option>
                  {majors.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <span className="material-symbols-outlined input-icon">expand_more</span>
              </div>
            </div>

            {/* الرقم الجامعي */}
            <div className="form-group">
              <div className="label-row">
                <label className="form-label" style={{ margin: 0 }}>
                  الرقم الجامعي <span className="required-star">*</span>
                </label>
                <span className="label-hint">مكتوب على البطاقة الجامعية</span>
              </div>
              <div className="input-wrapper">
                <input
                  type="text"
                  inputMode="numeric"
                  name="studentId"
                  className={`form-input input-with-icon ${errors.studentId ? 'error' : ''}`}
                  placeholder="مثلاً: 201910432"
                  value={formData.studentId}
                  onChange={handleInputChange}
                  aria-invalid={!!errors.studentId}
                />
                <span className="material-symbols-outlined input-icon">pin</span>
              </div>
              <FieldError message={errors.studentId} />
            </div>

            {/* من الثلاثة الأوائل */}
            <div className="form-group">
              <label className="form-label">هل أنت من الثلاثة الأوائل؟</label>
              <div className="input-wrapper">
                <select
                  name="topRank"
                  className="form-select select-with-icon"
                  value={formData.topRank}
                  onChange={handleInputChange}
                >
                  {TOP_RANK_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className="material-symbols-outlined input-icon">expand_more</span>
              </div>
            </div>

            {/* المعدل كنسبة مئوية */}
            <div className="form-group">
              <div className="label-row">
                <label className="form-label" style={{ margin: 0 }}>
                  المعدل (نسبة مئوية) <span className="required-star">*</span>
                </label>
                <span className="label-hint">من 0 إلى 100</span>
              </div>
              <div className="input-wrapper">
                <input
                  type="text"
                  inputMode="decimal"
                  name="gpa"
                  className={`form-input input-with-icon ${errors.gpa ? 'error' : ''}`}
                  placeholder="مثلاً: 82.5"
                  value={formData.gpa}
                  onChange={handleInputChange}
                  aria-invalid={!!errors.gpa}
                />
                <span className="material-symbols-outlined input-icon">percent</span>
              </div>
              <FieldError message={errors.gpa} />
            </div>

            {/* اسم الأب والأم */}
            <div className="form-group grid-two-cols">
              <div>
                <label className="form-label">
                  اسم الأب <span className="required-star">*</span>
                </label>
                <input
                  type="text"
                  name="fatherName"
                  className={`form-input ${errors.fatherName ? 'error' : ''}`}
                  placeholder="اسم الوالد"
                  value={formData.fatherName}
                  onChange={handleInputChange}
                  aria-invalid={!!errors.fatherName}
                />
                <FieldError message={errors.fatherName} />
              </div>
              <div>
                <label className="form-label">
                  اسم الأم <span className="required-star">*</span>
                </label>
                <input
                  type="text"
                  name="motherName"
                  className={`form-input ${errors.motherName ? 'error' : ''}`}
                  placeholder="اسم الوالدة"
                  value={formData.motherName}
                  onChange={handleInputChange}
                  aria-invalid={!!errors.motherName}
                />
                <FieldError message={errors.motherName} />
              </div>
            </div>

            {/* الملاحظة التنبيهية */}
            <div className="info-box">
              <span className="material-symbols-outlined info-icon">verified_user</span>
              <p className="info-text">
                تُطابق هذه البيانات مع سجلات الامتحانات المركزية لإصدار التذكرة الرسمية المعتمدة.
              </p>
            </div>
          </form>
        </div>

        {/* الشريط السفلي والزر */}
        <div className="footer-deck">
          <button className="submit-btn" type="button" onClick={handleNextStep}>
            {isLoading ? (
              <span>جاري الحفظ...</span>
            ) : (
              <>
                <span>التالي: معلومات التواصل</span>
                <span className="material-symbols-outlined">arrow_back</span>
              </>
            )}
          </button>

          {/* لديك حساب؟ تسجيل دخول */}
          <p className="login-prompt">
            هل لديك حساب من قبل؟{' '}
            <button
              type="button"
              className="login-link-btn"
              onClick={onNavigateToLogin}
            >
              تسجيل دخول
            </button>
          </p>

          <p className="footer-copy">جامعة حمص • فرع حمص لاتحاد الطلبة</p>
        </div>
      </main>
    </div>
  );
}