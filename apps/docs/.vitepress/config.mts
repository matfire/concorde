import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Concorde",
  description:
    "A TypeScript wrapper for Pusher that ensures end-to-end type safety with schema validation",

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
      {
        text: "Examples",
        items: [
          { text: "Real-time Chat", link: "/examples/chat" },
          { text: "Live Notifications", link: "/examples/notifications" },
          { text: "User Presence", link: "/examples/presence" },
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
