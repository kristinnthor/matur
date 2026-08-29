import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://matur.kristinn.eu',
  output: 'static',
  build: { format: 'directory' },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/offline/') && !page.includes('/myndir/'),
    }),
  ],
});
