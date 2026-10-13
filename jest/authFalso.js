import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { gerarId } from './firestoreFalso';

/*
 * Simulação do Firebase Authentication para os testes (jest.setup.js
 * troca 'firebase/auth' por este arquivo). Foram as "contasLocais" do
 * app enquanto os dados ficavam só no aparelho.
 *
 * Mesmos nomes de função e mesmos códigos de erro ('auth/...') de
 * 'firebase/auth'. Contas e sessão no AsyncStorage simulado; a senha
 * no SecureStore simulado.
 */

const CHAVE_CONTAS = '@teste:contas';
const CHAVE_SESSAO = '@teste:sessao';

// Chaves do SecureStore aceitam apenas letras, números, ".", "-" e "_".
const chaveSenha = (uid) => `teste.senha.${uid}`;

const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TAMANHO_MINIMO_SENHA = 6;

export const auth = { currentUser: null };

const ouvintes = new Set();

function erroAuth(codigo) {
  const erro = new Error(codigo);
  erro.code = codigo;
  return erro;
}

function normalizarEmail(email) {
  return (email || '').trim().toLowerCase();
}

function criarUsuario(conta) {
  return { uid: conta.uid, email: conta.email, displayName: null };
}

// { [email]: { uid, email, criadaEm } }
async function lerContas() {
  const texto = await AsyncStorage.getItem(CHAVE_CONTAS);

  return texto ? JSON.parse(texto) : {};
}

// Sessão guardada (equivale à persistência do Firebase Auth).
const carregamento = (async () => {
  try {
    const uid = await AsyncStorage.getItem(CHAVE_SESSAO);

    if (!uid) return;

    const conta = Object.values(await lerContas()).find((item) => item.uid === uid);

    if (conta) {
      auth.currentUser = criarUsuario(conta);
    }
  } catch (erro) {
    console.log('Sessão local não restaurada:', erro);
  }
})();

function avisarOuvintes() {
  for (const ouvinte of [...ouvintes]) {
    ouvinte(auth.currentUser);
  }
}

async function abrirSessao(conta) {
  await AsyncStorage.setItem(CHAVE_SESSAO, conta.uid);

  auth.currentUser = criarUsuario(conta);
  avisarOuvintes();

  return { user: auth.currentUser };
}

export function onAuthStateChanged(_auth, callback) {
  let ativo = true;

  const ouvinte = (usuario) => {
    if (ativo) callback(usuario);
  };

  // Como no Firebase: avisa a sessão atual e, depois, cada mudança.
  carregamento.then(() => {
    if (!ativo) return;

    ouvintes.add(ouvinte);
    callback(auth.currentUser);
  });

  return () => {
    ativo = false;
    ouvintes.delete(ouvinte);
  };
}

export async function createUserWithEmailAndPassword(_auth, email, senha) {
  await carregamento;

  const emailNormalizado = normalizarEmail(email);

  if (!EMAIL_VALIDO.test(emailNormalizado)) throw erroAuth('auth/invalid-email');
  if (!senha) throw erroAuth('auth/missing-password');
  if (senha.length < TAMANHO_MINIMO_SENHA) throw erroAuth('auth/weak-password');

  const contas = await lerContas();

  if (contas[emailNormalizado]) {
    throw erroAuth('auth/email-already-in-use');
  }

  const conta = {
    uid: gerarId(28),
    email: emailNormalizado,
    criadaEm: new Date().toISOString(),
  };

  await SecureStore.setItemAsync(chaveSenha(conta.uid), senha);
  await AsyncStorage.setItem(
    CHAVE_CONTAS,
    JSON.stringify({ ...contas, [emailNormalizado]: conta })
  );

  return abrirSessao(conta);
}

export async function signInWithEmailAndPassword(_auth, email, senha) {
  await carregamento;

  const emailNormalizado = normalizarEmail(email);

  if (!EMAIL_VALIDO.test(emailNormalizado)) throw erroAuth('auth/invalid-email');
  if (!senha) throw erroAuth('auth/missing-password');

  const conta = (await lerContas())[emailNormalizado];

  if (!conta) {
    throw erroAuth('auth/user-not-found');
  }

  const senhaSalva = await SecureStore.getItemAsync(chaveSenha(conta.uid));

  if (senhaSalva === null || senhaSalva !== senha) {
    throw erroAuth('auth/invalid-credential');
  }

  return abrirSessao(conta);
}

export async function signOut() {
  await carregamento;
  await AsyncStorage.removeItem(CHAVE_SESSAO);

  auth.currentUser = null;
  avisarOuvintes();
}

/*
 * Confirmar a senha da conta aberta sem trocar a sessão (ex.: encerrar
 * o SOS). Mesmos nomes do Firebase:
 *   reauthenticateWithCredential(auth.currentUser,
 *     EmailAuthProvider.credential(email, senha))
 */
export const EmailAuthProvider = {
  credential: (email, senha) => ({ email: normalizarEmail(email), senha }),
};

// Testes: simula o aparelho sem internet (o Firebase não responde).
let semInternet = false;

export function __simularSemInternet(valor) {
  semInternet = valor;
}

export async function reauthenticateWithCredential(usuario, credencial) {
  await carregamento;

  if (semInternet) throw erroAuth('auth/network-request-failed');

  if (!usuario?.uid || credencial?.email !== usuario.email) {
    throw erroAuth('auth/user-mismatch');
  }

  if (!credencial.senha) throw erroAuth('auth/missing-password');

  const senhaSalva = await SecureStore.getItemAsync(chaveSenha(usuario.uid));

  if (senhaSalva === null || senhaSalva !== credencial.senha) {
    throw erroAuth('auth/invalid-credential');
  }

  return { user: usuario };
}

// Simulação: não envia e-mail.
export async function sendPasswordResetEmail(_auth, email) {
  if (!EMAIL_VALIDO.test(normalizarEmail(email))) {
    throw erroAuth('auth/invalid-email');
  }

  throw erroAuth('auth/operation-not-allowed');
}
