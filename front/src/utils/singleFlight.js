// Runs at most one async job per key at a time: callers that arrive while a job is
// in flight get the SAME promise instead of starting a second one. Used for the
// token refresh: the backend rotates refresh tokens and revokes the whole session
// when an already-used token comes back, so two parallel refreshes would log the
// user out.
export function createSingleFlight() {
  const flights = new Map();
  return {
    run(key, job) {
      if (flights.has(key)) return flights.get(key);
      const promise = Promise.resolve()
        .then(job)
        .finally(() => {
          if (flights.get(key) === promise) flights.delete(key);
        });
      flights.set(key, promise);
      return promise;
    },
  };
}

// Another tab may have refreshed while we waited for the lock: if the stored access
// token differs from the one we hold and is still valid, use it instead of
// refreshing again.
export function reuseFreshToken(storedToken, heldToken, storedIsExpired) {
  if (storedToken && storedToken !== heldToken && !storedIsExpired) return storedToken;
  return null;
}
