import React, { useState, useEffect } from 'react';
import '../../style/GraduationForm.css';
import '../../style/BrandHeader.css';
import universityLogo from '../../assets/homs-university-white.png';
import unionLogo from '../../assets/only-logo.png';
import { getVolunteerAnswers, saveVolunteerAnswers } from '../../api/graduate';
import { getGraduateToken } from '../../api/session';
import { CEREMONY_TITLE, BATCH_BADGE } from '../../config/brand';
import HelpFooter from '../../components/HelpFooter';

/* نص السؤالين: عدّلهما من هنا */
const QUESTIONS = [
  {
    name: 'wantsResponsibility',
    text: 'هل ترغب بأن تكون مسؤولاً عن شيء في تقديم الحفل؟',
    icon: 'record_voice_over',
  },
  {
    name: 'hasExperience',
    text: 'هل لديك خبرة سابقة؟',
    icon: 'workspace_premium',
  },
];

const YES_NO = [
  { value: 'yes', label: 'نعم' },
  { value: 'no', label: 'لا' },
];

/* كل دالة ترجع نص الخطأ، أو نص فاضي إذا القيمة صحيحة */
const validate = (v) => (v ? '' : 'يرجى الإجابة عن هذا السؤال');

function FieldError({ message }) {
  if (!message) return null;
  return (
    <p className="error-text" role="alert">
      {message}
    </p>
  );
}

/*
  onDone(answers): يُستدعى بعد الإجابة عن السؤالين،
  answers = { wantsResponsibility: 'yes' | 'no', hasExperience: 'yes' | 'no' }
*/
export default function GraduateQuestions({ onDone }) {
  const [answers, setAnswers] = useState({ wantsResponsibility: '', hasExperience: '' });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [alreadyAnswered, setAlreadyAnswered] = useState(false);

  useEffect(() => {
    let mounted = true;
    getVolunteerAnswers(getGraduateToken())
      .then((data) => {
        if (!mounted) return;
        if (data.answered) {
          setAlreadyAnswered(true);
        }
      })
      .catch((err) => {
        if (mounted) setLoadError(err.message || 'تعذّر تحميل البيانات');
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (alreadyAnswered && onDone) onDone(answers);
  }, [alreadyAnswered, onDone]);

  const handleChoice = (name, value) => {
    setAnswers((prev) => ({ ...prev, [name]: value }));
    if (submitted) {
      setErrors((prev) => ({ ...prev, [name]: validate(value) }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;

    const newErrors = {};
    QUESTIONS.forEach((q) => {
      newErrors[q.name] = validate(answers[q.name]);
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
      await saveVolunteerAnswers({
        wants_responsibility: answers.wantsResponsibility,
        has_experience: answers.hasExperience,
      }, getGraduateToken());
      if (onDone) onDone(answers);
    } catch (err) {
      setErrors({ general: err.message || 'حدث خطأ غير متوقع' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <main className="mobile-shell">
        {/* الهيدر العلوي (نفس بقية الصفحات، بلا سهم رجوع لأن البريد تأكد) */}
        <header className="header-main">
          <div className="header-top">
            <div className="icon-btn" aria-hidden="true"></div>
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

        {/* شريط التقدم 100% */}
        <section className="progress-section">
          <div className="progress-labels">
            <span className="progress-title">خطوة 4 من 4: أسئلة إضافية</span>
            <span className="progress-percent">100%</span>
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill"></div>
            <div className="progress-bar-fill"></div>
            <div className="progress-bar-fill"></div>
            <div className="progress-bar-fill"></div>
          </div>
        </section>

        {/* بطاقة النموذج */}
        <div className="form-card">
          <div className="card-header">
            <div className="logo-circle">
              <img src={universityLogo} alt="شعار جامعة حمص" />
            </div>
            <div>
              <h2 className="card-title">سؤالان قبل المتابعة</h2>
              <p className="card-subtitle">إجاباتك تساعدنا في تنظيم الحفل وتوزيع المهام</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} noValidate style={{ marginTop: '4px' }}>
            {loadError && (
              <div className="info-box" style={{ borderColor: '#ba1a1a', background: '#fff5f5' }}>
                <p className="info-text" style={{ color: '#ba1a1a' }}>{loadError}</p>
              </div>
            )}
            {errors.general && (
              <div className="info-box" style={{ borderColor: '#ba1a1a', background: '#fff5f5' }}>
                <p className="info-text" style={{ color: '#ba1a1a' }}>{errors.general}</p>
              </div>
            )}
            {QUESTIONS.map((q) => (
              <div className="form-group" key={q.name}>
                <label className="form-label" id={`label-${q.name}`}>
                  {q.text} <span className="required-star">*</span>
                </label>
                <div className="gender-grid" role="radiogroup" aria-labelledby={`label-${q.name}`}>
                  {YES_NO.map((opt, i) => (
                    <button
                      key={opt.value}
                      type="button"
                      name={i === 0 ? q.name : undefined}
                      role="radio"
                      aria-checked={answers[q.name] === opt.value}
                      className={`gender-btn ${answers[q.name] === opt.value ? 'active' : 'inactive'}`}
                      onClick={() => handleChoice(q.name, opt.value)}
                    >
                      <span className="material-symbols-outlined">
                        {answers[q.name] === opt.value ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
                <FieldError message={errors[q.name]} />
              </div>
            ))}

            <div className="info-box">
              <span className="material-symbols-outlined info-icon">info</span>
              <p className="info-text">
                لا تؤثر إجاباتك على حجز تذكرتك، وتُستخدم فقط لتنسيق مهام الحفل مع اللجنة المنظمة.
              </p>
            </div>

            <div style={{ marginTop: '20px' }}>
              <button className="submit-btn" type="submit" disabled={isLoading}>
                {isLoading ? (
                  <span>جاري الحفظ...</span>
                ) : (
                  <>
                    <span>متابعة إلى اختيار التذكرة</span>
                    <span className="material-symbols-outlined">arrow_back</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* التذييل */}
        <div style={{ textAlign: 'center', marginTop: 'auto', padding: '16px 16px 8px' }}>
          <HelpFooter />
          <p className="footer-copy">{CEREMONY_TITLE}</p>
        </div>
      </main>
    </div>
  );
}