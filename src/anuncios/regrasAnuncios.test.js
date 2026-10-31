/*
 * Testes das regras dos anúncios (regrasAnuncios.js).
 */

const {
  IDS_ANUNCIOS,
  INTERVALO_INTERSTICIAL,
  TELAS_ENTRE_INTERSTICIAIS,
  configPadrao,
  idDoAnuncio,
  montarConfigAnuncios,
  observarConfigAnuncios,
  podeMostrarIntersticial,
  telaTemBanner,
} = require('./regrasAnuncios');

const firestore = require('firebase/firestore');
const { apagarDadosLocais } = require('../dados/armazenamentoLocal');

const PODE = {
  mostrarAnuncios: true,
  carregado: true,
  agora: INTERVALO_INTERSTICIAL,
  ultimaExibicao: 0,
  telasAbertas: TELAS_ENTRE_INTERSTICIAIS,
  telaDeOrigem: 'mapa',
};

describe('idDoAnuncio', () => {
  it('usa os IDs de teste do Google em cada sistema', () => {
    expect(idDoAnuncio('banner', 'android')).toBe('ca-app-pub-3940256099942544/9214589741');
    expect(idDoAnuncio('intersticial', 'ios')).toBe('ca-app-pub-3940256099942544/4411468910');
  });

  it('outros sistemas usam os IDs do Android', () => {
    expect(idDoAnuncio('banner', 'web')).toBe(IDS_ANUNCIOS.android.banner);
  });

  it('todos os IDs são da conta de teste do Google', () => {
    const ids = Object.values(IDS_ANUNCIOS).flatMap((tipos) => Object.values(tipos));

    expect(ids.every((id) => id.startsWith('ca-app-pub-3940256099942544/'))).toBe(true);
  });
});

describe('telaTemBanner', () => {
  it.each(['menu', 'historico'])('%s tem banner', (tela) => {
    expect(telaTemBanner(tela)).toBe(true);
  });

  it.each(['sos', 'perfil', 'mapa', 'familia'])('%s não tem banner', (tela) => {
    expect(telaTemBanner(tela)).toBe(false);
  });

  it('banner ou anúncios desligados na configuração: sem banner', () => {
    const config = configPadrao('android');

    expect(telaTemBanner('menu', config)).toBe(true);
    expect(telaTemBanner('menu', { ...config, banner: false })).toBe(false);
    expect(telaTemBanner('menu', { ...config, anunciosLigados: false })).toBe(false);
    expect(telaTemBanner('sos', { ...config, banner: true })).toBe(false);
  });
});

describe('podeMostrarIntersticial', () => {
  it('mostra quando todas as condições valem', () => {
    expect(podeMostrarIntersticial(PODE)).toBe(true);
  });

  it('não mostra com anúncios desligados ou sem anúncio carregado', () => {
    expect(podeMostrarIntersticial({ ...PODE, mostrarAnuncios: false })).toBe(false);
    expect(podeMostrarIntersticial({ ...PODE, carregado: false })).toBe(false);
  });

  it('não mostra antes do intervalo', () => {
    expect(podeMostrarIntersticial({ ...PODE, agora: INTERVALO_INTERSTICIAL - 1 })).toBe(false);
  });

  it('não mostra antes de abrir telas suficientes', () => {
    expect(podeMostrarIntersticial({ ...PODE, telasAbertas: TELAS_ENTRE_INTERSTICIAIS - 1 })).toBe(false);
  });

  it.each(['sos', 'perfil'])('nunca mostra saindo de %s', (telaDeOrigem) => {
    expect(podeMostrarIntersticial({ ...PODE, telaDeOrigem })).toBe(false);
  });

  it('aceita intervalo e mínimo de telas diferentes', () => {
    expect(podeMostrarIntersticial({ ...PODE, agora: 10, intervalo: 10, telasAbertas: 1, minimoTelas: 1 })).toBe(true);
  });
});

