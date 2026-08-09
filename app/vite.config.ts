import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const REACT_RUNTIME_SEGMENTS = [
  "/node_modules/react/",
  "/node_modules/react-dom/",
  "/node_modules/scheduler/",
];

export default defineConfig(({ mode }) => ({
  build: {
    outDir: "dist/client",
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll("\\", "/");
          if (!normalizedId.includes("/node_modules/")) return undefined;
          if (REACT_RUNTIME_SEGMENTS.some((segment) => normalizedId.includes(segment))) return "react";
          if (normalizedId.includes("pixi.js") || normalizedId.includes("@pixi")) return "pixi";
          if (normalizedId.includes("motion") || normalizedId.includes("framer-motion")) return "motion";
          if (normalizedId.includes("@phosphor-icons")) return "icons";
          return undefined;
        },
      },
    },
  },
  define: {
    __THREADWAKE_PERFORMANCE_QA__: JSON.stringify(mode === "qa"),
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    warmup: {
      clientFiles: ["./src/main.tsx"],
    },
  },
}));
