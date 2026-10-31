import { useEffect, useState } from "react";
import { getPublicSettings } from "../api/graduate";

const CACHE_KEY = "grad.contactPhone";

function readCache() {
  try {
    // A cached empty value means "not set yet": ask the server again.
    return window.sessionStorage.getItem(CACHE_KEY) || null;
  } catch {
    return null;
  }
}

function writeCache(value) {
  try {
    window.sessionStorage.setItem(CACHE_KEY, value);
  } catch {
    /* التخزين المؤقت غير متاح */
  }
}

export default function useContactPhone() {
  const [contactPhone, setContactPhone] = useState(() => readCache() ?? "");

  useEffect(() => {
    if (readCache() !== null) return undefined;
    let mounted = true;
    getPublicSettings()
      .then((data) => {
        const phone = (data?.contact_phone || "").trim();
        if (phone) writeCache(phone);
        if (mounted) setContactPhone(phone);
      })
      .catch(() => {
        /* نترك الرقم فارغاً إذا تعذّر الجلب */
      });
    return () => {
      mounted = false;
    };
  }, []);

  return contactPhone;
}
