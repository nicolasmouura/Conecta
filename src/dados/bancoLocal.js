/*
 * Banco local (SQLite) do aparelho. Guarda as cópias de leitura, a fila
 * de envio e a sessão do Firebase. O Firebase continua sendo a fonte
 * oficial: aqui fica só o que precisa estar à mão sem internet.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';

const PREFIXO_ANTIGO = 'conecta:';
const PREFIXO_FILA_ANTIGO = `${PREFIXO_ANTIGO}fila:`;

let abertura = null;

async function migrarDoAsyncStorage(banco) {
  const chaves = (await AsyncStorage.getAllKeys()).filter((chave) => chave.startsWith(PREFIXO_ANTIGO));

  if (!chaves.length) return;

  const pares = await AsyncStorage.multiGet(chaves);

  await banco.withTransactionAsync(async () => {
    for (const [chave, texto] of pares) {
      if (texto === null) continue;

      try {
        if (chave.startsWith(PREFIXO_FILA_ANTIGO)) {
          const uid = chave.slice(PREFIXO_FILA_ANTIGO.length);

          for (const item of JSON.parse(texto)) {
            await banco.runAsync(
              'INSERT OR IGNORE INTO fila (id, uid, tipo, dados, criado_em) VALUES (?, ?, ?, ?, ?)',
              item.id,
              uid,
              item.tipo,
              JSON.stringify(item.dados ?? {}),
              item.criadoEm
            );
          }
        } else {
          await banco.runAsync(
            'INSERT OR IGNORE INTO copias (chave, valor) VALUES (?, ?)',
            chave.slice(PREFIXO_ANTIGO.length),
            texto
          );
        }
      } catch (erro) {
        console.log('Cópia antiga ignorada na migração:', chave, erro.message);
      }
    }
  });

  await AsyncStorage.multiRemove(chaves);
}

async function abrir() {
  const banco = await SQLite.openDatabaseAsync('conecta.db');

  await banco.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS copias (
      chave TEXT PRIMARY KEY NOT NULL,
      valor TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fila (
      ordem INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      uid TEXT NOT NULL,
      tipo TEXT NOT NULL,
      dados TEXT NOT NULL,
      criado_em INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS fila_uid ON fila (uid);
    CREATE TABLE IF NOT EXISTS sessao_firebase (
      chave TEXT PRIMARY KEY NOT NULL,
      valor TEXT NOT NULL
    );
  `);

  try {
    await migrarDoAsyncStorage(banco);
  } catch (erro) {
    console.log('Migração do AsyncStorage não concluída:', erro.message);
  }

  return banco;
}

// Abre (e prepara) o banco uma única vez; tenta de novo se a abertura falhar.
export function banco() {
  if (!abertura) {
    abertura = abrir().catch((erro) => {
      abertura = null;
      throw erro;
    });
  }

  return abertura;
}

/*
 * Armazenamento da sessão do Firebase Auth (mesma interface do
 * AsyncStorage). Sessões salvas antes da troca são trazidas do
 * AsyncStorage na primeira leitura, para ninguém precisar entrar de novo.
 */
export const armazenamentoSessao = {
  async getItem(chave) {
    const local = await banco();
    const linha = await local.getFirstAsync('SELECT valor FROM sessao_firebase WHERE chave = ?', chave);

    if (linha) return linha.valor;

    const antigo = await AsyncStorage.getItem(chave);

    if (antigo !== null) {
      await local.runAsync('INSERT OR REPLACE INTO sessao_firebase (chave, valor) VALUES (?, ?)', chave, antigo);
      await AsyncStorage.removeItem(chave);
    }

    return antigo;
  },

  async setItem(chave, valor) {
    const local = await banco();

    await local.runAsync('INSERT OR REPLACE INTO sessao_firebase (chave, valor) VALUES (?, ?)', chave, valor);
  },

  async removeItem(chave) {
    const local = await banco();

    await local.runAsync('DELETE FROM sessao_firebase WHERE chave = ?', chave);
    await AsyncStorage.removeItem(chave);
  },
};
