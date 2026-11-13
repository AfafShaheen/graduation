import React, { useEffect, useState } from 'react';
import '../style/VolunteerQuestionsCard.css';
import { getVolunteerAnswers, saveVolunteerAnswers } from '../api/graduate';
import { getGraduateToken, getGraduateId } from '../api/session';
import {
  VOLUNTEER_QUESTIONS,
  VOLUNTEER_YES_NO,
  VOLUNTEER_NOTE,
  volunteerLaterKey,
  volunteerAnswersComplete,
} from '../config/volunteerQuestions';

/*
 * Two short, optional questions about representing the batch. It shows only while the graduate has not
 * answered; "later" hides it for this visit. It never blocks his ticket, his payment or anything else.
 */
export default function VolunteerQuestionsCard() {
  const [state, setState] = useState('loading'); // loading | ask | saved | hidden
  const [answers, setAnswers] = useState({ wantsResponsibility: '', hasExperience: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    try {
      if (sessionStorage.getItem(volunteerLaterKey(getGraduateId())) === '1') {
        setState('hidden');
        return undefined;
      }
    } catch {
      /* no storage: the card simply shows */
    }
    getVolunteerAnswers(getGraduateToken())
      .then((data) => {
        if (alive) setState(data?.answered ? 'hidden' : 'ask');
      })
      .catch(() => {
        if (alive) setState('hidden'); // optional: if it cannot be loaded it is simply not shown
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state === 'loading' || state === 'hidden') return null;

  if (state === 'saved') {
    return (
      <section className="vq vq-saved" role="status">
        <span className="material-symbols-outlined" aria-hidden="true">check_circle</span>
        <p>شكراً، تم حفظ إجاباتك.</p>
      </section>
    );
  }

  const save = async () => {
    if (!volunteerAnswersComplete(answers)) {
      setError('أجب عن السؤالين ثم احفظ، أو اختر «لاحقاً».');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await saveVolunteerAnswers(
        { wants_responsibility: answers.wantsResponsibility, has_experience: answers.hasExperience },
        getGraduateToken(),
      );
      setState('saved');
    } catch (err) {
      setError(err?.message || 'تعذّر الحفظ، حاول لاحقاً.');
    } finally {
      setBusy(false);
    }
  };

  const later = () => {
    try {
      sessionStorage.setItem(volunteerLaterKey(getGraduateId()), '1');
    } catch {
      /* ignore */
    }
    setState('hidden');
  };

  return (
    <section className="vq" aria-label="سؤالان سريعان">
      <h3 className="vq-title">سؤالان سريعان (اختياري)</h3>
      <p className="vq-note">{VOLUNTEER_NOTE}</p>
      {VOLUNTEER_QUESTIONS.map((q) => (
        <div className="vq-question" key={q.name}>
          <p className="vq-text" id={`vq-${q.name}`}>{q.text}</p>
          <div className="vq-choices" role="radiogroup" aria-labelledby={`vq-${q.name}`}>
            {VOLUNTEER_YES_NO.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={answers[q.name] === opt.value}
                className={`vq-choice${answers[q.name] === opt.value ? ' on' : ''}`}
                onClick={() => {
                  setAnswers((prev) => ({ ...prev, [q.name]: opt.value }));
                  setError('');
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {error && <p className="vq-error" role="alert">{error}</p>}
      <div className="vq-actions">
        <button type="button" className="vq-save" onClick={save} disabled={busy}>
          {busy ? 'جارٍ الحفظ...' : 'حفظ'}
        </button>
        <button type="button" className="vq-later" onClick={later} disabled={busy}>لاحقاً</button>
      </div>
    </section>
  );
}
