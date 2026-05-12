import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/customer/', '/contractor/', '/company/', '/admin/', '/api/', '/inv/'],
      },
      {
        userAgent: 'GPTBot',
        allow: ['/', '/tasks', '/services', '/how-it-works', '/about', '/glossary'],
        disallow: ['/customer/', '/contractor/', '/company/', '/admin/', '/api/', '/contractors', '/companies'],
      },
      {
        userAgent: 'PerplexityBot',
        allow: ['/', '/tasks', '/services', '/how-it-works', '/about', '/glossary'],
        disallow: ['/customer/', '/contractor/', '/company/', '/admin/', '/api/', '/contractors', '/companies'],
      },
      {
        userAgent: 'ClaudeBot',
        allow: ['/', '/tasks', '/services', '/how-it-works', '/about', '/glossary'],
        disallow: ['/customer/', '/contractor/', '/company/', '/admin/', '/api/', '/contractors', '/companies'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
