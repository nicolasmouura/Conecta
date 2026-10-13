import { Alert } from 'react-native';
import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { auth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';

import App from '../App';
import { salvarPerfilUsuario } from '../src/dados/salvarUsuario';

/*
 * Fluxos de uso pelo app inteiro (Firebase simulado em jest.setup.js):
 * erros de cadastro e login, convite entre duas contas pela interface,
 * editar o perfil e a trava de biometria.
 */

configure({ asyncUtilTimeout: 8000 });

jest.mock('@expo-google-fonts/poppins', () => ({
  useFonts: () => [true],
  Poppins_700Bold: 'Poppins_700Bold',
  Poppins_600SemiBold: 'Poppins_600SemiBold',
}));

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3, High: 4 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true, canAskAgain: true })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true, canAskAgain: true })),
  hasServicesEnabledAsync: jest.fn(async () => true),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  reverseGeocodeAsync: jest.fn(async () => []),
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
}));

jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));

// Biometria simulada em jest.setup.js.
const biometria = jest.requireMock('expo-local-authentication').__controle;

const ANA = { nome: 'Ana Souza', email: 'ana@fluxo.com', cpf: '529.982.247-25', senha: 'senha123' };
const BRUNO = { nome: 'Bruno Lima', email: 'bruno@fluxo.com', cpf: '111.444.777-35', senha: 'senha456' };

const erros = [];

beforeAll(async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation((...args) => erros.push(args));

  // Bruno já tem conta (sem família), criada fora da tela.
  const { user } = await createUserWithEmailAndPassword(auth, BRUNO.email, BRUNO.senha);
  await salvarPerfilUsuario({
    uid: user.uid,
    nome: BRUNO.nome,
    email: BRUNO.email,
    cpf: BRUNO.cpf,
    telefone: '(21) 91234-5678',
    endereco: 'Rua B, 2',
  });
  await signOut(auth);
});

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  biometria.resultado = { success: true };
});

afterEach(() => {
  Alert.alert.mockRestore();
});

const preencher = (placeholder, texto) =>
  fireEvent.changeText(screen.getByPlaceholderText(placeholder), texto);

async function tocarNoAlerta(textoDoBotao) {
  const [, , botoes] = Alert.alert.mock.calls.at(-1);

  await act(() => botoes.find((botao) => botao.text === textoDoBotao).onPress());
}

async function sairDaConta() {
  await fireEvent.press(screen.getAllByText('Meu Perfil')[0]);
  await fireEvent.press(await screen.findByText('Sair do aplicativo'));
  await tocarNoAlerta('Sair');
  expect(await screen.findByText('Se cadastrar')).toBeTruthy();
}

async function entrar(pessoa) {
  // Na tela inicial abre o formulário; no formulário, só um título a mais.
  await fireEvent.press((await screen.findAllByText('Entrar no app'))[0]);
  await preencher('Seu e-mail', pessoa.email);
  await preencher('Sua senha', pessoa.senha);
  await fireEvent.press(screen.getAllByText('Entrar no app').at(-1));
}

test('cadastro: mensagens de erro do formulário', async () => {
  await render(<App />);
  await fireEvent.press(await screen.findByText('Se cadastrar'));

  await fireEvent.press(screen.getByText('Criar minha conta'));
  expect(screen.getByText('Digite seu nome completo.')).toBeTruthy();

  await preencher('Seu nome completo', 'Teste');
  await preencher('Seu e-mail', 'teste@fluxo.com');
  await preencher('000.000.000-00', '123.456.789-00');
  await fireEvent.press(screen.getByText('Criar minha conta'));
  expect(screen.getByText('Digite um CPF válido.')).toBeTruthy();

  // E-mail já cadastrado (o do Bruno).
  await preencher('Seu e-mail', BRUNO.email);
  await preencher('000.000.000-00', '935.411.347-80');
  await preencher('(21) 98765-4321', '(21) 99999-0000');
  await preencher('Rua, número, bairro, cidade - UF', 'Rua T, 1');
  await preencher('Sua senha', 'senha123');
  await preencher('Digite a senha novamente', 'senha124');
  await fireEvent.press(screen.getByText('Criar minha conta'));
  expect(screen.getByText('As senhas não conferem.')).toBeTruthy();

  await preencher('Digite a senha novamente', 'senha123');
  await fireEvent.press(screen.getByText('Criar minha conta'));
  expect(await screen.findByText('Este e-mail já possui uma conta.')).toBeTruthy();
});

