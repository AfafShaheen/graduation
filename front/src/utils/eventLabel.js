/* عرض موحّد لاسم الحفل وتاريخه بشاشات الماسح. */
export function formatEventDate(value) {
    if (!value) return '';
    const [y, m, d] = String(value).slice(0, 10).split('-');
    if (!y || !m || !d) return '';
    return `${d}/${m}/${y}`;
  }
  
  export function eventTitle(event) {
    return event?.name ? `حفل: ${event.name}` : '';
  }
  