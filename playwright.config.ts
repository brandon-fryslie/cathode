import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test/e2e',
  timeout: 15000,
  use: {
    baseURL: 'http://localhost:3999',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
