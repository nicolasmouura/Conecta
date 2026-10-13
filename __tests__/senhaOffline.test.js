import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  __simularSemInternet,
  auth,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import {
  apagarSenhaOffline,
  confirmarSenhaDaConta,
  conferirSenhaOffline,
  guardarSenhaOffline,
} from '../src/dados/senhaOffline';
import { limparDadosAntigos } from '../src/dados/limparDadosAntigos';

// Firebase e SecureStore simulados em jest.setup.js.
const cofre = jest.requireMock('expo-secure-store').__cofre;
const codigoDoErro = (promessa) => promessa.then(() => null, (e) => e.code);

let eu;

beforeAll(async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});

  await createUserWithEmailAndPassword(auth, 'offline@x.com', 'senha123');
  eu = auth.currentUser;
});

afterEach(async () => {
  __simularSemInternet(false);
  await apagarSenhaOffline();
});

describe('hash da senha no aparelho', () => {
  test('guarda só sal e hash, nunca a senha', async () => {
    await guardarSenhaOffline(eu.uid, 'senha123');

    const salvo = await SecureStore.getItemAsync('conecta.senhaOffline');

    expect(salvo).not.toContain('senha123');
    expect(JSON.parse(salvo)).toEqual({
      uid: eu.uid,
      sal: expect.stringMatching(/^[0-9a-f]{32}$/),
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  test('confere a senha certa e recusa a errada', async () => {
    await guardarSenhaOffline(eu.uid, 'senha123');

    expect(await conferirSenhaOffline(eu.uid, 'senha123')).toBe(true);
    expect(await conferirSenhaOffline(eu.uid, 'senha124')).toBe(false);
  });

  test('sem hash, ou hash de outra conta: null', async () => {
    expect(await conferirSenhaOffline(eu.uid, 'senha123')).toBeNull();

    await guardarSenhaOffline('outra-conta', 'senha123');

    expect(await conferirSenhaOffline(eu.uid, 'senha123')).toBeNull();
  });

  test('o sal muda a cada vez que guarda', async () => {
    await guardarSenhaOffline(eu.uid, 'senha123');
    const primeiro = await SecureStore.getItemAsync('conecta.senhaOffline');

    await guardarSenhaOffline(eu.uid, 'senha123');
    const segundo = await SecureStore.getItemAsync('conecta.senhaOffline');

    expect(JSON.parse(primeiro).hash).not.toBe(JSON.parse(segundo).hash);
  });
});

describe('confirmarSenhaDaConta (encerrar SOS)', () => {
  test('com internet: o Firebase confere e o hash é atualizado', async () => {
    await expect(confirmarSenhaDaConta(eu, 'senha123')).resolves.toBe('online');
    expect(await conferirSenhaOffline(eu.uid, 'senha123')).toBe(true);

    expect(await codigoDoErro(confirmarSenhaDaConta(eu, 'errada'))).toBe('auth/invalid-credential');
  });

  test('sem internet: confere pelo hash', async () => {
    await guardarSenhaOffline(eu.uid, 'senha123');
    __simularSemInternet(true);

    await expect(confirmarSenhaDaConta(eu, 'senha123')).resolves.toBe('offline');
    expect(await codigoDoErro(confirmarSenhaDaConta(eu, 'errada'))).toBe('auth/invalid-credential');
  });

  test('sem internet e sem hash: avisa que não há conexão', async () => {
    __simularSemInternet(true);

    expect(await codigoDoErro(confirmarSenhaDaConta(eu, 'senha123'))).toBe(
      'auth/network-request-failed'
    );
  });

  test('senha vazia ou sem usuário', async () => {
    expect(await codigoDoErro(confirmarSenhaDaConta(eu, ''))).toBe('auth/missing-password');
    expect(await codigoDoErro(confirmarSenhaDaConta(null, 'senha123'))).toBe('auth/user-mismatch');
  });
});

describe('limparDadosAntigos (fase "dados só no aparelho")', () => {
  test('apaga banco, contas, sessão e senhas antigas; mantém o resto', async () => {
    await AsyncStorage.multiSet([
      ['@conecta:banco:usuarios/u1', '{}'],
      ['@conecta:banco:grupos/g1/membros/u1', '{}'],
      ['@conecta:contas', JSON.stringify({ 'a@x.com': { uid: 'u1', email: 'a@x.com' } })],
      ['@conecta:sessao', 'u1'],
      ['@conecta:outra-coisa', 'fica'],
    ]);
    cofre.set('conecta.senha.u1', 'senha-antiga');

    expect(await limparDadosAntigos()).toBe(4);

    const chaves = await AsyncStorage.getAllKeys();

    expect(chaves.some((chave) => chave.startsWith('@conecta:banco:'))).toBe(false);
    expect(chaves).not.toContain('@conecta:contas');
    expect(chaves).not.toContain('@conecta:sessao');
    expect(chaves).toContain('@conecta:outra-coisa');
    expect(cofre.has('conecta.senha.u1')).toBe(false);

    // Na próxima abertura não há mais nada para apagar.
    expect(await limparDadosAntigos()).toBe(0);
  });
});
