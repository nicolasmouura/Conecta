/*
 * Testes da tela de entrada (AutenticacaoScreen.js): login, cadastro e
 * "Esqueci minha senha". O perfil é gravado no Firestore falso.
 */

import { Alert, BackHandler } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from 'firebase/auth';

import AutenticacaoScreen from './AutenticacaoScreen';
import { zerarFalhas } from '../dados/biometria';
import { guardarSenhaOffline } from '../dados/senhaOffline';

jest.mock('../dados/biometria', () => ({ zerarFalhas: jest.fn() }));
jest.mock('../dados/senhaOffline', () => ({ guardarSenhaOffline: jest.fn() }));

const firestore = require('firebase/firestore');
const config = require('../config/firebase');

const NOVO = { uid: 'u1', email: 'ana@exemplo.com' };

let voltarAndroid;

beforeEach(() => {
  firestore.__limpar();
  config.auth.currentUser = { ...NOVO, emailVerified: false };

  signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1', email: 'ana@exemplo.com' } });
  createUserWithEmailAndPassword.mockResolvedValue({ user: NOVO });
  sendEmailVerification.mockResolvedValue();
  sendPasswordResetEmail.mockResolvedValue();
  deleteUser.mockResolvedValue();
  zerarFalhas.mockResolvedValue();
  guardarSenhaOffline.mockResolvedValue();

  voltarAndroid = null;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, ouvinte) => {
    voltarAndroid = ouvinte;
    return { remove: () => (voltarAndroid = null) };
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function abrir(props = {}) {
  const onAutenticado = jest.fn();
  await render(<AutenticacaoScreen onAutenticado={onAutenticado} {...props} />);
  return onAutenticado;
}

const digitar = (placeholder, texto) => fireEvent.changeText(screen.getByPlaceholderText(placeholder), texto);

// No formulário, "Entrar no app" é o título e o botão (o último).
const botaoEntrar = () => screen.getAllByText('Entrar no app').at(-1);

async function irParaLogin() {
  await fireEvent.press(screen.getByText('Entrar no app'));
}

async function preencherCadastro(alteracoes = {}) {
  const dados = {
    nome: 'Ana Souza',
    email: 'ana@exemplo.com',
    cpf: '529.982.247-25',
    telefone: '11987654321',
    senha: 'segredo',
    confirmacao: 'segredo',
    ...alteracoes,
  };

  await fireEvent.press(screen.getByText('Se cadastrar'));
  await digitar('Seu nome completo', dados.nome);
  await digitar('Seu e-mail', dados.email);
  await digitar('000.000.000-00', dados.cpf);
  await digitar('(21) 98765-4321', dados.telefone);
  await digitar('Sua senha', dados.senha);
  await digitar('Digite a senha novamente', dados.confirmacao);
}

describe('AutenticacaoScreen', () => {
  it('boas-vindas com entrar e se cadastrar', async () => {
    await abrir();

    expect(screen.getByText('Bem-vindo!')).toBeOnTheScreen();
    expect(screen.getByText('Se cadastrar')).toBeOnTheScreen();
    expect(voltarAndroid).toBeNull();
  });

  it('aviso de sessão encerrada abre no login com o motivo', async () => {
    await abrir({ aviso: 'Entre com seu e-mail e senha.' });

    expect(screen.getByText('Entre para continuar usando o Conecta.')).toBeOnTheScreen();
    expect(screen.getByText('Entre com seu e-mail e senha.')).toBeOnTheScreen();
  });

  describe('login', () => {
    it('entra, zera as falhas da biometria e guarda o hash da senha', async () => {
      const onAutenticado = await abrir();
      await irParaLogin();

      await digitar('Seu e-mail', ' ana@exemplo.com ');
      await digitar('Sua senha', 'segredo');
      await fireEvent.press(botaoEntrar());

      expect(signInWithEmailAndPassword).toHaveBeenCalledWith(config.auth, 'ana@exemplo.com', 'segredo');
      expect(zerarFalhas).toHaveBeenCalledWith('u1');
      expect(guardarSenhaOffline).toHaveBeenCalledWith('u1', 'segredo');
      expect(onAutenticado).toHaveBeenCalledWith({ uid: 'u1', email: 'ana@exemplo.com' });
    });

    it.each([
      ['auth/invalid-credential', 'E-mail ou senha incorretos.'],
      ['auth/wrong-password', 'E-mail ou senha incorretos.'],
      ['auth/user-not-found', /Não há conta com este e-mail/],
      ['auth/invalid-email', 'Digite um e-mail válido.'],
      ['auth/too-many-requests', /Muitas tentativas/],
      ['auth/network-request-failed', /é preciso internet/],
      ['inesperado', 'Não foi possível continuar. Tente novamente.'],
    ])('erro %s', async (code, mensagem) => {
      signInWithEmailAndPassword.mockRejectedValue({ code });
      const onAutenticado = await abrir();
      await irParaLogin();

      await fireEvent.press(botaoEntrar());

      expect(screen.getByText(mensagem)).toBeOnTheScreen();
      expect(onAutenticado).not.toHaveBeenCalled();
      expect(botaoEntrar()).toBeOnTheScreen();
    });

    it('esqueci minha senha envia o link', async () => {
      await abrir();
      await irParaLogin();
      await digitar('Seu e-mail', 'ana@exemplo.com');

      await fireEvent.press(screen.getByText('Esqueci minha senha'));

      expect(sendPasswordResetEmail).toHaveBeenCalledWith(config.auth, 'ana@exemplo.com');
      expect(Alert.alert).toHaveBeenCalledWith('Verifique seu e-mail', expect.any(String));
    });

    it('esqueci minha senha sem e-mail', async () => {
      await abrir();
      await irParaLogin();

      await fireEvent.press(screen.getByText('Esqueci minha senha'));

      expect(screen.getByText('Digite seu e-mail para redefinir a senha.')).toBeOnTheScreen();
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it.each([
      ['auth/invalid-email', 'Digite um e-mail válido.'],
      ['auth/network-request-failed', /Sem conexão/],
      ['outro', 'Não foi possível enviar o e-mail. Tente novamente.'],
    ])('erro ao redefinir: %s', async (code, mensagem) => {
      sendPasswordResetEmail.mockRejectedValue({ code });
      await abrir();
      await irParaLogin();
      await digitar('Seu e-mail', 'x');

      await fireEvent.press(screen.getByText('Esqueci minha senha'));

      expect(screen.getByText(mensagem)).toBeOnTheScreen();
    });

    it('digitar o e-mail apaga o erro', async () => {
      signInWithEmailAndPassword.mockRejectedValue({ code: 'auth/invalid-credential' });
      await abrir();
      await irParaLogin();
      await fireEvent.press(botaoEntrar());

      await digitar('Seu e-mail', 'a');

      expect(screen.queryByText('E-mail ou senha incorretos.')).toBeNull();
    });
  });

  describe('cadastro', () => {
    it('cria a conta, o perfil, manda a confirmação e avisa que é conta nova', async () => {
      const onAutenticado = await abrir();
      await preencherCadastro();

      await fireEvent.press(screen.getByText('Criar minha conta'));

      expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(config.auth, 'ana@exemplo.com', 'segredo');
      expect(firestore.__ler('usuarios/u1')).toMatchObject({ nome: 'Ana Souza', telefone: '(11) 98765-4321' });
      expect(firestore.__ler('cpfs/52998224725')).toEqual({ uid: 'u1' });
      expect(sendEmailVerification).toHaveBeenCalledWith(NOVO);
      expect(guardarSenhaOffline).toHaveBeenCalledWith('u1', 'segredo');
      expect(onAutenticado).toHaveBeenCalledWith(
        { uid: 'u1', nome: 'Ana Souza', email: 'ana@exemplo.com' },
        { contaNova: true }
      );
    });

    it('valida antes de criar a conta', async () => {
      await abrir();
      await preencherCadastro({ cpf: '123' });

      await fireEvent.press(screen.getByText('Criar minha conta'));

      expect(screen.getByText('Digite um CPF válido.')).toBeOnTheScreen();
      expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it('CPF de outra conta: apaga o login recém-criado', async () => {
      firestore.__semear('cpfs/52998224725', { uid: 'outra' });
      const onAutenticado = await abrir();
      await preencherCadastro();

      await fireEvent.press(screen.getByText('Criar minha conta'));

      expect(screen.getByText('Este CPF já está cadastrado em outra conta.')).toBeOnTheScreen();
      expect(deleteUser).toHaveBeenCalledWith(NOVO);
      expect(onAutenticado).not.toHaveBeenCalled();
    });

    it('e-mail já usado', async () => {
      createUserWithEmailAndPassword.mockRejectedValue({ code: 'auth/email-already-in-use' });
      await abrir();
      await preencherCadastro();

      await fireEvent.press(screen.getByText('Criar minha conta'));

      expect(screen.getByText('Este e-mail já possui uma conta.')).toBeOnTheScreen();
    });

    it('senha fraca recusada pelo Firebase', async () => {
      createUserWithEmailAndPassword.mockRejectedValue({ code: 'auth/weak-password' });
      await abrir();
      await preencherCadastro();

      await fireEvent.press(screen.getByText('Criar minha conta'));

      expect(screen.getByText('A senha precisa ter pelo menos 6 caracteres.')).toBeOnTheScreen();
    });

    it('falha ao mandar o e-mail de confirmação não impede o cadastro', async () => {
      sendEmailVerification.mockRejectedValue({ code: 'auth/too-many-requests' });
      const onAutenticado = await abrir();
      await preencherCadastro();

      await fireEvent.press(screen.getByText('Criar minha conta'));

      expect(onAutenticado).toHaveBeenCalled();
    });

    it('erro ao gravar o perfil (não de CPF) mantém o login', async () => {
      firestore.__falhar('commit', { code: 'unavailable' });
      await abrir();
      await preencherCadastro();

      await fireEvent.press(screen.getByText('Criar minha conta'));

      expect(screen.getByText('Não foi possível continuar. Tente novamente.')).toBeOnTheScreen();
      expect(deleteUser).not.toHaveBeenCalled();
    });

    it('enquanto cria, mostra "Aguarde..."', async () => {
      await abrir();
      await preencherCadastro();

      const durante = await duranteAEspera(
        'commit',
        () => fireEvent.press(screen.getByText('Criar minha conta')),
        () => screen.queryByText('Aguarde...')
      );

      expect(durante).not.toBeNull();
    });
  });

  it('"← Voltar" e o voltar do Android voltam às boas-vindas', async () => {
    await abrir();
    await irParaLogin();
    await fireEvent.press(screen.getByText('← Voltar'));
    expect(screen.getByText('Bem-vindo!')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Se cadastrar'));
    await act(() => voltarAndroid());
    expect(screen.getByText('Bem-vindo!')).toBeOnTheScreen();
  });
});
