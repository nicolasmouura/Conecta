/*
 * Alertas de SOS (alertasSOS): acionar, encerrar e ouvir os alertas
 * ativos da família e o próprio.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';

import { db } from '../config/firebase';
import { comTempoLimite, semConexao } from './armazenamentoLocal';
import { coordenadaValida } from './buscarFamiliares';
import { enfileirar, removerDaFila } from './filaEnvio';
import { formatarHorario } from './historico';
import { ultimaPosicaoDoAparelho } from './smsSOS';

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

// Sem resposta do Firebase nesse tempo, o SOS segue como "sem internet"
// (no máximo ~3 s no total: as consultas correm juntas, depois o envio).
const ESPERA_SOS = 1500;

/*
 * Última localização conhecida, lida de familiares/{uid} (Etapa 3) ou,
 * sem internet, a última guardada pelo aparelho. Não liga o GPS: sem
 * nenhuma das duas, o SOS segue sem localização.
 */
async function buscarUltimaLocalizacao(uid) {
  try {
    const resultado = await comTempoLimite(getDoc(doc(db, 'familiares', uid)), ESPERA_SOS);

    if (resultado.exists()) {
      const { latitude, longitude } = resultado.data();

      if (coordenadaValida(latitude, longitude)) return { latitude, longitude };
    }
  } catch (erro) {
    console.log('Localização do SOS pelo aparelho:', erro.code || erro.message);
  }

  const doAparelho = await ultimaPosicaoDoAparelho();

  if (!doAparelho) return null;

  const { latitude, longitude } = doAparelho.posicao;

  return coordenadaValida(latitude, longitude) ? { latitude, longitude } : null;
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

// Espera a confirmação do servidor; sem internet, devolve false (o
// envio continua na fila). Recusa das regras é erro de verdade.
async function confirmado(confirmacao) {
  try {
    await comTempoLimite(confirmacao, ESPERA_SOS);
    return true;
  } catch (erro) {
    if (semConexao(erro)) return false;
    throw erro;
  }
}

/*
 * Cria o alerta. Se o usuário já tem um SOS ativo, reaproveita-o.
 * Sem internet, o alerta fica na fila do aparelho e vai para a família
 * quando a conexão voltar (enviado: false).
 */
export async function acionarSOS({ uid, grupoId, nome }) {
  // As duas consultas ao mesmo tempo: sem internet, o SOS não espera uma
  // depois da outra.
  const [existentes, localizacao] = await Promise.all([
    comTempoLimite(getDocs(consultaAtivos(grupoId, uid)), ESPERA_SOS).catch((erro) => {
      // Sem conferir o SOS anterior: o alerta não pode esperar.
      console.log('SOS anterior não conferido:', erro.code || erro.message);
      return null;
    }),
    buscarUltimaLocalizacao(uid),
  ]);

  if (existentes && !existentes.empty) {
    return { id: existentes.docs[0].id, jaExistia: true };
  }

  const alerta = { grupoId, nome };

  if (localizacao) {
    alerta.latitude = localizacao.latitude;
    alerta.longitude = localizacao.longitude;
  }

  const { id, confirmacao } = await enfileirar(uid, 'sos', alerta);
  const enviado = await confirmado(confirmacao);

  console.log(enviado ? 'SOS acionado:' : 'SOS na fila (sem conexão):', id);

  return { id, jaExistia: false, comLocalizacao: Boolean(localizacao), enviado };
}

// Só o próprio autor consegue encerrar (garantido pelas regras).
// Na interface, só por Perfil → Configurações → Segurança, depois de
// confirmar a identidade (sos/EncerrarSOS.js). Sem internet, o
// encerramento fica na fila e vale assim que a conexão voltar.
export async function encerrarSOS(alertaId, uid) {
  // Um SOS que ainda nem saiu do aparelho não é mais reenviado.
  await removerDaFila(uid, alertaId);

  const { confirmacao } = await enfileirar(uid, 'encerrarSOS', { alertaId });
  const enviado = await confirmado(confirmacao);

  console.log(enviado ? 'SOS encerrado:' : 'Encerramento na fila (sem conexão):', alertaId);

  return { enviado };
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
export function observarSOSAtivos(grupoId, callback, onErro) {
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
