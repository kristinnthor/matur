import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://matur.kristinn.eu',
  output: 'static',
  build: { format: 'directory' },
});
