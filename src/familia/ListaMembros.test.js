/*
 * Testes da lista de membros (ListaMembros.js).
 */

import { render, screen } from '@testing-library/react-native';

import ListaMembros from './ListaMembros';

describe('ListaMembros', () => {
  it('um card por membro, com o nome do perfil quando existe', async () => {
    await render(
      <ListaMembros
        uidAtual="a"
        membros={[
          { id: 'a', uid: 'a', nome: 'Ana antiga', status: 'ativo', papel: 'administrador', perfil: { nome: 'Ana' } },
          { id: 'b', uid: 'b', nome: 'Bia', status: 'ativo', papel: 'membro' },
          { id: 'convite', nome: 'Caio', status: 'pendente' },
        ]}
      />
    );

    expect(screen.getByText('Ana (você)')).toBeOnTheScreen();
    expect(screen.queryByText(/Ana antiga/)).toBeNull();
    expect(screen.getByText('Bia')).toBeOnTheScreen();
    expect(screen.getByText('Caio')).toBeOnTheScreen();
    expect(screen.getByText('Convite pendente')).toBeOnTheScreen();
  });

  it('lista vazia', async () => {
    await render(<ListaMembros membros={[]} uidAtual="a" />);

    expect(screen.queryByText(/Membro/)).toBeNull();
  });
});
