import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import GraduateGuide from './GraduateGuide';
import { hasGraduateSession, getGraduateId } from '../../api/session';
import { GUIDE_STAGES, pathForStage, guidePath } from '../../utils/stage';
import { ackGuide, hasAckedGuide } from '../../utils/guideAck';

const PREVIOUS_LABELS = {
  before: 'إرشادات التسجيل',
  package: 'اختيار الباقة',
};

/*
 * /guide/:stage — the guide of one stage after registration (only the package stage).
 * First time: it must be read ("read and understood") and then the graduate continues to the
 * page of that stage. Afterwards it opens in review mode (read, then go back).
 */
export default function StageGuide() {
  const { stage } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  if (!hasGraduateSession()) return <Navigate to="/login" replace />;
  if (!GUIDE_STAGES.includes(stage)) return <Navigate to="/tickets" replace />;

  const email = getGraduateId();
  const acked = hasAckedGuide(email, stage);
  const fallback = pathForStage(stage);

  // review mode: the guides of the earlier stages he already reached (never the coming ones)
  const earlier = GUIDE_STAGES.slice(0, GUIDE_STAGES.indexOf(stage)).filter((s) => hasAckedGuide(email, s));
  const previous = [
    { key: 'before', label: PREVIOUS_LABELS.before, to: '/guide/start' },
    ...earlier.map((s) => ({ key: s, label: PREVIOUS_LABELS[s], to: guidePath(s) })),
  ].map((item) => ({
    ...item,
    onOpen: () => navigate(item.to, { state: { from: location.state?.from || fallback } }),
  }));

  return (
    <GraduateGuide
      phase={stage}
      mode={acked ? 'review' : 'required'}
      previous={previous}
      onContinue={() => {
        ackGuide(email, stage);
        navigate(location.state?.next || fallback, { replace: true });
      }}
      onBack={() => navigate(location.state?.from || fallback, { replace: true })}
    />
  );
}
