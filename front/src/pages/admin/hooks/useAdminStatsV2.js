import { useCallback, useEffect, useRef, useState } from 'react';
import { adminRequest, ApiError } from '../../../api/admin.js';

export const STATS_POLL_MS = 30000; // the server keeps the answer for 30 s, so this is cheap
export const STATS_POLL_EVENT_DAY_MS = 10000; // on a ceremony day the entry numbers move fast

// Statistics of one scope (a ceremony id, or null for all ceremonies). Refreshes by
// itself only while the tab is visible and again as soon as the tab comes back.
// A refresh in the background never replaces the page by a loading state or an error.
export function useAdminStatsV2(eventId) {
  const [state, setState] = useState({ data: null, loading: true, refreshing: false, error: '', updatedAt: null });
  const latest = useRef(0);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      const id = ++latest.current;
      setState((s) => ({ ...s, refreshing: true, loading: s.data ? s.loading : true, error: silent ? s.error : '' }));
      try {
        const data = await adminRequest('/api/admin/stats/v2', {
          query: eventId ? { event_id: eventId } : null,
        });
        if (latest.current === id) {
          setState({ data, loading: false, refreshing: false, error: '', updatedAt: new Date() });
        }
      } catch (e) {
        if (latest.current === id) {
          setState((s) => ({
            ...s,
            loading: false,
            refreshing: false,
            error: silent && s.data ? '' : e instanceof ApiError ? e.message : 'حدث خطأ غير متوقع.',
          }));
        }
      }
    },
    [eventId],
  );

  const eventDay = Boolean(state.data?.scope?.event_day);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') load({ silent: true });
    };
    const timer = setInterval(tick, eventDay ? STATS_POLL_EVENT_DAY_MS : STATS_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [load, eventDay]);

  const refresh = useCallback(() => load({ silent: false }), [load]);
  return { ...state, refresh };
}
