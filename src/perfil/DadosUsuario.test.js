/*
 * Testes do cartão de Meu Perfil (DadosUsuario.js).
 */

import { fireEvent, render, screen } from '@testing-library/react-native';

import DadosUsuario from './DadosUsuario';

const PERFIL = {
  nome: 'Ana Souza',
  email: 'ana@exemplo.com',
  documento: '529.982.247-25',
  telefone: '(11) 98765-4321',
  endereco: 'Rua A, 10',
  foto: null,
};

describe('DadosUsuario', () => {
  it('mostra os dados com o CPF mascarado', async () => {
    await render(<DadosUsuario perfil={PERFIL} onAlterarFoto={jest.fn()} />);

    expect(screen.getByText('Ana Souza')).toBeOnTheScreen();
    expect(screen.getByText('ana@exemplo.com')).toBeOnTheScreen();
    expect(screen.getByText('•••.•••.•••-25')).toBeOnTheScreen();
    expect(screen.queryByText('529.982.247-25')).toBeNull();
    expect(screen.getByText('(11) 98765-4321')).toBeOnTheScreen();
    expect(screen.getByText('Rua A, 10')).toBeOnTheScreen();
  });

  it('campos vazios: "Não informado" e nome padrão', async () => {
    await render(<DadosUsuario perfil={{}} onAlterarFoto={jest.fn()} />);

    expect(screen.getByText('Usuário')).toBeOnTheScreen();
    expect(screen.getAllByText('Não informado')).toHaveLength(4);
  });

  it('sem foto: "Adicionar foto"; com foto: "Alterar foto"', async () => {
    const onAlterarFoto = jest.fn();

    await render(<DadosUsuario perfil={PERFIL} onAlterarFoto={onAlterarFoto} />);
    await fireEvent.press(screen.getByText('Adicionar foto'));
    expect(onAlterarFoto).toHaveBeenCalled();

    await screen.rerender(<DadosUsuario perfil={{ ...PERFIL, foto: 'data:x' }} onAlterarFoto={onAlterarFoto} />);
    expect(screen.getByText('Alterar foto')).toBeOnTheScreen();
  });

  it('salvando a foto: avisa e trava o botão', async () => {
    const onAlterarFoto = jest.fn();

    await render(<DadosUsuario perfil={PERFIL} salvandoFoto onAlterarFoto={onAlterarFoto} />);
    await fireEvent.press(screen.getByText('Salvando foto...'));

    expect(onAlterarFoto).not.toHaveBeenCalled();
  });
});
