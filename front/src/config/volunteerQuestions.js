// The two questions about representing the batch. They are asked while the graduate waits for his
// payment to be reviewed (and on his ticket if he has not answered), never in the middle of registering.
export const VOLUNTEER_QUESTIONS = [
  {
    name: 'wantsResponsibility',
    text: 'هل ترغب ان تكون ممثلاً لطلاب دفعتك في حفل التخرج ',
    icon: 'record_voice_over',
  },
  {
    name: 'hasExperience',
    text: 'هل لديك خبرة سابقة؟',
    icon: 'workspace_premium',
  },
];

export const VOLUNTEER_YES_NO = [
  { value: 'yes', label: 'نعم' },
  { value: 'no', label: 'لا' },
];

export const VOLUNTEER_NOTE = 'لا تؤثر إجاباتك على حجز تذكرتك، وتُستخدم فقط لتنسيق مهام الحفل مع اللجنة المنظمة.';

// the card never blocks anything: "later" hides it for this visit only
export const volunteerLaterKey = (graduateId) => `grad.volunteer.later.${graduateId || 'x'}`;

// both questions are answered: only then can the answers be sent
export function volunteerAnswersComplete(answers) {
  return VOLUNTEER_QUESTIONS.every((q) => answers?.[q.name] === 'yes' || answers?.[q.name] === 'no');
}
