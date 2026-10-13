import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '../config/firebase';

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

/*
 * Grupos criados antes do sistema de convites só possuem
 * o array "membros". Cria o registro do próprio usuário
 * na subcoleção para que ele apareça na lista.
 */
export async function garantirRegistroMembro(grupo, usuario) {
  if (!grupo?.membros?.includes(usuario.uid)) {
    return;
  }

  const referencia = doc(
    db,
    'grupos',
    grupo.id,
    'membros',
    usuario.uid
  );

  const registro = await getDoc(referencia);

  if (registro.exists()) {
    return;
  }

  await setDoc(referencia, {
    uid: usuario.uid,
    nome: usuario.nome || 'Usuário',
    papel:
      grupo.administradorUid === usuario.uid
        ? 'administrador'
        : 'membro',
    status: 'ativo',
    entrouEm: new Date().toISOString(),
  });

  console.log('Registro de membro criado:', usuario.uid);
}

export function observarMembros(grupoId, callback, onErro) {
  return onSnapshot(
    collection(db, 'grupos', grupoId, 'membros'),
    (consulta) => {
      callback(
        consulta.docs.map((documento) => ({
          id: documento.id,
          ...documento.data(),
        }))
      );
    },
    onErro
  );
}
