import js from '@eslint/js';
import globals from 'globals';

export default [
    {
        ignores: ['node_modules/', '.husky/']
    },
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'script',
            globals: {
                ...globals.browser,
                ...globals.webextensions
            }
        },
        rules: {
            strict: ['error', 'function'],
            'no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
            ],
            'no-case-declarations': 'off'
        }
    }
];
