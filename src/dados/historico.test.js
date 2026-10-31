/*
 * Testes do histórico de localizações (historico.js).
 */

let historico;
let firestore;
let config;

beforeEach(() => {
  jest.resetModules();

  firestore = require('firebase/firestore');
  config = require('../config/firebase');
  historico = require('./historico');

  config.auth.currentUser = { uid: 'u1' };
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const MINUTO = 60 * 1000;

function semearPonto(uid, id, registradoEm, extra = {}) {
  firestore.__semear(`historicoLocalizacoes/${uid}/pontos/${id}`, {
    uid,
    grupoId: 'g1',
    latitude: -23.5,
    longitude: -46.6,
    registradoEm: firestore.Timestamp.fromMillis(registradoEm),
    ...extra,
  });
}

describe('deveRegistrarHistorico', () => {
  const origem = { latitude: 0, longitude: 0, em: 0 };

  it('registra o primeiro ponto', () => {
    expect(historico.deveRegistrarHistorico(null, { latitude: 0, longitude: 0 }, 0)).toBe(true);
  });

  it('registra ao andar a distância mínima', () => {
    expect(historico.deveRegistrarHistorico(origem, { latitude: 0.001, longitude: 0 }, 1000)).toBe(true);
    expect(historico.deveRegistrarHistorico(origem, { latitude: 0.0001, longitude: 0 }, 1000)).toBe(false);
  });

  it('parado, registra a cada 30 min', () => {
    expect(historico.deveRegistrarHistorico(origem, origem, historico.INTERVALO_PONTO_PARADO - 1)).toBe(false);
    expect(historico.deveRegistrarHistorico(origem, origem, historico.INTERVALO_PONTO_PARADO)).toBe(true);
  });
});

describe('registrarPontoHistorico', () => {
  it('envia o ponto pela fila com a precisão arredondada', async () => {
    await historico.registrarPontoHistorico({
      uid: 'u1',
      grupoId: 'g1',
      coordenadas: { latitude: 1, longitude: 2, accuracy: 7.4 },
    });
    await esperar();

    const pontos = Object.entries(firestore.__todos()).filter(([caminho]) =>
      caminho.startsWith('historicoLocalizacoes/u1/pontos/')
    );

    expect(pontos).toHaveLength(1);
    expect(pontos[0][1]).toMatchObject({ grupoId: 'g1', latitude: 1, longitude: 2, precisao: 7, uid: 'u1' });
  });

  it('recusa coordenada inválida', async () => {
    await expect(
      historico.registrarPontoHistorico({ uid: 'u1', grupoId: 'g1', coordenadas: { latitude: 99, longitude: 0 } })
    ).rejects.toThrow('COORDENADA_INVALIDA');
  });
});

describe('calcularPeriodo', () => {
  const agora = new Date(2026, 9, 30, 15, 45);

  it('hoje', () => {
    expect(historico.calcularPeriodo('hoje', agora)).toEqual({
      inicio: new Date(2026, 9, 30),
      fim: new Date(2026, 9, 31),
    });
  });

  it('ontem', () => {
    expect(historico.calcularPeriodo('ontem', agora)).toEqual({
      inicio: new Date(2026, 9, 29),
      fim: new Date(2026, 9, 30),
    });
  });

  it('últimos 7 dias, incluindo hoje', () => {
    expect(historico.calcularPeriodo('7dias', agora)).toEqual({
      inicio: new Date(2026, 9, 24),
      fim: new Date(2026, 9, 31),
    });
  });

  it('chave desconhecida vira hoje', () => {
    expect(historico.calcularPeriodo('x', agora)).toEqual(historico.calcularPeriodo('hoje', agora));
  });

  it('atravessa a virada do mês', () => {
    expect(historico.calcularPeriodo('ontem', new Date(2026, 10, 1, 8))).toEqual({
      inicio: new Date(2026, 9, 31),
      fim: new Date(2026, 10, 1),
    });
  });
});

describe('buscarHistorico', () => {
  const inicio = new Date(2026, 9, 30);
  const fim = new Date(2026, 9, 31);
  const em = (minutos) => inicio.getTime() + minutos * MINUTO;

  it('devolve os pontos do período em ordem cronológica', async () => {
    semearPonto('u1', 'b', em(20));
    semearPonto('u1', 'a', em(10));
    semearPonto('u1', 'ontem', inicio.getTime() - 1);
    semearPonto('u1', 'amanha', fim.getTime());

    const { pontos, limitado } = await historico.buscarHistorico('u1', { inicio, fim });

    expect(pontos.map((ponto) => ponto.id)).toEqual(['a', 'b']);
    expect(pontos[0]).toEqual({ id: 'a', latitude: -23.5, longitude: -46.6, precisao: undefined, registradoEm: em(10) });
    expect(limitado).toBe(false);
  });

  it('para outro membro, filtra pelo grupo', async () => {
    semearPonto('u2', 'a', em(10), { grupoId: 'g1' });
    semearPonto('u2', 'b', em(20), { grupoId: 'antigo' });

    const { pontos } = await historico.buscarHistorico('u2', { inicio, fim }, 'g1');

    expect(pontos.map((ponto) => ponto.id)).toEqual(['a']);
  });

  it('descarta pontos sem hora ou com coordenada inválida', async () => {
    semearPonto('u1', 'a', em(10), { latitude: 500 });
    firestore.__semear('historicoLocalizacoes/u1/pontos/b', { latitude: 1, longitude: 1, registradoEm: null });

    expect((await historico.buscarHistorico('u1', { inicio, fim })).pontos).toEqual([]);
  });

  it('avisa quando chegou ao limite de pontos', async () => {
    for (let i = 0; i < historico.LIMITE_PONTOS_HISTORICO + 5; i++) {
      semearPonto('u1', `p${String(i).padStart(4, '0')}`, em(0) + i * 1000);
    }

    const { pontos, limitado } = await historico.buscarHistorico('u1', { inicio, fim });

    expect(limitado).toBe(true);
    expect(pontos).toHaveLength(historico.LIMITE_PONTOS_HISTORICO);
    // Ficam os mais recentes.
    expect(pontos.at(-1).id).toBe(`p${String(historico.LIMITE_PONTOS_HISTORICO + 4).padStart(4, '0')}`);
  });

  it('soma os pontos próprios que ainda estão na fila', async () => {
    semearPonto('u1', 'servidor', em(30));
    firestore.__semResposta('setDoc');
    jest.spyOn(Date, 'now').mockReturnValue(em(15));

    await historico.registrarPontoHistorico({ uid: 'u1', grupoId: 'g1', coordenadas: { latitude: 1, longitude: 1 } });

    const { pontos } = await historico.buscarHistorico('u1', { inicio, fim });

    expect(pontos.map((ponto) => ponto.registradoEm)).toEqual([em(15), em(30)]);
  });

  it('sem internet, mostra só os pontos do aparelho', async () => {
    firestore.__semResposta('setDoc');
    jest.spyOn(Date, 'now').mockReturnValue(em(15));
    await historico.registrarPontoHistorico({ uid: 'u1', grupoId: 'g1', coordenadas: { latitude: 1, longitude: 1 } });

    firestore.__falhar('getDocs', { code: 'unavailable' });

    const { pontos, limitado } = await historico.buscarHistorico('u1', { inicio, fim });

    expect(pontos).toEqual([expect.objectContaining({ latitude: 1, longitude: 1, registradoEm: em(15) })]);
    expect(limitado).toBe(false);
  });

  it('sem internet e sem pontos no aparelho, repassa o erro', async () => {
    firestore.__falhar('getDocs', { code: 'unavailable' });

    await expect(historico.buscarHistorico('u1', { inicio, fim })).rejects.toEqual({ code: 'unavailable' });
  });

  it('não mistura a fila de outro usuário', async () => {
    config.auth.currentUser = { uid: 'outro' };
    firestore.__falhar('getDocs', { code: 'unavailable' });

    await expect(historico.buscarHistorico('u1', { inicio, fim })).rejects.toEqual({ code: 'unavailable' });
  });
});

describe('formatarHorario', () => {
  const momento = new Date(2026, 8, 7, 9, 5).getTime();

  it('só a hora', () => {
    expect(historico.formatarHorario(momento)).toBe('09:05');
  });

  it('com a data', () => {
    expect(historico.formatarHorario(momento, true)).toBe('07/09 09:05');
  });
});
