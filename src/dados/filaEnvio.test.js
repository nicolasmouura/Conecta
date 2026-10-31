/*
 * Testes da fila de envio (filaEnvio.js): guardar no SQLite, entregar
 * ao Firebase e tirar da fila quando o servidor responde.
 */

jest.mock('../config/firebase', () => ({ db: { nome: 'db' } }));

jest.mock('firebase/firestore', () => {
  let proximoId = 0;

  return {
    collection: jest.fn((_db, ...caminho) => ({ caminho: caminho.join('/') })),
    doc: jest.fn((pai, ...caminho) =>
      caminho.length
        ? { caminho: caminho.join('/') }
        : { caminho: `${pai.caminho}/auto`, id: `id-${++proximoId}` }
    ),
    setDoc: jest.fn(() => Promise.resolve()),
    updateDoc: jest.fn(() => Promise.resolve()),
    serverTimestamp: jest.fn(() => 'HORA_DO_SERVIDOR'),
    Timestamp: { fromMillis: jest.fn((ms) => ({ ms })) },
  };
});

let fila;
let firestore;
let banco;

beforeEach(() => {
  jest.resetModules();

  firestore = require('firebase/firestore');
  fila = require('./filaEnvio');
  ({ banco } = require('./bancoLocal'));

  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Deixa terminar os envios e as remoções da fila pendentes.
async function esperar() {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolver) => setTimeout(resolver, 0));
  }
}

// Envio que nunca termina: o aparelho está sem internet.
function semInternet() {
  firestore.setDoc.mockImplementation(() => new Promise(() => {}));
  firestore.updateDoc.mockImplementation(() => new Promise(() => {}));
}

async function inserirNaFila(uid, item) {
  const db = await banco();

  await db.runAsync(
    'INSERT INTO fila (id, uid, tipo, dados, criado_em) VALUES (?, ?, ?, ?, ?)',
    item.id,
    uid,
    item.tipo,
    JSON.stringify(item.dados),
    item.criadoEm
  );
}

describe('enfileirar', () => {
  it('envia o SOS com o id do item como id do documento', async () => {
    const { id, confirmacao } = await fila.enfileirar('uid1', 'sos', { latitude: 1, longitude: 2 });

    await expect(confirmacao).resolves.toBeUndefined();
    expect(firestore.doc).toHaveBeenCalledWith({ nome: 'db' }, 'alertasSOS', id);
    expect(firestore.setDoc).toHaveBeenCalledWith(
      { caminho: `alertasSOS/${id}` },
      { latitude: 1, longitude: 2, uid: 'uid1', criadoEm: 'HORA_DO_SERVIDOR', status: 'ativo' }
    );
  });

  it('tira o item da fila depois que o servidor confirma', async () => {
    await fila.enfileirar('uid1', 'sos', {});
    await esperar();

    expect(await fila.lerFila('uid1')).toEqual([]);
  });

  it('sem internet, o item fica guardado na fila', async () => {
    semInternet();
    jest.spyOn(Date, 'now').mockReturnValue(5000);

    const { id } = await fila.enfileirar('uid1', 'sos', { latitude: 1 });
    await esperar();

    expect(await fila.lerFila('uid1')).toEqual([
      { id, tipo: 'sos', dados: { latitude: 1 }, criadoEm: 5000 },
    ]);
  });

  it('tira da fila um envio recusado pelas regras', async () => {
    firestore.setDoc.mockImplementation(() => Promise.reject({ code: 'permission-denied' }));

    const { confirmacao } = await fila.enfileirar('uid1', 'sos', {});

    await expect(confirmacao).rejects.toEqual({ code: 'permission-denied' });
    await esperar();
    expect(await fila.lerFila('uid1')).toEqual([]);
  });

  it('envia o ponto com a hora em que foi registrado', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1234);

    const { id, confirmacao } = await fila.enfileirar('uid1', 'ponto', { latitude: 1 });
    await confirmacao;

    expect(firestore.setDoc).toHaveBeenCalledWith(
      { caminho: `historicoLocalizacoes/uid1/pontos/${id}` },
      { latitude: 1, uid: 'uid1', registradoEm: { ms: 1234 } }
    );
  });

  it('encerra o SOS indicado', async () => {
    const { confirmacao } = await fila.enfileirar('uid1', 'encerrarSOS', { alertaId: 'sos1' });
    await confirmacao;

    expect(firestore.updateDoc).toHaveBeenCalledWith(
      { caminho: 'alertasSOS/sos1' },
      { status: 'encerrado', encerradoEm: 'HORA_DO_SERVIDOR' }
    );
  });

  it('marca o "Estou bem" no membro do grupo', async () => {
    const { confirmacao } = await fila.enfileirar('uid1', 'estouBem', { grupoId: 'g1' });
    await confirmacao;

    expect(firestore.updateDoc).toHaveBeenCalledWith(
      { caminho: 'grupos/g1/membros/uid1' },
      { estouBemEm: 'HORA_DO_SERVIDOR' }
    );
  });

  it('descarta sem enviar um tipo desconhecido (não tem validade)', async () => {
    // Guardado em 1000, processado em 2000.
    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValue(2000);

    const { confirmacao } = await fila.enfileirar('uid1', 'outro', {});

    await expect(confirmacao).resolves.toBeUndefined();
    expect(firestore.setDoc).not.toHaveBeenCalled();
    expect(firestore.updateDoc).not.toHaveBeenCalled();
    expect(await fila.lerFila('uid1')).toEqual([]);
  });
});