test('login: senha errada, conta inexistente e "Esqueci minha senha" sem e-mail', async () => {
  await render(<App />);
  await fireEvent.press(await screen.findByText('Entrar no app'));

  await fireEvent.press(screen.getByText('Esqueci minha senha'));
  expect(screen.getByText('Digite seu e-mail para redefinir a senha.')).toBeTruthy();

  await preencher('Seu e-mail', BRUNO.email);
  await preencher('Sua senha', 'errada1');
  await fireEvent.press(screen.getAllByText('Entrar no app').at(-1));
  expect(await screen.findByText('E-mail ou senha incorretos.')).toBeTruthy();

  await preencher('Seu e-mail', 'ninguem@fluxo.com');
  await fireEvent.press(screen.getAllByText('Entrar no app').at(-1));
  expect(await screen.findByText(/Não há conta com este e-mail/)).toBeTruthy();
});

test('Ana cria a família e convida o Bruno; Bruno aceita pela tela', async () => {
  await render(<App />);

  // Cadastro da Ana.
  await fireEvent.press(await screen.findByText('Se cadastrar'));
  await preencher('Seu nome completo', ANA.nome);
  await preencher('Seu e-mail', ANA.email);
  await preencher('000.000.000-00', ANA.cpf);
  await preencher('(21) 98765-4321', '(21) 98765-4321');
  await preencher('Rua, número, bairro, cidade - UF', 'Rua A, 1');
  await preencher('Sua senha', ANA.senha);
  await preencher('Digite a senha novamente', ANA.senha);
  await fireEvent.press(screen.getByText('Criar minha conta'));

  await fireEvent.press(await screen.findByText('Criar família'));
  await preencher('Ex: Família Silva', 'Família Souza');
  await fireEvent.press(screen.getAllByText('Criar família').at(-1));
  await fireEvent.press(await screen.findByText('Continuar'));

  // Minha Família → convidar.
  await fireEvent.press(await screen.findByText('Minha Família'));
  await fireEvent.press(await screen.findByText('+ Convidar familiar'));

  await fireEvent.press(screen.getByText('Enviar convite'));
  expect(screen.getByText('Preencha o nome completo e o e-mail cadastrado.')).toBeTruthy();

  await preencher('Nome completo cadastrado', 'Bruno Errado');
  await preencher('email@exemplo.com', BRUNO.email);
  await fireEvent.press(screen.getByText('Enviar convite'));
  expect(await screen.findByText(/Usuário não encontrado/)).toBeTruthy();

  await preencher('Nome completo cadastrado', '  bruno   LIMA ');
  await fireEvent.press(screen.getByText('Enviar convite'));
  expect(await screen.findByText(/Convite enviado com sucesso\./)).toBeTruthy();
  expect(screen.getByText('Convite pendente')).toBeTruthy();

  await fireEvent.press(screen.getByText('Fechar'));
  await fireEvent.press(screen.getByLabelText('Voltar ao menu'));
  await sairDaConta();

  // Bruno entra: ainda sem família, vê o convite.
  await entrar(BRUNO);

  expect(await screen.findByText('Você recebeu um convite')).toBeTruthy();
  expect(screen.getByText('Família Souza')).toBeTruthy();
  expect(screen.getByText(ANA.nome)).toBeTruthy();

  await fireEvent.press(screen.getByText('Aceitar'));
  await waitFor(() =>
    expect(Alert.alert).toHaveBeenCalledWith('Convite aceito.', 'Você agora faz parte da Família Souza.')
  );

  // Já na família: Minha Família mostra os dois.
  await fireEvent.press(await screen.findByText('Minha Família'));
  expect(await screen.findByText(/Ana Souza/)).toBeTruthy();
  expect(await screen.findByText(/Bruno Lima/)).toBeTruthy();

  expect(erros).toEqual([]);
});

test('reabrir o app restaura a sessão (depois da biometria); editar informações', async () => {
  await render(<App />);

  // Sessão do Bruno guardada do teste anterior: entra direto.
  expect(await screen.findByText(/Bruno Lima/)).toBeTruthy();

  await fireEvent.press(await screen.findByText('Meu Perfil'));
  await fireEvent.press(await screen.findByText('Editar informações'));

  await preencher('Seu nome completo', '   ');
  await fireEvent.press(screen.getByText('Salvar alterações'));
  expect(await screen.findByText('Digite seu nome.')).toBeTruthy();

  await preencher('Seu nome completo', 'Bruno Lima Santos');
  await fireEvent.press(screen.getByText('Salvar alterações'));
  expect(await screen.findByText(/Dados atualizados com sucesso\./)).toBeTruthy();

  // CPF já cadastrado: aparece mascarado e não pode ser editado.
  expect(screen.getAllByText('•••.•••.•••-35').length).toBeGreaterThan(0);
  // E-mail e CPF.
  expect(screen.getAllByText('Não editável')).toHaveLength(2);

  expect(erros).toEqual([]);
});

