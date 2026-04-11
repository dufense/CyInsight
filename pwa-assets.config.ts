import { defineConfig, minimalPreset } from "@vite-pwa/assets-generator/config";

export default defineConfig({
  preset: {
    ...minimalPreset,
    maskable: {
      sizes: [512],
      padding: 0.3,
      resizeOptions: { background: "#0f172a" },
    },
    apple: {
      sizes: [180],
      padding: 0.2,
      resizeOptions: { background: "#0f172a" },
    },
    favicon: {
      sizes: [64, 192, 512],
      padding: 0,
    },
  },
  images: ["client/public/icon.svg"],
});
