/*
 * SOS por SMS: monta a mensagem com a última posição e abre o app de
 * mensagens com os telefones da família (funciona sem internet).
 */

import * as Location from 'expo-location';
import * as SMS from 'expo-sms';

import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { comTempoLimite, gravarLocal, lerLocal } from './armazenamentoLocal';
import { coordenadaValida } from './buscarFamiliares';
import { formatarHorario } from './historico';
import { buscarPerfisDosMembros } from './salvarUsuario';

/*
 * SOS por SMS: funciona SEM internet (só com sinal de celular).
 * Abre o app de mensagens do aparelho já com os telefones da família e
 * o texto com a localização; quem envia é a própria pessoa, tocando em
 * "Enviar" (o app não manda SMS sozinho).
 */

// Posição mais antiga que isso não vai para a mensagem.
export const IDADE_MAXIMA_POSICAO = 30 * 60 * 1000;

// "(21) 98765-4321" → "21987654321". Números curtos demais são ignorados.
export function telefoneParaSMS(telefone) {
  const digitos = (telefone || '').replace(/\D/g, '');

  return digitos.length >= 8 && digitos.length <= 15 ? digitos : null;
}

// Telefones dos outros membros (sem repetir e sem o meu).
export function telefonesDaFamilia(perfis, uidProprio) {
  const telefones = Object.entries(perfis || {})
    .filter(([uid, perfil]) => uid !== uidProprio && perfil)
    .map(([, perfil]) => telefoneParaSMS(perfil.telefone))
    .filter(Boolean);

  return [...new Set(telefones)];
}

export function montarMensagemSOS({ nome, posicao, posicaoEm, agora = Date.now() }) {
  const linhas = [`SOS! ${nome || 'Um familiar'} precisa de ajuda.`];

  const posicaoRecente =
    posicao
    && coordenadaValida(posicao.latitude, posicao.longitude)
    && (typeof posicaoEm !== 'number' || agora - posicaoEm <= IDADE_MAXIMA_POSICAO);

  if (posicaoRecente) {
    const latitude = posicao.latitude.toFixed(5);
    const longitude = posicao.longitude.toFixed(5);
    const horario = formatarHorario(typeof posicaoEm === 'number' ? posicaoEm : agora, false);

    linhas.push(`Localização (${horario}): https://maps.google.com/?q=${latitude},${longitude}`);
  } else {
    linhas.push('Localização indisponível no momento.');
  }

  linhas.push('Enviado pelo app Conecta.');

  return linhas.join('\n');
}

/*
 * Telefones da família; sem família ou sem dados, lista vazia. Cada
 * busca bem-sucedida fica guardada no aparelho (App.js busca ao abrir),
 * para o SMS sair com os destinatários mesmo sem internet.
 */
export async function buscarTelefonesDaFamilia(grupoId, uidProprio) {
  if (!grupoId) return [];

  const chave = `telefones:${grupoId}`;

  try {
    const membros = await comTempoLimite(
      getDocs(collection(db, 'grupos', grupoId, 'membros')),
      3000
    );

    // Sem internet o Firebase responde com a memória (incompleta).
    if (membros.metadata.fromCache) throw new Error('SEM_CONEXAO');

    const perfis = await buscarPerfisDosMembros(membros.docs.map((membro) => membro.id));
    const telefones = telefonesDaFamilia(perfis, uidProprio);

    gravarLocal(chave, telefones);

    return telefones;
  } catch (erro) {
    const copia = await lerLocal(chave);

    console.log(
      copia ? 'Telefones da família pela cópia do aparelho:' : 'Telefones da família indisponíveis:',
      erro.code || erro.message
    );

    return copia || [];
  }
}

// Última posição guardada pelo sistema (não liga o GPS nem espera).
export async function ultimaPosicaoDoAparelho() {
  try {
    const { granted } = await Location.getForegroundPermissionsAsync();

    if (!granted) return null;

    const ultima = await Location.getLastKnownPositionAsync({ maxAge: IDADE_MAXIMA_POSICAO });

    return ultima ? { posicao: ultima.coords, posicaoEm: ultima.timestamp } : null;
  } catch (erro) {
    console.log('Última posição indisponível:', erro.message);
    return null;
  }
}

/*
 * Abre o app de mensagens. Resultado:
 *   indisponivel → o aparelho não envia SMS (ex.: tablet sem chip)
 *   aberto       → o app de mensagens foi aberto (a pessoa decide enviar)
 * telefones: quantos destinatários foram preenchidos.
 */
export async function enviarSOSPorSMS({ uid, grupoId, nome, posicao, posicaoEm }) {
  if (!(await SMS.isAvailableAsync())) {
    return { resultado: 'indisponivel', telefones: 0 };
  }

  const local = posicao ? { posicao, posicaoEm } : await ultimaPosicaoDoAparelho();
  const telefones = await buscarTelefonesDaFamilia(grupoId, uid);
  const mensagem = montarMensagemSOS({ nome, ...local });

  await SMS.sendSMSAsync(telefones, mensagem);

  return { resultado: 'aberto', telefones: telefones.length };
}