test('biometria: 3 falhas encerram a sessão e pedem e-mail e senha', async () => {
  biometria.resultado = { success: false, error: 'authentication_failed' };

  // Reabre com a sessão do Bruno guardada: pede a biometria.
  await render(<App />);

  expect(await screen.findByText('Não reconhecemos você (tentativa 1 de 3).')).toBeTruthy();

  await fireEvent.press(screen.getByText('Tentar novamente'));
  expect(await screen.findByText('Não reconhecemos você (tentativa 2 de 3).')).toBeTruthy();

  await fireEvent.press(screen.getByText('Tentar novamente'));
  expect(
    await screen.findByText(/Não foi possível confirmar sua identidade pela biometria/)
  ).toBeTruthy();
  // Vai direto para o formulário de e-mail e senha.
  expect(screen.getByPlaceholderText('Sua senha')).toBeTruthy();

  // Depois, com a biometria funcionando, entra normalmente.
  biometria.resultado = { success: true };
  await entrar(ANA);
  expect(await screen.findByText('Minha Família')).toBeTruthy();
});

test('Meus lugares: cadastrar a casa pelo CEP, localizar e salvar', async () => {
  const Location = jest.requireMock('expo-location');

  Location.geocodeAsync.mockResolvedValue([{ latitude: -23.5503, longitude: -46.6339 }]);
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP' }),
  }));

  try {
    // Sessão da Ana guardada do teste anterior.
    await render(<App />);

    await fireEvent.press(await screen.findByText('Meu Perfil'));
    await fireEvent.press(await screen.findByText('Meus lugares'));
    await fireEvent.press(await screen.findByText('Cadastrar'));

    await preencher('123', '10');
    await preencher('00000-000', '01001000');
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Rua Barata Ribeiro').props.value).toBe('Praça da Sé')
    );

    await fireEvent.press(screen.getByText('Localizar no mapa'));
    await fireEvent.press(await screen.findByText('Salvar casa'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Lugar salvo', 'Casa atualizada com sucesso.')
    );
    expect((await screen.findAllByText(/Praça da Sé, 10 - Sé, São Paulo - SP, 01001-000/)).length).toBeGreaterThan(0);
    expect(erros).toEqual([]);
  } finally {
    delete global.fetch;
  }
});

test('mapa e histórico com dados: posição da Ana pelo GPS e do Bruno no banco', async () => {
  const Location = jest.requireMock('expo-location');
  const { collection, doc, getDocs, setDoc, Timestamp } = jest.requireMock('firebase/firestore');
  const { db } = jest.requireMock('../src/config/firebase');

  // Bruno (já na família) com posição recente e rua.
  const membros = await getDocs(collection(db, 'usuarios'));
  const bruno = membros.docs.find((perfil) => perfil.data().email === BRUNO.email);

  await setDoc(doc(db, 'familiares', bruno.id), {
    uid: bruno.id,
    grupoId: bruno.data().grupoId,
    nome: 'Bruno Lima Santos',
    latitude: -23.56,
    longitude: -46.64,
    atualizadoEm: Timestamp.now(),
    online: true,
    rua: 'Rua Augusta',
  });

  // GPS da Ana: uma posição assim que o app começa a compartilhar.
  Location.watchPositionAsync.mockImplementation(async (opcoes, callback) => {
    callback({
      coords: { latitude: -23.5503, longitude: -46.6339, accuracy: 9 },
      timestamp: Date.now(),
    });
    return { remove: jest.fn() };
  });

  await render(<App />);

  await fireEvent.press(await screen.findByText('Mapa'));
  expect((await screen.findAllByText(/Bruno Lima Santos/)).length).toBeGreaterThan(0);
  expect(await screen.findByText('Rua Augusta')).toBeTruthy();
  expect(screen.getByText(/de você/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Voltar ao menu'));

  // O envio da posição gravou um ponto no histórico da Ana.
  await fireEvent.press(await screen.findByText('Histórico'));
  expect(await screen.findByText(/^1 ponto/)).toBeTruthy();

  expect(erros).toEqual([]);
});
