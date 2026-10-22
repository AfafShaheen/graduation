import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function readSeoConfig() {
  try {
    return JSON.parse(readFileSync(new URL('./seo.config.json', import.meta.url), 'utf8'))
  } catch {
    return null
  }
}

/*
  SEO: وسوم الميتا + robots.txt + sitemap.xml تُبنى وقت البناء (build).
  - عنوان/وصف/كلمات/canonical/og/twitter + JSON-LD داخل index.html.
  - robots.txt يسمح بالصفحات العامة ويمنع المناطق الخاصة (/admin ...).
  - sitemap.xml يرث المسارات العامة من seo.config.json.
  الروابط تُبنى من VITE_SITE_URL (أو siteUrl في seo.config.json) + مسار النشر VITE_BASE_PATH.
*/
function seoPlugin({ base = '/' } = {}) {
  const config = readSeoConfig()
  const env = globalThis.process?.env ?? {}

  const baseNoSlash = String(base).replace(/\/+$/, '')
  let siteUrl = String(env.VITE_SITE_URL || env.SITE_URL || config?.siteUrl || '').replace(/\/+$/, '')
  if (siteUrl && baseNoSlash && !siteUrl.endsWith(baseNoSlash)) siteUrl += baseNoSlash
  const siteRoot = siteUrl ? `${siteUrl}/` : ''

  const siteName = config?.siteName || 'graduation-events'
  const title = config?.defaultTitle || siteName
  const description = config?.defaultDescription || ''
  const lang = config?.lang || 'ar'
  const locale = config?.locale || 'ar_SY'
  const ogImageName = config?.ogImage || 'og-image.png'
  const ogImage = siteRoot ? siteRoot + ogImageName : ogImageName
  const publicRoutes = Array.isArray(config?.publicRoutes) ? config.publicRoutes : []
  const disallowPaths = Array.isArray(config?.disallowPaths) ? config.disallowPaths : []

  function buildHead() {
    const tags = [
      `<meta name="description" content="${escapeAttr(description)}" />`,
      `<meta name="keywords" content="${escapeAttr(config?.keywords || '')}" />`,
      `<meta name="author" content="${escapeAttr(config?.publisher?.name || siteName)}" />`,
      `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />`,
      `<meta name="theme-color" content="${escapeAttr(config?.themeColor || '#124d44')}" />`,
      siteRoot ? `<link rel="canonical" href="${escapeAttr(siteRoot)}" />` : '',
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="${escapeAttr(siteName)}" />`,
      siteRoot ? `<meta property="og:url" content="${escapeAttr(siteRoot)}" />` : '',
      `<meta property="og:title" content="${escapeAttr(title)}" />`,
      `<meta property="og:description" content="${escapeAttr(description)}" />`,
      `<meta property="og:image" content="${escapeAttr(ogImage)}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta property="og:image:alt" content="${escapeAttr(title)}" />`,
      `<meta property="og:locale" content="${escapeAttr(locale)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
      `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
      `<meta name="twitter:image" content="${escapeAttr(ogImage)}" />`,
      `<link rel="icon" type="image/svg+xml" href="${escapeAttr(`${base}favicon.svg`)}" />`,
      `<link rel="preconnect" href="https://fonts.googleapis.com" />`,
      `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />`,
    ].filter(Boolean)

    const ld = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          '@id': `${siteRoot}#website`,
          url: siteRoot,
          name: siteName,
          description,
          inLanguage: lang,
          publisher: { '@id': `${siteRoot}#organization` },
        },
        {
          '@type': 'Organization',
          '@id': `${siteRoot}#organization`,
          name: config?.publisher?.name || siteName,
          url: siteRoot,
          logo: { '@type': 'ImageObject', url: ogImage },
        },
        {
          '@type': 'WebPage',
          '@id': `${siteRoot}#webpage`,
          url: siteRoot,
          name: title,
          description,
          inLanguage: lang,
          isPartOf: { '@id': `${siteRoot}#website` },
        },
      ],
    }

    return [
      ...tags,
      `<script type="application/ld+json">${escapeJson(ld)}</script>`,
    ]
  }

  function buildRobots() {
    const lines = ['User-agent: *', 'Allow: /']
    const prefixes = new Set(
      [baseNoSlash, String(config?.basePath || '').replace(/\/+$/, '')].filter(Boolean)
    )
    for (const p of disallowPaths) {
      const clean = p.replace(/\/+$/, '')
      lines.push(`Disallow: ${clean}`)
      for (const prefix of prefixes) {
        if (!clean.startsWith(prefix)) lines.push(`Disallow: ${prefix}${clean}`)
      }
    }
    if (siteRoot) lines.push('', `Sitemap: ${siteRoot}sitemap.xml`)
    return `${lines.join('\n')}\n`
  }

  function buildSitemap() {
    const today = new Date().toISOString().slice(0, 10)
    const urls = publicRoutes
      .map((route) => {
        const path = route.path || '/'
        const loc = siteRoot
          ? siteRoot + (path === '/' ? '' : path.replace(/^\//, ''))
          : path
        return [
          '  <url>',
          `    <loc>${escapeAttr(loc)}</loc>`,
          `    <lastmod>${today}</lastmod>`,
          `    <changefreq>${route.changefreq || 'weekly'}</changefreq>`,
          `    <priority>${route.priority || '0.8'}</priority>`,
          '  </url>',
        ].join('\n')
      })
      .join('\n')
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      urls,
      '</urlset>',
      '',
    ].join('\n')
  }

  return {
    name: 'seo-meta',
    transformIndexHtml(html) {
      if (!config) return html
      const withTitle = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeAttr(title)}</title>`)
      return withTitle.replace('</head>', `    ${buildHead().join('\n    ')}\n  </head>`)
    },
    generateBundle() {
      if (!config) return
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: buildRobots() })
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: buildSitemap() })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // cPanel sub-path deploy: VITE_BASE_PATH=/graduation/ (default '/' = unchanged)
  base: globalThis.process?.env?.VITE_BASE_PATH || '/',
  plugins: [
    react(),
    seoPlugin({ base: globalThis.process?.env?.VITE_BASE_PATH || '/' }),
    ...(mode === 'development' ? [basicSsl()] : []),
  ],
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
}))
