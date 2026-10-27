import { useCallback, useEffect, useState } from 'react';

/*
  مثل useState بالضبط، لكن القيمة بتنحفظ بالمتصفح (sessionStorage افتراضياً، أو localStorage)
  فما بتضيع عند الرجوع بين الصفحات أو عمل refresh.

  - key: مفتاح التخزين. إذا كان null نرجع useState عادي بدون أي حفظ.
  - initial: القيمة الابتدائية. إذا كانت كائناً ({}) ندمج المحفوظ فوقه.
  - options.storage: 'session' (افتراضي) أو 'local'.

  بترجع [values, setValues, clear].
*/
export default function useFormDraft(key, initial, { storage = 'session' } = {}) {
  const store =
    typeof window === 'undefined'
      ? null
      : storage === 'local'
        ? window.localStorage
        : window.sessionStorage;

  const enabled = Boolean(key && store);

  const [values, setValues] = useState(() => {
    if (!enabled) return initial;
    try {
      const saved = store.getItem(key);
      if (saved == null) return initial;
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && initial && typeof initial === 'object' && !Array.isArray(initial)) {
        return { ...initial, ...parsed };
      }
      return parsed;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    if (!enabled) return;
    try {
      store.setItem(key, JSON.stringify(values));
    } catch {
      /* التخزين غير متاح، نتجاهل */
    }
  }, [enabled, store, key, values]);

  const clear = useCallback(() => {
    if (!enabled) return;
    try {
      store.removeItem(key);
    } catch {
      /* التخزين غير متاح، نتجاهل */
    }
  }, [enabled, store, key]);

  return [values, setValues, clear];
}
