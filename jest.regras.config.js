/*
 * Jest das regras do Firestore (firestore.rules.test.js): roda contra o
 * emulador local, com as funções de dados do próprio app.
 *   npm run test:regras
 *
 * Node puro (sem o preset jest-expo, que troca o fetch): o SDK do
 * Firebase e o @firebase/rules-unit-testing falam com o emulador pela rede.
 */
const { transform } = require('jest-expo/jest-preset');

module.exports = {
  testEnvironment: 'node',
  // Mesma transformação (Babel do Expo) dos outros testes.
  transform,
  setupFiles: ['<rootDir>/jest.setup.js'],
  clearMocks: true,
  testMatch: ['<rootDir>/firestore.rules.test.js'],
  testTimeout: 30000,
};
