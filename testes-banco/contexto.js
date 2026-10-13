import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

/*
 * Sessão simulada para os testes do banco: o src/config/firebase.js é
 * trocado (configuracao.js) por "config", e entrarComo() muda quem
 * está logado. O db é o do emulador, já autenticado como essa pessoa,
 * então cada leitura e gravação passa pelas regras.
 */

const estado = {
  db: null,
  auth: { currentUser: null },
};

export const config = {
  get db() {
    return estado.db;
  },
  auth: estado.auth,
};

let ambiente = null;

export async function iniciarBanco() {
  ambiente = await initializeTestEnvironment({
    projectId: 'demo-conecta',
    firestore: {
      rules: readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });

  return ambiente;
}

export async function limparBanco() {
  await ambiente.clearFirestore();
  sair();
}

export async function encerrarBanco() {
  await ambiente?.cleanup();
}

// Pessoa logada (uid + e-mail no token, como o Firebase Auth faz).
export function entrarComo(pessoa) {
  estado.db = ambiente.authenticatedContext(pessoa.uid, { email: pessoa.email }).firestore();
  estado.auth.currentUser = { uid: pessoa.uid, email: pessoa.email };

  return estado.db;
}

// Sem login.
export function sair() {
  estado.db = ambiente.unauthenticatedContext().firestore();
  estado.auth.currentUser = null;
}

// Lê ou grava ignorando as regras (preparar cenário / conferir resultado).
export async function semRegras(acao) {
  let resultado;

  await ambiente.withSecurityRulesDisabled(async (contexto) => {
    resultado = await acao(contexto.firestore());
  });

  return resultado;
}
