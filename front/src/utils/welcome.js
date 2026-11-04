// The sentence at the top of a confirmed ticket.
export function welcomeText(college) {
  const name = typeof college === 'string' ? college.trim() : '';
  const graduation = name && name !== '—' ? `مبارك تخرجك من ${name}` : 'مبارك تخرجك';
  return `أهلاً بك في ختام رحلتك الجامعية. ${graduation}، ونحن بانتظارك في الحفل.`;
}
