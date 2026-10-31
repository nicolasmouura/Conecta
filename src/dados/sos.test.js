/*
 * Testes dos alertas de SOS (sos.js).
 */

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: false })),
  getLastKnownPositionAsync: jest.fn(async () => null),
}));

let sos;
let firestore;
let fila;
let Location;

beforeEach(() => {
  jest.resetModules();

  Location = require('expo-location');
  firestore = require('firebase/firestore');
  fila = require('./filaEnvio');
  sos = require('./sos');

  Location.getForegroundPermissionsAsync.mockResolvedValue({ granted: false });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

const USUARIO = { uid: 'u1', grupoId: 'g1', nome: 'Ana' };

function alertas() {
  return Object.entries(firestore.__todos()).filter(([caminho]) => caminho.startsWith('alertasSOS/'));
}

describe('horarioDoAlerta', () => {
  it('"agora" sem hora', () => {
    expect(sos.horarioDoAlerta(null)).toBe('agora');
    expect(sos.horarioDoAlerta(undefined)).toBe('agora');
  });

  it('só a hora quando é de hoje, com data quando não é', () => {
    const hoje = new Date();
    hoje.setHours(9, 5, 0, 0);
    const outroDia = new Date(2020, 0, 2, 9, 5).getTime();

    expect(sos.horarioDoAlerta(hoje.getTime())).toBe('09:05');
    expect(sos.horarioDoAlerta(outroDia)).toBe('02/01 09:05');
  });
});

describe('botoesConfirmacaoSOS', () => {
  it('só "Acionar SOS" chama a confirmação', () => {
    const confirmar = jest.fn();
    const [cancelar, acionar] = sos.botoesConfirmacaoSOS(confirmar);

    expect(cancelar).toEqual({ text: 'Cancelar', style: 'cancel' });
    expect(acionar).toMatchObject({ text: 'Acionar SOS', style: 'destructive' });
    acionar.onPress();
    expect(confirmar).toHaveBeenCalled();
  });
});

describe('acionarSOS', () => {
  it('cria o alerta com a última localização enviada', async () => {
    firestore.__semear('familiares/u1', { latitude: -23.5, longitude: -46.6 });

    const resultado = await sos.acionarSOS(USUARIO);

    expect(resultado).toEqual({ id: expect.any(String), jaExistia: false, comLocalizacao: true, enviado: true });
    expect(firestore.__ler(`alertasSOS/${resultado.id}`)).toMatchObject({
      uid: 'u1',
      grupoId: 'g1',
      nome: 'Ana',
      latitude: -23.5,
      longitude: -46.6,
      status: 'ativo',
    });
  });

  it('reaproveita o SOS ativo', async () => {
    firestore.__semear('alertasSOS/s1', { uid: 'u1', grupoId: 'g1', status: 'ativo' });

    expect(await sos.acionarSOS(USUARIO)).toEqual({ id: 's1', jaExistia: true });
    expect(alertas()).toHaveLength(1);
  });

  it('usa a posição do aparelho quando não há localização enviada', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({ granted: true });
    Location.getLastKnownPositionAsync.mockResolvedValue({ coords: { latitude: 1, longitude: 2 }, timestamp: 0 });

    const { id } = await sos.acionarSOS(USUARIO);

    expect(firestore.__ler(`alertasSOS/${id}`)).toMatchObject({ latitude: 1, longitude: 2 });
  });

  it('segue sem localização quando não há nenhuma válida', async () => {
    firestore.__semear('familiares/u1', { latitude: 999, longitude: 0 });

    const { id, comLocalizacao } = await sos.acionarSOS(USUARIO);

    expect(comLocalizacao).toBe(false);
    expect(firestore.__ler(`alertasSOS/${id}`)).not.toHaveProperty('latitude');
  });

  it('sem internet: o alerta fica na fila e não trava', async () => {
    firestore.__semResposta('getDocs');
    firestore.__semResposta('getDoc');
    firestore.__semResposta('setDoc');

    const resultado = await sos.acionarSOS(USUARIO);

    expect(resultado).toMatchObject({ jaExistia: false, enviado: false, comLocalizacao: false });
    expect(await fila.lerFila('u1')).toEqual([expect.objectContaining({ id: resultado.id, tipo: 'sos' })]);
  }, 10000);

  it('recusa das regras é erro', async () => {
    firestore.__falhar('setDoc', { code: 'permission-denied' });

    await expect(sos.acionarSOS(USUARIO)).rejects.toEqual({ code: 'permission-denied' });
  });
});

describe('encerrarSOS', () => {
  it('marca o alerta como encerrado', async () => {
    firestore.__semear('alertasSOS/s1', { uid: 'u1', status: 'ativo' });

    expect(await sos.encerrarSOS('s1', 'u1')).toEqual({ enviado: true });
    expect(firestore.__ler('alertasSOS/s1')).toMatchObject({ status: 'encerrado', encerradoEm: expect.anything() });
  });

  it('tira da fila um SOS que ainda não saiu do aparelho', async () => {
    firestore.__semResposta('setDoc');
    const { id } = await fila.enfileirar('u1', 'sos', {});
    // O Firestore de verdade já tem o alerta na memória do aparelho.
    firestore.__semear(`alertasSOS/${id}`, { uid: 'u1', status: 'ativo' });

    await sos.encerrarSOS(id, 'u1');

    expect((await fila.lerFila('u1')).map((item) => item.tipo)).not.toContain('sos');
  });

  it('sem internet, o encerramento fica na fila', async () => {
    firestore.__semResposta('updateDoc');

    expect(await sos.encerrarSOS('s1', 'u1')).toEqual({ enviado: false });
    expect(await fila.lerFila('u1')).toEqual([
      expect.objectContaining({ tipo: 'encerrarSOS', dados: { alertaId: 's1' } }),
    ]);
  }, 10000);
});

describe('observarMeuSOS', () => {
  it('entrega o meu SOS ativo, com a hora em milissegundos', () => {
    firestore.__semear('alertasSOS/s1', {
      uid: 'u1',
      grupoId: 'g1',
      status: 'ativo',
      criadoEm: firestore.Timestamp.fromMillis(5000),
    });
    firestore.__semear('alertasSOS/s2', { uid: 'u2', grupoId: 'g1', status: 'ativo' });
    const callback = jest.fn();

    sos.observarMeuSOS('g1', 'u1', callback)();

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 's1', criadoEm: 5000 }));
  });

  it('null sem SOS, sem grupo ou sem usuário', () => {
    const callback = jest.fn();

    sos.observarMeuSOS('g1', 'u1', callback)();
    sos.observarMeuSOS(null, 'u1', callback)();
    sos.observarMeuSOS('g1', null, callback)();

    expect(callback.mock.calls).toEqual([[null], [null], [null]]);
  });
});

describe('observarSOSAtivos', () => {
  it('lista os ativos da família do mais antigo para o mais novo', () => {
    firestore.__semear('alertasSOS/novo', {
      grupoId: 'g1',
      status: 'ativo',
      criadoEm: firestore.Timestamp.fromMillis(9000),
    });
    firestore.__semear('alertasSOS/velho', {
      grupoId: 'g1',
      status: 'ativo',
      criadoEm: firestore.Timestamp.fromMillis(1000),
    });
    firestore.__semear('alertasSOS/fim', { grupoId: 'g1', status: 'encerrado' });
    firestore.__semear('alertasSOS/outra', { grupoId: 'g2', status: 'ativo' });
    const callback = jest.fn();

    sos.observarSOSAtivos('g1', callback)();

    expect(callback.mock.calls[0][0].map((alerta) => alerta.id)).toEqual(['velho', 'novo']);
  });

  it('sem grupo, lista vazia', () => {
    const callback = jest.fn();

    sos.observarSOSAtivos(null, callback)();

    expect(callback).toHaveBeenCalledWith([]);
  });
});
