import {availableParallelism} from 'node:os'
import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    clearMocks: true,
    // Bound cold CLI/SDK imports without relaxing command deadlines.
    maxWorkers: Math.min(4, availableParallelism()),
    disableConsoleIntercept: true,
    include: ['test/**/*.test.ts'],
  },
})
