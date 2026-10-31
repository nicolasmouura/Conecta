/*
 * Testes dos cards da família abaixo do mapa (CardsFamiliares.js).
 */

import { fireEvent, render, screen } from '@testing-library/react-native';

import CardsFamiliares from './CardsFamiliares';
import { cores } from '../theme/theme';

const BIA = {
  uid: 'b',
  nome: 'Bia',
  voce: false,
  foto: null,
  temLocalizacao: true,
  online: true,
  visto: 'Atualizado agora',
  distancia: '350 m',
  rua: 'Rua das Flores',
  casa: '750 m de casa',
  estouBem: 'Está bem · há 5 min',
  bateria: { texto: '15%', icone: 'battery', baixa: true },
};

describe('CardsFamiliares', () => {
  it('sem cards: carregando', async () => {
    await render(<CardsFamiliares cards={[]} onSelecionar={jest.fn()} />);

    expect(screen.getByText('Minha Família')).toBeOnTheScreen();
    expect(screen.getByText('Carregando familiares...')).toBeOnTheScreen();
  });

  it('mostra todas as linhas do card', async () => {
    await render(<CardsFamiliares cards={[BIA]} onSelecionar={jest.fn()} />);

    expect(screen.getByText('Bia')).toBeOnTheScreen();
    expect(screen.getByText('Online · Atualizado agora')).toBeOnTheScreen();
    expect(screen.getByText('15%')).toBeOnTheScreen();
    expect(screen.getByText('Rua das Flores')).toBeOnTheScreen();
    expect(screen.getByText('750 m de casa')).toBeOnTheScreen();
    expect(screen.getByText('Está bem · há 5 min')).toBeOnTheScreen();
    expect(screen.getByText('350 m de você')).toBeOnTheScreen();
  });

  it('bateria baixa em vermelho', async () => {
    await render(<CardsFamiliares cards={[BIA]} onSelecionar={jest.fn()} />);

    expect(screen.getByTestId('icone-battery')).toHaveProp('color', cores.erro);
  });

  it('esconde as linhas sem informação', async () => {
    await render(
      <CardsFamiliares
        cards={[{ ...BIA, rua: null, casa: null, estouBem: null, bateria: null, distancia: null, online: false }]}
        onSelecionar={jest.fn()}
      />
    );

    expect(screen.getByText('Offline · Atualizado agora')).toBeOnTheScreen();
    expect(screen.queryByTestId('icone-map-pin')).toBeNull();
    expect(screen.queryByTestId('icone-home')).toBeNull();
    expect(screen.queryByTestId('icone-heart')).toBeNull();
    expect(screen.queryByText(/de você/)).toBeNull();
  });

  it('marca você', async () => {
    await render(<CardsFamiliares cards={[{ ...BIA, voce: true }]} onSelecionar={jest.fn()} />);

    expect(screen.getByText('Bia (você)')).toBeOnTheScreen();
  });

  it('tocar no card seleciona o familiar', async () => {
    const onSelecionar = jest.fn();

    await render(<CardsFamiliares cards={[BIA]} onSelecionar={onSelecionar} />);
    await fireEvent.press(screen.getByText('Bia'));

    expect(onSelecionar).toHaveBeenCalledWith('b');
  });

  it('sem localização: só o motivo e não dá para tocar', async () => {
    const onSelecionar = jest.fn();

    await render(
      <CardsFamiliares
        cards={[{ ...BIA, temLocalizacao: false, visto: 'Localização indisponível' }]}
        onSelecionar={onSelecionar}
      />
    );
    await fireEvent.press(screen.getByText('Bia'));

    expect(screen.getByText('Localização indisponível')).toBeOnTheScreen();
    expect(onSelecionar).not.toHaveBeenCalled();
  });
});
