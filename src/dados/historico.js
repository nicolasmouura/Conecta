import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';

import { db } from '../config/firebase';
import {
  coordenadaValida,
  distanciaEmMetros,
  DISTANCIA_MINIMA_ENVIO,
} from './buscarFamiliares';

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
 * Chamado só depois que a localização atual foi gravada
 * (herda o intervalo mínimo de 15 s da Etapa 3). O histórico
 * guarda apenas deslocamentos relevantes, não cada envio.
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

// historicoLocalizacoes/{uid}/pontos/{pontoId} — pontos nunca são alterados.
export async function registrarPontoHistorico({ uid, grupoId, coordenadas }) {
  if (!coordenadaValida(coordenadas.latitude, coordenadas.longitude)) {
    throw new Error('COORDENADA_INVALIDA');
  }

  const ponto = {
    uid,
    grupoId,
    latitude: coordenadas.latitude,
    longitude: coordenadas.longitude,
    registradoEm: serverTimestamp(),
  };

  if (typeof coordenadas.accuracy === 'number' && coordenadas.accuracy >= 0) {
    ponto.precisao = Math.round(coordenadas.accuracy);
  }

  await addDoc(collection(db, 'historicoLocalizacoes', uid, 'pontos'), ponto);
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
 */
export async function buscarHistorico(uid, { inicio, fim }) {
  const consulta = query(
    collection(db, 'historicoLocalizacoes', uid, 'pontos'),
    where('registradoEm', '>=', Timestamp.fromDate(inicio)),
    where('registradoEm', '<', Timestamp.fromDate(fim)),
    orderBy('registradoEm', 'desc'),
    limit(LIMITE_PONTOS_HISTORICO)
  );

  const resultado = await getDocs(consulta);

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

  return {
    pontos,
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
