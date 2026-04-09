import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/utils/**/*.ts', 'src/core/graph/**/*.ts', 'src/db/**/*.ts', 'src/tools/**/*.ts'],
    },
    testTimeout: 10000,
  },
})
