/*
 * Testes do aviso de SOS ativo no Menu (AvisoSOS.js).
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import AvisoSOS from './AvisoSOS';
import { observarSOSAtivos } from '../dados/sos';

jest.mock('../dados/sos', () => ({
  observarSOSAtivos: jest.fn(),
  horarioDoAlerta: jest.fn(() => '14:05'),
}));

let entregar;
let cancelar;

beforeEach(() => {
  cancelar = jest.fn();
  observarSOSAtivos.mockImplementation((_grupoId, callback) => {
    entregar = callback;
    return cancelar;
  });
});

describe('AvisoSOS', () => {
  it('não aparece sem SOS', async () => {
    await render(<AvisoSOS grupoId="g1" uidAtual="a" onAbrir={jest.fn()} />);

    expect(observarSOSAtivos).toHaveBeenCalledWith('g1', expect.any(Function), expect.any(Function));
    expect(screen.queryByText('SOS ATIVO')).toBeNull();
  });

  it('mostra quem acionou e a hora', async () => {
    await render(<AvisoSOS grupoId="g1" uidAtual="a" onAbrir={jest.fn()} />);
    await act(() => entregar([{ id: 's1', uid: 'b', nome: 'Bia', criadoEm: 1 }]));

    expect(await screen.findByText('SOS ATIVO')).toBeOnTheScreen();
    expect(screen.getByText('Bia acionou às 14:05')).toBeOnTheScreen();
  });

  it('"Você" quando é o próprio SOS e "Um membro" sem nome', async () => {
    await render(<AvisoSOS grupoId="g1" uidAtual="a" onAbrir={jest.fn()} />);

    await act(() => entregar([{ id: 's1', uid: 'a', criadoEm: 1 }]));
    expect(await screen.findByText('Você acionou às 14:05')).toBeOnTheScreen();

    await act(() => entregar([{ id: 's2', uid: 'c', criadoEm: 1 }]));
    expect(await screen.findByText('Um membro acionou às 14:05')).toBeOnTheScreen();
  });

  it('conta os alertas quando há vários e abre ao tocar', async () => {
    const onAbrir = jest.fn();
    await render(<AvisoSOS grupoId="g1" uidAtual="a" onAbrir={onAbrir} />);

    await act(() => entregar([{ id: 's1' }, { id: 's2' }]));
    await fireEvent.press(await screen.findByText('2 alertas ativos na família'));

    expect(onAbrir).toHaveBeenCalled();
  });

  it('para de ouvir ao sair', async () => {
    const { unmount } = await render(<AvisoSOS grupoId="g1" uidAtual="a" onAbrir={jest.fn()} />);

    await unmount();

    expect(cancelar).toHaveBeenCalled();
  });
});
