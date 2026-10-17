/*
 * Alertas de SOS (alertasSOS): acionar, encerrar e ouvir os alertas
 * ativos da família e o próprio.
 */

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '../config/firebase';
import { coordenadaValida } from './buscarFamiliares';
import { formatarHorario } from './historico';
import { MODO_DEMO, observarSOSDemo } from '../demo/demonstracao';

// "14:05", ou "26/09 14:05" se não foi hoje.
export function horarioDoAlerta(criadoEm) {
  if (criadoEm === null || criadoEm === undefined) return 'agora';

  const mesmoDia = new Date(criadoEm).toDateString() === new Date().toDateString();

  return formatarHorario(criadoEm, !mesmoDia);
}

// Botões do Alert de confirmação: só "Acionar SOS" dispara o alerta.
export function botoesConfirmacaoSOS(onConfirmar) {
  return [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Acionar SOS', style: 'destructive', onPress: onConfirmar },
  ];
}

/*
 * Última localização conhecida, lida de familiares/{uid} (Etapa 3).
 * Não usa GPS: se não houver documento, a leitura é negada pelas
 * regras ou a coordenada é inválida, o SOS segue sem localização.
 */
async function buscarUltimaLocalizacao(uid) {
  try {
    const resultado = await getDoc(doc(db, 'familiares', uid));

    if (!resultado.exists()) return null;

    const { latitude, longitude } = resultado.data();

    return coordenadaValida(latitude, longitude) ? { latitude, longitude } : null;
  } catch (erro) {
    console.log('SOS sem localização disponível:', erro.code || erro.message);
    return null;
  }
}

function mapearAlertas(consulta) {
  return consulta.docs.map((documento) => {
    // Alerta recém-criado ainda sem hora do servidor: usa a estimativa.
    const dados = documento.data({ serverTimestamps: 'estimate' });

    return {
      id: documento.id,
      ...dados,
      criadoEm: dados.criadoEm?.toMillis?.() ?? null,
    };
  });
}

function consultaAtivos(grupoId, uid) {
  const filtros = [
    where('grupoId', '==', grupoId),
    where('status', '==', 'ativo'),
  ];

  if (uid) {
    filtros.push(where('uid', '==', uid));
  }

  return query(collection(db, 'alertasSOS'), ...filtros);
}

// Cria o alerta. Se o usuário já tem um SOS ativo, reaproveita-o.
export async function acionarSOS({ uid, grupoId, nome }) {
  const existentes = await getDocs(consultaAtivos(grupoId, uid));

  if (!existentes.empty) {
    return { id: existentes.docs[0].id, jaExistia: true };
  }

  const alerta = {
    uid,
    grupoId,
    nome,
    criadoEm: serverTimestamp(),
    status: 'ativo',
  };

  const localizacao = await buscarUltimaLocalizacao(uid);

  if (localizacao) {
    alerta.latitude = localizacao.latitude;
    alerta.longitude = localizacao.longitude;
  }

  const referencia = await addDoc(collection(db, 'alertasSOS'), alerta);

  console.log('SOS acionado:', referencia.id);

  return { id: referencia.id, jaExistia: false, comLocalizacao: Boolean(localizacao) };
}

// Só o próprio autor consegue encerrar (garantido pelas regras).
// Na interface, só por Perfil → Configurações → Segurança, depois de
// confirmar a identidade (sos/EncerrarSOS.js).
export async function encerrarSOS(alertaId) {
  await updateDoc(doc(db, 'alertasSOS', alertaId), {
    status: 'encerrado',
    encerradoEm: serverTimestamp(),
  });

  console.log('SOS encerrado:', alertaId);
}

// O SOS ativo do próprio usuário (ou null).
export function observarMeuSOS(grupoId, uid, callback, onErro) {
  if (!grupoId || !uid) {
    callback(null);
    return () => {};
  }

  return onSnapshot(
    consultaAtivos(grupoId, uid),
    (consulta) => callback(mapearAlertas(consulta)[0] || null),
    onErro
  );
}

// SOS ativos da família, do mais antigo para o mais recente.
// Modo demonstração: soma o SOS fictício (demo/demonstracao.js).
export function observarSOSAtivos(grupoId, callback, onErro) {
  return MODO_DEMO && grupoId
    ? observarSOSDemo(observarSOSAtivosReal, grupoId, callback, onErro)
    : observarSOSAtivosReal(grupoId, callback, onErro);
}

function observarSOSAtivosReal(grupoId, callback, onErro) {
  if (!grupoId) {
    callback([]);
    return () => {};
  }

  return onSnapshot(
    consultaAtivos(grupoId),
    (consulta) => {
      callback(
        mapearAlertas(consulta).sort(
          (a, b) => (a.criadoEm ?? 0) - (b.criadoEm ?? 0)
        )
      );
    },
    onErro
  );
}