describe('enfileirar: Firestore e SQLite', () => {
  it('gera o id com o Firestore (não com o banco do aparelho)', async () => {
    await fila.enfileirar('uid1', 'sos', {});

    expect(firestore.collection).toHaveBeenCalledWith({ nome: 'db' }, 'alertasSOS');
  });

  it('se o aparelho não consegue guardar, envia direto mesmo assim', async () => {
    const local = await banco();
    jest.spyOn(local, 'runAsync').mockRejectedValueOnce(new Error('disco cheio'));

    const { id, confirmacao } = await fila.enfileirar('uid1', 'sos', { latitude: 1 });

    await expect(confirmacao).resolves.toBeUndefined();
    expect(firestore.setDoc).toHaveBeenCalledWith(
      { caminho: `alertasSOS/${id}` },
      expect.objectContaining({ latitude: 1, uid: 'uid1', status: 'ativo' })
    );
  });

  it('fila ilegível: lerFila devolve vazio e removerDaFila não lança', async () => {
    const local = await banco();
    jest.spyOn(local, 'getAllAsync').mockRejectedValueOnce(new Error('corrompido'));
    jest.spyOn(local, 'runAsync').mockRejectedValueOnce(new Error('corrompido'));

    expect(await fila.lerFila('uid1')).toEqual([]);
    await expect(fila.removerDaFila('uid1', 'x')).resolves.toBeUndefined();
  });
});

describe('lerFila e removerDaFila', () => {
  it('lê só os itens do usuário, na ordem em que entraram', async () => {
    await inserirNaFila('uid1', { id: 'b', tipo: 'sos', dados: {}, criadoEm: 2 });
    await inserirNaFila('uid2', { id: 'x', tipo: 'sos', dados: {}, criadoEm: 1 });
    await inserirNaFila('uid1', { id: 'a', tipo: 'ponto', dados: { latitude: 1 }, criadoEm: 3 });

    expect(await fila.lerFila('uid1')).toEqual([
      { id: 'b', tipo: 'sos', dados: {}, criadoEm: 2 },
      { id: 'a', tipo: 'ponto', dados: { latitude: 1 }, criadoEm: 3 },
    ]);
  });

  it('remove só o item indicado', async () => {
    await inserirNaFila('uid1', { id: 'a', tipo: 'sos', dados: {}, criadoEm: 1 });
    await inserirNaFila('uid1', { id: 'b', tipo: 'sos', dados: {}, criadoEm: 2 });

    await fila.removerDaFila('uid1', 'a');

    expect((await fila.lerFila('uid1')).map((item) => item.id)).toEqual(['b']);
  });
});

describe('processarFila', () => {
  it('não faz nada sem usuário', async () => {
    await fila.processarFila(null);

    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('envia o que ficou guardado (por exemplo, depois de fechar o app)', async () => {
    const agora = Date.now();
    await inserirNaFila('uid1', { id: 'sos1', tipo: 'sos', dados: { latitude: 1 }, criadoEm: agora });

    await fila.processarFila('uid1');
    await esperar();

    expect(firestore.setDoc).toHaveBeenCalledWith(
      { caminho: 'alertasSOS/sos1' },
      expect.objectContaining({ latitude: 1, uid: 'uid1' })
    );
    expect(await fila.lerFila('uid1')).toEqual([]);
  });

  it('descarta sem enviar o que passou da validade', async () => {
    const agora = Date.now();
    await inserirNaFila('uid1', {
      id: 'velho',
      tipo: 'estouBem',
      dados: { grupoId: 'g1' },
      criadoEm: agora - 2 * 60 * 60 * 1000,
    });

    await fila.processarFila('uid1');

    expect(firestore.updateDoc).not.toHaveBeenCalled();
    expect(await fila.lerFila('uid1')).toEqual([]);
  });

  it('não entrega duas vezes um item que ainda espera o servidor', async () => {
    semInternet();

    await fila.enfileirar('uid1', 'sos', {});
    await fila.processarFila('uid1');
    await fila.processarFila('uid1');

    expect(firestore.setDoc).toHaveBeenCalledTimes(1);
  });
});
