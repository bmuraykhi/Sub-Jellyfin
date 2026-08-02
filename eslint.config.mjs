import js from '@eslint/js';
import html from 'eslint-plugin-html';
import globals from 'globals';

const shared = {
    languageOptions: {
        ecmaVersion: 2021,
        sourceType: 'script',
        globals: {
            ...globals.browser,
            ApiClient: 'readonly',
            Dashboard: 'readonly'
        }
    },
    rules: {
        ...js.configs.recommended.rules,
        'no-empty': ['error', { allowEmptyCatch: true }],
        'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
        eqeqeq: ['error', 'smart']
    }
};

export default [
    { ignores: ['node_modules/**', 'plans/**', 'publish/**'] },
    { files: ['Web/**/*.js'], ...shared },
    { files: ['Configuration/**/*.html'], plugins: { html }, ...shared }
];
