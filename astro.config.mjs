import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://matur.kristinn.eu',
  output: 'static',
  build: { format: 'directory' },
  integrations: [
    sitemap({
      // Pages that only mean anything to a signed-in person, or to nobody.
      filter: (page) =>
        !page.includes('/offline/') && !page.includes('/uppskriftirnar-minar/'),
    }),
  ],
});