describe('montarConfigAnuncios', () => {
  it('sem documento: os padrões do código', () => {
    expect(montarConfigAnuncios(null, 'android')).toEqual({
      anunciosLigados: true,
      banner: true,
      intersticial: true,
      intervalo: INTERVALO_INTERSTICIAL,
      telasAntesDoIntersticial: TELAS_ENTRE_INTERSTICIAIS,
      idBanner: IDS_ANUNCIOS.android.banner,
      idIntersticial: IDS_ANUNCIOS.android.intersticial,
    });
    expect(montarConfigAnuncios(undefined, 'ios').idBanner).toBe(IDS_ANUNCIOS.ios.banner);
  });

  it('usa os campos gerais', () => {
    const config = montarConfigAnuncios(
      { anunciosLigados: true, intersticial: false, intervaloMinutos: 5, telasAntesDoIntersticial: 2 },
      'android'
    );

    expect(config).toMatchObject({ intersticial: false, intervalo: 5 * 60 * 1000, telasAntesDoIntersticial: 2 });
  });

  it('o bloco do sistema sobrepõe os gerais, só nele', () => {
    const documento = {
      intervaloMinutos: 2,
      intersticial: true,
      ios: { intersticial: false, intervaloMinutos: 5 },
      android: { idBanner: 'ca-app-pub-123/456' },
    };

    expect(montarConfigAnuncios(documento, 'ios')).toMatchObject({
      intersticial: false,
      intervalo: 5 * 60 * 1000,
      idBanner: IDS_ANUNCIOS.ios.banner,
    });
    expect(montarConfigAnuncios(documento, 'android')).toMatchObject({
      intersticial: true,
      intervalo: 2 * 60 * 1000,
      idBanner: 'ca-app-pub-123/456',
    });
  });

  it.each([
    [{ banner: 'não' }, 'banner', true],
    [{ anunciosLigados: 0 }, 'anunciosLigados', true],
    [{ intervaloMinutos: -1 }, 'intervalo', INTERVALO_INTERSTICIAL],
    [{ intervaloMinutos: '5' }, 'intervalo', INTERVALO_INTERSTICIAL],
    [{ intervaloMinutos: 99999 }, 'intervalo', INTERVALO_INTERSTICIAL],
    [{ telasAntesDoIntersticial: 51 }, 'telasAntesDoIntersticial', TELAS_ENTRE_INTERSTICIAIS],
    [{ idBanner: 'ca-app-pub-123~456' }, 'idBanner', IDS_ANUNCIOS.android.banner],
    [{ idIntersticial: 'qualquer coisa' }, 'idIntersticial', IDS_ANUNCIOS.android.intersticial],
  ])('valor inválido %p usa o padrão', (documento, campo, esperado) => {
    expect(montarConfigAnuncios(documento, 'android')[campo]).toBe(esperado);
  });

  it('aceita zero (sem intervalo, sem mínimo de telas) e arredonda telas', () => {
    expect(montarConfigAnuncios({ intervaloMinutos: 0, telasAntesDoIntersticial: 2.7 }, 'android')).toMatchObject({
      intervalo: 0,
      telasAntesDoIntersticial: 2,
    });
  });

  it('bloco do sistema que não é objeto é ignorado', () => {
    expect(montarConfigAnuncios({ banner: false, ios: 'nada' }, 'ios').banner).toBe(false);
  });
});

describe('observarConfigAnuncios', () => {
  beforeEach(async () => {
    firestore.__limpar();
    await apagarDadosLocais();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('entrega a configuração do Firestore e acompanha mudanças', async () => {
    const callback = jest.fn();

    const cancelar = observarConfigAnuncios('ios', callback);
    await esperar();
    expect(callback).toHaveBeenLastCalledWith(configPadrao('ios'));

    firestore.__semear('configuracoes/anuncios', { banner: true, ios: { banner: false } });
    await esperar();
    expect(callback.mock.calls.at(-1)[0]).toMatchObject({ banner: false });

    cancelar();
  });

  it('sem internet e sem cópia: fica nos padrões (não quebra)', async () => {
    firestore.__falhar('onSnapshot', { code: 'unavailable' });
    const callback = jest.fn();

    observarConfigAnuncios('android', callback);
    await esperar();

    expect(callback).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith('Configuração dos anúncios indisponível:', 'unavailable');
  });
});
