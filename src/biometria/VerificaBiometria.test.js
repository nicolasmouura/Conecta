/*
 * Testes da tela de bloqueio por biometria (VerificaBiometria.js). Só a
 * biometria do aparelho é simulada; as regras (proximoPasso) são reais.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import VerificaBiometria from './VerificaBiometria';
import {
  autenticarComBiometria,
  lerFalhas,
  registrarFalha,
  temReconhecimentoFacial,
  zerarFalhas,
} from '../dados/biometria';

jest.mock('../dados/biometria', () => ({
  ...jest.requireActual('../dados/biometria'),
  autenticarComBiometria: jest.fn(),
  lerFalhas: jest.fn(),
  registrarFalha: jest.fn(),
  temReconhecimentoFacial: jest.fn(),
  zerarFalhas: jest.fn(),
}));

const USUARIO = { uid: 'u1' };

beforeEach(() => {
  lerFalhas.mockResolvedValue(0);
  temReconhecimentoFacial.mockResolvedValue(true);
  autenticarComBiometria.mockResolvedValue('sucesso');
  registrarFalha.mockImplementation(async () => 1);
  zerarFalhas.mockResolvedValue();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function abrir() {
  const funcoes = { onDesbloqueado: jest.fn(), onEncerrar: jest.fn() };
  await render(<VerificaBiometria usuario={USUARIO} {...funcoes} />);
  await act(() => esperar());
  return funcoes;
}

describe('VerificaBiometria', () => {
  it('pede a biometria sozinha e desbloqueia', async () => {
    const { onDesbloqueado } = await abrir();

    expect(autenticarComBiometria).toHaveBeenCalledTimes(1);
    expect(zerarFalhas).toHaveBeenCalledWith('u1');
    expect(onDesbloqueado).toHaveBeenCalled();
  });

  it('com rosto: ícone e texto do reconhecimento facial', async () => {
    autenticarComBiometria.mockResolvedValue('cancelado');

    await abrir();

    expect(screen.getByText('Você escolheu entrar no Conecta com o reconhecimento facial.')).toBeOnTheScreen();
    expect(screen.getAllByTestId('icone-face-recognition').length).toBeGreaterThan(0);
  });

  it('sem rosto: digital', async () => {
    temReconhecimentoFacial.mockResolvedValue(false);
    autenticarComBiometria.mockResolvedValue('cancelado');

    await abrir();

    expect(screen.getByText('Você escolheu entrar no Conecta com a biometria do aparelho.')).toBeOnTheScreen();
    expect(screen.getAllByTestId('icone-fingerprint').length).toBeGreaterThan(0);
  });

  it('falha: conta a tentativa e deixa tentar de novo', async () => {
    autenticarComBiometria.mockResolvedValueOnce('falha').mockResolvedValueOnce('sucesso');

    const { onDesbloqueado } = await abrir();

    expect(registrarFalha).toHaveBeenCalledWith('u1');
    expect(screen.getByText('Não reconhecemos você (tentativa 1 de 3).')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Tentar novamente'));
    await act(() => esperar());

    expect(onDesbloqueado).toHaveBeenCalled();
  });

  it('terceira falha encerra a sessão', async () => {
    lerFalhas.mockResolvedValue(2);
    registrarFalha.mockResolvedValue(3);
    autenticarComBiometria.mockResolvedValue('falha');

    const { onEncerrar, onDesbloqueado } = await abrir();

    expect(onEncerrar).toHaveBeenCalledWith(expect.stringContaining('Entre com seu e-mail e senha'));
    expect(onDesbloqueado).not.toHaveBeenCalled();
  });

  it('tentativas já esgotadas (app fechado no meio): nem pede a biometria', async () => {
    lerFalhas.mockResolvedValue(3);

    const { onEncerrar } = await abrir();

    expect(autenticarComBiometria).not.toHaveBeenCalled();
    expect(onEncerrar).toHaveBeenCalledWith(expect.stringContaining('Entre com seu e-mail e senha'));
  });

  it('cancelar não conta falha', async () => {
    autenticarComBiometria.mockResolvedValue('cancelado');

    await abrir();

    expect(registrarFalha).not.toHaveBeenCalled();
    expect(screen.getByText(/Verificação cancelada/)).toBeOnTheScreen();
  });

  it('erro ao ler a configuração: tenta mesmo assim', async () => {
    lerFalhas.mockRejectedValue(new Error('falhou'));

    const { onDesbloqueado } = await abrir();

    expect(autenticarComBiometria).toHaveBeenCalled();
    expect(onDesbloqueado).toHaveBeenCalled();
  });

  it('falha ao gravar o contador usa a contagem da tela', async () => {
    registrarFalha.mockRejectedValue(new Error('falhou'));
    autenticarComBiometria.mockResolvedValue('falha');

    await abrir();

    expect(screen.getByText('Não reconhecemos você (tentativa 1 de 3).')).toBeOnTheScreen();
  });

  it('"Sair da conta" encerra sem mensagem', async () => {
    autenticarComBiometria.mockResolvedValue('cancelado');
    const { onEncerrar } = await abrir();

    await fireEvent.press(screen.getByText('Sair da conta'));

    expect(onEncerrar).toHaveBeenCalledWith('');
  });

  it('enquanto verifica, "Sair da conta" fica travado', async () => {
    autenticarComBiometria.mockReturnValue(new Promise(() => {}));
    const { onEncerrar } = await abrir();

    expect(screen.getByText('Aguardando biometria...')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Sair da conta'));
    expect(onEncerrar).not.toHaveBeenCalled();
  });
});
