/*
 * Testes da tela de quem ainda não tem família (GrupoScreen.js), com o
 * Firestore falso.
 */

import { BackHandler } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import GrupoScreen from './GrupoScreen';

const firestore = require('firebase/firestore');
const config = require('../config/firebase');

const USUARIO = { uid: 'a', nome: 'Ana' };

let voltarAndroid;

beforeEach(() => {
  firestore.__limpar();
  firestore.__semear('usuarios/a', { nome: 'Ana' });
  config.auth.currentUser = { uid: 'a', email: 'ana@exemplo.com' };

  voltarAndroid = null;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, ouvinte) => {
    voltarAndroid = ouvinte;
    return { remove: () => (voltarAndroid = null) };
  });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Na tela de criar, "Criar família" é o título e o botão (o último).
const botaoCriar = () => screen.getAllByText('Criar família').at(-1);

async function irParaCriar(props = {}) {
  await render(<GrupoScreen usuario={USUARIO} onGrupoConcluido={jest.fn()} {...props} />);
  await fireEvent.press(screen.getByText('Criar família'));
}

describe('GrupoScreen', () => {
  it('tela inicial: criar família ou aceitar convite', async () => {
    firestore.__semear('convites/c1', {
      paraEmail: 'ana@exemplo.com',
      status: 'pendente',
      grupoNome: 'Família Lima',
      deNome: 'Bia',
    });

    await render(<GrupoScreen usuario={USUARIO} onGrupoConcluido={jest.fn()} />);

    expect(screen.getByText('Grupo Familiar')).toBeOnTheScreen();
    expect(screen.getByText('Família Lima')).toBeOnTheScreen();
    expect(screen.queryByText('Pular por agora')).toBeNull();
  });

  it('"Pular por agora" quando permitido', async () => {
    const onPular = jest.fn();

    await render(<GrupoScreen usuario={USUARIO} onGrupoConcluido={jest.fn()} onPular={onPular} />);
    await fireEvent.press(screen.getByText('Pular por agora'));

    expect(onPular).toHaveBeenCalled();
  });

  it('cria a família e continua', async () => {
    const onGrupoConcluido = jest.fn();
    await irParaCriar({ onGrupoConcluido });

    await fireEvent.changeText(screen.getByPlaceholderText('Ex: Família Silva'), 'Família Souza');
    await fireEvent.press(botaoCriar());

    expect(await screen.findByText('Família criada com sucesso.')).toBeOnTheScreen();
    expect(screen.getByText('Família Souza')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Continuar'));
    const grupoId = firestore.__ler('usuarios/a').grupoId;
    expect(onGrupoConcluido).toHaveBeenCalledWith(grupoId);
  });

  it('pede o nome', async () => {
    await irParaCriar();

    await fireEvent.press(botaoCriar());

    expect(screen.getByText('Digite um nome para a família.')).toBeOnTheScreen();
  });

  it('quem já tem família vê o aviso', async () => {
    firestore.__semear('usuarios/a', { grupoId: 'g0' });
    await irParaCriar();

    await fireEvent.changeText(screen.getByPlaceholderText('Ex: Família Silva'), 'Família Souza');
    await fireEvent.press(botaoCriar());

    expect(await screen.findByText('Você já pertence a uma família.')).toBeOnTheScreen();
  });

  it('enquanto cria, mostra "Criando..."', async () => {
    await irParaCriar();

    await fireEvent.changeText(screen.getByPlaceholderText('Ex: Família Silva'), 'Família Souza');
    const durante = await duranteAEspera(
      'commit',
      () => fireEvent.press(botaoCriar()),
      () => screen.queryByText('Criando...')
    );

    expect(durante).not.toBeNull();
    expect(screen.getByText('Família criada com sucesso.')).toBeOnTheScreen();
  });

  it('"Voltar" e o voltar do Android voltam para a tela inicial', async () => {
    await irParaCriar();
    await fireEvent.press(screen.getByText('Voltar'));
    expect(screen.getByText('Grupo Familiar')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Criar família'));
    expect(screen.getByText('Escolha um nome para identificar sua família.')).toBeOnTheScreen();
    await act(() => voltarAndroid());
    expect(screen.getByText('Grupo Familiar')).toBeOnTheScreen();
  });

  it('o voltar do Android não fica registrado na tela inicial', async () => {
    await render(<GrupoScreen usuario={USUARIO} onGrupoConcluido={jest.fn()} />);

    expect(voltarAndroid).toBeNull();
  });
});
