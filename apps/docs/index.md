---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "Concorde"
  text: "Type-safe Pusher wrapper"
  tagline: "A TypeScript wrapper for Pusher that ensures end-to-end type safety with schema validation"
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /api/client

features:
  - title: 🔒 Type Safety
    details: End-to-end TypeScript type safety for all your real-time events. Catch errors at compile time, not runtime.
  - title: 📐 Schema Validation
    details: Built-in schema validation using StandardSchema ensures data integrity across your entire application.
  - title: 🚀 Developer Experience
    details: Intuitive API design with excellent IntelliSense support and comprehensive error messages.
  - title: 🔌 Pusher Compatible
    details: Works seamlessly with existing Pusher infrastructure. Drop-in replacement for pusher-js and pusher packages.
  - title: 📚 Dynamic Channels
    details: Support for parameterized channels with full type safety for scalable real-time applications.
  - title: 🛡️ Runtime Safety
    details: Automatic validation of incoming and outgoing data prevents invalid payloads from breaking your app.
---

