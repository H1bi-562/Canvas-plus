import { defineBackground } from "wxt/utils/define-background";
import { browser } from "wxt/browser";
import { openWebApp } from "../lib/webAppUrl";

export default defineBackground(() => {
  browser.action.onClicked.addListener(() => {
    void openWebApp(browser.tabs, import.meta.env.WXT_WEB_APP_URL).catch(console.error);
  });
});
