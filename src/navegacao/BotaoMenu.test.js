/*
 * Testes do botão "‹ Menu" e do espaço no topo (BotaoMenu.js).
 */

import { fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BotaoMenu, { useEspacoTopo } from './BotaoMenu';

afterEach(() => {
  useSafeAreaInsets.mockReturnValue?.({ top: 0, bottom: 0, left: 0, right: 0 });
});

function comTopo(top) {
  jest.spyOn(require('react-native-safe-area-context'), 'useSafeAreaInsets').mockReturnValue({
    top,
    bottom: 0,
    left: 0,
    right: 0,
  });
}

describe('BotaoMenu', () => {
  it('volta ao menu ao tocar', async () => {
    const onPress = jest.fn();

    await render(<BotaoMenu onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar ao menu' }));

    expect(screen.getByText('‹ Menu')).toBeOnTheScreen();
    expect(onPress).toHaveBeenCalled();
  });

  it('fica abaixo do notch', async () => {
    comTopo(59);

    await render(<BotaoMenu onPress={jest.fn()} />);

    expect(screen.getByRole('button')).toHaveStyle({ top: 67 });
  });

  it('nunca fica colado no topo', async () => {
    comTopo(0);

    await render(<BotaoMenu onPress={jest.fn()} />);

    expect(screen.getByRole('button')).toHaveStyle({ top: 50 });
  });
});

describe('useEspacoTopo', () => {
  it('deixa espaço para o botão', async () => {
    comTopo(0);

    const { result } = await renderHook(() => useEspacoTopo());

    // 50 (topo) + 37 (botão) + 12 (espaço).
    expect(result.current).toBe(99);
  });

  it('acompanha o notch e respeita o mínimo da tela', async () => {
    comTopo(59);

    expect((await renderHook(() => useEspacoTopo())).result.current).toBe(116);
    expect((await renderHook(() => useEspacoTopo(200))).result.current).toBe(200);
  });
});
