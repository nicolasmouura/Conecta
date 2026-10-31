/*
 * Testes do botão "← Voltar" (BotaoVoltar.js).
 */

import { BackHandler } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import BotaoVoltar from './BotaoVoltar';

let ouvintes;

beforeEach(() => {
  ouvintes = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_evento, ouvinte) => {
    ouvintes.push(ouvinte);
    return { remove: jest.fn() };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('BotaoVoltar', () => {
  it('mostra o destino e volta ao tocar', async () => {
    const onPress = jest.fn();

    await render(<BotaoVoltar label="Configurações" onPress={onPress} />);

    expect(screen.getByText('Configurações')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar para Configurações' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('o voltar do Android faz o mesmo', async () => {
    const onPress = jest.fn();

    await render(<BotaoVoltar label="Configurações" onPress={onPress} />);
    ouvintes.at(-1)();

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('desabilitado: nem o toque nem o voltar do Android voltam', async () => {
    const onPress = jest.fn();

    await render(<BotaoVoltar label="Configurações" onPress={onPress} desabilitado />);

    const botao = screen.getByRole('button', { name: 'Voltar para Configurações' });
    expect(botao).toBeDisabled();
    await fireEvent.press(botao);
    expect(ouvintes.at(-1)()).toBe(true);
    expect(onPress).not.toHaveBeenCalled();
  });
});
