/*
 * Teste de fumaça: abre o app inteiro, cadastra, confirma o e-mail,
 * cria a família, passa por todas as telas, sai e entra de novo.
 */

import { Alert } from 'react-native';
import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { __confirmarEmail, __emailsDeConfirmacao } from 'firebase/auth';

import App from '../App';

/*
 * Teste de fumaça do app inteiro: abre o App de verdade (com o Firebase
 * simulado em jest.setup.js), cria uma conta, cria a família e passa
 * por todas as telas do menu. Pega telas que quebram ao abrir.
 */

configure({ asyncUtilTimeout: 8000 });

jest.mock('@expo-google-fonts/poppins', () => ({
  useFonts: () => [true],
  Poppins_700Bold: 'Poppins_700Bold',
  Poppins_600SemiBold: 'Poppins_600SemiBold',
}));

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3, High: 4 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true })),
  hasServicesEnabledAsync: jest.fn(async () => true),
  watchPositionAsync: jest.fn(async (opcoes, callback) => {
    callback({
      coords: { latitude: -22.9, longitude: -43.2, accuracy: 10 },
      timestamp: Date.now(),
    });
    return { remove: jest.fn() };
  }),
  getLastKnownPositionAsync: jest.fn(async () => null),
  reverseGeocodeAsync: jest.fn(async () => [{ street: 'Rua Teste', city: 'Rio de Janeiro' }]),
  geocodeAsync: jest.fn(async () => []),
}));

jest.mock('expo-sms', () => ({
  isAvailableAsync: jest.fn(async () => false),
  sendSMSAsync: jest.fn(),
}));

jest.mock('expo-camera', () => {
  const { View } = require('react-native');

  return {
    CameraView: (props) => <View {...props} />,
    useCameraPermissions: () => [{ granted: false }, jest.fn()],
  };
});

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: false })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));

const erros = [];

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation((...args) => erros.push(args));
});

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  Alert.alert.mockRestore();
});

async function preencher(placeholder, texto) {
  await fireEvent.changeText(screen.getByPlaceholderText(placeholder), texto);
}

async function voltarAoMenu() {
  await fireEvent.press(screen.getByLabelText('Voltar ao menu'));
  expect(await screen.findByText('Minha Família')).toBeTruthy();
}

test('cadastro → família → todas as telas do menu → sair, sem quebrar', async () => {
  await render(<App />);

  // Sem sessão: tela inicial do login.
  await fireEvent.press(await screen.findByText('Se cadastrar'));

  await preencher('Seu nome completo', 'Ana Teste');
  await preencher('Seu e-mail', 'ana@teste.com');
  await preencher('000.000.000-00', '529.982.247-25');
  await preencher('(21) 98765-4321', '(21) 98765-4321');
  await preencher('Sua senha', 'senha123');
  await preencher('Digite a senha novamente', 'senha123');
  await fireEvent.press(screen.getByText('Criar minha conta'));

  // E-mail de confirmação: o app só abre depois do link.
  expect(await screen.findByText('Confirme seu e-mail')).toBeTruthy();
  expect(__emailsDeConfirmacao).toContain('ana@teste.com');

  await fireEvent.press(screen.getByText('Já confirmei'));
  expect(await screen.findByText(/Ainda não recebemos a confirmação/)).toBeTruthy();

  // Reenviar: manda de novo e espera 60 s para o próximo.
  await fireEvent.press(screen.getByText('Reenviar e-mail'));
  expect(await screen.findByText(/E-mail enviado/)).toBeTruthy();
  expect(screen.getByText(/Reenviar e-mail \(\d+ s\)/)).toBeTruthy();
  expect(__emailsDeConfirmacao.filter((email) => email === 'ana@teste.com')).toHaveLength(2);

  await __confirmarEmail('ana@teste.com');
  await fireEvent.press(screen.getByText('Já confirmei'));

  // Biometria simulada aprova → ainda sem família.
  await fireEvent.press(await screen.findByText('Criar família'));
  await preencher('Ex: Família Silva', 'Família Teste');
  await fireEvent.press(screen.getAllByText('Criar família').at(-1));
  await fireEvent.press(await screen.findByText('Continuar'));

  // Menu e cada tela.
  expect(await screen.findByText('Minha Família')).toBeTruthy();

  // O cadastro guardou o hash da senha (SOS sem internet).
  expect(await SecureStore.getItemAsync('conecta.senhaOffline')).toContain('"hash"');

  // O cadastro não pede endereço.
  expect(screen.queryByPlaceholderText('Rua, número, bairro, cidade - UF')).toBeNull();

  for (const opcao of ['Minha Família', 'Mapa', 'Histórico']) {
    await fireEvent.press(screen.getAllByText(opcao)[0]);
    await waitFor(() => expect(screen.getByLabelText('Voltar ao menu')).toBeTruthy());
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    await voltarAoMenu();
  }

  // Meu Perfil sem endereço: o cadastro da casa abre sozinho; fechado,
  // fica o aviso de endereço obrigatório.
  await fireEvent.press(screen.getAllByText('Meu Perfil')[0]);
  expect(await screen.findByText('Cadastrar Casa')).toBeTruthy();
  await fireEvent.press(screen.getByText('icone:x'));
  expect(await screen.findByText('Endereço obrigatório')).toBeTruthy();
  expect(screen.queryByText('Cadastrar Casa')).toBeNull();
  await voltarAoMenu();

  // SOS: abre a tela (sem acionar).
  await fireEvent.press(screen.getByText(/SOS/, { exact: false }));
  await waitFor(() => expect(screen.getByLabelText('Voltar ao menu')).toBeTruthy());
  await voltarAoMenu();

  // Sair: Meu Perfil → Configurações → Sair do aplicativo → confirmar.
  // (O cadastro da casa abre de novo: ainda não há endereço.)
  await fireEvent.press(screen.getAllByText('Meu Perfil')[0]);
  await fireEvent.press(await screen.findByText('icone:x'));
  await fireEvent.press(await screen.findByText('Sair do aplicativo'));

  const [, , botoes] = Alert.alert.mock.calls.at(-1);
  await act(() => botoes.find((botao) => botao.text === 'Sair').onPress());

  expect(await screen.findByText('Se cadastrar')).toBeTruthy();
  await waitFor(async () =>
    expect(await SecureStore.getItemAsync('conecta.senhaOffline')).toBeNull()
  );

  // Entrar de novo: senha errada recusa; certa volta ao menu (já com família).
  await fireEvent.press(screen.getByText('Entrar no app'));
  await preencher('Seu e-mail', 'ana@teste.com');
  await preencher('Sua senha', 'errada1');
  await fireEvent.press(screen.getAllByText('Entrar no app').at(-1));
  expect(await screen.findByText('E-mail ou senha incorretos.')).toBeTruthy();

  await preencher('Sua senha', 'senha123');
  await fireEvent.press(screen.getAllByText('Entrar no app').at(-1));
  expect(await screen.findByText('Minha Família')).toBeTruthy();
  expect(await SecureStore.getItemAsync('conecta.senhaOffline')).toContain('"hash"');

  // Nenhuma tela registrou erro (console.error) no caminho.
  expect(erros).toEqual([]);

  // Para o compartilhamento de localização e os timers do app.
  await screen.unmount();
});
