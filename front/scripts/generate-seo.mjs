import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const config = JSON.parse(readFileSync(join(root, "seo.config.json"), "utf8"));

const siteUrl = (
  globalThis.process?.env?.VITE_SITE_URL ||
  globalThis.process?.env?.SITE_URL ||
  "http://localhost:5173"
).replace(/\/+$/, "");

const publicDir = join(root, "public");
mkdirSync(publicDir, { recursive: true });

const routes = Array.isArray(config.publicRoutes) ? config.publicRoutes : [];

const urlBlocks = routes.map((route) => {
  const path = route.path.startsWith("/") ? route.path : `/${route.path}`;
  const lines = [`  <url>`, `    <loc>${siteUrl}${path}</loc>`];
  if (route.changefreq) lines.push(`    <changefreq>${route.changefreq}</changefreq>`);
  if (route.priority) lines.push(`    <priority>${route.priority}</priority>`);
  lines.push(`  </url>`);
  return lines.join("\n");
});

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urlBlocks,
  "</urlset>",
  "",
].join("\n");

const robots = [
  "User-agent: *",
  "Allow: /$",
  "Disallow: /",
  "",
  `Sitemap: ${siteUrl}/sitemap.xml`,
  "",
].join("\n");

writeFileSync(join(publicDir, "sitemap.xml"), sitemap, "utf8");
writeFileSync(join(publicDir, "robots.txt"), robots, "utf8");

console.log(`[seo] generated sitemap.xml and robots.txt for ${siteUrl}`);
