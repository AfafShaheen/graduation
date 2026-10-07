import React, { useState } from 'react';
import '../../style/GraduationForm.css';

export default function GraduationFormStep1() {
  const [formData, setFormData] = useState({
    fullName: '',
    gender: 'male',
    faculty: '',
    studentId: '',
    fatherName: '',
    motherName: '',
  });

  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: false }));
    }
  };

  const handleGenderSelect = (gender) => {
    setFormData((prev) => ({ ...prev, gender }));
  };

  const handleNextStep = (e) => {
    e.preventDefault();
    const newErrors = {};

    if (!formData.fullName.trim()) newErrors.fullName = true;
    if (!formData.faculty) newErrors.faculty = true;
    if (!formData.studentId.trim()) newErrors.studentId = true;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      alert('تم تأكيد بيانات المرحلة الأولى بنجاح! الانتقال إلى خطوة معلومات التواصل.');
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
              <span className="material-symbols-outlined">school</span>
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
            <span className="progress-title">خطوة 1 من 2: معلومات التخرج الأساسية</span>
            <span className="progress-percent">50%</span>
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill"></div>
            <div className="progress-bar-empty"></div>
          </div>
        </section>

        {/* بطاقة النموذج */}
        <div className="form-card">
          <div className="card-header">
            <div className="logo-circle">
              <img
                src="https://lh3.googleusercontent.com/aida/AEtjO1W5XnO0ut9JGDdrQCNqF9P1fgvLHu3gUDkgwxkzUj3d9vtprfhpfij06j5-ElsJkkhxSu2QtNIve8z8vrepio8875EyWlYGVHfLMGD43j5Iy0dd8xoOVJh5l3L3fwHNfJFwM2UjxlUYDaIgDgfl9Sw_fgI7bGNeZaIdgac5UPNEBuObWoE-UsNnRJ6UNS_IbPP_LvoWN8iA67rrrhBCqNrxUxkp2FjAicCcbp5q6GnE0NOGuEM0s6IpS3Q"
                alt="شعار جامعة البعث"
              />
            </div>
            <div>
              <h2 className="card-title">ألف مبروك التخرج! 🎓</h2>
              <p className="card-subtitle">سجّل بياناتك لتأكيد حجز مقعدك وتذكرتك الرقمية</p>
            </div>
          </div>

          <form onSubmit={handleNextStep}>
            {/* الاسم الثلاثي */}
            <div className="form-group">
              <label className="form-label">
                الاسم الثلاثي الكامل <span className="required-star">*</span>
              </label>
              <div className="input-wrapper">
                <input
                  type="text"
                  name="fullName"
                  className={`form-input input-with-icon ${errors.fullName ? 'error' : ''}`}
                  placeholder="مثلاً: مجد أحمد العلي"
                  value={formData.fullName}
                  onChange={handleInputChange}
                />
                <span className="material-symbols-outlined input-icon">badge</span>
              </div>
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
                  type="number"
                  name="studentId"
                  className={`form-input input-with-icon ${errors.studentId ? 'error' : ''}`}
                  placeholder="مثلاً: 201910432"
                  value={formData.studentId}
                  onChange={handleInputChange}
                />
                <span className="material-symbols-outlined input-icon">pin</span>
              </div>
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
                  className="form-input"
                  placeholder="اسم الوالد"
                  value={formData.fatherName}
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <label className="form-label">
                  اسم الأم <span className="required-star">*</span>
                </label>
                <input
                  type="text"
                  name="motherName"
                  className="form-input"
                  placeholder="الاسم والكنية"
                  value={formData.motherName}
                  onChange={handleInputChange}
                />
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
          <p className="footer-copy">جامعة حمص • فرع حمص لاتحاد الطلبة</p>
        </div>
      </main>
    </div>
  );
}