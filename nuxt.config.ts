import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-01',

  devtools: { enabled: false },

  srcDir: 'app',

  // Keep server routes at the project root (./server), as Nuxt 4 layout does.
  serverDir: 'server',

  ssr: true,

  modules: ['@pinia/nuxt'],

  // Use unprefixed component names (Dialog, Sheet, Button…) like shadcn-vue.
  components: [{ path: '~/components', pathPrefix: false }],

  css: ['~/assets/css/main.css'],

  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },

  vite: {
    server: {
      // In the compose stack the download worker calls back to the dev server
      // as http://nuxt:3000; without this, Vite's DNS-rebinding protection
      // answers every such request with 403.
      allowedHosts: true,
    },
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },

  // All secrets are read from process.env via server/utils/env.ts.
  // docker-compose and .env pass DATABASE_URL / MINIO_* / SESSION_* directly.

  app: {
    head: {
      title: 'Dreamy',
      titleTemplate: '%s · Dreamy',
      htmlAttrs: { lang: 'en', class: 'dark' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#0c0815' },
        { name: 'description', content: 'Dreamy — a quiet place for music. Calm, plush, and yours.' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/favicon.svg' },
        // Quicksand display font: preloaded so headings snap in instead of swapping.
        { rel: 'preload', as: 'font', type: 'font/woff2', href: '/fonts/quicksand-latin.woff2', crossorigin: '' },
        { rel: 'preload', as: 'font', type: 'font/woff2', href: '/fonts/quicksand-latin-ext.woff2', crossorigin: '' },
      ],
    },
  },

})
