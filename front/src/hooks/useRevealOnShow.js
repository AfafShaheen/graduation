import { useEffect, useRef } from 'react';

// A message that appears far from the button he pressed (e.g. an error at the top of a long form
// while the "next" button sits in the bottom bar) is brought into view, so he does not miss it.
export default function useRevealOnShow(message) {
  const ref = useRef(null);
  useEffect(() => {
    if (message && ref.current) ref.current.scrollIntoView({ block: 'center' }); // instant: always works, even on weak phones
  }, [message]);
  return ref;
}
