/*
 * Testes do mapa da família (Mapa.js).
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { __metodos as mapa } from 'react-native-maps';

import Mapa from './Mapa';

const EU = { uid: 'a', nome: 'Ana', voce: true, latitude: 1, longitude: 1, online: true, visto: 'agora' };
const BIA = { uid: 'b', nome: 'Bia', voce: false, latitude: 2, longitude: 2, online: true, visto: 'agora' };

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

async function mapaPronto() {
  await fireEvent(screen.getByTestId('mapa'), 'mapReady');
  await act(() => jest.advanceTimersByTime(300));
}

describe('Mapa', () => {
  it('um marcador por pessoa', async () => {
    await render(<Mapa marcadores={[EU, BIA]} pronto />);

    expect(screen.getAllByTestId('marcador')).toHaveLength(2);
    expect(screen.getByText('Você')).toBeOnTheScreen();
    expect(screen.getByText('Bia')).toBeOnTheScreen();
  });

  it('abre perto da minha posição atual', async () => {
    await render(<Mapa marcadores={[]} pronto={false} centroInicial={{ latitude: 5, longitude: 6 }} />);

    expect(screen.getByTestId('mapa')).toHaveProp('initialRegion', {
      latitude: 5,
      longitude: 6,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  });

  it('sem posição, abre na visão padrão', async () => {
    await render(<Mapa marcadores={[]} pronto={false} />);

    expect(screen.getByTestId('mapa').props.initialRegion).toBeUndefined();
  });

  it('centraliza em você quando tudo está pronto', async () => {
    await render(<Mapa marcadores={[BIA, EU]} pronto />);
    await mapaPronto();

    expect(mapa.animateCamera).toHaveBeenCalledWith(
      { center: { latitude: 1, longitude: 1 }, zoom: 16, pitch: 0, heading: 0 },
      { duration: 1000 }
    );
  });

  it('sem você no mapa, centraliza no primeiro familiar', async () => {
    await render(<Mapa marcadores={[BIA]} pronto />);
    await mapaPronto();

    expect(mapa.animateCamera).toHaveBeenCalledWith(expect.objectContaining({ center: { latitude: 2, longitude: 2 } }), {
      duration: 1000,
    });
  });

  it('espera os dados da família antes de centralizar', async () => {
    await render(<Mapa marcadores={[EU]} pronto={false} />);
    await mapaPronto();

    expect(mapa.animateCamera).not.toHaveBeenCalled();
  });

  it('não recentraliza depois que a pessoa mexe no mapa', async () => {
    await render(<Mapa marcadores={[EU]} pronto={false} />);
    await fireEvent(screen.getByTestId('mapa'), 'panDrag');
    await screen.rerender(<Mapa marcadores={[EU]} pronto />);
    await mapaPronto();

    expect(mapa.animateCamera).not.toHaveBeenCalled();
  });

  it('centraliza no familiar tocado no card', async () => {
    await render(<Mapa marcadores={[EU, BIA]} pronto foco={null} />);
    await screen.rerender(<Mapa marcadores={[EU, BIA]} pronto foco={{ uid: 'b', pedido: 1 }} />);

    expect(mapa.animateCamera).toHaveBeenCalledWith(
      { center: { latitude: 2, longitude: 2 }, zoom: 16 },
      { duration: 700 }
    );
  });

  it('ignora foco em quem não está no mapa', async () => {
    await render(<Mapa marcadores={[EU]} pronto foco={{ uid: 'x', pedido: 1 }} />);

    expect(mapa.animateCamera).not.toHaveBeenCalled();
  });

  it('avisa o marcador tocado', async () => {
    const onSelecionar = jest.fn();

    await render(<Mapa marcadores={[EU, BIA]} pronto onSelecionar={onSelecionar} />);
    await fireEvent.press(screen.getAllByTestId('marcador')[1]);

    expect(onSelecionar).toHaveBeenCalledWith('b');
  });

  it('mostra a minha casa só para mim', async () => {
    await render(<Mapa marcadores={[]} pronto minhaCasa={{ latitude: 3, longitude: 4 }} />);

    const casa = screen.getByTestId('marcador');
    expect(casa).toHaveProp('title', 'Minha casa');
    expect(casa).toHaveProp('coordinate', { latitude: 3, longitude: 4 });
    expect(casa).toHaveProp('tracksViewChanges', true);

    await act(() => jest.advanceTimersByTime(800));
    expect(screen.getByTestId('marcador')).toHaveProp('tracksViewChanges', false);
  });
});
