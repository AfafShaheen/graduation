// "Read and understood" marks of the stage guides. One mark per graduate (by e-mail) and
// stage, kept on this device only: a graduate on another phone reads the guide again.

import { stageForPath, GUIDE_STAGES } from './stage.js';

const PREFIX = 'grad.guide.ack';

function defaultStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

const who = (email) => String(email || 'anon').trim().toLowerCase();
export const ackKey = (email, stage) => `${PREFIX}.${who(email)}.${stage}`;

export function hasAckedGuide(email, stage, storage = defaultStorage()) {
  if (!GUIDE_STAGES.includes(stage)) return true;
  try {
    return storage?.getItem(ackKey(email, stage)) === '1';
  } catch {
    // storage blocked: do not trap the graduate in a guide he cannot confirm
    return true;
  }
}

export function ackGuide(email, stage, storage = defaultStorage()) {
  try {
    storage?.setItem(ackKey(email, stage), '1');
  } catch {
    /* storage not available */
  }
}

// The guide that must be read before this page, or null when it was read (or there is none).
export function pendingGuideFor(pathname, email, storage = defaultStorage()) {
  const stage = stageForPath(pathname);
  if (!stage || hasAckedGuide(email, stage, storage)) return null;
  return stage;
}
