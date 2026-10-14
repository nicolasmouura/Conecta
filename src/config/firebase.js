/*
 * Inicializa o Firebase (Firestore e Authentication) com as chaves do
 * .env.local e mantém a sessão salva no aparelho.
 */

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

/*
 * Firebase: Cloud Firestore (dados) e Authentication (contas).
 * Os valores vêm do .env.local (EXPO_PUBLIC_FIREBASE_*). O prefixo
 * EXPO_PUBLIC_ é o que deixa o Expo colocá-los no app.
 */
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const faltando = Object.entries(firebaseConfig)
  .filter(([, valor]) => !valor)
  .map(([campo]) => campo);

if (faltando.length) {
  throw new Error(
    `Configuração do Firebase incompleta (${faltando.join(', ')}). ` +
      'Preencha as chaves EXPO_PUBLIC_FIREBASE_* no .env.local e reinicie o "npx expo start -c".'
  );
}

// Reaproveita o app já criado (o hot reload executa este arquivo de novo).
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Sessão persistente pelo mecanismo oficial do Firebase (AsyncStorage).
// initializeAuth só pode ser chamado uma vez; no hot reload usa a instância existente.
function iniciarAuth() {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (erro) {
    if (erro?.code === 'auth/already-initialized') {
      return getAuth(app);
    }

    throw erro;
  }
}

export const db = getFirestore(app);
export const auth = iniciarAuth();
