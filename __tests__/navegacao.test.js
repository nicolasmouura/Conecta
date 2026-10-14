/*
 * Testes do voltar do Android (useVoltarAndroid) e do BotaoVoltar.
 */

import { BackHandler, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import BotaoVoltar from '../src/navegacao/BotaoVoltar';
import { useVoltarAndroid } from '../src/navegacao/voltar';

/*
 * BackHandler do Android simulado com a mesma regra do React Native:
 * o último registrado é chamado primeiro e, se devolver true, para.
 * Sem ninguém tratar, o app "sai" (exitApp).
 */
let inscritos;
let saiu;

beforeEach(() => {
  inscritos = [];
  saiu = 0;

  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_evento, funcao) => {
    inscritos.push(funcao);

    return {
      remove: () => {
        inscritos = inscritos.filter((item) => item !== funcao);
      },
    };
  });
});

afterEach(() => jest.restoreAllMocks());

async function pressionarVoltar() {
  await act(async () => {
    for (let i = inscritos.length - 1; i >= 0; i--) {
      if (inscritos[i]()) return;
    }

    saiu++;
  });
}

function TelaComVoltar({ ativo, onVoltar }) {
  useVoltarAndroid(ativo, onVoltar);
  return <Text>tela</Text>;
}

describe('useVoltarAndroid', () => {
  test('ativo: o voltar chama onVoltar e não fecha o app', async () => {
    const onVoltar = jest.fn();
    await render(<TelaComVoltar ativo onVoltar={onVoltar} />);

    await pressionarVoltar();

    expect(onVoltar).toHaveBeenCalledTimes(1);
    expect(saiu).toBe(0);
  });

  test('inativo: não registra e o Android segue o padrão', async () => {
    await render(<TelaComVoltar ativo={false} onVoltar={jest.fn()} />);

    expect(inscritos).toHaveLength(0);
    await pressionarVoltar();
    expect(saiu).toBe(1);
  });

  test('usa sempre o onVoltar mais recente sem registrar de novo', async () => {
    const primeiro = jest.fn();
    const segundo = jest.fn();
    const { rerender } = await render(<TelaComVoltar ativo onVoltar={primeiro} />);

    await rerender(<TelaComVoltar ativo onVoltar={segundo} />);
    await pressionarVoltar();

    expect(inscritos).toHaveLength(1);
    expect(primeiro).not.toHaveBeenCalled();
    expect(segundo).toHaveBeenCalledTimes(1);
  });

  test('desmontar remove o registro', async () => {
    const { unmount } = await render(<TelaComVoltar ativo onVoltar={jest.fn()} />);

    await unmount();

    expect(inscritos).toHaveLength(0);
  });

  test('subtela aberta depois tem prioridade (fecha o nível mais interno)', async () => {
    const irMenu = jest.fn();
    const fecharSubtela = jest.fn();

    await render(<TelaComVoltar ativo onVoltar={irMenu} />);
    const subtela = await render(<BotaoVoltar label="Configurações" onPress={fecharSubtela} />);

    await pressionarVoltar();
    expect(fecharSubtela).toHaveBeenCalledTimes(1);
    expect(irMenu).not.toHaveBeenCalled();

    await subtela.unmount();
    await pressionarVoltar();
    expect(irMenu).toHaveBeenCalledTimes(1);
  });
});

describe('BotaoVoltar', () => {
  test('toque e voltar do Android fazem a mesma coisa', async () => {
    const onPress = jest.fn();
    await render(<BotaoVoltar label="Configurações" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar para Configurações' }));
    await pressionarVoltar();

    expect(onPress).toHaveBeenCalledTimes(2);
  });

  test('desabilitado (salvando): nada acontece e o app não fecha', async () => {
    const onPress = jest.fn();
    await render(<BotaoVoltar label="Configurações" onPress={onPress} desabilitado />);

    await fireEvent.press(screen.getByRole('button'));
    await pressionarVoltar();

    expect(onPress).not.toHaveBeenCalled();
    expect(saiu).toBe(0);
  });

  test('mostra o rótulo e é acessível', async () => {
    await render(<BotaoVoltar label="Configurações" onPress={jest.fn()} />);

    expect(screen.getByText('Configurações')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Voltar para Configurações' })).toBeTruthy();
  });
});
