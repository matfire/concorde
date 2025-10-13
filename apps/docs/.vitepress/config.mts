import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Concorde",
  description:
    "A TypeScript wrapper for Pusher that ensures end-to-end type safety with schema validation",
  head: [
    [
      'script',
      {
        src: "https://stats.matteogassend.com/script.js",
        "data-website-id": "0f8b0398-1d1e-433e-959f-3dcca2e64081",
        defer: ""
      }
    ]
  ],
  lastUpdated: true,
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: "Home", link: "/" },
      { text: "Guide", link: "/guide/getting-started" },
      { text: "API Reference", link: "/api/client" },
    ],

    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Basic Usage", link: "/guide/basic-usage" },
          { text: "Schema Validation", link: "/guide/schema-validation" },
          { text: "Dynamic Channels", link: "/guide/dynamic-channels" },
          { text: "Error Handling", link: "/guide/error-handling" },
          { text: "Best Practices", link: "/guide/best-practices" },
        ],
      },
      {
        text: "API Reference",
        items: [
          { text: "Client API", link: "/api/client" },
          { text: "Server API", link: "/api/server" },
          { text: "Registry Builder", link: "/api/registry" },
          { text: "Types", link: "/api/types" },
        ],
      },
    ],
    search: {
      provider: "local",
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/matfire/concorde" },
    ],
  },
});
