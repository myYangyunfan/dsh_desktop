import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    server: {
      deps: {
        inline: [/@deepseek-ai\/dsh-client-ui-primitives/],
      },
    },
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/lib/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],
  },
})
