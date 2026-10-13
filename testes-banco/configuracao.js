/*
 * Configuração dos testes do banco (jest.banco.config.js): o Firebase é
 * o do emulador; só os módulos do aparelho (GPS, SMS, cofre...) são
 * simulados, porque não existem no Node.
 */

jest.mock('../src/config/firebase', () => require('./contexto').config);

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-secure-store', () => {
  const cofre = new Map();

  return {
    getItemAsync: async (chave) => (cofre.has(chave) ? cofre.get(chave) : null),
    setItemAsync: async (chave, valor) => {
      cofre.set(chave, valor);
    },
    deleteItemAsync: async (chave) => {
      cofre.delete(chave);
    },
  };
});

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: async () => ({ granted: false }),
  getLastKnownPositionAsync: async () => null,
  reverseGeocodeAsync: async () => [],
  geocodeAsync: async () => [],
}));

jest.mock('expo-sms', () => ({
  isAvailableAsync: async () => false,
  sendSMSAsync: async () => ({ result: 'unknown' }),
}));

jest.mock('expo-crypto', () => ({}));
jest.mock('expo-image-manipulator', () => ({}));
jest.mock('expo-local-authentication', () => ({}));

// Logs do app ("Grupo criado: ...") poluem a saída dos testes.
jest.spyOn(console, 'log').mockImplementation(() => {});
