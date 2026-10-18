import { useEffect } from "react";

/*
 * Sets the document title and robots meta for the current screen.
 *
 * Private screens keep the default "noindex, nofollow" so nothing behind the
 * login is indexed; only the public landing page opts into indexing (D7).
 */
const SITE_NAME = "حفل تخرج جامعة حمص";
const DEFAULT_TITLE = `${SITE_NAME} 2026 - تسجيل الخريجين`;

function setMeta(name, content) {
  let el = document.head.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export default function usePageMeta({ title, description, robots = "noindex, nofollow" } = {}) {
  useEffect(() => {
    document.title = title ? `${title} | حفل تخرج جامعة حمص` : DEFAULT_TITLE;
    setMeta("robots", robots);
    if (description) {
      setMeta("description", description);
    }
  }, [title, description, robots]);
}
