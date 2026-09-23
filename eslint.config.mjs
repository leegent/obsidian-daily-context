import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'main.js', 'tests/**', 'scripts/**', '*.mjs'] },
  ...tseslint.configs.recommendedTypeChecked,
  { files: ['src/**/*.ts'], rules: { '@typescript-eslint/no-restricted-imports': ['error', { paths: [{ name: 'moment', allowTypeImports: true, message: 'Import the moment value from obsidian.' }] }] }, languageOptions: { parserOptions: { project: './tsconfig.json' } } },
);
