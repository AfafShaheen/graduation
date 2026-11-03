import { useEffect } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

const isVisible = (el) => el.getClientRects().length > 0;

/*
  Makes the open modal behave like one for keyboard and screen-reader users:
  - focus moves into the dialog (first field, else first control) and returns to
    the element that opened it when the dialog closes;
  - Tab / Shift+Tab stay inside the dialog;
  - the page behind does not scroll.
  The dialog is the last element with role="dialog" and aria-modal="true".
*/
export default function useDialogA11y(open) {
  useEffect(() => {
    if (!open) return undefined;

    const previous = document.activeElement;
    const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
    const dialog = dialogs[dialogs.length - 1];
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    if (dialog) {
      const first =
        dialog.querySelector('textarea,input:not([type="hidden"]),select') ||
        dialog.querySelector(FOCUSABLE);
      if (first) first.focus();
    }

    const onKeyDown = (event) => {
      if (event.key !== 'Tab' || !dialog) return;
      const items = [...dialog.querySelectorAll(FOCUSABLE)].filter(isVisible);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [open]);
}
