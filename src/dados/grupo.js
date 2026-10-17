/*
 * Família (grupos/{id}): criar, buscar, ouvir os membros e sair da
 * família.
 */

import {
  arrayRemove,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '../config/firebase';
import { MODO_DEMO, observarMembrosDemo } from '../demo/demonstracao';

// Lança JA_POSSUI_FAMILIA se o usuário já estiver vinculado a um grupo.
export async function garantirSemFamilia(uid) {
  const perfil = await getDoc(doc(db, 'usuarios', uid));

  if (perfil.exists() && perfil.data().grupoId) {
    throw new Error('JA_POSSUI_FAMILIA');
  }
}

export async function criarGrupo(nomeGrupo, usuario) {
  await garantirSemFamilia(usuario.uid);

  const referenciaGrupo = doc(collection(db, 'grupos'));
  const agora = new Date().toISOString();

  const grupo = {
    nome: nomeGrupo.trim(),
    administradorUid: usuario.uid,
    membros: [usuario.uid],
    criadoEm: agora,
  };

  /*
   * Grupo, registro do membro e vínculo no perfil
   * são gravados juntos: ou tudo é salvo, ou nada.
   * As regras do Firestore conferem as três partes.
   */
  const lote = writeBatch(db);

  lote.set(referenciaGrupo, grupo);

  lote.set(
    doc(db, 'grupos', referenciaGrupo.id, 'membros', usuario.uid),
    {
      uid: usuario.uid,
      nome: usuario.nome || 'Usuário',
      papel: 'administrador',
      status: 'ativo',
      entrouEm: agora,
    }
  );

  lote.set(
    doc(db, 'usuarios', usuario.uid),
    { grupoId: referenciaGrupo.id },
    { merge: true }
  );

  await lote.commit();

  console.log('Grupo criado:', referenciaGrupo.id);

  return {
    id: referenciaGrupo.id,
    ...grupo,
  };
}

export async function buscarGrupoPorId(grupoId) {
  if (!grupoId) {
    return null;
  }

  const referencia = doc(db, 'grupos', grupoId);
  const resultado = await getDoc(referencia);

  if (!resultado.exists()) {
    return null;
  }

  return {
    id: resultado.id,
    ...resultado.data(),
  };
}


// Modo demonstração: soma a família fictícia (demo/demonstracao.js).
export function observarMembros(grupoId, callback, onErro) {
  return MODO_DEMO
    ? observarMembrosDemo(observarMembrosReal, grupoId, callback, onErro)
    : observarMembrosReal(grupoId, callback, onErro);
}

function observarMembrosReal(grupoId, callback, onErro) {
  return onSnapshot(
    collection(db, 'grupos', grupoId, 'membros'),
    (consulta) => {
      callback(
        consulta.docs.map((documento) => ({
          id: documento.id,
          // "Estou bem" recém-tocado ainda sem hora do servidor: usa a estimativa.
          ...documento.data({ serverTimestamps: 'estimate' }),
        }))
      );
    },
    onErro
  );
}

/*
 * Quem assume a administração quando o administrador sai: o membro
 * que entrou primeiro (entrouEm). Membros antigos sem registro ficam
 * por último, na ordem do array "membros".
 */
async function membroMaisAntigo(grupoId, candidatos) {
  const registros = await getDocs(collection(db, 'grupos', grupoId, 'membros'));
  const entrada = new Map(registros.docs.map((registro) => [registro.id, registro.data().entrouEm]));

  return [...candidatos].sort((a, b) => {
    const entradaA = entrada.get(a);
    const entradaB = entrada.get(b);

    // entrouEm é ISO 8601: a ordem do texto é a ordem do tempo.
    if (entradaA && entradaB && entradaA !== entradaB) return entradaA < entradaB ? -1 : 1;
    if (entradaA && !entradaB) return -1;
    if (!entradaA && entradaB) return 1;

    return candidatos.indexOf(a) - candidatos.indexOf(b);
  })[0];
}

/*
 * Sair da família. Tudo num lote só (as regras conferem as partes):
 *   - o uid sai de "membros" e o registro do membro é apagado;
 *   - administrador saindo: o papel passa para o membro mais antigo;
 *   - último membro: a família é apagada e os convites pendentes
 *     dela são cancelados;
 *   - o perfil fica sem família e a localização no mapa é apagada.
 * Com SOS ativo não sai (SOS_ATIVO): a família precisa ver o alerta
 * até ele ser encerrado.
 * Devolve { familiaApagada, novoAdministrador }.
 */
export async function sairDaFamilia(uid) {
  const referenciaPerfil = doc(db, 'usuarios', uid);
  const perfil = await getDoc(referenciaPerfil);
  const grupoId = perfil.exists() ? perfil.data().grupoId : null;

  if (!grupoId) throw new Error('SEM_FAMILIA');

  const sosAtivo = await getDocs(
    query(
      collection(db, 'alertasSOS'),
      where('grupoId', '==', grupoId),
      where('status', '==', 'ativo'),
      where('uid', '==', uid)
    )
  );

  if (!sosAtivo.empty) throw new Error('SOS_ATIVO');

  const grupo = await buscarGrupoPorId(grupoId);
  const referenciaGrupo = doc(db, 'grupos', grupoId);
  const outros = (grupo?.membros || []).filter((membro) => membro !== uid);
  const agora = new Date().toISOString();
  const lote = writeBatch(db);

  let novoAdministrador = null;

  if (outros.length === 0) {
    const pendentes = await getDocs(
      query(
        collection(db, 'convites'),
        where('grupoId', '==', grupoId),
        where('status', '==', 'pendente')
      )
    );

    pendentes.forEach((convite) => {
      lote.update(convite.ref, { status: 'cancelado', respondidoEm: agora });
    });

    if (grupo) lote.delete(referenciaGrupo);
  } else {
    const alteracao = { membros: arrayRemove(uid) };

    if (grupo.administradorUid === uid) {
      novoAdministrador = await membroMaisAntigo(grupoId, outros);
      alteracao.administradorUid = novoAdministrador;

      const registro = doc(db, 'grupos', grupoId, 'membros', novoAdministrador);

      if ((await getDoc(registro)).exists()) {
        lote.update(registro, { papel: 'administrador' });
      }
    }

    lote.update(referenciaGrupo, alteracao);
  }

  lote.delete(doc(db, 'grupos', grupoId, 'membros', uid));
  lote.update(referenciaPerfil, { grupoId: deleteField() });
  lote.delete(doc(db, 'familiares', uid));

  await lote.commit();

  console.log('Saiu da família:', grupoId);

  return { familiaApagada: outros.length === 0, novoAdministrador };
}
