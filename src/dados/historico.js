/*
 * Histórico de localizações: quando registrar um ponto, registrar,
 * buscar por período e formatar horários.
 */

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';

import { auth, db } from '../config/firebase';
import {
  coordenadaValida,
  distanciaEmMetros,
  DISTANCIA_MINIMA_ENVIO,
} from './buscarFamiliares';
import { comTempoLimite } from './armazenamentoLocal';
import { enfileirar, lerFila } from './filaEnvio';

// Máximo de pontos lidos por consulta (os mais recentes do período).
export const LIMITE_PONTOS_HISTORICO = 500;

// Parado no mesmo lugar: no máximo 1 ponto a cada 30 min.
export const INTERVALO_PONTO_PARADO = 30 * 60 * 1000;

export const PERIODOS = [
  { chave: 'hoje', label: 'Hoje' },
  { chave: 'ontem', label: 'Ontem' },
  { chave: '7dias', label: 'Últimos 7 dias' },
];

/*
 * Chamado a cada leitura do GPS, com ou sem internet. O histórico
 * guarda apenas deslocamentos relevantes, não cada leitura.
 */
export function deveRegistrarHistorico(ultimoPonto, coordenadas, agora) {
  if (!ultimoPonto) {
    return true;
  }

  return (
    distanciaEmMetros(ultimoPonto, coordenadas) >= DISTANCIA_MINIMA_ENVIO ||
    agora - ultimoPonto.em >= INTERVALO_PONTO_PARADO
  );
}

/*
 * historicoLocalizacoes/{uid}/pontos/{pontoId} — pontos nunca são alterados.
 * Vai pela fila de envio: sem internet, o ponto fica no aparelho (com a
 * hora em que foi registrado) e sobe quando a conexão voltar.
 */
export async function registrarPontoHistorico({ uid, grupoId, coordenadas }) {
  if (!coordenadaValida(coordenadas.latitude, coordenadas.longitude)) {
    throw new Error('COORDENADA_INVALIDA');
  }

  const ponto = {
    grupoId,
    latitude: coordenadas.latitude,
    longitude: coordenadas.longitude,
  };

  if (typeof coordenadas.accuracy === 'number' && coordenadas.accuracy >= 0) {
    ponto.precisao = Math.round(coordenadas.accuracy);
  }

  await enfileirar(uid, 'ponto', ponto);
}

// Pontos do próprio usuário que ainda estão só no aparelho.
async function pontosNaFila(uid, inicio, fim) {
  return (await lerFila(uid))
    .filter((item) => item.tipo === 'ponto')
    .map((item) => ({
      id: item.id,
      latitude: item.dados.latitude,
      longitude: item.dados.longitude,
      precisao: item.dados.precisao,
      registradoEm: item.criadoEm,
    }))
    .filter((ponto) => ponto.registradoEm >= inicio.getTime() && ponto.registradoEm < fim.getTime());
}

// Intervalo [inicio, fim) no fuso horário do aparelho.
export function calcularPeriodo(chave, agora = new Date()) {
  const ano = agora.getFullYear();
  const mes = agora.getMonth();
  const dia = agora.getDate();

  if (chave === 'ontem') {
    return { inicio: new Date(ano, mes, dia - 1), fim: new Date(ano, mes, dia) };
  }

  if (chave === '7dias') {
    return { inicio: new Date(ano, mes, dia - 6), fim: new Date(ano, mes, dia + 1) };
  }

  return { inicio: new Date(ano, mes, dia), fim: new Date(ano, mes, dia + 1) };
}

/*
 * Consulta única (sem listener). Busca os pontos mais recentes do
 * período, limitados, e devolve em ordem cronológica.
 *
 * grupoId: para ver o histórico de OUTRO membro. A família só lê os
 * pontos registrados nela (firestore.rules), então a consulta precisa
 * filtrar por ela (índice em firestore.indexes.json). O próprio
 * histórico vem completo (sem grupoId).
 */
export async function buscarHistorico(uid, { inicio, fim }, grupoId = null) {
  const consulta = query(
    collection(db, 'historicoLocalizacoes', uid, 'pontos'),
    ...(grupoId ? [where('grupoId', '==', grupoId)] : []),
    where('registradoEm', '>=', Timestamp.fromDate(inicio)),
    where('registradoEm', '<', Timestamp.fromDate(fim)),
    orderBy('registradoEm', 'desc'),
    limit(LIMITE_PONTOS_HISTORICO)
  );

  const proprio = auth.currentUser?.uid === uid;
  const pendentes = proprio ? await pontosNaFila(uid, inicio, fim) : [];

  let resultado;

  try {
    resultado = await comTempoLimite(getDocs(consulta));
  } catch (erro) {
    // Sem internet: o próprio histórico mostra ao menos o que está no aparelho.
    if (pendentes.length === 0) throw erro;

    console.log('Histórico sem conexão, só os pontos do aparelho:', erro.code || erro.message);

    return { pontos: pendentes, limitado: false };
  }

  const pontos = resultado.docs
    .map((documento) => {
      const dados = documento.data();

      return {
        id: documento.id,
        latitude: dados.latitude,
        longitude: dados.longitude,
        precisao: dados.precisao,
        registradoEm: dados.registradoEm?.toMillis?.() ?? null,
      };
    })
    .filter(
      (ponto) =>
        ponto.registradoEm !== null &&
        coordenadaValida(ponto.latitude, ponto.longitude)
    )
    .reverse();

  // Soma os pontos que ainda não subiram (sem repetir os que o
  // Firebase já tem em memória).
  const ids = new Set(pontos.map((ponto) => ponto.id));
  const todos = [...pontos, ...pendentes.filter((ponto) => !ids.has(ponto.id))]
    .sort((a, b) => a.registradoEm - b.registradoEm);

  return {
    pontos: todos,
    limitado: resultado.size === LIMITE_PONTOS_HISTORICO,
  };
}

// "14:05" ou, em períodos de vários dias, "27/09 14:05".
export function formatarHorario(momento, comData) {
  const data = new Date(momento);
  const doisDigitos = (valor) => String(valor).padStart(2, '0');
  const hora = `${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`;

  if (!comData) {
    return hora;
  }

  return `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)} ${hora}`;
}
