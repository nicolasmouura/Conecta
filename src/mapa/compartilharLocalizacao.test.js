/*
 * Testes do compartilhamento da localização (compartilharLocalizacao.js).
 */

import { AppState, Linking } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';

import { descreverLocalizacao, useCompartilharLocalizacao } from './compartilharLocalizacao';
import { salvarLocalizacao } from '../dados/buscarFamiliares';
import { registrarPontoHistorico } from '../dados/historico';
import { observarLugar } from '../dados/lugares';
import { lerBateria } from '../dados/bateria';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));

jest.mock('../dados/buscarFamiliares', () => ({
  ...jest.requireActual('../dados/buscarFamiliares'),
  salvarLocalizacao: jest.fn(),
}));

jest.mock('../dados/historico', () => ({
  ...jest.requireActual('../dados/historico'),
  registrarPontoHistorico: jest.fn(),
}));

jest.mock('../dados/lugares', () => ({
  ...jest.requireActual('../dados/lugares'),
  observarLugar: jest.fn(),
}));

jest.mock('../dados/enderecos', () => ({
  criarCacheRua: () => jest.fn(async () => 'Rua A'),
}));

jest.mock('../dados/bateria', () => ({ lerBateria: jest.fn() }));

const Location = require('expo-location');

const USUARIO = { uid: 'u1', nome: 'Ana' };

let aoMudarPosicao;
let aoErrarGPS;
let pararGPS;
let aoReceberCasa;
let cancelarCasa;
let aoMudarApp;

beforeEach(() => {
  pararGPS = jest.fn();
  cancelarCasa = jest.fn();

  Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
  Location.hasServicesEnabledAsync.mockResolvedValue(true);
  Location.watchPositionAsync.mockImplementation(async (_opcoes, aoMudar, aoErrar) => {
    aoMudarPosicao = aoMudar;
    aoErrarGPS = aoErrar;
    return { remove: pararGPS };
  });

  observarLugar.mockImplementation((_uid, _lugar, callback) => {
    aoReceberCasa = callback;
    return cancelarCasa;
  });

  salvarLocalizacao.mockResolvedValue();
  registrarPontoHistorico.mockResolvedValue();
  lerBateria.mockResolvedValue({ bateria: 80, carregando: false });

  jest.spyOn(AppState, 'addEventListener').mockImplementation((_evento, ouvinte) => {
    aoMudarApp = ouvinte;
    return { remove: jest.fn() };
  });
  jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function iniciar(usuario = USUARIO, grupoId = 'g1') {
  const resultado = await renderHook(({ u, g }) => useCompartilharLocalizacao(u, g), {
    initialProps: { u: usuario, g: grupoId },
  });
  await act(() => esperar());
  return resultado;
}

async function novaPosicao(coords) {
  await act(async () => {
    aoMudarPosicao({ coords });
    await esperar();
  });
}

describe('useCompartilharLocalizacao', () => {
  it('sem família, não pede nada', async () => {
    const { result } = await iniciar(USUARIO, null);

    expect(result.current.status).toBe('sem_familia');
    expect(Location.getForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('com permissão e GPS: compartilha', async () => {
    const { result } = await iniciar();

    expect(result.current.status).toBe('compartilhando');
    expect(Location.watchPositionAsync).toHaveBeenCalledWith(
      { accuracy: 3, timeInterval: 30000, distanceInterval: 0 },
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('pede a permissão uma vez quando ainda pode', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });

    const { result } = await iniciar();

    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('negado');
  });

  it('permissão negada em definitivo: bloqueado e abre as configurações', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });

    const { result } = await iniciar();

    expect(result.current.status).toBe('bloqueado');
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();

    await act(() => result.current.tentarNovamente());
    expect(Linking.openSettings).toHaveBeenCalled();
  });

  it('GPS desligado', async () => {
    Location.hasServicesEnabledAsync.mockResolvedValue(false);

    const { result } = await iniciar();

    expect(result.current.status).toBe('gps_desligado');
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  });

  it('erro ao iniciar e erro do GPS', async () => {
    Location.hasServicesEnabledAsync.mockRejectedValueOnce(new Error('falhou'));
    const { result } = await iniciar();
    expect(result.current.status).toBe('erro');

    const segundo = await iniciar();
    await act(() => aoErrarGPS(new Error('GPS')));
    expect(segundo.result.current.status).toBe('erro');
  });

  it('tentar novamente pede a permissão de novo', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });
    const { result } = await iniciar();

    await act(async () => {
      result.current.tentarNovamente();
      await esperar();
    });

    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(2);
  });

  it('ao voltar para o app, confere de novo sem pedir', async () => {
    Location.hasServicesEnabledAsync.mockResolvedValueOnce(false);
    const { result } = await iniciar();
    expect(result.current.status).toBe('gps_desligado');

    await act(async () => {
      aoMudarApp('active');
      await esperar();
    });

    expect(result.current.status).toBe('compartilhando');
  });

  it('voltar para o app compartilhando não reinicia o GPS', async () => {
    await iniciar();

    await act(async () => {
      aoMudarApp('active');
      await esperar();
    });

    expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
  });

  it('envia a posição com rua, casa e bateria e registra o histórico', async () => {
    const { result } = await iniciar();
    await act(() => aoReceberCasa({ latitude: 0, longitude: 0 }));

    await novaPosicao({ latitude: 0, longitude: 0, accuracy: 10 });

    expect(salvarLocalizacao).toHaveBeenCalledWith({
      uid: 'u1',
      grupoId: 'g1',
      nome: 'Ana',
      coordenadas: { latitude: 0, longitude: 0, accuracy: 10 },
      rua: 'Rua A',
      estadoCasa: { emCasa: true, distanciaCasa: 0 },
      energia: { bateria: 80, carregando: false },
    });
    expect(registrarPontoHistorico).toHaveBeenCalledWith({
      uid: 'u1',
      grupoId: 'g1',
      coordenadas: { latitude: 0, longitude: 0, accuracy: 10 },
    });
    expect(result.current).toMatchObject({
      status: 'compartilhando',
      coordenadas: { latitude: 0, longitude: 0, accuracy: 10 },
      atualizadoEm: expect.any(Number),
      erroEnvio: false,
    });
  });

  it('não reenvia a mesma posição logo em seguida', async () => {
    await iniciar();

    await novaPosicao({ latitude: 0, longitude: 0 });
    await novaPosicao({ latitude: 0, longitude: 0 });

    expect(salvarLocalizacao).toHaveBeenCalledTimes(1);
    expect(registrarPontoHistorico).toHaveBeenCalledTimes(1);
  });

  it('casa alterada: o próximo sinal envia de novo', async () => {
    await iniciar();
    await novaPosicao({ latitude: 0, longitude: 0 });

    await act(() => aoReceberCasa({ latitude: 0, longitude: 0 }));
    await novaPosicao({ latitude: 0, longitude: 0 });

    expect(salvarLocalizacao).toHaveBeenCalledTimes(2);
  });

  it('falha no envio marca erroEnvio', async () => {
    salvarLocalizacao.mockRejectedValue({ code: 'permission-denied' });
    const { result } = await iniciar();

    await novaPosicao({ latitude: 0, longitude: 0 });

    expect(result.current.erroEnvio).toBe(true);
  });

  it('falha no histórico não afeta a localização', async () => {
    registrarPontoHistorico.mockRejectedValue(new Error('falhou'));
    const { result } = await iniciar();

    await novaPosicao({ latitude: 0, longitude: 0 });

    expect(result.current.erroEnvio).toBe(false);
    expect(salvarLocalizacao).toHaveBeenCalled();
  });

  it('para o GPS e a casa ao sair da família', async () => {
    const { rerender, result } = await iniciar();

    await rerender({ u: USUARIO, g: null });

    expect(pararGPS).toHaveBeenCalled();
    expect(cancelarCasa).toHaveBeenCalled();
    expect(result.current.status).toBe('sem_familia');
  });

  it('usa o nome novo sem reiniciar o GPS', async () => {
    const { rerender } = await iniciar();

    await rerender({ u: { uid: 'u1', nome: 'Ana Lima' }, g: 'g1' });
    await novaPosicao({ latitude: 0, longitude: 0 });

    expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
    expect(salvarLocalizacao).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Ana Lima' }));
  });
});

