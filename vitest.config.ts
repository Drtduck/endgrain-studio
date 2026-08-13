import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import mdx from '@mdx-js/rollup'
import remarkGfm from 'remark-gfm'

export default defineConfig({
  // registry.ts импортирует content/blog/*.mdx напрямую: vitest (в отличие от
  // Next/Turbopack) не умеет .mdx из коробки, поэтому та же обвязка remark-gfm
  // подключена и здесь, отдельно от next.config.ts.
  plugins: [tsconfigPaths(), mdx({ remarkPlugins: [remarkGfm] }), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx', 'components/**/*.test.tsx', 'app/**/*.test.ts', 'app/**/*.test.tsx'],
  },
})
