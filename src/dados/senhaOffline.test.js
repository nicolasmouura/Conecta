/*
 * Testes da senha sem internet (senhaOffline.js): hash com sal no
 * SecureStore e confirmação da senha com ou sem Firebase.
 */

jest.mock('expo-secure-store', () => {
  const guardado = new Map();

  return {
    __guardado: guardado,
    getItemAsync: jest.fn(async (chave) => (guardado.has(chave) ? guardado.get(chave) : null)),
    setItemAsync: jest.fn(async (chave, valor) => void guardado.set(chave, valor)),
    deleteItemAsync: jest.fn(async (chave) => void guardado.delete(chave)),
  };
});

// SHA-256 e bytes aleatórios de verdade (crypto do Node).
jest.mock('expo-crypto', () => {
  const crypto = require('crypto');

  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: jest.fn(async (_algoritmo, texto) => crypto.createHash('sha256').update(texto).digest('hex')),
    getRandomBytes: jest.fn((n) => new Uint8Array(crypto.randomBytes(n))),
  };
});

const SecureStore = require('expo-secure-store');
const auth = require('firebase/auth');
const senhaOffline = require('./senhaOffline');

const CHAVE = 'conecta.senhaOffline';
const USUARIO = { uid: 'u1', email: 'ana@exemplo.com' };

beforeEach(() => {
  SecureStore.__guardado.clear();
  auth.reauthenticateWithCredential.mockResolvedValue();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

const semInternet = () =>
  auth.reauthenticateWithCredential.mockRejectedValue({ code: 'auth/network-request-failed' });

describe('guardarSenhaOffline', () => {
  it('guarda só o hash com sal, nunca a senha', async () => {
    await senhaOffline.guardarSenhaOffline('u1', 'segredo123');

    const texto = SecureStore.__guardado.get(CHAVE);
    const salvo = JSON.parse(texto);

    expect(texto).not.toContain('segredo123');
    expect(salvo).toEqual({ uid: 'u1', sal: expect.stringMatching(/^[0-9a-f]{32}$/), hash: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it('usa um sal diferente a cada vez', async () => {
    await senhaOffline.guardarSenhaOffline('u1', 'segredo');
    const primeiro = JSON.parse(SecureStore.__guardado.get(CHAVE));
    await senhaOffline.guardarSenhaOffline('u1', 'segredo');
    const segundo = JSON.parse(SecureStore.__guardado.get(CHAVE));

    expect(primeiro.sal).not.toBe(segundo.sal);
    expect(primeiro.hash).not.toBe(segundo.hash);
  });

  it('não guarda nada sem uid ou senha', async () => {
    await senhaOffline.guardarSenhaOffline('', 'x');
    await senhaOffline.guardarSenhaOffline('u1', '');

    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});

describe('conferirSenhaOffline', () => {
  it('confere a senha certa e a errada', async () => {
    await senhaOffline.guardarSenhaOffline('u1', 'segredo');

    expect(await senhaOffline.conferirSenhaOffline('u1', 'segredo')).toBe(true);
    expect(await senhaOffline.conferirSenhaOffline('u1', 'errada')).toBe(false);
  });

  it('null sem hash, de outra conta ou ilegível', async () => {
    expect(await senhaOffline.conferirSenhaOffline('u1', 'x')).toBeNull();

    await senhaOffline.guardarSenhaOffline('u2', 'x');
    expect(await senhaOffline.conferirSenhaOffline('u1', 'x')).toBeNull();

    SecureStore.__guardado.set(CHAVE, 'não é json');
    expect(await senhaOffline.conferirSenhaOffline('u1', 'x')).toBeNull();

    SecureStore.__guardado.set(CHAVE, JSON.stringify({ uid: 'u1' }));
    expect(await senhaOffline.conferirSenhaOffline('u1', 'x')).toBeNull();
  });

  it('não confere mais depois de apagar', async () => {
    await senhaOffline.guardarSenhaOffline('u1', 'segredo');
    await senhaOffline.apagarSenhaOffline();

    expect(await senhaOffline.conferirSenhaOffline('u1', 'segredo')).toBeNull();
  });
});

describe('confirmarSenhaDaConta', () => {
  it('com internet, quem confere é o Firebase, e o hash é atualizado', async () => {
    expect(await senhaOffline.confirmarSenhaDaConta(USUARIO, 'nova')).toBe('online');

    expect(auth.EmailAuthProvider.credential).toHaveBeenCalledWith('ana@exemplo.com', 'nova');
    expect(await senhaOffline.conferirSenhaOffline('u1', 'nova')).toBe(true);
  });

  it('senha errada no Firebase é repassada', async () => {
    auth.reauthenticateWithCredential.mockRejectedValue({ code: 'auth/invalid-credential' });

    await expect(senhaOffline.confirmarSenhaDaConta(USUARIO, 'x')).rejects.toEqual({
      code: 'auth/invalid-credential',
    });
  });

  it('sem internet, confere pelo hash', async () => {
    await senhaOffline.guardarSenhaOffline('u1', 'segredo');
    semInternet();

    expect(await senhaOffline.confirmarSenhaDaConta(USUARIO, 'segredo')).toBe('offline');
    await expect(senhaOffline.confirmarSenhaDaConta(USUARIO, 'errada')).rejects.toMatchObject({
      code: 'auth/invalid-credential',
    });
  });

  it('sem internet e sem hash, repassa o erro de rede', async () => {
    semInternet();

    await expect(senhaOffline.confirmarSenhaDaConta(USUARIO, 'x')).rejects.toEqual({
      code: 'auth/network-request-failed',
    });
  });

  it('recusa usuário sem e-mail e senha vazia', async () => {
    await expect(senhaOffline.confirmarSenhaDaConta({ uid: 'u1' }, 'x')).rejects.toMatchObject({
      code: 'auth/user-mismatch',
    });
    await expect(senhaOffline.confirmarSenhaDaConta(null, 'x')).rejects.toMatchObject({ code: 'auth/user-mismatch' });
    await expect(senhaOffline.confirmarSenhaDaConta(USUARIO, '')).rejects.toMatchObject({
      code: 'auth/missing-password',
    });
  });

  it('confirma mesmo se o hash não puder ser atualizado', async () => {
    SecureStore.setItemAsync.mockRejectedValueOnce(new Error('cheio'));

    expect(await senhaOffline.confirmarSenhaDaConta(USUARIO, 'x')).toBe('online');
  });
});
