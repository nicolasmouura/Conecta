/*
 * "Estou bem" (coração do Menu): avisa a família que você está bem. O
 * aviso fica no seu registro da família e aparece no seu card do mapa
 * por 24 h ("Está bem · há 5 min").
 */

import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';

import { db } from '../config/firebase';

// Depois disso o aviso some do card (já não diz nada sobre agora).
export const VALIDADE_ESTOU_BEM = 24 * 60 * 60 * 1000;

// Só o próprio registro, só esse campo e com a hora do servidor
// (firestore.rules). Sem internet, o Firebase envia quando voltar.
export function avisarQueEstouBem(grupoId, uid) {
  return updateDoc(doc(db, 'grupos', grupoId, 'membros', uid), {
    estouBemEm: serverTimestamp(),
  });
}

function paraMilissegundos(valor) {
  if (typeof valor === 'number') return valor;
  if (typeof valor?.toMillis === 'function') return valor.toMillis();
  return null;
}

// "Está bem · agora" / "· há 5 min" / "· há 3 h", ou null (sem aviso ou velho).
export function descreverEstouBem(estouBemEm, agora) {
  const momento = paraMilissegundos(estouBemEm);

  if (momento === null) return null;

  const decorrido = Math.max(0, agora - momento);

  if (decorrido > VALIDADE_ESTOU_BEM) return null;

  const minutos = Math.floor(decorrido / 60000);

  if (minutos < 1) return 'Está bem · agora';
  if (minutos < 60) return `Está bem · há ${minutos} min`;

  return `Está bem · há ${Math.floor(minutos / 60)} h`;
}
