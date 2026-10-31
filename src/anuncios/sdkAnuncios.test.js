/*
 * Testes do carregamento do AdMob (sdkAnuncios.js): só com o módulo
 * nativo (build próprio); no Expo Go, nada é carregado.
 */

let sdkAnuncios;
let AdMob;

// Recarrega o módulo com (ou sem) o código nativo do AdMob no app.
function carregar({ nativo }) {
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({
      TurboModuleRegistry: {
        get: (nome) => (nativo && nome === 'RNGoogleMobileAdsModule' ? {} : null),
      },
    }));

    sdkAnuncios = require('./sdkAnuncios');
    // Primeiro carregamento aqui dentro: o módulo guarda esta cópia.
    AdMob = sdkAnuncios.carregarSDK();
  });
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('no Expo Go (sem o módulo nativo)', () => {
  beforeEach(() => carregar({ nativo: false }));

  it('não carrega o AdMob', () => {
    expect(sdkAnuncios.carregarSDK()).toBeNull();
    expect(sdkAnuncios.temAdMob()).toBe(false);
  });

  it('iniciar não faz nada', async () => {
    await expect(sdkAnuncios.iniciarAnuncios()).resolves.toBe(false);
  });
});

describe('num build próprio (com o módulo nativo)', () => {
  beforeEach(() => carregar({ nativo: true }));

  it('carrega o AdMob uma vez', () => {
    expect(AdMob.BannerAd).toEqual(expect.any(Function));
    expect(sdkAnuncios.carregarSDK()).toBe(AdMob);
    expect(sdkAnuncios.temAdMob()).toBe(true);
  });

  it('inicia uma vez, com conteúdo para todas as idades', async () => {
    await expect(sdkAnuncios.iniciarAnuncios()).resolves.toBe(true);
    await sdkAnuncios.iniciarAnuncios();

    expect(AdMob.__instancia.setRequestConfiguration).toHaveBeenCalledWith({ maxAdContentRating: 'G' });
    expect(AdMob.__instancia.initialize).toHaveBeenCalledTimes(1);
  });

  it('se a inicialização falhar, tenta de novo na próxima vez', async () => {
    AdMob.__instancia.initialize.mockRejectedValueOnce(new Error('sem rede'));

    await expect(sdkAnuncios.iniciarAnuncios()).resolves.toBe(false);
    await expect(sdkAnuncios.iniciarAnuncios()).resolves.toBe(true);
  });

  it('só pede anúncios não personalizados', () => {
    expect(sdkAnuncios.OPCOES_PEDIDO).toEqual({ requestNonPersonalizedAdsOnly: true });
  });
});
