/*
 * Testes do banco de dados (npm run test:banco).
 *
 * Rodam o código de src/dados contra o Emulador do Firestore, que
 * aplica o firestore.rules de verdade. Nada vai para o Firebase real:
 * o projeto "demo-conecta" só existe no emulador.
 *
 * Ambiente Node (não React Native): o SDK do Firebase conversa com o
 * emulador pela rede local, como no aparelho.
 */
const presetExpo = require.resolve('babel-preset-expo', {
  paths: [require.resolve('expo/package.json')],
});

module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/testes-banco/**/*.test.js'],
  setupFiles: ['<rootDir>/testes-banco/configuracao.js'],
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { presets: [presetExpo] }],
  },
  testTimeout: 30000,
  // Um arquivo por vez: todos usam o mesmo emulador.
  maxWorkers: 1,
};
