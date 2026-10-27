import { useEffect } from "react";
import seoConfig from "../../seo.config.json";

/*
  يضبط عنوان الصفحة ووصفها ووسوم robots/canonical/og/twitter حسب المسار الحالي.
  - المسارات الموجودة في seo.config.json → publicRoutes هي صفحات عامة قابلة للفهرسة
    (الفهرسة الكاملة مفعّلة عليها: index, follow).
  - أي مسار خاص (لوحة الإدارة، السكannenر، صفحات الدفع والتذاكر) → noindex, nofollow.
*/
const SITE_NAME = seoConfig.siteName;
const DEFAULT_TITLE = seoConfig.defaultTitle;
const TITLE_TEMPLATE = seoConfig.titleTemplate || `%s | ${SITE_NAME}`;
const DEFAULT_DESCRIPTION = seoConfig.defaultDescription;
const BASE_URL = import.meta.env.BASE_URL || "/";
const ORIGIN = String(import.meta.env.VITE_SITE_URL || seoConfig.siteUrl || "").replace(/\/+$/, "");

function upsertMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setMetaName(name, content) {
  upsertMeta("name", name, content);
}

function setMetaProperty(property, content) {
  upsertMeta("property", property, content);
}

function setLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function canonicalUrl(path = "/") {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const baseNoSlash = base.replace(/\/+$/, "");
  let origin = ORIGIN;
  if (origin && baseNoSlash && !origin.endsWith(baseNoSlash)) origin += baseNoSlash;
  const rel = path === "/" ? "" : String(path).replace(/^\/+/, "");
  return `${origin}/${rel}`;
}

export default function usePageMeta({ path = "/", title, description, robots } = {}) {
  const route = (seoConfig.publicRoutes || []).find((item) => item.path === path);
  const resolvedTitle = title ?? route?.title;
  const resolvedDescription = description ?? route?.description ?? DEFAULT_DESCRIPTION;
  const resolvedRobots =
    robots ?? (route ? "index, follow, max-image-preview:large" : "noindex, nofollow");

  useEffect(() => {
    document.title = resolvedTitle
      ? resolvedTitle === DEFAULT_TITLE
        ? DEFAULT_TITLE
        : TITLE_TEMPLATE.replace("%s", resolvedTitle)
      : DEFAULT_TITLE;

    const url = canonicalUrl(path);
    setMetaName("robots", resolvedRobots);
    setMetaName("description", resolvedDescription);
    setMetaProperty("og:title", document.title);
    setMetaProperty("og:description", resolvedDescription);
    setMetaProperty("og:url", url);
    setMetaName("twitter:title", document.title);
    setMetaName("twitter:description", resolvedDescription);
    setLink("canonical", url);
  }, [path, resolvedTitle, resolvedDescription, resolvedRobots]);
}
