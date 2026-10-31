/*
 * Testes das cópias locais (armazenamentoLocal.js): leitura e gravação
 * no SQLite, limite de espera e listener com cópia local.
 */

let local;
let banco;

beforeEach(() => {
  jest.resetModules();

  local = require('./armazenamentoLocal');
  ({ banco } = require('./bancoLocal'));

  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// Deixa terminar as promessas e as leituras do banco pendentes.
async function esperar() {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolver) => setTimeout(resolver, 0));
  }
}

describe('semConexao', () => {
  it('reconhece o SEM_CONEXAO do app e o unavailable do Firebase', () => {
    expect(local.semConexao(new Error('SEM_CONEXAO'))).toBe(true);
    expect(local.semConexao({ code: 'unavailable' })).toBe(true);
  });

  it('não confunde outros erros', () => {
    expect(local.semConexao(new Error('permission-denied'))).toBe(false);
    expect(local.semConexao({ code: 'permission-denied' })).toBe(false);
    expect(local.semConexao(undefined)).toBe(false);
  });
});

describe('comTempoLimite', () => {
  it('devolve o resultado quando a promessa termina a tempo', async () => {
    await expect(local.comTempoLimite(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('repassa o erro da promessa', async () => {
    await expect(local.comTempoLimite(Promise.reject(new Error('recusado')), 1000)).rejects.toThrow(
      'recusado'
    );
  });

  it('lança SEM_CONEXAO quando a espera estoura', async () => {
    jest.useFakeTimers();

    const resultado = local.comTempoLimite(new Promise(() => {}), 1000);

    jest.advanceTimersByTime(1000);

    await expect(resultado).rejects.toThrow('SEM_CONEXAO');
  });

  it('usa o TEMPO_LIMITE quando não recebe o tempo', async () => {
    jest.useFakeTimers();

    const resultado = local.comTempoLimite(new Promise(() => {}));
    let terminou = false;
    resultado.catch(() => (terminou = true));

    jest.advanceTimersByTime(local.TEMPO_LIMITE - 1);
    await Promise.resolve();
    expect(terminou).toBe(false);

    jest.advanceTimersByTime(1);
    await expect(resultado).rejects.toThrow('SEM_CONEXAO');
  });
});

describe('lerLocal e gravarLocal', () => {
  it('guarda e devolve o valor', async () => {
    await local.gravarLocal('perfil', { nome: 'Ana', idade: 30 });

    expect(await local.lerLocal('perfil')).toEqual({ nome: 'Ana', idade: 30 });
  });

  it('substitui o valor anterior', async () => {
    await local.gravarLocal('perfil', { nome: 'Ana' });
    await local.gravarLocal('perfil', { nome: 'Bia' });

    expect(await local.lerLocal('perfil')).toEqual({ nome: 'Bia' });
  });

  it('devolve null quando não há cópia', async () => {
    expect(await local.lerLocal('nada')).toBeNull();
  });

  it('transforma Timestamps do Firestore em milissegundos', async () => {
    const timestamp = { seconds: 1, nanoseconds: 0, toMillis: () => 1000 };

    await local.gravarLocal('posicao', { atualizadoEm: timestamp, lista: [{ em: timestamp }] });

    expect(await local.lerLocal('posicao')).toEqual({ atualizadoEm: 1000, lista: [{ em: 1000 }] });
  });

  it('devolve null para uma cópia ilegível', async () => {
    const db = await banco();
    await db.runAsync('INSERT INTO copias (chave, valor) VALUES (?, ?)', 'perfil', 'não é json');

    expect(await local.lerLocal('perfil')).toBeNull();
  });

  it('não lança quando a gravação falha', async () => {
    const db = await banco();
    jest.spyOn(db, 'runAsync').mockRejectedValueOnce(new Error('disco cheio'));

    await expect(local.gravarLocal('perfil', {})).resolves.toBeUndefined();
  });
});

describe('apagarDadosLocais', () => {
  it('apaga as cópias e a fila, mas mantém a sessão do Firebase', async () => {
    const db = await banco();

    await local.gravarLocal('perfil', { nome: 'Ana' });
    await db.runAsync(
      'INSERT INTO fila (id, uid, tipo, dados, criado_em) VALUES (?, ?, ?, ?, ?)',
      'a',
      'uid1',
      'sos',
      '{}',
      1
    );
    await db.runAsync('INSERT INTO sessao_firebase (chave, valor) VALUES (?, ?)', 'firebase:authUser', 'x');

    await local.apagarDadosLocais();

    expect(await db.getAllAsync('SELECT * FROM copias')).toEqual([]);
    expect(await db.getAllAsync('SELECT * FROM fila')).toEqual([]);
    expect(await db.getAllAsync('SELECT chave FROM sessao_firebase')).toEqual([
      { chave: 'firebase:authUser' },
    ]);
  });
});

describe('observarComCopiaLocal', () => {
  // Listener falso: guarda os callbacks para o teste disparar.
  function criarAssinatura() {
    const assinatura = { cancelar: jest.fn() };

    assinatura.assinar = jest.fn((aoReceber, onErro) => {
      assinatura.receber = aoReceber;
      assinatura.erro = onErro;
      return assinatura.cancelar;
    });

    return assinatura;
  }

  it('mostra a cópia do aparelho antes do Firebase responder', async () => {
    await local.gravarLocal('familia', [{ id: 'a', nome: 'Ana' }]);
    const assinatura = criarAssinatura();
    const callback = jest.fn();

    local.observarComCopiaLocal('familia', assinatura.assinar, callback);
    await esperar();

    expect(callback).toHaveBeenCalledWith([{ id: 'a', nome: 'Ana' }]);
  });

  it('dados do servidor substituem a cópia e viram a nova cópia', async () => {
    await local.gravarLocal('familia', [{ id: 'a', nome: 'Ana' }]);
    const assinatura = criarAssinatura();
    const callback = jest.fn();

    local.observarComCopiaLocal('familia', assinatura.assinar, callback);
    assinatura.receber([{ id: 'b', nome: 'Bia' }], true);
    await esperar();

    expect(callback).toHaveBeenLastCalledWith([{ id: 'b', nome: 'Bia' }]);
    expect(callback).not.toHaveBeenCalledWith([{ id: 'a', nome: 'Ana' }]);
    expect(await local.lerLocal('familia')).toEqual([{ id: 'b', nome: 'Bia' }]);
  });

  it('sem internet, soma o cache do Firebase à cópia (por id)', async () => {
    await local.gravarLocal('familia', [
      { id: 'a', nome: 'Ana' },
      { id: 'b', nome: 'Bia' },
    ]);
    const assinatura = criarAssinatura();
    const callback = jest.fn();

    local.observarComCopiaLocal('familia', assinatura.assinar, callback);
    assinatura.receber([{ id: 'b', nome: 'Bia (nova)' }], false);
    await esperar();

    expect(callback).toHaveBeenLastCalledWith([
      { id: 'a', nome: 'Ana' },
      { id: 'b', nome: 'Bia (nova)' },
    ]);
    // A cópia só muda com dados do servidor.
    expect(await local.lerLocal('familia')).toHaveLength(2);
  });

  it('sem internet e sem cópia, mostra o que o Firebase tem', async () => {
    const assinatura = criarAssinatura();
    const callback = jest.fn();

    local.observarComCopiaLocal('perfil', assinatura.assinar, callback);
    assinatura.receber({ nome: 'Ana' }, false);
    await esperar();

    expect(callback).toHaveBeenCalledWith({ nome: 'Ana' });
  });

  it('com a cópia na tela, o erro do Firebase não chega ao onErro', async () => {
    await local.gravarLocal('perfil', { nome: 'Ana' });
    const assinatura = criarAssinatura();
    const onErro = jest.fn();

    local.observarComCopiaLocal('perfil', assinatura.assinar, jest.fn(), onErro);
    await esperar();
    assinatura.erro({ code: 'unavailable' });

    expect(onErro).not.toHaveBeenCalled();
  });

  it('sem cópia, o erro do Firebase vai para o onErro', async () => {
    const assinatura = criarAssinatura();
    const onErro = jest.fn();

    local.observarComCopiaLocal('perfil', assinatura.assinar, jest.fn(), onErro);
    await esperar();
    assinatura.erro({ code: 'permission-denied' });

    expect(onErro).toHaveBeenCalledWith({ code: 'permission-denied' });
  });

  it('depois de cancelar, não chama mais o callback', async () => {
    await local.gravarLocal('perfil', { nome: 'Ana' });
    const assinatura = criarAssinatura();
    const callback = jest.fn();

    const cancelar = local.observarComCopiaLocal('perfil', assinatura.assinar, callback);
    cancelar();
    assinatura.receber({ nome: 'Bia' }, true);
    await esperar();

    expect(callback).not.toHaveBeenCalled();
    expect(assinatura.cancelar).toHaveBeenCalled();
  });
});
