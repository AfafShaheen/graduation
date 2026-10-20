import { getAdminToken as readAdminSessionKey } from './session.js';

/*
  طبقة تخزين مؤقت داخل الجلسة (in-memory) للقوائم بطيئة التغيّر، لتجنّب إعادة
  جلب نفس البيانات عند التنقّل بين صفحات الإدارة.

  - cachedRequest(key, ttlMs, loader, { force }): ترجع القيمة المخزّنة إن لم
    تنتهِ صلاحيتها، وإلا تنفّذ loader وتخزّن الناتج. الطلبات المتزامنة على نفس
    المفتاح تُدمج في طلب شبكة واحد. الأخطاء لا تُخزَّن.
  - invalidate(prefix): إبطال مفتاح واحد أو كل المفاتيح التي تبدأ بالسابقة.

  المفاتيح مُنَطَّقة برمز جلسة المشرف الحالي حتى لا تظهر بيانات جلسة سابقة.
*/
const cache = new Map();
const inflight = new Map();

export const CACHE_TTL = {
  events: 30 * 1000,
  settings: 60 * 1000,
};

function scopedKey(key) {
  let sid = '';
  try {
    sid = readAdminSessionKey() || '';
  } catch {
    sid = '';
  }
  return `${sid}::${key}`;
}

export function invalidate(prefix = '') {
  for (const key of Array.from(cache.keys())) {
    if (!prefix || key.endsWith(`::${prefix}`) || key.includes(`::${prefix}`)) {
      cache.delete(key);
    }
  }
}

export function invalidateAll() {
  cache.clear();
}

export async function cachedRequest(key, ttlMs, loader, { force = false } = {}) {
  const fullKey = scopedKey(key);
  const now = Date.now();

  if (!force) {
    const hit = cache.get(fullKey);
    if (hit && hit.expiresAt > now) return hit.value;
  }

  if (inflight.has(fullKey)) return inflight.get(fullKey);

  const promise = (async () => {
    try {
      const value = await loader();
      cache.set(fullKey, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } finally {
      inflight.delete(fullKey);
    }
  })();

  inflight.set(fullKey, promise);
  return promise;
}
