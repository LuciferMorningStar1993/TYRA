// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Las Edge Functions (Deno) se validan aparte con `npm run check:functions`.
    ignores: ['dist/*', 'supabase/functions/**'],
  },
]);
