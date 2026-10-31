/*
 * Testes do anúncio intersticial (Intersticial.js): simulado no Expo Go,
 * real (AdMob) num build próprio, sempre com as regras de regrasAnuncios.
 */

import { Platform } from 'react-native';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';

import { IntersticialSimulado, useIntersticial } from './Intersticial';
import { carregarSDK, iniciarAnuncios } from './sdkAnuncios';
import {
  configPadrao,
  idDoAnuncio,
  INTERVALO_INTERSTICIAL,
  TELAS_ENTRE_INTERSTICIAIS,
} from './regrasAnuncios';

jest.mock('./sdkAnuncios', () => ({
  carregarSDK: jest.fn(),
  iniciarAnuncios: jest.fn(),
  OPCOES_PEDIDO: { requestNonPersonalizedAdsOnly: true },
}));

const AdMob = require('react-native-google-mobile-ads');

let agora;

beforeEach(() => {
  agora = 10 * INTERVALO_INTERSTICIAL;
  jest.spyOn(Date, 'now').mockImplementation(() => agora);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  iniciarAnuncios.mockResolvedValue(true);
  AdMob.__intersticiais.length = 0;
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// Abre as telas necessárias pelo Menu.
function abrirTelas(resultado, quantidade = TELAS_ENTRE_INTERSTICIAIS) {
  for (let i = 0; i < quantidade; i++) resultado.current.registrarTela();
}

// Hook + o elemento que ele devolve (o App renderiza o elemento).
function Tela({ onPronto }) {
  const intersticial = useIntersticial();
  onPronto(intersticial);
  return intersticial.elemento;
}

describe('IntersticialSimulado', () => {
  it('tela cheia de anúncio de teste com botão de fechar', async () => {
    const onFechar = jest.fn();

    await render(<IntersticialSimulado visivel onFechar={onFechar} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Fechar anúncio' }));

    expect(screen.getByText('Anúncio de teste')).toBeOnTheScreen();
    expect(onFechar).toHaveBeenCalled();
  });

  it('escondido não mostra nada', async () => {
    await render(<IntersticialSimulado visivel={false} onFechar={jest.fn()} />);

    expect(screen.queryByText('Anúncio de teste')).toBeNull();
  });
});

describe('useIntersticial no Expo Go (simulado)', () => {
  beforeEach(() => carregarSDK.mockReturnValue(null));

  it('depois de abrir 3 telas, mostra ao voltar ao Menu; fechar esconde', async () => {
    let intersticial;
    await render(<Tela onPronto={(valor) => (intersticial = valor)} />);

    abrirTelas({ current: intersticial });
    let mostrou;
    await act(() => {
      mostrou = intersticial.mostrarSePuder('mapa');
    });

    expect(mostrou).toBe(true);
    expect(screen.getByText('Anúncio de teste')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Fechar anúncio' }));
    expect(screen.queryByText('Anúncio de teste')).toBeNull();
  });

  it('não mostra antes de 3 telas', async () => {
    const { result } = await renderHook(() => useIntersticial());

    abrirTelas(result, TELAS_ENTRE_INTERSTICIAIS - 1);

    expect(result.current.mostrarSePuder('mapa')).toBe(false);
  });

  it('nunca saindo do SOS', async () => {
    const { result } = await renderHook(() => useIntersticial());

    abrirTelas(result, 10);

    expect(result.current.mostrarSePuder('sos')).toBe(false);
  });

  it('depois de mostrar, espera o intervalo e mais 3 telas', async () => {
    const { result } = await renderHook(() => useIntersticial());
    abrirTelas(result);
    await act(() => result.current.mostrarSePuder('mapa'));

    // Passou o intervalo, mas nenhuma tela foi aberta.
    agora += INTERVALO_INTERSTICIAL;
    expect(result.current.mostrarSePuder('historico')).toBe(false);

    // 3 telas, mas logo depois de mostrar (o intervalo conta de novo).
    agora -= 1;
    abrirTelas(result);
    expect(result.current.mostrarSePuder('historico')).toBe(false);

    agora += 1;
    await act(async () => {
      expect(result.current.mostrarSePuder('historico')).toBe(true);
    });
  });

  it('segue a configuração remota: desligado, intervalo e telas', async () => {
    const padrao = configPadrao('android');

    const desligado = await renderHook(() => useIntersticial({ ...padrao, intersticial: false }));
    abrirTelas(desligado.result, 10);
    expect(desligado.result.current.mostrarSePuder('mapa')).toBe(false);

    const semAnuncios = await renderHook(() => useIntersticial({ ...padrao, anunciosLigados: false }));
    abrirTelas(semAnuncios.result, 10);
    expect(semAnuncios.result.current.mostrarSePuder('mapa')).toBe(false);

    const umaTela = await renderHook(() =>
      useIntersticial({ ...padrao, intervalo: 0, telasAntesDoIntersticial: 1 })
    );
    abrirTelas(umaTela.result, 1);
    await act(async () => {
      expect(umaTela.result.current.mostrarSePuder('mapa')).toBe(true);
    });
  });

  it('não cria anúncio do AdMob', async () => {
    await renderHook(() => useIntersticial());

    expect(AdMob.InterstitialAd.createForAdRequest).not.toHaveBeenCalled();
  });
});

describe('useIntersticial num build próprio (AdMob)', () => {
  beforeEach(() => carregarSDK.mockReturnValue(AdMob));

  async function iniciar() {
    const resultado = await renderHook(() => useIntersticial());
    await act(() => esperar());
    return { ...resultado, anuncio: AdMob.__intersticiais.at(-1) };
  }

  it('cria e carrega o anúncio não personalizado', async () => {
    const { anuncio } = await iniciar();

    expect(AdMob.InterstitialAd.createForAdRequest).toHaveBeenCalledWith(idDoAnuncio('intersticial', Platform.OS), {
      requestNonPersonalizedAdsOnly: true,
    });
    expect(anuncio.load).toHaveBeenCalled();
  });

  it('só mostra depois de carregado', async () => {
    const { result, anuncio } = await iniciar();
    abrirTelas(result);

    expect(result.current.mostrarSePuder('mapa')).toBe(false);

    await act(() => anuncio.__emitir('loaded'));
    expect(result.current.mostrarSePuder('mapa')).toBe(true);
    expect(anuncio.show).toHaveBeenCalled();
  });

  it('usa o ID do bloco da configuração e troca o anúncio se ele mudar', async () => {
    const padrao = configPadrao('android');
    const { rerender } = await renderHook(({ config }) => useIntersticial(config), {
      initialProps: { config: { ...padrao, idIntersticial: 'ca-app-pub-1/1' } },
    });
    await act(() => esperar());
    const primeiro = AdMob.__intersticiais.at(-1);

    await rerender({ config: { ...padrao, idIntersticial: 'ca-app-pub-2/2' } });
    await act(() => esperar());

    expect(primeiro.unitId).toBe('ca-app-pub-1/1');
    expect(primeiro.destroy).toHaveBeenCalled();
    expect(AdMob.__intersticiais.at(-1).unitId).toBe('ca-app-pub-2/2');
  });

  it('com o ID trocado, só mostra depois que o anúncio novo carregar', async () => {
    const padrao = configPadrao('android');
    const { result, rerender } = await renderHook(({ config }) => useIntersticial(config), {
      initialProps: { config: { ...padrao, idIntersticial: 'ca-app-pub-1/1' } },
    });
    await act(() => esperar());
    await act(() => AdMob.__intersticiais.at(-1).__emitir('loaded'));

    await rerender({ config: { ...padrao, idIntersticial: 'ca-app-pub-2/2' } });
    await act(() => esperar());
    abrirTelas(result);

    expect(result.current.mostrarSePuder('mapa')).toBe(false);

    await act(() => AdMob.__intersticiais.at(-1).__emitir('loaded'));
    await act(async () => {
      expect(result.current.mostrarSePuder('mapa')).toBe(true);
    });
  });

  it.each([
    ['antes do login', (padrao) => [padrao, false]],
    ['intersticial desligado no console', (padrao) => [{ ...padrao, intersticial: false }, true]],
    ['anúncios desligados no console', (padrao) => [{ ...padrao, anunciosLigados: false }, true]],
  ])('%s: nem pede anúncio ao AdMob', async (_caso, argumentos) => {
    const [config, ativo] = argumentos(configPadrao('android'));

    await renderHook(() => useIntersticial(config, ativo));
    await act(() => esperar());

    expect(AdMob.InterstitialAd.createForAdRequest).not.toHaveBeenCalled();
  });

  it('se o anúncio não aparecer, a espera não conta e ele carrega de novo', async () => {
    const { result, anuncio } = await iniciar();
    await act(() => anuncio.__emitir('loaded'));
    abrirTelas(result);
    anuncio.show.mockRejectedValueOnce(new Error('expirou'));
    anuncio.load.mockClear();

    await act(async () => {
      expect(result.current.mostrarSePuder('mapa')).toBe(true);
      await esperar();
    });

    expect(anuncio.load).toHaveBeenCalled();

    // Carregou de novo: pode mostrar já, sem esperar 2 min nem abrir 3 telas.
    await act(() => anuncio.__emitir('loaded'));
    await act(async () => {
      expect(result.current.mostrarSePuder('mapa')).toBe(true);
    });
  });

  it('depois de mostrado, só mostra de novo quando outro carregar', async () => {
    const { result, anuncio } = await iniciar();
    await act(() => anuncio.__emitir('loaded'));
    abrirTelas(result);

    await act(async () => {
      expect(result.current.mostrarSePuder('mapa')).toBe(true);
    });

    agora += INTERVALO_INTERSTICIAL;
    abrirTelas(result);
    expect(result.current.mostrarSePuder('mapa')).toBe(false);
  });

  it('ao fechar, carrega o próximo', async () => {
    const { anuncio } = await iniciar();
    anuncio.load.mockClear();

    await act(() => anuncio.__emitir('closed'));

    expect(anuncio.load).toHaveBeenCalled();
  });

  it('erro ao carregar: tenta de novo depois de 1 min', async () => {
    const { anuncio } = await iniciar();
    jest.useFakeTimers();
    anuncio.load.mockClear();

    await act(() => anuncio.__emitir('error', { code: 'no-fill' }));
    expect(anuncio.load).not.toHaveBeenCalled();

    await act(() => jest.advanceTimersByTime(60 * 1000));
    expect(anuncio.load).toHaveBeenCalled();
  });

  it('se o AdMob não iniciar, não carrega', async () => {
    iniciarAnuncios.mockResolvedValue(false);

    const { anuncio } = await iniciar();

    expect(anuncio.load).not.toHaveBeenCalled();
  });

  it('ao sair, para de ouvir e libera o anúncio', async () => {
    const { anuncio, unmount } = await iniciar();

    await unmount();

    expect(anuncio.__ouvindo('loaded')).toBe(false);
    expect(anuncio.destroy).toHaveBeenCalled();
  });

  it('show recusado não quebra o app', async () => {
    const { result, anuncio } = await iniciar();
    anuncio.show.mockRejectedValueOnce(new Error('já mostrado'));
    await act(() => anuncio.__emitir('loaded'));
    abrirTelas(result);

    await act(async () => {
      expect(result.current.mostrarSePuder('mapa')).toBe(true);
    });
  });
});
