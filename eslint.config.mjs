import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.expo/**',
      '**/coverage/**',
      '**/.turbo/**',
      'ml/data/**',
      'docs/**',
      '**/*.d.ts',
      '**/*.map',
      '**/*.json'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
      'no-useless-assignment': 'off',
      'prefer-const': 'warn',
      'no-control-regex': 'off',
      'no-useless-escape': 'off'
    }
  }
);
