import React, { useCallback, useEffect, useRef, useState } from 'react';
import RosterFilters from './RosterFilters.jsx';
import RosterTable from './RosterTable.jsx';
import RosterDrawer from './RosterDrawer.jsx';
import Pagination from './Pagination.jsx';
import { useAdminRoster, exportRosterXlsx } from '../hooks/useAdminRoster.js';
import { listUniversityFiles, listColleges, ApiError } from '../../../api/admin.js';
import {
  EMPTY_FILTERS,
  DEFAULT_PAGE_SIZE,
  hasActiveFilters,
  pageCount,
  clampPage,
} from '../../../utils/roster.js';

const asList = (res) => (Array.isArray(res) ? res : res?.items || res?.colleges || []);

export default function RosterTab() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedId, setSelectedId] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [notice, setNotice] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [files, setFiles] = useState([]);
  const [colleges, setColleges] = useState([]);
  const appliedSearch = useRef('');

  const { items, total, loading, error, refetch } = useAdminRoster({
    filters,
    page,
    pageSize,
    onPageOverflow: setPage,
  });

  // Options of the "uploaded file" and "college" filters (loaded once).
  useEffect(() => {
    let alive = true;
    listUniversityFiles()
      .then((res) => alive && setFiles(asList(res)))
      .catch(() => {});
    listColleges()
      .then((res) => alive && setColleges(asList(res)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // The search box applies after the admin stops typing, and goes back to page 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchText.trim();
      if (next !== appliedSearch.current) {
        appliedSearch.current = next;
        setFilters((f) => ({ ...f, search: next }));
        setPage(1);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const selectedRow = items.find((i) => i.record_id === selectedId) || null;

  // The row as it was when opened: shown (with actions disabled) if a later
  // refresh drops it from the current filters.
  const handleSelect = (recordId) => {
    setSelectedId(recordId);
    setSnapshot(items.find((i) => i.record_id === recordId) || null);
  };

  const handleFilters = (next) => {
    setFilters(next);
    setPage(1);
  };

  const handleReset = () => {
    appliedSearch.current = '';
    setSearchText('');
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const handlePageSize = (size) => {
    setPageSize(size);
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      await exportRosterXlsx(filters);
    } catch (e) {
      setExportError(e instanceof ApiError ? e.message : 'تعذّر تصدير الملف، حاول مجدداً.');
    } finally {
      setExporting(false);
    }
  };

  const closeDrawer = useCallback(() => setSelectedId(null), []);
  const drawerRow = selectedRow || (selectedId ? snapshot : null);
  const last = pageCount(total, pageSize);

  return (
    <>
      {notice && (
        <div className="exc-notice" role="status">
          <span className="exc-symbol" style={{ fontSize: '18px' }}>check_circle</span>
          <span>{notice}</span>
        </div>
      )}

      <RosterFilters
        filters={filters}
        searchText={searchText}
        onSearchText={setSearchText}
        onChange={handleFilters}
        onReset={handleReset}
        onExport={handleExport}
        exporting={exporting}
        canReset={hasActiveFilters(filters) || searchText.trim() !== ''}
        files={files}
        colleges={colleges}
      />

      {exportError && (
        <div className="exc-alert" role="alert">
          <span className="exc-symbol">error</span>
          <p style={{ margin: 0 }}>{exportError}</p>
        </div>
      )}

      <section className="exc-card flush">
        <div className="rost-list-head">
          <h4 className="exc-card-title">قائمة الخريجين</h4>
          <span className="rost-count">
            {loading && items.length === 0 ? '...' : `${total} خريج`}
          </span>
        </div>

        <RosterTable
          items={items}
          loading={loading}
          error={error}
          selectedId={selectedId}
          onSelect={handleSelect}
        />

        {total > 0 && (
          <Pagination
            page={page}
            pageCount={last}
            pageSize={pageSize}
            total={total}
            shown={items.length}
            disabled={loading}
            onPage={(n) => setPage(clampPage(n, total, pageSize))}
            onPageSize={handlePageSize}
            noun="خريج"
          />
        )}
      </section>

      {drawerRow && (
        <RosterDrawer
          key={drawerRow.record_id}
          row={drawerRow}
          stale={!selectedRow && !loading}
          onClose={closeDrawer}
          onChanged={refetch}
          onNotice={setNotice}
        />
      )}
    </>
  );
}
