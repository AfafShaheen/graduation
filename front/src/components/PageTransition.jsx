import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import '../style/motion.css';
import { transitionDirection } from '../utils/pageDirection';

// Scroll position of every history entry, so the browser's back button returns to the same place.
const positions = new Map();

/*
 * Wraps the routes. When the path changes it:
 *  - tells the CSS which way the page moves (data-dir), see motion.css
 *  - scrolls to the top, or back to the saved place on the back button
 *  - moves the keyboard / screen-reader focus to the new page's heading
 * The wrapper has no box of its own (display: contents), so it never changes the layout.
 */
export default function PageTransition({ children }) {
  const { pathname, key } = useLocation();
  const navType = useNavigationType();
  const ref = useRef(null);
  const prevPath = useRef(null);
  const keyRef = useRef(key);

  useEffect(() => {
    let before;
    try {
      before = window.history.scrollRestoration;
      window.history.scrollRestoration = 'manual';
    } catch {
      /* not supported */
    }
    const onScroll = () => positions.set(keyRef.current, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      try {
        if (before) window.history.scrollRestoration = before;
      } catch {
        /* not supported */
      }
    };
  }, []);

  useLayoutEffect(() => {
    keyRef.current = key;
    const from = prevPath.current;
    if (from === pathname) return undefined;
    prevPath.current = pathname;

    const el = ref.current;
    const dir = transitionDirection(from, pathname);
    if (el) {
      if (dir === 'none') delete el.dataset.dir;
      else el.dataset.dir = dir;
    }

    const saved = navType === 'POP' ? positions.get(key) : 0;
    window.scrollTo(0, saved || 0);

    if (from === null) return undefined; // first load: leave the focus alone

    // the heading may still be loading (lazy page, data): look for it for about half a second
    let frame = 0;
    let tries = 0;
    const focusHeading = () => {
      const root = ref.current;
      if (!root) return;
      const active = document.activeElement;
      if (active && active !== document.body && root.contains(active)) return; // a field took it
      const heading = root.querySelector('main h2') || root.querySelector('h1');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
        return;
      }
      tries += 1;
      if (tries < 30) frame = requestAnimationFrame(focusHeading);
    };
    frame = requestAnimationFrame(focusHeading);
    return () => cancelAnimationFrame(frame);
  }, [pathname, key, navType]);

  return (
    <div ref={ref} key={pathname} className="pt">
      {children}
    </div>
  );
}
