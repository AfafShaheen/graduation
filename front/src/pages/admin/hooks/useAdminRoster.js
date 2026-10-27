import { useCallback, useEffect, useRef, useState } from 'react';
import { adminRequest, adminBlob, downloadBlob, ApiError } from '../../../api/admin.js';
import { buildRosterQuery, buildRosterFilterQuery } from '../../../utils/roster.js';

// One page of the roster for the given filters. A newer request always wins:
// a slow answer for old filters can never overwrite the newer list.
export function useAdminRoster({ filters, page, pageSize, onPageOverflow }) {
  const [state, setState] = useState({ items: [], total: 0, loading: true, error: '' });
  const latest = useRef(0);

  const load = useCallback(async () => {
    const id = ++latest.current;
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const res = await adminRequest('/api/admin/roster', {
        query: buildRosterQuery(filters, page, pageSize),
      });
      if (latest.current === id) {
        const items = res.items || [];
        const total = res.total || 0;
        setState({ items, total, loading: false, error: '' });
        // The page became empty (rows left the filter): step back to the last page.
        if (items.length === 0 && total > 0 && page > 1 && onPageOverflow) {
          onPageOverflow(Math.max(1, Math.ceil(total / pageSize)));
        }
      }
    } catch (e) {
      if (latest.current === id) {
        setState((s) => ({
          ...s,
          items: [],
          loading: false,
          error: e instanceof ApiError ? e.message : 'حدث خطأ غير متوقع.',
        }));
      }
    }
  }, [filters, page, pageSize, onPageOverflow]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, refetch: load };
}

// Excel file of everything that matches the current filters (not just one page).
export async function exportRosterXlsx(filters) {
  const { blob, filename } = await adminBlob(
    '/api/admin/roster/export',
    buildRosterFilterQuery(filters),
  );
  downloadBlob(blob, filename);
}
