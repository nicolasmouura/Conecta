/*
 * Testes da tela Mapa (TelaMapa.js), com os dados da família no
 * Firestore falso.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { __metodos as mapa } from 'react-native-maps';

import TelaMapa from './TelaMapa';

const firestore = require('firebase/firestore');

const USUARIO = { uid: 'a', nome: 'Ana' };
const COMPARTILHANDO = {
  status: 'compartilhando',
  coordenadas: { latitude: 0, longitude: 0 },
  atualizadoEm: Date.now(),
};

const { apagarDadosLocais } = require('../dados/armazenamentoLocal');

beforeEach(async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});

  // Cada teste começa sem dados no Firestore e sem cópias no aparelho.
  firestore.__limpar();
  await apagarDadosLocais();
});

afterEach(() => {
  jest.restoreAllMocks();
});

function semearFamilia() {
  firestore.__semear('grupos/g1/membros/a', { uid: 'a', nome: 'Ana', status: 'ativo' });
  firestore.__semear('grupos/g1/membros/b', { uid: 'b', nome: 'Bia', status: 'ativo' });
  firestore.__semear('usuarios/b', { nome: 'Bia', foto: 'data:bia' });
  firestore.__semear('familiares/b', {
    uid: 'b',
    grupoId: 'g1',
    latitude: 0.001,
    longitude: 0,
    atualizadoEm: firestore.Timestamp.fromMillis(Date.now()),
    rua: 'Rua das Flores',
  });
}

async function abrir(props = {}) {
  await render(<TelaMapa usuario={USUARIO} grupoId="g1" localizacao={COMPARTILHANDO} {...props} />);
  await act(() => esperar());
}

describe('TelaMapa', () => {
  it('mostra você e a família no mapa e nos cards', async () => {
    semearFamilia();

    await abrir();

    expect(screen.getAllByTestId('marcador')).toHaveLength(2);
    expect(screen.getByText('Ana (você)')).toBeOnTheScreen();
    expect(screen.getByText('Rua das Flores')).toBeOnTheScreen();
    expect(screen.getByText('111 m de você')).toBeOnTheScreen();
    expect(screen.getByText(/Compartilhando localização/)).toBeOnTheScreen();
  });

  it('acompanha quem entra na família', async () => {
    semearFamilia();
    await abrir();

    await act(async () => {
      firestore.__semear('grupos/g1/membros/c', { uid: 'c', nome: 'Caio', status: 'ativo' });
      await esperar();
    });

    expect(screen.getByText('Caio')).toBeOnTheScreen();
    expect(screen.getByText('Localização indisponível')).toBeOnTheScreen();
  });

  it('sem família: só você e o aviso', async () => {
    await abrir({ grupoId: null, localizacao: { status: 'sem_familia' } });

    expect(screen.getByText(/Localização não compartilhada/)).toBeOnTheScreen();
    expect(screen.getByText(/Nenhuma localização disponível/)).toBeOnTheScreen();
  });

  it('avisa quando a sua posição ainda não chegou', async () => {
    semearFamilia();

    await abrir({ localizacao: { status: 'compartilhando', coordenadas: null } });

    expect(screen.getByText(/Sua localização ainda não está disponível/)).toBeOnTheScreen();
  });

  it('erro ao carregar a família', async () => {
    // Casa, membros e localizações: os três listeners falham.
    for (let i = 0; i < 3; i++) firestore.__falhar('onSnapshot', { code: 'permission-denied' });

    await abrir();

    expect(screen.getByText(/Não foi possível carregar as localizações da família/)).toBeOnTheScreen();
  });

  it('tocar num card centraliza o mapa no familiar', async () => {
    semearFamilia();
    await abrir();

    // O nome aparece no marcador e no card; o card vem depois.
    await fireEvent.press(screen.getAllByText('Bia').at(-1));

    expect(mapa.animateCamera).toHaveBeenCalledWith(
      { center: { latitude: 0.001, longitude: 0 }, zoom: 16 },
      { duration: 700 }
    );
  });

  it('mostra a minha casa no mapa', async () => {
    firestore.__semear('usuarios/a/lugares/casa', { latitude: 5, longitude: 5 });

    await abrir();

    expect(screen.getAllByTestId('marcador').map((marcador) => marcador.props.title)).toContain('Minha casa');
    expect(screen.queryByText('Casa não cadastrada')).toBeNull();
  });

  it('avisa no seu card quando a casa não foi cadastrada', async () => {
    await abrir();

    expect(screen.getByText('Casa não cadastrada')).toBeOnTheScreen();
  });
});
