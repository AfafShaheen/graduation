// The sentence at the top of a confirmed ticket.
export function welcomeText(college, { ended = false } = {}) {
  const name = typeof college === 'string' ? college.trim() : '';
  const graduation = name && name !== '—' ? `مبارك تخرجك من ${name}` : 'مبارك تخرجك';
  if (ended) return `انتهى حفل التخرج. ${graduation}، ونتمنى لك التوفيق في مسيرتك.`;
  return `أهلاً بك في ختام رحلتك الجامعية. ${graduation}، ونحن بانتظارك في الحفل.`;
}
