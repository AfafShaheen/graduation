import React, { useState, useEffect } from 'react';
import '../../style/GraduationForm.css';
import GuideLinkButton from '../../components/GuideLinkButton';
import '../../style/BrandHeader.css';
import universityLogo from '../../assets/homs-university-white.png';
import unionLogo from '../../assets/only-logo.png';
import useFormDraft from '../../hooks/useFormDraft';
import { getRegistrationColleges, verifyStep1 } from '../../api/graduate';
import { setRegistrationToken } from '../../api/session';
import { cleanServerMessage } from '../../utils/cleanServerMessage.js';
import { NAME_REGEX } from '../../utils/validators.js';
import { CEREMONY_TITLE, BATCH_BADGE } from '../../config/brand';
import HelpFooter from '../../components/HelpFooter';

/* أرقام فقط، بدون تحديد عدد معين */
const DIGITS_ONLY = /^[0-9]+$/;

const TOP_RANK_MAP = { none: null, first: 1, second: 2, third: 3 };
const GENDER_MAP = { male: "ذكر", female: "أنثى" };

/* رموز خطأ الأوائل (D11) التي تُعرض تحت حقل الاختيار */
const TOP_RANK_ERROR_CODES = ['TOP_RANK_NOT_HONOR', 'TOP_RANK_SHOULD_BE_HONOR', 'TOP_RANK_MISMATCH'];

