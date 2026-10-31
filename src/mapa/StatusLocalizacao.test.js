/*
 * Testes do selo de compartilhamento da localização (StatusLocalizacao.js).
 */

import { render, screen } from '@testing-library/react-native';

import StatusLocalizacao from './StatusLocalizacao';
import { cores } from '../theme/theme';

describe('StatusLocalizacao', () => {
  it('mostra o texto com a bolinha verde quando ativo', async () => {
    const { root } = await render(<StatusLocalizacao texto="Compartilhando sua localização" ativo />);

    expect(screen.getByText('Compartilhando sua localização')).toBeOnTheScreen();
    expect(root.children[0]).toHaveStyle({ backgroundColor: cores.online });
  });

  it('bolinha vermelha quando parado', async () => {
    const { root } = await render(<StatusLocalizacao texto="Localização desligada" ativo={false} />);

    expect(root.children[0]).toHaveStyle({ backgroundColor: cores.offline });
  });
});
