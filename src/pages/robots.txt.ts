import type { APIRoute } from 'astro';
export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const sitemap = new URL(base + 'sitemap-index.xml', site).href;
  return new Response(`User-agent: *\nDisallow: ${base}api/\nDisallow: ${base}admin/\nDisallow: ${base}spasibo/\n\nSitemap: ${sitemap}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
