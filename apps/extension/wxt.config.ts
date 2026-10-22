import react from "@vitejs/plugin-react";
import { defineConfig } from "wxt";
import { getWebAppUrl } from "./lib/webAppUrl";

export default defineConfig({
  vite: () => ({ plugins: [react()] }),
  // A function, so WXT_WEB_APP_URL from the .env files is loaded before it is read.
  manifest: () => {
    const app = new URL(getWebAppUrl(process.env.WXT_WEB_APP_URL));
    return {
      name: "CanvasPlus", description: "Your top CanvasPlus priorities at a glance", action: { default_title: "CanvasPlus" },
      // Only the web app: the popup reads its API with the student's session cookie. Match patterns cover every port.
      host_permissions: [`${app.protocol}//${app.hostname}/*`],
      browser_specific_settings: { gecko: { id: "canvasplus@example.invalid", data_collection_permissions: { required: ["none"] } } }
    };
  }
});
