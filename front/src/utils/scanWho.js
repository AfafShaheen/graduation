// What the volunteer at the door reads after a scan: whose ticket it is, and for a companion
// which companion of how many. The server sends only a name and a surname.

export function scanWho(result) {
  const name = String(result?.graduate_name || '').trim();
  if (!name) return null;
  if (result.code_type === 'COMPANION') {
    const number = Number(result.companion_number);
    const total = Number(result.companions_count);
    const which =
      number > 0 && total > 0 ? `المرافق رقم ${number} من ${total}` : 'مرافق';
    return { name, role: which, label: 'مرافق الخريج', isCompanion: true };
  }
  return { name, role: 'الخريج', label: 'صاحب التذكرة', isCompanion: false };
}
