/*
 * Fila de envio: o que a pessoa faz sem internet (SOS, encerrar SOS,
 * "Estou bem" e pontos do histórico) fica guardado no aparelho e vai
 * para o Firebase quando a conexão voltar, mesmo que o app seja fechado.
 */

import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';

import { db } from '../config/firebase';
import { banco } from './bancoLocal';

/*
 * Depois disso o item já não diz nada sobre agora e é descartado.
 * Pontos: o histórico mostra até 7 dias (firestore.rules aceita 8).
 */
const VALIDADE = {
  ponto: 7 * 24 * 60 * 60 * 1000,
  sos: 24 * 60 * 60 * 1000,
  encerrarSOS: 30 * 24 * 60 * 60 * 1000,
  estouBem: 60 * 60 * 1000,
};

function itemDaLinha(linha) {
  return { id: linha.id, tipo: linha.tipo, dados: JSON.parse(linha.dados), criadoEm: linha.criado_em };
}

// "local" é o SQLite do aparelho; "db" é o Firestore.
export async function lerFila(uid) {
  try {
    const local = await banco();
    const linhas = await local.getAllAsync('SELECT * FROM fila WHERE uid = ? ORDER BY ordem', uid);

    return linhas.map(itemDaLinha);
  } catch (erro) {
    console.log('Fila do aparelho ilegível:', erro.message);
    return [];
  }
}

export async function removerDaFila(uid, id) {
  try {
    const local = await banco();

    await local.runAsync('DELETE FROM fila WHERE uid = ? AND id = ?', uid, id);
  } catch (erro) {
    console.log('Item não removido da fila:', erro.message);
  }
}

/*
 * O id do item é também o id do documento (SOS e pontos). Reenviar
 * depois de fechar o app vira uma "alteração", que as regras recusam
 * se o primeiro envio já chegou: nunca há documento repetido.
 */
function enviar(uid, { tipo, dados, id, criadoEm }) {
  switch (tipo) {
    case 'ponto':
      return setDoc(doc(db, 'historicoLocalizacoes', uid, 'pontos', id), {
        ...dados,
        uid,
        // Hora em que o ponto foi registrado, não a do envio.
        registradoEm: Timestamp.fromMillis(criadoEm),
      });

    case 'sos':
      return setDoc(doc(db, 'alertasSOS', id), {
        ...dados,
        uid,
        criadoEm: serverTimestamp(),
        status: 'ativo',
      });

    case 'encerrarSOS':
      return updateDoc(doc(db, 'alertasSOS', dados.alertaId), {
        status: 'encerrado',
        encerradoEm: serverTimestamp(),
      });

    case 'estouBem':
      return updateDoc(doc(db, 'grupos', dados.grupoId, 'membros', uid), {
        estouBemEm: serverTimestamp(),
      });

    default:
      return Promise.reject(new Error('TIPO_DESCONHECIDO'));
  }
}

/*
 * Itens já entregues ao Firebase nesta sessão: sem internet, ele mesmo
 * guarda e reenvia até o servidor confirmar. Só saem da fila depois
 * da confirmação (ou de uma recusa definitiva das regras).
 */
const entregues = new Map();

async function processarAgora(uid) {
  const agora = Date.now();

  for (const item of await lerFila(uid)) {
    if (entregues.has(item.id)) continue;

    if (agora - item.criadoEm > (VALIDADE[item.tipo] ?? 0)) {
      console.log('Item antigo descartado da fila:', item.tipo);
      await removerDaFila(uid, item.id);
      continue;
    }

    const envio = enviar(uid, item);

    entregues.set(item.id, envio);

    envio
      .then(
        () => console.log('Enviado pela fila:', item.tipo),
        (erro) => console.log('Envio recusado, descartado da fila:', item.tipo, erro.code || erro.message)
      )
      .finally(async () => {
        await removerDaFila(uid, item.id);
        entregues.delete(item.id);
      });
  }
}

// Uma passada de cada vez: o mesmo item nunca é entregue duas vezes.
let processamento = Promise.resolve();

export function processarFila(uid) {
  if (!uid) return Promise.resolve();

  processamento = processamento
    .then(() => processarAgora(uid))
    .catch((erro) => console.log('Fila não processada:', erro.message));

  return processamento;
}

/*
 * Guarda no aparelho e já entrega ao Firebase. confirmacao termina
 * quando o servidor recebe (sem internet, só quando a conexão voltar)
 * e falha se as regras recusarem. Se o aparelho não conseguir guardar,
 * entrega mesmo assim: o SOS nunca deixa de sair por isso.
 */
export async function enfileirar(uid, tipo, dados) {
  const item = {
    id: doc(collection(db, 'alertasSOS')).id, // id aleatório, gerado sem internet
    tipo,
    dados,
    criadoEm: Date.now(),
  };

  try {
    const local = await banco();

    await local.runAsync(
      'INSERT INTO fila (id, uid, tipo, dados, criado_em) VALUES (?, ?, ?, ?, ?)',
      item.id,
      uid,
      tipo,
      JSON.stringify(dados ?? {}),
      item.criadoEm
    );
  } catch (erro) {
    console.log('Fila do aparelho indisponível, enviando direto:', tipo, erro.message);
    return { id: item.id, confirmacao: enviar(uid, item) };
  }

  await processarFila(uid);

  return { id: item.id, confirmacao: entregues.get(item.id) ?? Promise.resolve() };
}
