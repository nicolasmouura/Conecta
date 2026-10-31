/*
 * SDK do AdMob (react-native-google-mobile-ads), carregado só quando o
 * app tem o módulo nativo dele: num build próprio (EAS) sim; no Expo Go
 * não, e aí as telas mostram anúncios simulados.
 */

import { TurboModuleRegistry } from 'react-native';

let sdk;
let iniciado = null;

/*
 * O módulo do AdMob já acessa o código nativo ao ser importado: no Expo
 * Go isso quebraria o app. Por isso ele só é carregado (require) depois
 * de conferir que o módulo nativo existe. null = sem AdMob.
 */
export function carregarSDK() {
  if (sdk !== undefined) return sdk;

  sdk = null;

  if (TurboModuleRegistry.get('RNGoogleMobileAdsModule')) {
    try {
      sdk = require('react-native-google-mobile-ads');
    } catch (erro) {
      console.log('AdMob indisponível:', erro.message);
    }
  }

  return sdk;
}

export function temAdMob() {
  return carregarSDK() !== null;
}

/*
 * Liga o AdMob uma vez. Conteúdo livre para todas as idades (o app é de
 * família) e só anúncios NÃO personalizados: sem rastreamento entre apps
 * (dispensa o pedido de rastreamento do iPhone).
 */
export function iniciarAnuncios() {
  const AdMob = carregarSDK();

  if (!AdMob) return Promise.resolve(false);

  if (!iniciado) {
    const mobileAds = AdMob.default;

    iniciado = mobileAds()
      .setRequestConfiguration({ maxAdContentRating: AdMob.MaxAdContentRating.G })
      .then(() => mobileAds().initialize())
      .then(() => true)
      .catch((erro) => {
        console.log('AdMob não iniciado:', erro.message);
        iniciado = null;
        return false;
      });
  }

  return iniciado;
}

// Pedido de anúncio de todo o app (banner e intersticial).
export const OPCOES_PEDIDO = { requestNonPersonalizedAdsOnly: true };
