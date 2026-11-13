/*
 * SMS automático do SOS (só Android): envia sem abrir o app de
 * mensagens, pelo módulo nativo modules/conecta-sms. No iOS, ou sem a
 * permissão, o SOS usa o app de mensagens (smsSOS.js). Fora de um
 * build próprio (Expo Go) o módulo não existe e tudo isso fica desligado.
 */

import { PermissionsAndroid, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

const modulo = Platform.OS === 'android' ? requireOptionalNativeModule('ConectaSms') : null;

export function smsAutomaticoSuportado() {
  return Boolean(modulo);
}

export function permissaoSMSConcedida() {
  try {
    return Boolean(modulo?.temPermissao());
  } catch (erro) {
    console.log('Permissão de SMS não conferida:', erro.message);
    return false;
  }
}

// Pedida antes da emergência (ao abrir a tela de SOS), nunca durante ela.
export async function pedirPermissaoSMS() {
  if (!modulo) return false;
  if (permissaoSMSConcedida()) return true;

  try {
    const resposta = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.SEND_SMS, {
      title: 'Avisar sua família por SMS',
      message:
        'Para o SOS avisar sua família por SMS na hora, mesmo sem internet, ' +
        'o Conecta precisa de permissão para enviar SMS. Só é usado quando você aciona o SOS.',
      buttonPositive: 'Permitir',
      buttonNegative: 'Agora não',
    });

    return resposta === PermissionsAndroid.RESULTS.GRANTED;
  } catch (erro) {
    console.log('Permissão de SMS não pedida:', erro.message);
    return false;
  }
}

// Sem acento o SMS cabe em 160 caracteres (com acento, 70): menos partes, mais chance de chegar.
export function semAcentos(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/*
 * { enviados, falhas }. Nunca lança: qualquer erro conta como falha
 * de todos os telefones, e o SOS cai para o app de mensagens.
 */
export async function enviarSMSAutomatico(telefones, mensagem) {
  if (!modulo || telefones.length === 0) {
    return { enviados: 0, falhas: telefones };
  }

  try {
    const { enviados, falhas } = await modulo.enviar(telefones, semAcentos(mensagem));

    return { enviados, falhas };
  } catch (erro) {
    console.log('SMS automático falhou:', erro.message);
    return { enviados: 0, falhas: telefones };
  }
}
