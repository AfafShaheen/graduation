import React, { useState } from 'react';
import '../../style/GraduationForm.css';
import universityLogo from '../../assets/homs-university-white.png';
import unionLogo from '../../assets/only-logo.png';
import useFormDraft from '../../hooks/useFormDraft';

/* حروف عربية ومسافات فقط (بدون أرقام أو رموز) */
const ARABIC_ONLY = /^[\u0621-\u064A\u064B-\u0652\s]+$/;
/* أرقام فقط، بدون تحديد عدد معين */
const DIGITS_ONLY = /^[0-9]+$/;

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

export default function GraduationFormStep1({ onNext }) {
  // البيانات محفوظة بـ sessionStorage حتى ما تضيع عند الرجوع
  const [formData, setFormData] = useFormDraft('step1', {
    fullName: '',
    gender: 'male',
    faculty: '',
    studentId: '',
    fatherName: '',
    motherName: '',
  });

  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false); // الأخطاء ما بتبين إلا بعد أول ضغطة على الزر
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // بعد أول ضغطة على الزر، الخطأ بيتحدّث مباشرة أثناء الكتابة
    if (submitted && validators[name]) {
      setErrors((prev) => ({ ...prev, [name]: validators[name](value) }));
    }
  };

  const handleGenderSelect = (gender) => {
    setFormData((prev) => ({ ...prev, gender }));
  };

  const handleNextStep = (e) => {
    e.preventDefault();
    if (isLoading) return;

    const newErrors = {};
    Object.keys(validators).forEach((name) => {
      newErrors[name] = validators[name](formData[name]);
    });
    setErrors(newErrors);
    setSubmitted(true);

    // إذا في أي خطأ: وقّف وروح لأول حقل فيه خطأ
    const firstInvalid = Object.keys(newErrors).find((k) => newErrors[k]);
    if (firstInvalid) {
      document.getElementsByName(firstInvalid)[0]?.focus();
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      if (onNext) onNext(formData);
      else alert('تم تأكيد بيانات المرحلة الأولى بنجاح! الانتقال إلى خطوة معلومات التواصل.');
    }, 700);
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
            <span className="progress-title">خطوة 1 من 3: معلومات التخرج الأساسية</span>
            <span className="progress-percent">33%</span>
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill"></div>
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
              <h2 className="card-title">ألف مبروك التخرج </h2>
              <p className="card-subtitle">سجّل بياناتك لتأكيد حجز مقعدك وتذكرتك الرقمية</p>
            </div>
          </div>

          <form onSubmit={handleNextStep} noValidate>
            {/* الاسم والكنية */}
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
                <select
                  name="faculty"
                  className={`form-select select-with-icon ${errors.faculty ? 'error' : ''}`}
                  value={formData.faculty}
                  onChange={handleInputChange}
                  aria-invalid={!!errors.faculty}
                >
                  <option value="" disabled>
                    اختر كليتك من القائمة...
                  </option>
                  <option value="it">الهندسة المعلوماتية</option>
                  <option value="civil">الهندسة المدنية</option>
                  <option value="med">الطب البشري</option>
                  <option value="pharm">الصيدلة</option>
                  <option value="dent">طب الأسنان</option>
                  <option value="mech">الهندسة الميكانيكية</option>
                  <option value="science">العلوم</option>
                  <option value="arts">الآداب والعلوم الإنسانية</option>
                </select>
                <span className="material-symbols-outlined input-icon">expand_more</span>
              </div>
              <FieldError message={errors.faculty} />
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
                  placeholder="الاسم والكنية"
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
          <p className="footer-copy">جامعة حمص • اتحاد الطلبة فرع حمص</p>
        </div>
      </main>
    </div>
  );
}