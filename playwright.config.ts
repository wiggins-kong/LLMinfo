import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const artifact = path.resolve(root, "llminfo.html");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: pathToFileURL(artifact).href,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "dark",
        viewport: { width: 1440, height: 900 },
        launchOptions: process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : undefined,
      },
    },
    {
      name: "desktop-firefox",
      use: { ...devices["Desktop Firefox"], colorScheme: "dark", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "desktop-webkit",
      use: { ...devices["Desktop Safari"], colorScheme: "dark", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        launchOptions: process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : undefined,
      },
    },
  ],
});
