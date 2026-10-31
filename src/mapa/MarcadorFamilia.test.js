/*
 * Testes do marcador de um familiar no mapa (MarcadorFamilia.js).
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import MarcadorFamilia from './MarcadorFamilia';
import { cores } from '../theme/theme';

const BIA = {
  uid: 'b',
  nome: 'Bia',
  voce: false,
  latitude: 1,
  longitude: 2,
  online: true,
  visto: 'Atualizado agora',
  foto: null,
};

afterEach(() => {
  jest.useRealTimers();
});

describe('MarcadorFamilia', () => {
  it('fica na posição do familiar com nome e situação', async () => {
    await render(<MarcadorFamilia membro={BIA} />);

    const marcador = screen.getByTestId('marcador');
    expect(marcador).toHaveProp('coordinate', { latitude: 1, longitude: 2 });
    expect(marcador).toHaveProp('title', 'Bia');
    expect(marcador).toHaveProp('description', 'Online · Atualizado agora');
    expect(screen.getByText('Bia')).toBeOnTheScreen();
    expect(screen.getByText('Atualizado agora')).toBeOnTheScreen();
  });

  it('o seu marcador diz "Você" com borda verde', async () => {
    await render(<MarcadorFamilia membro={{ ...BIA, voce: true, online: false }} />);

    expect(screen.getByText('Você')).toBeOnTheScreen();
    expect(screen.getByTestId('marcador')).toHaveProp('title', 'Bia (você)');
    expect(screen.getByTestId('marcador')).toHaveProp('description', 'Offline · Atualizado agora');
    expect(screen.container.queryAll((no) => JSON.stringify(no.props.style ?? '').includes(cores.online))).not.toHaveLength(0);
  });

  it('selecionado ganha a borda da cor principal', async () => {
    await render(<MarcadorFamilia membro={BIA} selecionado />);

    expect(
      screen.container.queryAll((no) => JSON.stringify(no.props.style ?? '').includes(cores.primaria))
    ).not.toHaveLength(0);
  });

  it('para de redesenhar depois que a foto aparece', async () => {
    jest.useFakeTimers();

    await render(<MarcadorFamilia membro={BIA} />);
    expect(screen.getByTestId('marcador')).toHaveProp('tracksViewChanges', true);

    await act(() => jest.advanceTimersByTime(800));

    expect(screen.getByTestId('marcador')).toHaveProp('tracksViewChanges', false);
  });

  it('volta a redesenhar quando a situação muda', async () => {
    jest.useFakeTimers();

    await render(<MarcadorFamilia membro={BIA} />);
    await act(() => jest.advanceTimersByTime(800));
    await screen.rerender(<MarcadorFamilia membro={{ ...BIA, online: false }} />);

    expect(screen.getByTestId('marcador')).toHaveProp('tracksViewChanges', true);
  });

  it('avisa o toque', async () => {
    const onPress = jest.fn();

    await render(<MarcadorFamilia membro={BIA} onPress={onPress} />);
    await fireEvent.press(screen.getByTestId('marcador'));

    expect(onPress).toHaveBeenCalled();
  });
});
