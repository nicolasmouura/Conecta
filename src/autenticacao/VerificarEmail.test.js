/*
 * Testes da tela "Confirme seu e-mail" (VerificarEmail.js).
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { reload, sendEmailVerification } from 'firebase/auth';

import VerificarEmail from './VerificarEmail';

const config = require('../config/firebase');

let getIdToken;

beforeEach(() => {
  getIdToken = jest.fn().mockResolvedValue('token');
  config.auth.currentUser = { uid: 'u1', emailVerified: false, getIdToken };
  reload.mockResolvedValue();
  sendEmailVerification.mockResolvedValue();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function abrir(props = {}) {
  const funcoes = { onConfirmado: jest.fn(), onSair: jest.fn() };
  await render(<VerificarEmail email="ana@exemplo.com" {...funcoes} {...props} />);
  return funcoes;
}

describe('VerificarEmail', () => {
  it('mostra o e-mail para onde foi o link', async () => {
    await abrir();

    expect(screen.getByText('Confirme seu e-mail')).toBeOnTheScreen();
    expect(screen.getByText('ana@exemplo.com')).toBeOnTheScreen();
  });

  it('"Já confirmei" libera o app com um token novo', async () => {
    reload.mockImplementation(async () => {
      config.auth.currentUser.emailVerified = true;
    });
    const { onConfirmado } = await abrir();

    await fireEvent.press(screen.getByText('Já confirmei'));

    expect(reload).toHaveBeenCalledWith(config.auth.currentUser);
    expect(getIdToken).toHaveBeenCalledWith(true);
    expect(onConfirmado).toHaveBeenCalled();
  });

  it('ainda não confirmado: avisa', async () => {
    const { onConfirmado } = await abrir();

    await fireEvent.press(screen.getByText('Já confirmei'));

    expect(screen.getByText(/Ainda não recebemos a confirmação/)).toBeOnTheScreen();
    expect(onConfirmado).not.toHaveBeenCalled();
  });

  it.each([
    ['auth/network-request-failed', 'Sem conexão. Verifique sua internet e tente novamente.'],
    ['outro', 'Não foi possível verificar agora. Tente novamente.'],
  ])('erro ao verificar: %s', async (code, mensagem) => {
    reload.mockRejectedValue({ code });
    await abrir();

    await fireEvent.press(screen.getByText('Já confirmei'));

    expect(screen.getByText(mensagem)).toBeOnTheScreen();
  });

  it('reenviar mostra a contagem de 60 s', async () => {
    jest.useFakeTimers();
    await abrir();

    await fireEvent.press(screen.getByText('Reenviar e-mail'));

    expect(sendEmailVerification).toHaveBeenCalledWith(config.auth.currentUser);
    expect(screen.getByText('E-mail enviado. Confira também a caixa de spam.')).toBeOnTheScreen();
    expect(screen.getByText('Reenviar e-mail (60 s)')).toBeOnTheScreen();

    await act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByText('Reenviar e-mail (59 s)')).toBeOnTheScreen();

    // Durante a espera, não reenvia.
    await fireEvent.press(screen.getByText('Reenviar e-mail (59 s)'));
    expect(sendEmailVerification).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 59; i++) {
      await act(() => jest.advanceTimersByTime(1000));
    }
    expect(screen.getByText('Reenviar e-mail')).toBeOnTheScreen();
  });

  it.each([
    ['auth/too-many-requests', /Muitos envios seguidos/],
    ['auth/network-request-failed', /Sem conexão/],
    ['outro', 'Não foi possível enviar o e-mail. Tente novamente.'],
  ])('erro ao reenviar: %s', async (code, mensagem) => {
    sendEmailVerification.mockRejectedValue({ code });
    await abrir();

    await fireEvent.press(screen.getByText('Reenviar e-mail'));

    expect(screen.getByText(mensagem)).toBeOnTheScreen();
    expect(screen.getByText('Reenviar e-mail')).toBeOnTheScreen();
  });

  it('sair da conta', async () => {
    const { onSair } = await abrir();

    await fireEvent.press(screen.getByText('Sair da conta'));

    expect(onSair).toHaveBeenCalled();
  });

  it('sair da tela no meio da verificação não atualiza nada', async () => {
    let terminar;
    reload.mockReturnValue(new Promise((resolver) => (terminar = resolver)));
    const { unmount } = await render(
      <VerificarEmail email="x" onConfirmado={jest.fn()} onSair={jest.fn()} />
    ).then((resultado) => resultado);

    const verificacao = fireEvent.press(screen.getByText('Já confirmei'));
    await unmount();
    terminar();

    await expect(verificacao).resolves.toBeUndefined();
  });
});