describe('descreverLocalizacao', () => {
  it('compartilhando: obtendo, enviada ou com erro', () => {
    expect(descreverLocalizacao({ status: 'compartilhando' })).toEqual({
      ativo: true,
      titulo: 'Compartilhando localização',
      detalhe: 'Obtendo sua localização...',
    });
    expect(descreverLocalizacao({ status: 'compartilhando', atualizadoEm: Date.now() }).detalhe).toBe(
      'Última atualização: há poucos segundos'
    );
    expect(descreverLocalizacao({ status: 'compartilhando', atualizadoEm: Date.now() - 5 * 60000 }).detalhe).toBe(
      'Última atualização: há 5 min'
    );
    expect(descreverLocalizacao({ status: 'compartilhando', erroEnvio: true, atualizadoEm: 1 }).detalhe).toMatch(
      /Tentaremos novamente/
    );
  });

  it('mais de 1 hora: mostra a hora', () => {
    const momento = Date.now() - 2 * 60 * 60000;
    const data = new Date(momento);
    const hora = `${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`;

    expect(descreverLocalizacao({ status: 'compartilhando', atualizadoEm: momento }).detalhe).toBe(
      `Última atualização: às ${hora}`
    );
  });

  it.each([
    ['sem_familia', 'Localização não compartilhada', undefined],
    ['verificando', 'Verificando localização...', undefined],
    ['negado', 'Localização desativada', 'Permitir localização'],
    ['bloqueado', 'Localização bloqueada', 'Abrir configurações'],
    ['gps_desligado', 'GPS desativado', 'Tentar novamente'],
    ['erro', 'Localização indisponível', 'Tentar novamente'],
    ['estranho', 'Localização indisponível', 'Tentar novamente'],
  ])('%s', (status, titulo, acao) => {
    const descricao = descreverLocalizacao({ status });

    expect(descricao).toMatchObject({ ativo: false, titulo });
    expect(descricao.acao).toBe(acao);
  });
});
