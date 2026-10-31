/*
 * Testes da tela Histórico (HistoricoScreen.js), com o Firestore falso.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { __metodos as mapa } from 'react-native-maps';

import HistoricoScreen from './HistoricoScreen';
import { calcularPeriodo, formatarHorario } from '../dados/historico';

const firestore = require('firebase/firestore');
const config = require('../config/firebase');
const { apagarDadosLocais } = require('../dados/armazenamentoLocal');

const ANA = { uid: 'a', nome: 'Ana' };

beforeEach(async () => {
  firestore.__limpar();
  await apagarDadosLocais();
  config.auth.currentUser = { uid: 'a' };

  firestore.__semear('grupos/g1/membros/a', { uid: 'a', nome: 'Ana', status: 'ativo' });
  firestore.__semear('grupos/g1/membros/b', { uid: 'b', nome: 'Bia', status: 'ativo' });
  firestore.__semear('grupos/g1/membros/c', { uid: 'c', nome: ' ', status: 'ativo' });
  firestore.__semear('grupos/g1/membros/d', { uid: 'd', nome: 'Saiu', status: 'saiu' });

  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// Pontos de hoje: minutos depois da meia-noite.
function semearPontos(uid, minutos, extra = {}) {
  const { inicio } = calcularPeriodo('hoje');

  minutos.forEach((minuto, indice) => {
    firestore.__semear(`historicoLocalizacoes/${uid}/pontos/p${indice}`, {
      uid,
      grupoId: 'g1',
      latitude: indice,
      longitude: indice,
      registradoEm: firestore.Timestamp.fromMillis(inicio.getTime() + minuto * 60000),
      ...extra,
    });
  });
}

const hora = (minuto) => formatarHorario(calcularPeriodo('hoje').inicio.getTime() + minuto * 60000);

async function abrir() {
  await render(<HistoricoScreen usuario={ANA} grupoId="g1" />);
  await act(() => esperar());
}

describe('HistoricoScreen', () => {
  it('lista você e os membros ativos', async () => {
    await abrir();

    expect(screen.getByText('Você')).toBeOnTheScreen();
    expect(screen.getByText('Bia')).toBeOnTheScreen();
    expect(screen.getByText('Membro da família')).toBeOnTheScreen();
    expect(screen.queryByText('Saiu')).toBeNull();
  });

  it('sem pontos no período', async () => {
    await abrir();

    expect(screen.getByText('Não há histórico de localização para este período.')).toBeOnTheScreen();
  });

  it('mostra a rota de hoje com início, fim e pontos do meio', async () => {
    semearPontos('a', [60, 90, 120]);

    await abrir();

    expect(screen.getByText(`3 pontos · ${hora(60)} → ${hora(120)}`)).toBeOnTheScreen();
    expect(screen.getByTestId('linha').props.coordinates).toHaveLength(3);

    const titulos = screen.getAllByTestId('marcador').map((marcador) => marcador.props.title);
    expect(titulos).toEqual([hora(90), `Início · ${hora(60)}`, `Último registro · ${hora(120)}`]);
  });

  it('um ponto só: sem linha nem fim', async () => {
    semearPontos('a', [60]);

    await abrir();

    expect(screen.getByText(`1 ponto · ${hora(60)}`)).toBeOnTheScreen();
    expect(screen.queryByTestId('linha')).toBeNull();
    expect(screen.getAllByTestId('marcador')).toHaveLength(1);
  });

  it('enquadra a rota quando o mapa fica pronto', async () => {
    semearPontos('a', [60, 90]);
    await abrir();
    jest.useFakeTimers();

    await fireEvent(screen.getByTestId('mapa'), 'mapReady');
    await act(() => jest.advanceTimersByTime(300));

    expect(mapa.fitToCoordinates).toHaveBeenCalledWith(
      [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
      ],
      expect.objectContaining({ animated: true })
    );
  });

  it('um ponto: aproxima nele', async () => {
    semearPontos('a', [60]);
    await abrir();
    jest.useFakeTimers();

    await fireEvent(screen.getByTestId('mapa'), 'mapReady');
    await act(() => jest.advanceTimersByTime(300));

    expect(mapa.animateCamera).toHaveBeenCalledWith({ center: { latitude: 0, longitude: 0 }, zoom: 16 }, { duration: 600 });
  });

  it('muitos pontos: só início e fim têm marcador', async () => {
    // Latitude fixa: o índice passaria de 90 (coordenada inválida).
    semearPontos('a', Array.from({ length: 120 }, (_, i) => i), { latitude: 1, longitude: 1 });

    await abrir();

    expect(screen.getAllByTestId('marcador')).toHaveLength(2);
  });

  it('troca de membro mostra só os pontos dele nesta família', async () => {
    semearPontos('b', [30, 45]);
    firestore.__semear('historicoLocalizacoes/b/pontos/outra', {
      grupoId: 'g0',
      latitude: 9,
      longitude: 9,
      registradoEm: firestore.Timestamp.fromMillis(calcularPeriodo('hoje').inicio.getTime() + 50 * 60000),
    });
    await abrir();

    await fireEvent.press(screen.getByText('Bia'));
    await act(() => esperar());

    expect(screen.getByText(`2 pontos · ${hora(30)} → ${hora(45)}`)).toBeOnTheScreen();
  });

  it('últimos 7 dias mostra a data', async () => {
    semearPontos('a', [60, 90]);
    await abrir();

    await fireEvent.press(screen.getByText('Últimos 7 dias'));
    await act(() => esperar());

    const data = formatarHorario(calcularPeriodo('hoje').inicio.getTime() + 60 * 60000, true);
    expect(screen.getByText(new RegExp(`^2 pontos · ${data}`))).toBeOnTheScreen();
  });

  it('ontem não mostra os pontos de hoje', async () => {
    semearPontos('a', [60]);
    await abrir();

    await fireEvent.press(screen.getByText('Ontem'));
    await act(() => esperar());

    expect(screen.getByText('Não há histórico de localização para este período.')).toBeOnTheScreen();
  });

  it('erro ao carregar', async () => {
    firestore.__falhar('getDocs', { code: 'permission-denied' });

    await abrir();

    expect(screen.getByText('Não foi possível carregar o histórico.')).toBeOnTheScreen();
  });

  it('avisa quando chegou ao limite de pontos', async () => {
    semearPontos('a', Array.from({ length: 505 }, (_, i) => i), { latitude: 1, longitude: 1 });

    await abrir();

    expect(screen.getByText('Mostrando os 500 pontos mais recentes do período.')).toBeOnTheScreen();
  });

  it('sem família: só você', async () => {
    await render(<HistoricoScreen usuario={ANA} grupoId={null} />);
    await act(() => esperar());

    expect(screen.getByText('Você')).toBeOnTheScreen();
    expect(screen.queryByText('Bia')).toBeNull();
  });
});
