import react from "@vitejs/plugin-react";
import { defineConfig } from "wxt";

export default defineConfig({
  // Keep the WXT server away from the Next.js web app on port 3000
  dev: {
    server: {
      port: 3001,
      origin: "http://localhost:3001",
      strictPort: true
    }
  },

  vite: () => ({
    plugins: [react()]
  }),

  manifest: () => {
    return {
      name: "CanvasPlus",
      description: "Your top CanvasPlus priorities at a glance",
      action: {
        default_title: "CanvasPlus"
      },

      permissions: [
        "declarativeNetRequestWithHostAccess",
        "storage"
      ],

      // Needed to block the sites entered in Focus Mode
      host_permissions: [
        "<all_urls>"
      ],

      browser_specific_settings: {
        gecko: {
          id: "canvasplus@example.invalid",
          data_collection_permissions: {
            required: ["none"]
          }
        }
      }
    };
  }
});