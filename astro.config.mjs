import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://www.zabs.dev',
  trailingSlash: 'always',
  integrations: [mdx()],
  build: {
    format: 'directory',
  },
});
