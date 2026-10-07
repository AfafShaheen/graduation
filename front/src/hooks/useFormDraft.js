import { useState, useEffect } from 'react';

/*
  مثل useState بالضبط، لكن القيمة بتنحفظ بـ sessionStorage
  فما بتضيع عند الرجوع بين الصفحات أو عمل refresh.
*/
export default function useFormDraft(key, initial) {
  const [values, setValues] = useState(() => {
    try {
      const saved = sessionStorage.getItem(key);
      return saved ? { ...initial, ...JSON.parse(saved) } : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(values));
    } catch {
      /* التخزين غير متاح، نتجاهل */
    }
  }, [key, values]);

  return [values, setValues];
}