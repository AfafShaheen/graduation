/* المسار الصحيح الذي يجب أن يكون فيه الخريج حسب حالة تذكرته */
export function routeForTicket(data) {
  if (!data || !data.has_ticket) return "/tickets";
  switch (data.ticket?.status) {
    case "AWAITING_PAYMENT":
      return "/payment";
    case "PROCESSING":
      return "/payment-submitted";
    case "REJECTED":
      return "/payment-rejected";
    case "CONFIRMED":
      return "/my-ticket";
    default:
      return "/tickets";
  }
}

// How often the "waiting for review" page asks the server (only while visible).
export const ORDER_POLL_MS = 15000;
