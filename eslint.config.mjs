import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'main.js', 'tests/**', 'scripts/**', '*.mjs'] },
  ...tseslint.configs.recommendedTypeChecked,
  { files: ['src/**/*.ts'], languageOptions: { parserOptions: { project: './tsconfig.json' } } },
);
