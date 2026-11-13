// The four tabs of the graduate journey shown under the header of every graduate page.

export const TABS = [
  { key: 'register', label: 'التسجيل' },
  { key: 'package', label: 'الباقة' },
  { key: 'payment', label: 'الدفع' },
  { key: 'ticket', label: 'التذكرة' },
];

export const DONE_NOTE = 'اكتملت هذه المرحلة ولا تُعدَّل.';
export const PACKAGE_LOCKED_NOTE = 'لا يمكن تغيير الباقة بعد إرسال الدفع.';

// state: done | current | todo. Only the package tab can be opened again, from the payment
// pages and only while the ticket still allows a package change (same rule as TicketGuard).
export function stageTabs(current, { canChangePackage = false } = {}) {
  const at = Math.max(0, TABS.findIndex((tab) => tab.key === current));
  return TABS.map((tab, index) => {
    const state = index < at ? 'done' : index === at ? 'current' : 'todo';
    const clickable = tab.key === 'package' && state === 'done' && canChangePackage;
    const note =
      state !== 'done' || clickable ? '' : tab.key === 'package' ? PACKAGE_LOCKED_NOTE : DONE_NOTE;
    return { ...tab, state, clickable, note };
  });
}

// "الخطوة 2 من 3" inside the registration tab.
export const registerStepLabel = (step, total = 3) => `الخطوة ${step} من ${total}`;
