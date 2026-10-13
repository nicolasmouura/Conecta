/*
 * Simulações dos módulos nativos para os testes (npm test).
 * O código do app roda de verdade; só o que depende do aparelho é
 * substituído: Firebase, armazenamento, cofre de senhas, hash e biometria.
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

// Firebase simulado (jest/): o src/dados/* roda de verdade, sem internet.
jest.mock('firebase/firestore', () => require('./jest/firestoreFalso'));
jest.mock('firebase/auth', () => require('./jest/authFalso'));
jest.mock('./src/config/firebase', () => ({
  db: require('./jest/firestoreFalso').db,
  auth: require('./jest/authFalso').auth,
}));

// Hash e bytes aleatórios pelo crypto do Node (mesmo resultado do aparelho).
jest.mock('expo-crypto', () => {
  const crypto = require('crypto');

  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    getRandomBytes: jest.fn((tamanho) => new Uint8Array(crypto.randomBytes(tamanho))),
    digestStringAsync: jest.fn(async (algoritmo, texto) =>
      crypto.createHash(algoritmo.replace('-', '').toLowerCase()).update(texto).digest('hex')
    ),
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

// Mapa: uma View com os métodos que o app chama pelo ref.
jest.mock('react-native-maps', () => {
  const { forwardRef, useImperativeHandle } = require('react');
  const { View } = require('react-native');

  const MapView = forwardRef((props, ref) => {
    useImperativeHandle(ref, () => ({
      animateToRegion: jest.fn(),
      animateCamera: jest.fn(),
      fitToCoordinates: jest.fn(),
    }));

    return <View {...props} />;
  });

  MapView.displayName = 'MapView';

  const Mock = (props) => <View {...props} />;

  return { __esModule: true, default: MapView, Marker: Mock, Polyline: Mock, Callout: Mock, Circle: Mock };
});

// Ícones: só o nome importa nos testes (evita carregar fontes).
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  const Icone = ({ name }) => <Text>{`icone:${name}`}</Text>;

  return { Feather: Icone, MaterialCommunityIcons: Icone };
});

// Área segura (notch/barra de status): simulação oficial da biblioteca.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default
);
