import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The wallet adapter declares React as a peer dependency, and Vite's
    // pre-bundling was resolving it to a second copy — enough to break every
    // hook in the tree with "Invalid hook call". Deduping pins both packages to
    // the one install at the project root.
    dedupe: ["react", "react-dom"],
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
