/*
 * Shared, in-flight "my ticket" request.
 *
 * TicketGuard and the page it wraps both render in the same commit, so each
 * used to fire its own GET /api/graduates/me/ticket. This helper collapses the
 * concurrent calls for the same token into a single network request, while a
 * forced call (a manual refresh) always starts a fresh one.
 */
export function createTicketRequest(fetchTicket) {
  let inFlight = null; // { token, promise }

  return {
    fetch(token, { force = false } = {}) {
      if (!token) return Promise.resolve(null);
      if (!force && inFlight && inFlight.token === token) {
        return inFlight.promise;
      }
      const promise = Promise.resolve()
        .then(() => fetchTicket(token))
        .finally(() => {
          if (inFlight && inFlight.promise === promise) {
            inFlight = null;
          }
        });
      inFlight = { token, promise };
      return promise;
    },
    invalidate() {
      inFlight = null;
    },
  };
}
