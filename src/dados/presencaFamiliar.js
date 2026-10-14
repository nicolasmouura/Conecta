/*
 * Textos dos cards da família no mapa: online ou offline, distância
 * até você e situação em relação à casa.
 */

import { distanciaEmMetros } from './buscarFamiliares';
import { descreverEstouBem } from './estouBem';
import { calcularEstadoCasa } from './lugares';

/*
 * Presença e distância dos familiares (cards do mapa).
 * Online/Offline vem de familiares/{uid}.atualizadoEm: com o app
 * aberto, a localização é gravada pelo menos a cada 5 min
 * (compartilharLocalizacao), então até 10 min = Online.
 * O campo "online" dos documentos não é usado.
 */
export const LIMITE_ONLINE = 10 * 60 * 1000;

export function statusPresenca(atualizadoEm, agora) {
  if (atualizadoEm === null || atualizadoEm === undefined) {
    return { online: false, visto: 'Sem atualização recente' };
  }

  const decorrido = Math.max(0, agora - atualizadoEm);
  const minutos = Math.floor(decorrido / 60000);
  const online = decorrido <= LIMITE_ONLINE;

  let visto;

  if (minutos < 1) visto = 'Atualizado agora';
  else if (minutos < 60) visto = `Visto há ${minutos} min`;
  else if (minutos < 24 * 60) visto = `Visto há ${Math.floor(minutos / 60)} h`;
  else visto = `Visto há ${Math.floor(minutos / (24 * 60))} d`;

  return { online, visto };
}

// 350 m · 1,2 km · 15,4 km
export function formatarDistancia(metros) {
  if (typeof metros !== 'number' || !Number.isFinite(metros)) return null;

  const arredondado = Math.round(metros);

  if (arredondado < 1000) {
    return `${arredondado} m`;
  }

  return `${(metros / 1000).toFixed(1).replace('.', ',')} km`;
}

// "Em casa" / "750 m de casa" a partir dos derivados publicados pelo
// próprio familiar (emCasa, distanciaCasa). Sem eles: nada.
export function descreverCasa({ emCasa, distanciaCasa }) {
  if (emCasa === true) return 'Em casa';
  if (typeof distanciaCasa === 'number') return `${formatarDistancia(distanciaCasa)} de casa`;
  return null;
}

/*
 * Linha da casa no MEU card: calculada aqui com a minha casa (privada,
 * lida só por mim). minhaCasa: undefined = carregando; null = não cadastrada.
 */
function minhaLinhaCasa(marcador, minhaCasa) {
  if (minhaCasa === null) return 'Casa não cadastrada';

  // O que a família já vê (publicado pelo watcher) tem prioridade.
  const publicado = descreverCasa(marcador);
  if (publicado || minhaCasa === undefined) return publicado;

  const estado = calcularEstadoCasa({ posicao: marcador, precisao: null, casa: minhaCasa, estavaEmCasa: false });

  return estado ? descreverCasa(estado) : null;
}

/*
 * Um card por membro ativo: quem tem marcador (com localização) e
 * quem ainda não tem. A distância é calculada na hora entre a minha
 * posição e a última posição conhecida do familiar; nada é gravado.
 *
 * marcadores / semLocalizacao: resultado de montarMarcadores
 * perfis: { uid: perfil } de buscarPerfisDosMembros (traz a foto)
 * minhaPosicao: { latitude, longitude } ou null
 */
// membros: registros da família (estouBemEm = último "Estou bem").
export function montarCardsFamiliares({ marcadores, semLocalizacao, perfis, membros, minhaPosicao, minhaCasa, agora }) {
  const fotoDe = (uid) => perfis?.[uid]?.foto || null;
  const estouBemDe = (uid) =>
    descreverEstouBem((membros || []).find((membro) => (membro.uid || membro.id) === uid)?.estouBemEm, agora);

  const comLocalizacao = marcadores.map((marcador) => {
    const { online, visto } = statusPresenca(marcador.atualizadoEm, agora);
    const distancia =
      !marcador.voce && minhaPosicao
        ? formatarDistancia(distanciaEmMetros(minhaPosicao, marcador))
        : null;

    return {
      uid: marcador.uid,
      nome: marcador.nome,
      voce: marcador.voce,
      foto: fotoDe(marcador.uid),
      temLocalizacao: true,
      online,
      visto,
      distancia,
      rua: marcador.rua || null,
      casa: marcador.voce ? minhaLinhaCasa(marcador, minhaCasa) : descreverCasa(marcador),
      estouBem: estouBemDe(marcador.uid),
    };
  });

  const semPosicao = semLocalizacao.map((pessoa) => ({
    uid: pessoa.uid,
    nome: pessoa.nome,
    voce: pessoa.voce,
    foto: fotoDe(pessoa.uid),
    temLocalizacao: false,
    online: false,
    visto: pessoa.motivo === 'invalida' ? 'Localização inválida' : 'Localização indisponível',
    distancia: null,
    rua: null,
    casa: pessoa.voce && minhaCasa === null ? 'Casa não cadastrada' : null,
    estouBem: estouBemDe(pessoa.uid),
  }));

  // Você primeiro; depois quem está online; depois os demais.
  return [...comLocalizacao, ...semPosicao].sort((a, b) => {
    if (a.voce !== b.voce) return a.voce ? -1 : 1;
    if (a.online !== b.online) return a.online ? -1 : 1;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
}
