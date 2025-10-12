import { defineConfig } from "tsdown";

export default defineConfig({
  dts: true,
  entry: [
    "./src/index.ts",
    "./src/client.ts",
    "./src/server.ts",
    "./src/registry.ts",
  ],
  clean: true,
});