export function toVerifyStep1Payload(formData, colleges) {
  const college = colleges.find((c) => String(c.id) === String(formData.faculty));
  const major = college?.majors?.find((m) => String(m.id) === String(formData.major));
  const gpaValue = String(formData.gpa ?? '').trim();

  return {
    college_id: college?.id || null,
    major_id: major?.id || null,
    university_id: formData.studentId.trim(),
    first_name: formData.firstName.trim(),
    last_name: formData.lastName.trim(),
    father_name: formData.fatherName.trim(),
    mother_name: formData.motherName.trim(),
    gender: GENDER_MAP[formData.gender],
    // المعدل اختياري (D2): يُرسل فقط عند إدخاله
    gpa: gpaValue === '' ? null : Number(gpaValue),
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
  firstName: (v) => {
    const t = v.trim();
    if (!t) return 'الاسم مطلوب';
    if (!NAME_REGEX.test(t)) return 'يرجى كتابة الاسم بحروف عربية أو إنجليزية فقط';
    if (t.length < 2) return 'الاسم قصير جداً';
    return '';
  },
  lastName: (v) => {
    const t = v.trim();
    if (!t) return 'الكنية مطلوبة';
    if (!NAME_REGEX.test(t)) return 'يرجى كتابة الكنية بحروف عربية أو إنجليزية فقط';
    if (t.length < 2) return 'الكنية قصيرة جداً';
    return '';
  },
  faculty: (v) => (v ? '' : 'اختر الكلية'),
  gender: (v) => (v ? '' : 'اختر الجنس'),
  studentId: (v) => {
    const t = v.trim();
    if (!t) return 'الرقم الجامعي مطلوب';
    if (!DIGITS_ONLY.test(t)) return 'يجب أن يكون الرقم الجامعي أرقاماً فقط';
    if (t.length > 100) return 'الرقم الجامعي طويل جداً';
    return '';
  },
  gpa: (v) => {
    const t = String(v ?? '').trim();
    if (!t) return ''; // المعدل اختياري (D2)
    const n = Number(t);
    if (!Number.isFinite(n)) return 'يرجى إدخال المعدل كرقم';
    if (n < 0 || n > 100) return 'المعدل يجب أن يكون بين 0 و 100';
    if (!/^\d+(?:\.\d{1,2})?$/.test(t)) return 'المعدل يقبل منزلتين عشريتين كحد أقصى';
    return '';
  },
  fatherName: (v) => {
    const t = v.trim();
    if (!t) return 'اسم الأب مطلوب';
    if (!NAME_REGEX.test(t)) return 'يجب أن يتكون اسم الأب من حروف عربية أو إنجليزية فقط';
    if (t.length < 2) return 'اسم الأب قصير جداً';
    return '';
  },
  motherName: (v) => {
    const t = v.trim();
    if (!t) return 'اسم الأم مطلوب';
    if (!NAME_REGEX.test(t)) return 'يجب أن يتكون اسم الأم من حروف عربية أو إنجليزية فقط';
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
  // مسودة محفوظة: إذا الخريج راح يقرأ الإرشادات ورجع، بتضل بياناته معبّاية
  const [formData, setFormData] = useFormDraft('step1', {
    firstName: '',
    lastName: '',
    gender: '',
    faculty: '',
    major: 'none',
    studentId: '',
    topRank: 'none',
    gpa: '',
    fatherName: '',
    motherName: '',
  });

  const [errors, setErrors] = useState({});
  const [unverifiedNotice, setUnverifiedNotice] = useState('');
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

  // بعد تحميل الكليات: إذا الكلية أو التخصص المحفوظ ما عاد موجود بالقائمة (تغيّرت الكشوفات مثلاً)
  // منرجّعه لحالته الفاضية بدل ما يضل اختيار وهمي
  useEffect(() => {
    if (collegesLoading || colleges.length === 0) return;
    setFormData((prev) => {
      if (!prev.faculty) return prev;
      const college = colleges.find((c) => String(c.id) === String(prev.faculty));
      if (!college) return { ...prev, faculty: '', major: 'none' };
      if (
        prev.major !== 'none' &&
        !(college.majors || []).some((m) => String(m.id) === String(prev.major))
      ) {
        return { ...prev, major: 'none' };
      }
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colleges, collegesLoading]);

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
    setUnverifiedNotice('');
    try {
      const payload = toVerifyStep1Payload(formData, colleges);
      const { registration_token } = await verifyStep1(payload);
      setRegistrationToken(registration_token);
      if (onNext) onNext(formData);
    } catch (err) {
      if (err.fieldErrors) {
        const cleaned = {};
        for (const [k, v] of Object.entries(err.fieldErrors)) cleaned[k] = cleanServerMessage(v);
        setErrors((prev) => ({ ...prev, ...cleaned }));
        const firstField = Object.keys(cleaned)[0];
        document.getElementsByName(firstField)?.[0]?.focus();
      } else if (err.status === 400 || err.status === 403) {
        const detail = err.data?.detail;
        const code = detail && typeof detail === 'object' ? detail.code : null;
        if (code === 'ACCOUNT_UNVERIFIED') {
          setUnverifiedNotice(err.message);
          setErrors({});
        } else if (code && TOP_RANK_ERROR_CODES.includes(code)) {
          setErrors({ topRank: err.message });
        } else {
          setErrors({ general: err.message });
        }
      } else if (err.status === 429) {
        setErrors({ general: err.message });
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
            <h1 className="header-title">{CEREMONY_TITLE}</h1>
            <div className="icon-btn">
              <img className="header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            </div>
          </div>
          <div className="header-subband">
            <span className="subband-title">إنشاء حساب</span>
            <span className="badge-batch">{BATCH_BADGE}</span>
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
              <p className="card-subtitle">سجّل بياناتك لتأكيد حجز تذكرتك الرقمية</p>
            </div>
          </div>

          <GuideLinkButton to="/guide/start" label="العودة لإرشادات التسجيل" />

          <form onSubmit={handleNextStep} noValidate>
            {/* الاسم والكنية */}
                        {unverifiedNotice && (
              <div className="info-box" style={{ marginBottom: 12 }} role="status">
                <span className="material-symbols-outlined info-icon">info</span>
                <div>
                  <p className="info-text">{unverifiedNotice}</p>
                  <button
                    type="button"
                    className="login-link-btn"
                    style={{ marginTop: 8 }}
                    onClick={onNavigateToLogin}
                  >
                    لدي حساب
                  </button>
                </div>
              </div>
            )}
{errors.general && (
              <div className="form-group">
                <div className="info-box" style={{ margin: 0, borderColor: '#ba1a1a', background: '#fff5f5' }}>
                  <p className="info-text" style={{ color: '#ba1a1a' }}>{errors.general}</p>
                </div>
              </div>
            )}

            <div className="info-box name-certificate-note" role="note">
              <span className="material-symbols-outlined info-icon">workspace_premium</span>
              <p className="info-text">
                <strong>انتبه:</strong> الاسم والكنية اللذان تكتبهما هنا هما ما سيُطبع على شهادة التخرج.
                اكتبهما بدقة وبالأحرف الصحيحة (مثل: ة / ه، أ / ا) كما في البطاقة الجامعية.
              </p>
            </div>

            <div className="form-group grid-two-cols">
              <div>
                <label className="form-label">
                  الاسم <span className="required-star">*</span>
                </label>
                <input
                  type="text"
                  name="firstName"
                  className={`form-input ${errors.firstName ? 'error' : ''}`}
                  placeholder="مثلاً: مجد"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  aria-invalid={!!errors.firstName}
                />
                <FieldError message={errors.firstName} />
              </div>
              <div>
                <label className="form-label">
                  الكنية <span className="required-star">*</span>
                </label>
                <input
                  type="text"
                  name="lastName"
                  className={`form-input ${errors.lastName ? 'error' : ''}`}
                  placeholder="مثلاً: المحمود"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  aria-invalid={!!errors.lastName}
                />
                <FieldError message={errors.lastName} />
              </div>
            </div>

            {/* الجنس */}
            <div className="form-group">
              <label className="form-label">
                الجنس <span className="required-star">*</span>
              </label>
              <div className="input-wrapper">
                <select
                  name="gender"
                  className={`form-select select-with-icon ${errors.gender ? 'error' : ''}`}
                  value={formData.gender}
                  onChange={handleInputChange}
                  aria-invalid={!!errors.gender}
                >
                  <option value="" disabled>اختر الجنس...</option>
                  <option value="male">ذكر</option>
                  <option value="female">أنثى</option>
                </select>
                <span className="material-symbols-outlined input-icon">expand_more</span>
              </div>
              <FieldError message={errors.gender} />
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
              <FieldError message={errors.topRank} />
            </div>

            {/* المعدل كنسبة مئوية */}
            <div className="form-group">
              <div className="label-row">
                <label className="form-label" style={{ margin: 0 }}>
                  المعدل (نسبة مئوية)
                </label>
                <span className="label-hint">اختياري، من 0 إلى 100</span>
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
                يُرجى إدخال بياناتك كما هي مسجّلة في سجلات الجامعة تماماً (الاسم، الكنية، اسم الأب،
                اسم الأم، الجنس، الكلية، التخصص والرقم الجامعي)؛ إذ تُقارَن مع كشوفات الجامعة
                المعتمدة لإصدار التذكرة الرسمية. اختلاف أي حقل يمنع إتمام التحقق.
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

          <HelpFooter />

          <p className="footer-copy">{CEREMONY_TITLE}</p>
        </div>
      </main>
    </div>
  );
}