import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    clearMocks: true,
    disableConsoleIntercept: true,
    include: ['test/**/*.test.ts'],
  },
})
