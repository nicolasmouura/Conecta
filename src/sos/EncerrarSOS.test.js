/*
 * Testes de encerrar o próprio SOS (EncerrarSOS.js). O alerta vem do
 * Firestore falso; biometria, senha e o encerramento são simulados.
 */

import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import EncerrarSOS from './EncerrarSOS';
import {
  autenticarComBiometria,
  biometriaDisponivel,
  registrarFalhaSenhaSOS,
  zerarFalhasSenhaSOS,
} from '../dados/biometria';
import { confirmarSenhaDaConta } from '../dados/senhaOffline';
import { encerrarSOS } from '../dados/sos';

jest.mock('../dados/biometria', () => ({
  MAXIMO_FALHAS: 3,
  autenticarComBiometria: jest.fn(),
  biometriaDisponivel: jest.fn(),
  registrarFalhaSenhaSOS: jest.fn(),
  zerarFalhasSenhaSOS: jest.fn(),
}));

jest.mock('../dados/senhaOffline', () => ({ confirmarSenhaDaConta: jest.fn() }));

jest.mock('../dados/sos', () => ({
  ...jest.requireActual('../dados/sos'),
  encerrarSOS: jest.fn(),
}));

const firestore = require('firebase/firestore');
const config = require('../config/firebase');

const USUARIO = { uid: 'u1' };

