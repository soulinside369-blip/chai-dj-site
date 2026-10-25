import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// SITE_URL и BASE_PATH задаёт workflow: на GitHub Pages сайт живёт в /chai-dj-site/,
// на боевом домене — в корне.
const site = process.env.SITE_URL || 'https://example.ru';
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  integrations: [sitemap({ filter: (p) => !/\/(spasibo|admin)\//.test(p) })],
  build: { inlineStylesheets: 'always', format: 'directory' },
  compressHTML: true,
});
