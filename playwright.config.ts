import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const baseURL = `http://127.0.0.1:${PORT}`
const isCI = process.env['CI'] === 'true' || process.env['CI'] === '1'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  ...(isCI ? { workers: 1 } : {}),
  reporter: isCI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    // Редактор рассчитан и на телефон: смоук гоняем в размере ноутбука, тачи покрыты pointer-событиями.
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // В headless нет GPU: без программного растеризатора Chromium не отдаёт WebGL-контекст,
        // и 3D-вкладка честно показала бы заглушку вместо сцены.
        launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
