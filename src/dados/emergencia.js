/*
 * Acionar a emergência: o SMS para a família e o alerta no app saem ao
 * mesmo tempo, e um nunca espera pelo outro. Sem internet o alerta do
 * app fica na fila (sos.js) e o SMS, que só precisa de sinal de celular,
 * continua sendo o aviso que chega.
 */

import { acionarSOS } from './sos';
import { enviarSMSAutomatico, permissaoSMSConcedida, smsAutomaticoSuportado } from './smsAutomatico';
import {
  enviarSOSPorSMS,
  montarMensagemSOS,
  telefonesParaSOS,
  ultimaPosicaoDoAparelho,
} from './smsSOS';

/*
 * Resultado do SMS:
 *   automatico   → saiu sem toque (Android com permissão): enviados/falhas
 *   aberto       → o app de mensagens abriu com tudo preenchido (iOS, ou
 *                  Android sem permissão): a pessoa toca em "Enviar"
 *   indisponivel → o aparelho não envia SMS
 *   erro         → algo falhou
 * Nunca lança.
 */
async function avisarPorSMS({ uid, grupoId, nome, posicao, posicaoEm }) {
  try {
    if (smsAutomaticoSuportado() && permissaoSMSConcedida()) {
      const local = posicao ? { posicao, posicaoEm } : await ultimaPosicaoDoAparelho();
      const telefones = await telefonesParaSOS(grupoId, uid);

      if (telefones.length > 0) {
        const { enviados, falhas } = await enviarSMSAutomatico(
          telefones,
          montarMensagemSOS({ nome, ...local })
        );

        if (enviados > 0) {
          return { resultado: 'automatico', enviados, falhas: falhas.length };
        }
      }
    }

    // Sem envio automático (ou ele falhou): o app de mensagens, já preenchido.
    const { resultado } = await enviarSOSPorSMS({ uid, grupoId, nome, posicao, posicaoEm });

    return { resultado, enviados: 0, falhas: 0 };
  } catch (erro) {
    console.log('SOS por SMS falhou:', erro.message);
    return { resultado: 'erro', enviados: 0, falhas: 0 };
  }
}

/*
 * { sms, sos }. "sos" é o resultado de acionarSOS, ou { erro } se o
 * alerta do app foi recusado, ou null sem família.
 */
export async function acionarEmergencia({ uid, grupoId, nome, posicao, posicaoEm }) {
  const [sms, sos] = await Promise.all([
    avisarPorSMS({ uid, grupoId, nome, posicao, posicaoEm }),
    grupoId
      ? acionarSOS({ uid, grupoId, nome }).catch((erro) => {
          console.log('Alerta do app não registrado:', erro.code || erro.message);
          return { erro };
        })
      : null,
  ]);

  return { sms, sos };
}
