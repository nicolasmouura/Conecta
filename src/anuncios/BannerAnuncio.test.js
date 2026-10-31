/*
 * Testes do banner de anúncio (BannerAnuncio.js): simulado no Expo Go,
 * real (AdMob) num build próprio.
 */

import { Platform } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';

import BannerAnuncio from './BannerAnuncio';
import { carregarSDK } from './sdkAnuncios';
import { idDoAnuncio } from './regrasAnuncios';

jest.mock('./sdkAnuncios', () => ({
  carregarSDK: jest.fn(),
  OPCOES_PEDIDO: { requestNonPersonalizedAdsOnly: true },
}));

const AdMob = require('react-native-google-mobile-ads');

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('BannerAnuncio', () => {
  it('no Expo Go mostra o banner simulado', async () => {
    carregarSDK.mockReturnValue(null);

    await render(<BannerAnuncio />);

    expect(screen.getByTestId('banner-simulado')).toBeOnTheScreen();
    expect(screen.getByText('Anúncio de teste')).toBeOnTheScreen();
    expect(screen.queryByTestId('banner-admob')).toBeNull();
  });

  it('num build próprio mostra o banner do AdMob, não personalizado', async () => {
    carregarSDK.mockReturnValue(AdMob);

    await render(<BannerAnuncio />);

    const banner = screen.getByTestId('banner-admob');
    expect(banner).toHaveProp('unitId', idDoAnuncio('banner', Platform.OS));
    expect(banner).toHaveProp('size', 'ANCHORED_ADAPTIVE_BANNER');
    expect(banner).toHaveProp('requestOptions', { requestNonPersonalizedAdsOnly: true });
    expect(screen.queryByTestId('banner-simulado')).toBeNull();
  });

  it('usa o ID do bloco da configuração remota', async () => {
    carregarSDK.mockReturnValue(AdMob);

    await render(<BannerAnuncio unitId="ca-app-pub-123/456" />);

    expect(screen.getByTestId('banner-admob')).toHaveProp('unitId', 'ca-app-pub-123/456');
  });

  it('sem anúncio para mostrar, o espaço some', async () => {
    carregarSDK.mockReturnValue(AdMob);
    await render(<BannerAnuncio />);

    await act(() => screen.getByTestId('banner-admob').props.onAdFailedToLoad({ code: 'no-fill' }));

    expect(screen.toJSON()).toBeNull();
  });
});
