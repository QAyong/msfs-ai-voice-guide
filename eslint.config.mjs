import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['coverage/', 'dist/', 'node_modules/', 'out/', 'release*/', '.ua/'],
  },
  {
    files: ['scripts/**/*.{mjs,mts,ts}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
);
