// The stages that have a guide page, read once before the page opens (see guideAck.js). Only the
// package stage has one: the payment, waiting and ticket pages say their own words themselves.

export const GUIDE_STAGES = ['package'];

const PATH_BY_STAGE = {
  package: '/tickets',
};

export const pathForStage = (stage) => PATH_BY_STAGE[stage] || '/tickets';
export const guidePath = (stage) => `/guide/${stage}`;

export function stageForPath(pathname) {
  const found = Object.entries(PATH_BY_STAGE).find(([, path]) => path === pathname);
  return found ? found[0] : null;
}
