// Monli is an internal admin tool: no SEO needs, so it ships as a static SPA
// that nginx serves next to the API (same origin, no CORS).
export default defineNuxtConfig({
  compatibilityDate: "2026-10-01",
  ssr: false,
  modules: ["@nuxt/ui"],
  css: ["~/assets/css/main.css"],
  devtools: { enabled: true },
  // 3000 is the backend's dev port.
  devServer: { port: 3001 },

  // The console is dark-only: no color-mode switching (a stored preference
  // from the browser would otherwise override ours), dark class always set.
  ui: { colorMode: false },
  app: {
    head: { htmlAttrs: { class: "dark", lang: "en" } },
  },

  fonts: {
    defaults: { weights: [400, 500, 600] },
  },

  nitro: {
    // Dev only: mirrors nginx, which strips /api before forwarding to Express.
    devProxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
});