beforeEach(() => {
  firestore.__limpar();
  firestore.__semear('alertasSOS/s1', { uid: 'u1', grupoId: 'g1', status: 'ativo' });
  config.auth.currentUser = { uid: 'u1', email: 'ana@exemplo.com' };

  biometriaDisponivel.mockResolvedValue(true);
  autenticarComBiometria.mockResolvedValue('sucesso');
  confirmarSenhaDaConta.mockResolvedValue('online');
  registrarFalhaSenhaSOS.mockResolvedValue(1);
  zerarFalhasSenhaSOS.mockResolvedValue();
  encerrarSOS.mockResolvedValue({ enviado: true });

  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function abrir(props = {}) {
  await render(<EncerrarSOS usuario={USUARIO} grupoId="g1" onSair={jest.fn()} {...props} />);
}

async function irParaSenha() {
  autenticarComBiometria.mockResolvedValue('cancelado');
  await abrir();
  await fireEvent.press(screen.getByText('Encerrar meu SOS'));
}

async function digitarSenha(senha) {
  await fireEvent.changeText(screen.getByPlaceholderText('Senha da conta'), senha);
  await fireEvent.press(screen.getByText('Confirmar senha e encerrar'));
}

describe('EncerrarSOS', () => {
  it('sem SOS ativo', async () => {
    firestore.__limpar();

    await abrir();

    expect(screen.getByText('Você não tem nenhum SOS ativo.')).toBeOnTheScreen();
  });

  it('sem família', async () => {
    await abrir({ grupoId: null });

    expect(screen.getByText('Você não tem nenhum SOS ativo.')).toBeOnTheScreen();
  });

  it('erro ao ler o SOS conta como nenhum', async () => {
    firestore.__falhar('onSnapshot', { code: 'permission-denied' });

    await abrir();
    await act(() => esperar());

    expect(screen.getByText('Você não tem nenhum SOS ativo.')).toBeOnTheScreen();
  });

  it('com a biometria, encerra', async () => {
    await abrir();

    expect(screen.getByText('Seu SOS está ativo')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Encerrar meu SOS'));

    expect(autenticarComBiometria).toHaveBeenCalledWith('Encerrar SOS');
    expect(encerrarSOS).toHaveBeenCalledWith('s1', 'u1');
    expect(zerarFalhasSenhaSOS).toHaveBeenCalledWith('u1');
    expect(Alert.alert).toHaveBeenCalledWith('SOS encerrado', 'O alerta deixou de aparecer para sua família.');
  });

  it('sem internet: avisa que encerra quando a conexão voltar', async () => {
    encerrarSOS.mockResolvedValue({ enviado: false });
    await abrir();

    await fireEvent.press(screen.getByText('Encerrar meu SOS'));

    expect(Alert.alert).toHaveBeenCalledWith('SOS encerrado', expect.stringContaining('Sem internet'));
  });

  it('biometria cancelada: pede a senha', async () => {
    await irParaSenha();

    expect(screen.getByText(/Não foi possível confirmar pela biometria/)).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Senha da conta')).toBeOnTheScreen();
  });

  it('sem biometria no aparelho: pede a senha direto', async () => {
    biometriaDisponivel.mockResolvedValue(false);
    await abrir();

    await fireEvent.press(screen.getByText('Encerrar meu SOS'));

    expect(autenticarComBiometria).not.toHaveBeenCalled();
    expect(screen.getByText(/Biometria indisponível neste aparelho/)).toBeOnTheScreen();
  });

  it('senha certa encerra', async () => {
    await irParaSenha();

    await digitarSenha('segredo');

    expect(confirmarSenhaDaConta).toHaveBeenCalledWith(config.auth.currentUser, 'segredo');
    expect(encerrarSOS).toHaveBeenCalledWith('s1', 'u1');
    expect(screen.queryByPlaceholderText('Senha da conta')).toBeNull();
  });

  it('pede a senha vazia', async () => {
    await irParaSenha();

    await digitarSenha('');

    expect(screen.getByText('Digite a senha da sua conta.')).toBeOnTheScreen();
    expect(confirmarSenhaDaConta).not.toHaveBeenCalled();
  });

  it('senha errada conta a tentativa', async () => {
    confirmarSenhaDaConta.mockRejectedValue({ code: 'auth/invalid-credential' });
    registrarFalhaSenhaSOS.mockResolvedValue(2);
    await irParaSenha();

    await digitarSenha('errada');

    expect(screen.getByText('Senha incorreta (tentativa 2 de 3).')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Senha da conta')).toHaveDisplayValue('');
    expect(encerrarSOS).not.toHaveBeenCalled();
  });

  it('terceira senha errada encerra a sessão e mantém o SOS', async () => {
    confirmarSenhaDaConta.mockRejectedValue({ code: 'auth/wrong-password' });
    registrarFalhaSenhaSOS.mockResolvedValue(3);
    const onSair = jest.fn();
    autenticarComBiometria.mockResolvedValue('falha');
    await abrir({ onSair });
    await fireEvent.press(screen.getByText('Encerrar meu SOS'));

    await digitarSenha('errada');

    expect(Alert.alert).toHaveBeenCalledWith('Muitas tentativas', expect.stringContaining('O SOS continua ativo'));
    expect(zerarFalhasSenhaSOS).toHaveBeenCalledWith('u1');
    expect(onSair).toHaveBeenCalled();
    expect(encerrarSOS).not.toHaveBeenCalled();
  });

  it.each([
    ['auth/network-request-failed', /Sem internet para conferir a senha/],
    ['auth/too-many-requests', /Muitas tentativas. Aguarde/],
    ['auth/outro', 'Não foi possível confirmar a senha. Tente novamente.'],
  ])('erro %s não conta tentativa', async (code, mensagem) => {
    confirmarSenhaDaConta.mockRejectedValue({ code });
    await irParaSenha();

    await digitarSenha('x');

    expect(screen.getByText(mensagem)).toBeOnTheScreen();
    expect(registrarFalhaSenhaSOS).not.toHaveBeenCalled();
  });

  it('erro ao encerrar', async () => {
    encerrarSOS.mockRejectedValue(new Error('falhou'));
    await abrir();

    await fireEvent.press(screen.getByText('Encerrar meu SOS'));

    expect(screen.getByText('Não foi possível encerrar o SOS. Tente novamente.')).toBeOnTheScreen();
  });

  it('erro ao encerrar depois da senha', async () => {
    encerrarSOS.mockRejectedValue(new Error('falhou'));
    await irParaSenha();

    await digitarSenha('segredo');

    expect(screen.getByText('Não foi possível encerrar o SOS. Tente novamente.')).toBeOnTheScreen();
  });

  it('confirma a senha pelo teclado também', async () => {
    await irParaSenha();
    await fireEvent.changeText(screen.getByPlaceholderText('Senha da conta'), 'segredo');

    await fireEvent(screen.getByPlaceholderText('Senha da conta'), 'submitEditing');

    expect(confirmarSenhaDaConta).toHaveBeenCalled();
  });
});
