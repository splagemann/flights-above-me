import js from '@eslint/js';
import globals from 'globals';

const noUnusedVars = ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }];

export default [
  js.configs.recommended,
  {
    files: ['server.js'],
    languageOptions: { globals: globals.node },
    rules: { 'no-unused-vars': noUnusedVars },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: { globals: { ...globals.browser, L: 'readonly' } },
    rules: { 'no-unused-vars': noUnusedVars },
  },
  { ignores: ['node_modules/'] },
];
