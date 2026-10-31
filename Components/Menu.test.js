/*
 * Testes da tela inicial (Menu.js).
 */

import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useNetworkState } from 'expo-network';

import Menu from './Menu';
import { avisarQueEstouBem } from '../src/dados/estouBem';

jest.mock('expo-network', () => ({ useNetworkState: jest.fn() }));
jest.mock('../src/dados/estouBem', () => ({ avisarQueEstouBem: jest.fn() }));

const firestore = require('firebase/firestore');

const COMPARTILHANDO = {
  status: 'compartilhando',
  coordenadas: { latitude: 1, longitude: 2 },
  atualizadoEm: Date.now(),
  tentarNovamente: jest.fn(),
};

beforeEach(() => {
  firestore.__limpar();
  useNetworkState.mockReturnValue({ isConnected: true, isInternetReachable: true });
  avisarQueEstouBem.mockResolvedValue();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function abrir(props = {}) {
  const onSelect = jest.fn();
  await render(
    <Menu onSelect={onSelect} nome="Maria da Silva Souza" localizacao={COMPARTILHANDO} grupoId="g1" uidAtual="u1" {...props} />
  );
  return onSelect;
}

// Confirma o Alert "Avisar que você está bem?".
async function avisarEstouBem() {
  await fireEvent.press(screen.getByRole('button', { name: 'Avisar a família que estou bem' }));
  const botoes = Alert.alert.mock.calls.at(-1)[2];
  await act(() => botoes.find((botao) => botao.text === 'Avisar').onPress());
}

describe('Menu', () => {
  it('saúda com o primeiro e o segundo nome, sem partículas', async () => {
    await abrir();

    expect(screen.getByText('Olá, Maria Silva! 👋')).toBeOnTheScreen();
  });

  it.each([
    ['Ana', 'Olá, Ana! 👋'],
    ['  João   de Souza ', 'Olá, João Souza! 👋'],
    ['', 'Olá, usuário! 👋'],
    [undefined, 'Olá, usuário! 👋'],
  ])('nome %p', async (nome, saudacao) => {
    await abrir({ nome });

    expect(screen.getByText(saudacao)).toBeOnTheScreen();
  });

  it('compartilhando: mini mapa com a sua posição', async () => {
    await abrir();

    expect(screen.getByText('Compartilhando')).toBeOnTheScreen();
    expect(screen.getByText('Compartilhando localização')).toBeOnTheScreen();
    expect(screen.getByTestId('marcador')).toHaveProp('coordinate', { latitude: 1, longitude: 2 });
  });

  it('compartilhando sem posição ainda: "Localizando..."', async () => {
    await abrir({ localizacao: { status: 'compartilhando', coordenadas: null } });

    expect(screen.getByText('Localizando...')).toBeOnTheScreen();
  });

  it('permissão negada: "Desativada" e botão para permitir', async () => {
    const tentarNovamente = jest.fn();
    await abrir({ localizacao: { status: 'negado', coordenadas: null, tentarNovamente } });

    expect(screen.getByText('Desativada')).toBeOnTheScreen();
    expect(screen.getByText('Sem localização')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Permitir localização'));
    expect(tentarNovamente).toHaveBeenCalled();
  });

  it.each([
    ['Minha Família', 'familia'],
    ['Mapa', 'mapa'],
    ['Histórico', 'historico'],
    ['Meu Perfil', 'perfil'],
    ['SOS — Emergência', 'sos'],
    ['Ver mapa completo', 'mapa'],
  ])('"%s" abre %s', async (texto, chave) => {
    const onSelect = await abrir();

    await fireEvent.press(screen.getByText(texto));

    expect(onSelect).toHaveBeenCalledWith(chave);
  });

  it('"Estou bem" avisa a família e mostra a hora', async () => {
    await abrir();

    await avisarEstouBem();

    expect(avisarQueEstouBem).toHaveBeenCalledWith('g1', 'u1');
    expect(screen.getByText(/Família avisada que você está bem \(\d\d:\d\d\)\./)).toBeOnTheScreen();
  });

  it('"Estou bem" fica travado por 30 s', async () => {
    jest.useFakeTimers();
    await abrir();
    await avisarEstouBem();

    const coracao = screen.getByRole('button', { name: 'Avisar a família que estou bem' });
    expect(coracao).toBeDisabled();

    await act(() => jest.advanceTimersByTime(30000));
    expect(coracao).toBeEnabled();
  });

  it('"Estou bem" sem família explica', async () => {
    await abrir({ grupoId: null });

    await fireEvent.press(screen.getByRole('button', { name: 'Avisar a família que estou bem' }));

    expect(Alert.alert).toHaveBeenCalledWith('Estou bem', 'Entre em uma família para avisar que você está bem.');
  });

  it('erro ao avisar', async () => {
    avisarQueEstouBem.mockRejectedValue(new Error('falhou'));
    await abrir();

    await avisarEstouBem();
    await act(() => esperar());

    expect(Alert.alert).toHaveBeenLastCalledWith('Não foi possível avisar', 'Tente novamente em instantes.');
    expect(screen.queryByText(/Família avisada/)).toBeNull();
  });

  it('SOS ativo na família aparece e abre a tela de SOS', async () => {
    firestore.__semear('alertasSOS/s1', { uid: 'u2', grupoId: 'g1', status: 'ativo', nome: 'Bia' });
    const onSelect = await abrir();

    await fireEvent.press(screen.getByText('SOS ATIVO'));

    expect(onSelect).toHaveBeenCalledWith('sos');
  });

  it('sem internet: faixa de aviso', async () => {
    useNetworkState.mockReturnValue({ isConnected: false });

    await abrir();

    expect(screen.getByText('Usando os dados guardados no aparelho.')).toBeOnTheScreen();
  });
});
