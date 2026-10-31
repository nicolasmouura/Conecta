/*
 * Testes do banco local (bancoLocal.js): abertura, migração do
 * AsyncStorage e sessão do Firebase.
 */

let AsyncStorage;
let SQLite;
let banco;
let armazenamentoSessao;

beforeEach(async () => {
  jest.resetModules();

  AsyncStorage = require('@react-native-async-storage/async-storage');
  SQLite = require('expo-sqlite');
  ({ banco, armazenamentoSessao } = require('./bancoLocal'));

  await AsyncStorage.clear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('banco', () => {
  it('abre o conecta.db uma única vez', async () => {
    const [primeiro, segundo] = await Promise.all([banco(), banco()]);

    expect(primeiro).toBe(segundo);
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith('conecta.db');
  });

  it('cria as tabelas copias, fila e sessao_firebase', async () => {
    const db = await banco();
    const tabelas = await db.getAllAsync("SELECT name FROM sqlite_master WHERE type = 'table'");

    expect(tabelas.map((tabela) => tabela.name)).toEqual(
      expect.arrayContaining(['copias', 'fila', 'sessao_firebase'])
    );
  });

  it('tenta abrir de novo depois de uma falha', async () => {
    SQLite.openDatabaseAsync.mockRejectedValueOnce(new Error('disco cheio'));

    await expect(banco()).rejects.toThrow('disco cheio');
    await expect(banco()).resolves.toBeTruthy();
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(2);
  });
});

describe('migração do AsyncStorage', () => {
  it('leva as cópias para a tabela copias, sem o prefixo', async () => {
    await AsyncStorage.setItem('conecta:perfil', JSON.stringify({ nome: 'Ana' }));

    const db = await banco();
    const linha = await db.getFirstAsync('SELECT valor FROM copias WHERE chave = ?', 'perfil');

    expect(JSON.parse(linha.valor)).toEqual({ nome: 'Ana' });
  });

  it('leva cada item da fila para a tabela fila, na ordem', async () => {
    await AsyncStorage.setItem(
      'conecta:fila:uid1',
      JSON.stringify([
        { id: 'a', tipo: 'sos', dados: { latitude: 1 }, criadoEm: 100 },
        { id: 'b', tipo: 'estouBem', dados: { grupoId: 'g' }, criadoEm: 200 },
      ])
    );

    const db = await banco();
    const linhas = await db.getAllAsync('SELECT id, uid, tipo, dados, criado_em FROM fila ORDER BY ordem');

    expect(linhas).toEqual([
      { id: 'a', uid: 'uid1', tipo: 'sos', dados: '{"latitude":1}', criado_em: 100 },
      { id: 'b', uid: 'uid1', tipo: 'estouBem', dados: '{"grupoId":"g"}', criado_em: 200 },
    ]);
  });

  it('apaga do AsyncStorage só as chaves do app', async () => {
    await AsyncStorage.setItem('conecta:perfil', '{}');
    await AsyncStorage.setItem('firebase:authUser', 'sessao');

    await banco();

    expect(await AsyncStorage.getAllKeys()).toEqual(['firebase:authUser']);
  });

  it('ignora uma fila ilegível e migra o resto', async () => {
    await AsyncStorage.setItem('conecta:fila:uid1', 'não é json');
    await AsyncStorage.setItem('conecta:perfil', '{"nome":"Ana"}');

    const db = await banco();

    expect(await db.getAllAsync('SELECT * FROM fila')).toEqual([]);
    expect(await db.getFirstAsync('SELECT valor FROM copias WHERE chave = ?', 'perfil')).toEqual({
      valor: '{"nome":"Ana"}',
    });
  });

  it('abre o banco mesmo se a migração falhar', async () => {
    AsyncStorage.getAllKeys.mockRejectedValueOnce(new Error('falhou'));

    await expect(banco()).resolves.toBeTruthy();
  });
});

describe('armazenamentoSessao', () => {
  it('grava, lê e apaga a sessão no SQLite', async () => {
    await armazenamentoSessao.setItem('firebase:authUser', 'sessao');
    expect(await armazenamentoSessao.getItem('firebase:authUser')).toBe('sessao');

    await armazenamentoSessao.removeItem('firebase:authUser');
    expect(await armazenamentoSessao.getItem('firebase:authUser')).toBeNull();
  });

  it('traz uma sessão antiga do AsyncStorage na primeira leitura', async () => {
    await AsyncStorage.setItem('firebase:authUser', 'sessao antiga');

    expect(await armazenamentoSessao.getItem('firebase:authUser')).toBe('sessao antiga');
    expect(await AsyncStorage.getItem('firebase:authUser')).toBeNull();

    const db = await banco();
    expect(
      await db.getFirstAsync('SELECT valor FROM sessao_firebase WHERE chave = ?', 'firebase:authUser')
    ).toEqual({ valor: 'sessao antiga' });
  });

  it('removeItem também apaga a cópia antiga do AsyncStorage', async () => {
    await AsyncStorage.setItem('firebase:authUser', 'sessao antiga');

    await armazenamentoSessao.removeItem('firebase:authUser');

    expect(await AsyncStorage.getItem('firebase:authUser')).toBeNull();
  });
});
