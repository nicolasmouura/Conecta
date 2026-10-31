/*
 * Testes do aviso "Sem internet" (AvisoOffline.js).
 */

import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useNetworkState } from 'expo-network';

import AvisoOffline from './AvisoOffline';

jest.mock('expo-network', () => ({ useNetworkState: jest.fn() }));

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

const ROTULO = 'Sem internet. Toque para saber o que funciona sem conexão.';

describe('AvisoOffline', () => {
  it('não aparece com internet', async () => {
    useNetworkState.mockReturnValue({ isConnected: true, isInternetReachable: true });

    await render(<AvisoOffline />);

    expect(screen.queryByText('Sem internet')).toBeNull();
  });

  it('não aparece enquanto o estado da rede não chegou', async () => {
    useNetworkState.mockReturnValue({});

    await render(<AvisoOffline />);

    expect(screen.queryByText('Sem internet')).toBeNull();
  });

  it.each([
    ['sem conexão', { isConnected: false }],
    ['conectado mas sem internet', { isConnected: true, isInternetReachable: false }],
  ])('aparece %s e explica ao tocar', async (_caso, rede) => {
    useNetworkState.mockReturnValue(rede);

    await render(<AvisoOffline />);
    await fireEvent.press(screen.getByRole('button', { name: ROTULO }));

    expect(Alert.alert).toHaveBeenCalledWith('Você está sem internet', expect.stringContaining('SOS por SMS'));
  });

  it('a faixa do Menu mostra o detalhe', async () => {
    useNetworkState.mockReturnValue({ isConnected: false });

    await render(<AvisoOffline faixa />);

    expect(screen.getByText('Usando os dados guardados no aparelho.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: ROTULO }));
    expect(Alert.alert).toHaveBeenCalled();
  });

  it('a pílula não mostra o detalhe', async () => {
    useNetworkState.mockReturnValue({ isConnected: false });

    await render(<AvisoOffline />);

    expect(screen.queryByText('Usando os dados guardados no aparelho.')).toBeNull();
  });
});
