/*
 * Testes do card de um membro (MembroCard.js).
 */

import { render, screen } from '@testing-library/react-native';

import MembroCard from './MembroCard';

describe('MembroCard', () => {
  it('membro ativo: nome, papel, situação e contato', async () => {
    await render(
      <MembroCard
        nome="Bia"
        status="ativo"
        papel="administrador"
        perfil={{ telefone: '(21) 91234-5678', endereco: 'Rua A, 10', documento: '529.982.247-25' }}
      />
    );

    expect(screen.getByText('Bia')).toBeOnTheScreen();
    expect(screen.getByText('Administrador')).toBeOnTheScreen();
    expect(screen.getByText('Membro ativo')).toBeOnTheScreen();
    expect(screen.getByText(/\(21\) 91234-5678/)).toBeOnTheScreen();
    expect(screen.getByText(/Rua A, 10/)).toBeOnTheScreen();
  });

  it('nunca mostra o CPF', async () => {
    await render(
      <MembroCard nome="Bia" status="ativo" papel="membro" perfil={{ documento: '529.982.247-25' }} />
    );

    expect(screen.queryByText(/529/)).toBeNull();
  });

  it('marca você', async () => {
    await render(<MembroCard nome="Ana" status="ativo" papel="membro" voce />);

    expect(screen.getByText('Ana (você)')).toBeOnTheScreen();
    expect(screen.getByText('Membro')).toBeOnTheScreen();
  });

  it('sem telefone ou endereço: "Não informado"', async () => {
    await render(<MembroCard nome="Bia" status="ativo" papel="membro" perfil={null} />);

    expect(screen.getAllByText(/Não informado/)).toHaveLength(2);
  });

  it('convite pendente: sem contato e sem papel', async () => {
    await render(<MembroCard nome="Caio" status="pendente" />);

    expect(screen.getByText('Convite pendente')).toBeOnTheScreen();
    expect(screen.queryByText(/Telefone/)).toBeNull();
    expect(screen.queryByText('Membro')).toBeNull();
  });

  it('situação desconhecida aparece como pendente', async () => {
    await render(<MembroCard nome="Caio" status="estranho" />);

    expect(screen.getByText('Convite pendente')).toBeOnTheScreen();
  });
});
