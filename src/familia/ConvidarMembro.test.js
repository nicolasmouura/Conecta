/*
 * Testes da janela "Convidar familiar" (ConvidarMembro.js), com o
 * Firestore falso.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';

import ConvidarMembro from './ConvidarMembro';

const firestore = require('firebase/firestore');
const config = require('../config/firebase');

const GRUPO = { id: 'g1', nome: 'Silva' };
const REMETENTE = { uid: 'a', nome: 'Ana' };

beforeEach(() => {
  firestore.__limpar();
  firestore.__semear('grupos/g1', { nome: 'Silva', membros: ['a'] });
  firestore.__semear('diretorioConvites/bia lima|bia@exemplo.com', { uid: 'b' });
  config.auth.currentUser = { uid: 'a', email: 'ana@exemplo.com' };
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function abrir(onFechar = jest.fn()) {
  await render(<ConvidarMembro visivel grupo={GRUPO} remetente={REMETENTE} onFechar={onFechar} />);
  return onFechar;
}

async function preencher(nome, email) {
  await fireEvent.changeText(screen.getByPlaceholderText('Nome completo cadastrado'), nome);
  await fireEvent.changeText(screen.getByPlaceholderText('email@exemplo.com'), email);
}

describe('ConvidarMembro', () => {
  it('envia o convite e limpa o formulário', async () => {
    await abrir();
    await preencher('Bia Lima', 'bia@exemplo.com');

    await fireEvent.press(screen.getByText('Enviar convite'));

    expect(await screen.findByText('✓ Convite enviado com sucesso.')).toBeOnTheScreen();
    expect(firestore.__ler('convites/g1_bia@exemplo.com')).toMatchObject({ status: 'pendente', deNome: 'Ana' });
    expect(screen.getByPlaceholderText('Nome completo cadastrado')).toHaveDisplayValue('');
  });

  it('pede os dois campos', async () => {
    await abrir();
    await preencher('Bia Lima', ' ');

    await fireEvent.press(screen.getByText('Enviar convite'));

    expect(screen.getByText('Preencha o nome completo e o e-mail cadastrado.')).toBeOnTheScreen();
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('mostra o erro de quem não foi encontrado', async () => {
    await abrir();
    await preencher('Bia', 'bia@exemplo.com');

    await fireEvent.press(screen.getByText('Enviar convite'));

    expect(await screen.findByText(/Usuário não encontrado/)).toBeOnTheScreen();
  });

  it('erro inesperado: mensagem padrão', async () => {
    firestore.__falhar('setDoc', { code: 'unavailable' });
    await abrir();
    await preencher('Bia Lima', 'bia@exemplo.com');

    await fireEvent.press(screen.getByText('Enviar convite'));

    expect(await screen.findByText('Não foi possível enviar o convite.')).toBeOnTheScreen();
  });

  it('digitar apaga o erro', async () => {
    await abrir();
    await fireEvent.press(screen.getByText('Enviar convite'));

    await fireEvent.changeText(screen.getByPlaceholderText('Nome completo cadastrado'), 'B');

    expect(screen.queryByText('Preencha o nome completo e o e-mail cadastrado.')).toBeNull();
  });

  it('enquanto envia, trava os campos', async () => {
    await abrir();
    await preencher('Bia Lima', 'bia@exemplo.com');

    const durante = await duranteAEspera(
      'setDoc',
      () => fireEvent.press(screen.getByText('Enviar convite')),
      () => ({
        botao: screen.queryByText('Enviar convite'),
        editavel: screen.getByPlaceholderText('email@exemplo.com').props.editable,
      })
    );

    expect(durante).toEqual({ botao: null, editavel: false });
    expect(screen.getByText('Enviar convite')).toBeOnTheScreen();
  });

  it('fechar limpa e avisa', async () => {
    const onFechar = await abrir();
    await preencher('Bia', 'x');

    await fireEvent.press(screen.getByText('Fechar'));

    expect(onFechar).toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Nome completo cadastrado')).toHaveDisplayValue('');
  });
});
