import React, { createContext, useContext, useMemo } from 'react';

/*
  إحصائيات مشتركة لكل صفحات الإدارة (مثل عدد طلبات الدفع المعلّقة بجانب القائمة الجانبية).
  القيم بتجي من فوق (App) من مكان واحد، والشريط الجانبي بيقراها بس.
*/
const AdminStatsContext = createContext({ pendingPayments: 0 });

export function AdminStatsProvider({ pendingPayments = 0, children }) {
  const value = useMemo(() => ({ pendingPayments }), [pendingPayments]);
  return <AdminStatsContext.Provider value={value}>{children}</AdminStatsContext.Provider>;
}

export const useAdminStats = () => useContext(AdminStatsContext);