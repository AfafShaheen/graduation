// The stages of a graduate after registration. Each one has a guide page that must be
// read the first time the stage opens (see guideAck.js).

export const GUIDE_STAGES = ['package', 'payment', 'submitted', 'ticket'];

const PATH_BY_STAGE = {
  package: '/tickets',
  payment: '/payment',
  submitted: '/payment-submitted',
  ticket: '/my-ticket',
};

export const pathForStage = (stage) => PATH_BY_STAGE[stage] || '/tickets';
export const guidePath = (stage) => `/guide/${stage}`;

export function stageForPath(pathname) {
  const found = Object.entries(PATH_BY_STAGE).find(([, path]) => path === pathname);
  return found ? found[0] : null;
}
