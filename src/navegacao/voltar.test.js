/*
 * Testes do botão voltar do Android (voltar.js).
 */

import { BackHandler } from 'react-native';
import { renderHook } from '@testing-library/react-native';

import { useVoltarAndroid } from './voltar';

let ouvintes;

beforeEach(() => {
  ouvintes = [];

  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_evento, ouvinte) => {
    ouvintes.push(ouvinte);
    return { remove: jest.fn(() => (ouvintes = ouvintes.filter((item) => item !== ouvinte))) };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// O BackHandler chama primeiro o último registrado.
const apertarVoltar = () => ouvintes.at(-1)?.();

describe('useVoltarAndroid', () => {
  it('ativo: o voltar chama onVoltar e não fecha o app', async () => {
    const onVoltar = jest.fn();

    await renderHook(() => useVoltarAndroid(true, onVoltar));

    expect(apertarVoltar()).toBe(true);
    expect(onVoltar).toHaveBeenCalledTimes(1);
  });

  it('inativo: não registra nada', async () => {
    await renderHook(() => useVoltarAndroid(false, jest.fn()));

    expect(ouvintes).toHaveLength(0);
  });

  it('usa sempre o onVoltar mais recente, sem registrar de novo', async () => {
    const primeiro = jest.fn();
    const segundo = jest.fn();

    const { rerender } = await renderHook(({ onVoltar }) => useVoltarAndroid(true, onVoltar), {
      initialProps: { onVoltar: primeiro },
    });
    await rerender({ onVoltar: segundo });

    apertarVoltar();

    expect(segundo).toHaveBeenCalled();
    expect(primeiro).not.toHaveBeenCalled();
    expect(BackHandler.addEventListener).toHaveBeenCalledTimes(1);
  });

  it('remove o registro ao desativar e ao desmontar', async () => {
    const { rerender, unmount } = await renderHook(({ ativo }) => useVoltarAndroid(ativo, jest.fn()), {
      initialProps: { ativo: true },
    });

    await rerender({ ativo: false });
    expect(ouvintes).toHaveLength(0);

    await rerender({ ativo: true });
    expect(ouvintes).toHaveLength(1);

    await unmount();
    expect(ouvintes).toHaveLength(0);
  });

  it('consome o voltar mesmo sem onVoltar', async () => {
    await renderHook(() => useVoltarAndroid(true, undefined));

    expect(apertarVoltar()).toBe(true);
  });
});
