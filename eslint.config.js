// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Testes (npm test): globais do Jest.
    files: ['__tests__/**/*.js', 'jest.setup.js'],
    languageOptions: {
      globals: Object.fromEntries(
        ['jest', 'describe', 'test', 'it', 'expect', 'beforeAll', 'beforeEach', 'afterAll', 'afterEach']
          .map((nome) => [nome, 'readonly'])
      ),
    },
  },
  {
    // Regras pensadas para o React Compiler (que o app não usa). Os
    // casos atuais são intencionais (zerar estado quando a entrada muda,
    // ref com o valor mais recente): ficam como aviso, não como erro.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
]);
