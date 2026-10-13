/*
 * Simulações dos módulos nativos para os testes (npm test).
 * O código do app roda de verdade; só o que depende do aparelho é
 * substituído: armazenamento, cofre de senhas e biometria.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Cofre (SecureStore) em memória.
jest.mock('expo-secure-store', () => {
  const cofre = new Map();

  return {
    __cofre: cofre,
    getItemAsync: jest.fn(async (chave) => (cofre.has(chave) ? cofre.get(chave) : null)),
    setItemAsync: jest.fn(async (chave, valor) => {
      cofre.set(chave, valor);
    }),
    deleteItemAsync: jest.fn(async (chave) => {
      cofre.delete(chave);
    }),
  };
});

// Biometria controlada por cada teste (__controle).
jest.mock('expo-local-authentication', () => {
  const controle = {
    hardware: true,
    cadastrada: true,
    resultado: { success: true },
  };

  return {
    __controle: controle,
    AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2 },
    hasHardwareAsync: jest.fn(async () => controle.hardware),
    isEnrolledAsync: jest.fn(async () => controle.cadastrada),
    supportedAuthenticationTypesAsync: jest.fn(async () => [2]),
    authenticateAsync: jest.fn(async () => controle.resultado),
  };
});

jest.mock('react-native-maps', () => {
  const { View } = require('react-native');
  const Mock = (props) => <View {...props} />;

  return { __esModule: true, default: Mock, Marker: Mock };
});

// Ícones: só o nome importa nos testes (evita carregar fontes).
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  const Icone = ({ name }) => <Text>{`icone:${name}`}</Text>;

  return { Feather: Icone };
});
