import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const baseURL = `http://127.0.0.1:${PORT}`
const isCI = process.env['CI'] === 'true' || process.env['CI'] === '1'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Живого Supabase в CI нет (webServer поднимается с PUBLIC_STUDIO=1), общего
  // состояния между тестами тоже, поэтому один воркер был лишней осторожностью:
  // на двухъядерном раннере два воркера дают почти двукратный выигрыш, а третий
  // уже конкурирует за ядра с самим next start.
  ...(isCI ? { workers: 2 } : {}),
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
    // Студия закрыта аккаунтом, но 40+ смоков ходят в редактор анонимно и живого
    // Supabase в CI нет. Поэтому e2e-сборка по умолчанию поднимается с аварийным
    // флагом PUBLIC_STUDIO=1. Чтобы проверить сам гейт, запускайте с PUBLIC_STUDIO=0
    // (тогда включится сценарий «гейт» в e2e/auth.spec.ts).
    env: { PUBLIC_STUDIO: process.env['PUBLIC_STUDIO'] ?? '1' },
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
