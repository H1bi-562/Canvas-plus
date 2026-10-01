import { defineConfig } from "wxt";

export default defineConfig({
  manifest: { name: "CanvasPlus", description: "Open your CanvasPlus study dashboard", action: { default_title: "Open CanvasPlus" }, browser_specific_settings: { gecko: { id: "canvasplus@example.invalid", data_collection_permissions: { required: ["none"] } } } }
});
