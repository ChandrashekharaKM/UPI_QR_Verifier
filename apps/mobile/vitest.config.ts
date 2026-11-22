import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}']
  },
  resolve: {
    alias: {
      'react-native': 'react-native-web'
    }
  }
});
