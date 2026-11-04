import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import GraduateGuide from './GraduateGuide';
import { hasGraduateSession, getGraduateEmail } from '../../api/session';
import { GUIDE_STAGES, pathForStage } from '../../utils/stage';
import { ackGuide, hasAckedGuide } from '../../utils/guideAck';

/*
 * /guide/:stage — the guide of one stage after registration (package, payment, submitted, ticket).
 * First time: it must be read ("read and understood") and then the graduate continues to the
 * page of that stage. Afterwards it opens in review mode (read, then go back).
 */
export default function StageGuide() {
  const { stage } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  if (!hasGraduateSession()) return <Navigate to="/login" replace />;
  if (!GUIDE_STAGES.includes(stage)) return <Navigate to="/tickets" replace />;

  const email = getGraduateEmail();
  const acked = hasAckedGuide(email, stage);
  const fallback = pathForStage(stage);

  return (
    <GraduateGuide
      phase={stage}
      mode={acked ? 'review' : 'required'}
      onContinue={() => {
        ackGuide(email, stage);
        navigate(location.state?.next || fallback, { replace: true });
      }}
      onBack={() => navigate(location.state?.from || fallback, { replace: true })}
    />
  );
}
