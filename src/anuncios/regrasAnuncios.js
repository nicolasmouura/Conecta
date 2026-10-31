/*
 * Regras dos anúncios: em quais telas aparecem, quando o intersticial
 * pode ser mostrado, os IDs do AdMob e a configuração que muda pelo
 * console do Firebase (configuracoes/anuncios), sem versão nova do app.
 * As regras são funções puras, como o canShowInterstitial da aula.
 */

import { doc, onSnapshot } from 'firebase/firestore';

import { db } from '../config/firebase';
import { observarComCopiaLocal } from '../dados/armazenamentoLocal';

/*
 * IDs de TESTE públicos do Google (developers.google.com/admob): mostram
 * anúncios marcados como "Test Ad", sem cobrança e sem risco de bloqueio
 * da conta. Para publicar, troque pelos IDs da conta AdMob do Conecta
 * aqui e em app.json (plugin react-native-google-mobile-ads).
 */
export const IDS_ANUNCIOS = {
  android: {
    banner: 'ca-app-pub-3940256099942544/9214589741',
    intersticial: 'ca-app-pub-3940256099942544/1033173712',
  },
  ios: {
    banner: 'ca-app-pub-3940256099942544/2435281174',
    intersticial: 'ca-app-pub-3940256099942544/4411468910',
  },
};

// Telas com banner. Nunca no SOS, no login, na biometria nem no perfil
// (dados da conta, câmera, excluir conta).
export const TELAS_COM_BANNER = ['menu', 'historico'];

// Saindo destas telas, nunca há intersticial: emergência e conta.
export const TELAS_SEM_INTERSTICIAL = ['sos', 'perfil'];

// No máximo 1 intersticial a cada 2 min, e só depois de 3 telas abertas.
export const INTERVALO_INTERSTICIAL = 2 * 60 * 1000;
export const TELAS_ENTRE_INTERSTICIAIS = 3;

export function idDoAnuncio(tipo, plataforma) {
  return IDS_ANUNCIOS[plataforma === 'ios' ? 'ios' : 'android'][tipo];
}

// config (opcional): a de montarConfigAnuncios; banner desligado = sem banner.
export function telaTemBanner(tela, config) {
  return TELAS_COM_BANNER.includes(tela) && (!config || (config.anunciosLigados && config.banner));
}

/*
 * Pode mostrar o intersticial ao voltar de "telaDeOrigem" para o Menu?
 *   mostrarAnuncios  anúncios ligados
 *   carregado        o anúncio já está pronto (não espera carregar)
 *   agora / ultimaExibicao (ms) e intervalo
 *   telasAbertas     telas abertas desde o último intersticial
 */
export function podeMostrarIntersticial({
  mostrarAnuncios,
  carregado,
  agora,
  ultimaExibicao,
  intervalo = INTERVALO_INTERSTICIAL,
  telasAbertas,
  minimoTelas = TELAS_ENTRE_INTERSTICIAIS,
  telaDeOrigem,
}) {
  return (
    Boolean(mostrarAnuncios) &&
    Boolean(carregado) &&
    !TELAS_SEM_INTERSTICIAL.includes(telaDeOrigem) &&
    agora - ultimaExibicao >= intervalo &&
    telasAbertas >= minimoTelas
  );
}

/*
 * Configuração remota: documento configuracoes/anuncios, editado só pelo
 * console do Firebase (firestore.rules). Campos gerais e, se quiser, um
 * bloco "android" ou "ios" que os sobrepõe naquele sistema:
 *
 *   anunciosLigados, banner, intersticial      true | false
 *   intervaloMinutos                           0 a 1440
 *   telasAntesDoIntersticial                   0 a 50
 *   idBanner, idIntersticial                   ca-app-pub-.../...
 *
 * Campo ausente ou com valor inválido usa o padrão (o que está acima).
 * As telas sem anúncio (SOS, perfil, login) não mudam por aqui.
 */
const LIMITES = {
  intervaloMinutos: [0, 24 * 60],
  telasAntesDoIntersticial: [0, 50],
};

const ID_BLOCO = /^ca-app-pub-[0-9]+\/[0-9]+$/;

export function configPadrao(plataforma) {
  return {
    anunciosLigados: true,
    banner: true,
    intersticial: true,
    intervalo: INTERVALO_INTERSTICIAL,
    telasAntesDoIntersticial: TELAS_ENTRE_INTERSTICIAIS,
    idBanner: idDoAnuncio('banner', plataforma),
    idIntersticial: idDoAnuncio('intersticial', plataforma),
  };
}

export function montarConfigAnuncios(documento, plataforma) {
  const padrao = configPadrao(plataforma);
  const geral = documento && typeof documento === 'object' ? documento : {};
  const doSistema = geral[plataforma === 'ios' ? 'ios' : 'android'];
  const dados = { ...geral, ...(doSistema && typeof doSistema === 'object' ? doSistema : {}) };

  const ligado = (campo) => (typeof dados[campo] === 'boolean' ? dados[campo] : padrao[campo]);

  const numero = (campo) => {
    const [minimo, maximo] = LIMITES[campo];
    const valor = dados[campo];

    return typeof valor === 'number' && Number.isFinite(valor) && valor >= minimo && valor <= maximo
      ? valor
      : null;
  };

  const id = (campo) => (typeof dados[campo] === 'string' && ID_BLOCO.test(dados[campo]) ? dados[campo] : padrao[campo]);

  const minutos = numero('intervaloMinutos');
  const telas = numero('telasAntesDoIntersticial');

  return {
    anunciosLigados: ligado('anunciosLigados'),
    banner: ligado('banner'),
    intersticial: ligado('intersticial'),
    intervalo: minutos === null ? padrao.intervalo : minutos * 60 * 1000,
    telasAntesDoIntersticial: telas === null ? padrao.telasAntesDoIntersticial : Math.floor(telas),
    idBanner: id('idBanner'),
    idIntersticial: id('idIntersticial'),
  };
}

// Ouve a configuração; sem internet vale a última recebida (cópia local).
export function observarConfigAnuncios(plataforma, callback) {
  return observarComCopiaLocal(
    'config:anuncios',
    (aoReceber, falhou) =>
      onSnapshot(
        doc(db, 'configuracoes', 'anuncios'),
        (documento) => aoReceber(documento.exists() ? documento.data() : null, !documento.metadata.fromCache),
        falhou
      ),
    (dados) => callback(montarConfigAnuncios(dados, plataforma)),
    (erro) => console.log('Configuração dos anúncios indisponível:', erro.code || erro.message)
  );
}
