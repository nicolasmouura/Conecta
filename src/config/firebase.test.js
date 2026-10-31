/*
 * Testes da configuração do Firebase (firebase.js). Usa o arquivo real
 * (os outros testes usam src/config/__mocks__/firebase.js), com o
 * Firebase falso de __mocks__/firebase.
 */

jest.unmock('./firebase');

const CHAVES = {
  EXPO_PUBLIC_FIREBASE_API_KEY: 'chave',
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'conecta.firebaseapp.com',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'conecta',
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'conecta.appspot.com',
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123',
  EXPO_PUBLIC_FIREBASE_APP_ID: 'app',
};

const ambienteOriginal = { ...process.env };

beforeEach(() => {
  jest.resetModules();
  Object.assign(process.env, CHAVES);
});

afterEach(() => {
  process.env = { ...ambienteOriginal };
});

describe('config/firebase', () => {
  it('inicia o app com as chaves do .env.local', () => {
    const app = require('firebase/app');

    require('./firebase');

    // O Babel do Expo troca process.env.EXPO_PUBLIC_* pelo valor ao
    // compilar: aqui só dá para conferir que os seis campos chegam.
    expect(app.initializeApp).toHaveBeenCalledWith({
      apiKey: expect.any(String),
      authDomain: expect.any(String),
      projectId: expect.any(String),
      storageBucket: expect.any(String),
      messagingSenderId: expect.any(String),
      appId: expect.any(String),
    });
  });

  it('guarda a sessão do login no SQLite (bancoLocal)', () => {
    const auth = require('firebase/auth');
    const { armazenamentoSessao } = require('../dados/bancoLocal');

    require('./firebase');

    expect(auth.getReactNativePersistence).toHaveBeenCalledWith(armazenamentoSessao);
    expect(auth.initializeAuth).toHaveBeenCalledWith(expect.anything(), {
      persistence: { armazenamento: armazenamentoSessao },
    });
  });

  it('exporta o Firestore e o Auth', () => {
    const { auth, db } = require('./firebase');

    expect(db).toEqual({ tipo: 'firestore' });
    expect(auth).toEqual({ currentUser: null });
  });

  it('reaproveita o app já criado (hot reload)', () => {
    const app = require('firebase/app');
    app.getApps.mockReturnValueOnce([{ existente: true }]);
    app.getApp.mockReturnValueOnce({ existente: true });

    require('./firebase');

    expect(app.initializeApp).not.toHaveBeenCalled();
  });

  it('Auth já iniciado: usa a instância existente', () => {
    const auth = require('firebase/auth');
    auth.initializeAuth.mockImplementationOnce(() => {
      throw Object.assign(new Error('já iniciado'), { code: 'auth/already-initialized' });
    });
    auth.getAuth.mockReturnValueOnce({ existente: true });

    expect(require('./firebase').auth).toEqual({ existente: true });
  });

  it('outro erro do Auth é repassado', () => {
    const auth = require('firebase/auth');
    auth.initializeAuth.mockImplementationOnce(() => {
      throw new Error('quebrou');
    });

    expect(() => require('./firebase')).toThrow('quebrou');
  });
});
