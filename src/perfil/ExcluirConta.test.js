/*
 * Testes da tela Excluir conta (ExcluirConta.js). A exclusão em si
 * (dados/conta.js) tem testes próprios; aqui ela é simulada.
 */

import { Alert, BackHandler } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import ExcluirConta from './ExcluirConta';
import { excluirConta } from '../dados/conta';

jest.mock('../dados/conta', () => ({ excluirConta: jest.fn() }));

beforeEach(() => {
  excluirConta.mockResolvedValue();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove: jest.fn() });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function confirmarComSenha(senha = 'segredo') {
  await fireEvent.changeText(screen.getByPlaceholderText('Digite sua senha para confirmar'), senha);
  await fireEvent.press(screen.getByText('Excluir minha conta'));

  const botoes = Alert.alert.mock.calls.at(-1)[2];
  await act(() => botoes.find((botao) => botao.text === 'Excluir').onPress());
}

describe('ExcluirConta', () => {
  it('explica o que será apagado', async () => {
    await render(<ExcluirConta onVoltar={jest.fn()} onExcluida={jest.fn()} />);

    expect(screen.getByText(/Todo o seu histórico de localizações/)).toBeOnTheScreen();
    expect(screen.getByText(/a família passa para o membro mais antigo/)).toBeOnTheScreen();
  });

  it('pede a senha antes de confirmar', async () => {
    await render(<ExcluirConta onVoltar={jest.fn()} onExcluida={jest.fn()} />);

    await fireEvent.press(screen.getByText('Excluir minha conta'));

    expect(screen.getByText('Digite a senha da sua conta.')).toBeOnTheScreen();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('confirma e exclui', async () => {
    const onExcluida = jest.fn();
    await render(<ExcluirConta onVoltar={jest.fn()} onExcluida={onExcluida} />);

    await confirmarComSenha('segredo');

    expect(Alert.alert).toHaveBeenCalledWith('Excluir conta', expect.stringContaining('não poderá ser recuperado'), expect.any(Array));
    expect(excluirConta).toHaveBeenCalledWith('segredo');
    expect(onExcluida).toHaveBeenCalled();
  });

  it('cancelar não exclui', async () => {
    await render(<ExcluirConta onVoltar={jest.fn()} onExcluida={jest.fn()} />);
    await fireEvent.changeText(screen.getByPlaceholderText('Digite sua senha para confirmar'), 'x');

    await fireEvent.press(screen.getByText('Excluir minha conta'));

    const cancelar = Alert.alert.mock.calls[0][2].find((botao) => botao.text === 'Cancelar');
    expect(cancelar.onPress).toBeUndefined();
    expect(excluirConta).not.toHaveBeenCalled();
  });

  it.each([
    ['auth/invalid-credential', 'Senha incorreta.'],
    ['auth/wrong-password', 'Senha incorreta.'],
    ['auth/network-request-failed', /é preciso estar conectado à internet/],
    ['auth/too-many-requests', /Muitas tentativas/],
    ['outro', 'Não foi possível excluir a conta. Tente novamente.'],
  ])('erro %s', async (code, mensagem) => {
    excluirConta.mockRejectedValue({ code });
    const onExcluida = jest.fn();
    await render(<ExcluirConta onVoltar={jest.fn()} onExcluida={onExcluida} />);

    await confirmarComSenha();

    expect(screen.getByText(mensagem)).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Digite sua senha para confirmar')).toHaveDisplayValue('');
    expect(onExcluida).not.toHaveBeenCalled();
  });

  it('digitar apaga o erro', async () => {
    await render(<ExcluirConta onVoltar={jest.fn()} onExcluida={jest.fn()} />);
    await fireEvent.press(screen.getByText('Excluir minha conta'));

    await fireEvent.changeText(screen.getByPlaceholderText('Digite sua senha para confirmar'), 'a');

    expect(screen.queryByText('Digite a senha da sua conta.')).toBeNull();
  });

  it('volta para Configurações', async () => {
    const onVoltar = jest.fn();
    await render(<ExcluirConta onVoltar={onVoltar} onExcluida={jest.fn()} />);

    await fireEvent.press(screen.getByText('Configurações'));

    expect(onVoltar).toHaveBeenCalled();
  });
});
