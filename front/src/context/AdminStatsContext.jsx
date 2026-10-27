import React, { createContext, useContext, useMemo } from 'react';

/*
  إحصائيات مشتركة لكل صفحات الإدارة (مثل عدد طلبات الدفع المعلّقة بجانب القائمة الجانبية).
  القيم بتجي من فوق (App) من مكان واحد، والشريط الجانبي بيقراها بس.
  refreshPendingPayments بتحدّث العدّاد بعد أي إجراء على الدفعات.
*/
const AdminStatsContext = createContext({
  pendingPayments: 0,
  refreshPendingPayments: () => {},
});

export function AdminStatsProvider({ pendingPayments = 0, refreshPendingPayments = () => {}, children }) {
  const value = useMemo(
    () => ({ pendingPayments, refreshPendingPayments }),
    [pendingPayments, refreshPendingPayments]
  );
  return <AdminStatsContext.Provider value={value}>{children}</AdminStatsContext.Provider>;
}

export const useAdminStats = () => useContext(AdminStatsContext);