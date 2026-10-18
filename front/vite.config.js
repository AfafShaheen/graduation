import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/*
  SEO: يقتصر الفهرسة على صفحة الهبوط العامة (D7).
  تُحقن وسوم الوصف/الكلمات/robots/og/canonical في index.html وقت البناء،
  وتعتمد الصفحات الخاصة على usePageMeta + ترويسة nginx.
*/
function seoPlugin() {
  return {
    name: 'seo-meta',
    transformIndexHtml(html) {
      let config
      try {
        config = JSON.parse(readFileSync(new URL('./seo.config.json', import.meta.url), 'utf8'))
      } catch {
        return html
      }
      const env = globalThis.process?.env ?? {}
      const siteUrl = (env.VITE_SITE_URL || env.SITE_URL || '').replace(/\/+$/, '')
      const title = config.defaultTitle || config.siteName || 'graduation-events'
      const description = config.defaultDescription || ''
      const tags = [
        `<meta name="description" content="${escapeAttr(description)}" />`,
        `<meta name="keywords" content="${escapeAttr(config.keywords)}" />`,
        `<meta name="robots" content="index, follow" />`,
        `<meta property="og:type" content="website" />`,
        `<meta property="og:title" content="${escapeAttr(title)}" />`,
        `<meta property="og:description" content="${escapeAttr(description)}" />`,
        `<meta property="og:locale" content="${escapeAttr(config.locale || 'ar_SY')}" />`,
        `<meta name="twitter:card" content="summary" />`,
      ]
      if (siteUrl) {
        tags.push(`<link rel="canonical" href="${escapeAttr(siteUrl + '/')}" />`)
      }
      const withTitle = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeAttr(title)}</title>`)
      return withTitle.replace('</head>', `    ${tags.join('\n    ')}\n  </head>`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // cPanel sub-path deploy: VITE_BASE_PATH=/graduation/ (default '/' = unchanged)
  base: globalThis.process?.env?.VITE_BASE_PATH || '/',
  plugins: [react(), seoPlugin()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
})
