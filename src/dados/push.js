/*
 * Notificação urgente do SOS (push). Cada aparelho registra o seu token
 * em tokensPush/{uid}. Quem aciona o SOS, com internet, manda o push
 * direto pela API gratuita da Expo para os aparelhos da família: não há
 * servidor nem custo. Sem internet o push não existe: o aviso que
 * chega é o SMS (emergencia.js), e o push sai assim que o alerta do app
 * for entregue ao Firebase (filaEnvio.js).
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

import { db } from '../config/firebase';
import { comTempoLimite } from './armazenamentoLocal';

export const CANAL_SOS = 'sos';

const URL_PUSH = 'https://exp.host/--/api/v2/push/send';

// A API da Expo aceita até 100 mensagens por pedido.
const MENSAGENS_POR_PEDIDO = 100;

// Com o app aberto, a notificação também aparece (e toca).
export function configurarNotificacoes() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Android: canal de importância máxima (som, vibração e tela de bloqueio).
async function criarCanalSOS() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(CANAL_SOS, {
    name: 'Alertas de SOS',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 250, 500, 250, 500],
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
    enableVibrate: true,
    enableLights: true,
    lightColor: '#FF0000',
  });
}

/*
 * Pede a permissão, pega o token do aparelho e o guarda para a família
 * poder avisá-lo. { registrado, motivo } e nunca lança.
 */
export async function registrarPush({ uid, grupoId }) {
  try {
    await criarCanalSOS();

    let { status } = await Notifications.getPermissionsAsync();

    if (status !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }

    if (status !== 'granted') return { registrado: false, motivo: 'permissao' };

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    await setDoc(doc(db, 'tokensPush', uid), {
      uid,
      grupoId,
      token,
      plataforma: Platform.OS,
      atualizadoEm: serverTimestamp(),
    });

    return { registrado: true };
  } catch (erro) {
    console.log('Push não registrado:', erro.code || erro.message);
    return { registrado: false, motivo: 'erro' };
  }
}

// Sai da família ou da conta: este aparelho para de receber os SOS dela.
export async function removerPush(uid) {
  try {
    await comTempoLimite(deleteDoc(doc(db, 'tokensPush', uid)), 3000);
  } catch (erro) {
    console.log('Push não removido:', erro.code || erro.message);
  }
}

// Tokens dos outros membros ATUAIS da família (quem saiu e deixou o token não conta).
async function tokensDaFamilia(uid, grupoId) {
  const [tokens, grupo] = await Promise.all([
    comTempoLimite(getDocs(query(collection(db, 'tokensPush'), where('grupoId', '==', grupoId))), 5000),
    comTempoLimite(getDoc(doc(db, 'grupos', grupoId)), 5000),
  ]);

  const membros = grupo.exists() ? grupo.data().membros || [] : [];

  return [
    ...new Set(
      tokens.docs
        .filter((documento) => documento.id !== uid && membros.includes(documento.id))
        .map((documento) => documento.data().token)
        .filter((token) => typeof token === 'string' && token.length > 0)
    ),
  ];
}

export function montarMensagemPush({ to, nome, alertaId }) {
  return {
    to,
    title: `SOS! ${nome || 'Um familiar'} precisa de ajuda`,
    body: 'Toque para ver a localização.',
    sound: 'default',
    priority: 'high',
    channelId: CANAL_SOS,
    interruptionLevel: 'time-sensitive',
    ttl: 60 * 60,
    data: { tipo: 'sos', alertaId },
  };
}

/*
 * Avisa o resto da família com uma notificação urgente. Nunca lança:
 * se falhar, o SMS e o alerta no app continuam valendo.
 * { enviados } = quantos aparelhos foram avisados.
 */
export async function notificarFamiliaSOS({ uid, grupoId, nome, alertaId }) {
  try {
    const tokens = await tokensDaFamilia(uid, grupoId);

    for (let inicio = 0; inicio < tokens.length; inicio += MENSAGENS_POR_PEDIDO) {
      const resposta = await fetch(URL_PUSH, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(
          tokens
            .slice(inicio, inicio + MENSAGENS_POR_PEDIDO)
            .map((to) => montarMensagemPush({ to, nome, alertaId }))
        ),
      });

      if (!resposta.ok) throw new Error(`PUSH_HTTP_${resposta.status}`);
    }

    return { enviados: tokens.length };
  } catch (erro) {
    console.log('Push da família não enviado:', erro.code || erro.message);
    return { enviados: 0 };
  }
}

/*
 * Tocou na notificação: quem a usa recebe o dado. Devolve o cancelamento.
 * Só os SOS (data.tipo === 'sos') chamam aoAbrirSOS.
 */
export function aoTocarNaNotificacao(aoAbrirSOS) {
  const assinatura = Notifications.addNotificationResponseReceivedListener((resposta) => {
    if (resposta?.notification?.request?.content?.data?.tipo === 'sos') aoAbrirSOS();
  });

  return () => assinatura.remove();
}
