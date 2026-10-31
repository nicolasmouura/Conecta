/*
 * Testes de Configurações (Configuracoes.js). As subtelas têm testes
 * próprios e aqui são simuladas; a biometria também.
 */

import { Alert, BackHandler } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import Configuracoes from './Configuracoes';
import { ativarBiometria, biometriaDisponivel, desativarBiometria } from '../dados/biometria';

jest.mock('../dados/biometria', () => ({
  ativarBiometria: jest.fn(),
  biometriaDisponivel: jest.fn(),
  desativarBiometria: jest.fn(),
}));

// Subtela simulada: mostra o nome e um "voltar".
function mockSubtela(nome, voltar = 'onVoltar') {
  return function Subtela(props) {
    const { Text, TouchableOpacity } = require('react-native');
    return (
      <TouchableOpacity onPress={props[voltar]}>
        <Text>Subtela {nome}</Text>
      </TouchableOpacity>
    );
  };
}

jest.mock('./EditarInformacoes', () => mockSubtela('Editar'));
jest.mock('./ExcluirConta', () => mockSubtela('Excluir'));
jest.mock('../lugares/MeusLugares', () => mockSubtela('Lugares'));
jest.mock('../sos/EncerrarSOS', () => mockSubtela('EncerrarSOS', 'onSair'));

const USUARIO = { uid: 'u1' };

beforeEach(() => {
  biometriaDisponivel.mockResolvedValue(true);
  ativarBiometria.mockResolvedValue({ ativada: true, mensagem: '' });
  desativarBiometria.mockResolvedValue();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove: jest.fn() });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function abrir(props = {}) {
  const funcoes = { onSair: jest.fn(), onBiometriaAlterada: jest.fn(), onContaExcluida: jest.fn() };
  await render(<Configuracoes usuario={USUARIO} perfil={{ nome: 'Ana' }} grupoId="g1" {...funcoes} {...props} />);
  return { ...funcoes, ...props };
}

async function abrirSeguranca(props) {
  const funcoes = await abrir(props);
  await fireEvent.press(screen.getByText('Segurança'));
  await act(() => esperar());
  return funcoes;
}

describe('Configuracoes', () => {
  it('lista as opções', async () => {
    await abrir();

    for (const opcao of ['Editar informações', 'Meus lugares', 'Segurança', 'Excluir conta', 'Sair do aplicativo']) {
      expect(screen.getByText(opcao)).toBeOnTheScreen();
    }
  });

  it.each([
    ['Editar informações', 'Subtela Editar'],
    ['Meus lugares', 'Subtela Lugares'],
    ['Excluir conta', 'Subtela Excluir'],
  ])('%s abre e volta', async (opcao, subtela) => {
    await abrir();

    await fireEvent.press(screen.getByText(opcao));
    expect(screen.getByText(subtela)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText(subtela));
    expect(screen.getByText('Configurações')).toBeOnTheScreen();
  });

  it('editar sem o perfil carregado pede para aguardar', async () => {
    await abrir({ perfil: null });

    await fireEvent.press(screen.getByText('Editar informações'));

    expect(Alert.alert).toHaveBeenCalledWith('Aguarde', 'Seus dados ainda estão carregando.');
    expect(screen.queryByText('Subtela Editar')).toBeNull();
  });

  it('sair pede confirmação', async () => {
    const { onSair } = await abrir();

    await fireEvent.press(screen.getByText('Sair do aplicativo'));

    const [titulo, , botoes] = Alert.alert.mock.calls[0];
    expect(titulo).toBe('Sair do aplicativo');
    botoes.find((botao) => botao.text === 'Sair').onPress();
    expect(onSair).toHaveBeenCalled();
  });

  describe('Segurança', () => {
    it('mostra o SOS e a biometria', async () => {
      await abrirSeguranca();

      expect(screen.getByText('Subtela EncerrarSOS')).toBeOnTheScreen();
      expect(screen.getByText('Entrar com biometria')).toBeOnTheScreen();
      expect(screen.getByRole('switch')).toHaveProp('value', false);
    });

    it('liga a biometria', async () => {
      const { onBiometriaAlterada } = await abrirSeguranca();

      await fireEvent(screen.getByRole('switch'), 'valueChange', true);

      expect(ativarBiometria).toHaveBeenCalledWith('u1');
      expect(onBiometriaAlterada).toHaveBeenCalledWith(true);
    });

    it('biometria não confirmada: explica', async () => {
      ativarBiometria.mockResolvedValue({ ativada: false, mensagem: 'Não confirmada.' });
      const { onBiometriaAlterada } = await abrirSeguranca();

      await fireEvent(screen.getByRole('switch'), 'valueChange', true);

      expect(Alert.alert).toHaveBeenCalledWith('Biometria não ativada', 'Não confirmada.');
      expect(onBiometriaAlterada).not.toHaveBeenCalled();
    });

    it('desliga a biometria', async () => {
      const { onBiometriaAlterada } = await abrirSeguranca({ biometriaLigada: true });

      await fireEvent(screen.getByRole('switch'), 'valueChange', false);

      expect(desativarBiometria).toHaveBeenCalledWith('u1');
      expect(onBiometriaAlterada).toHaveBeenCalledWith(false);
    });

    it('erro ao alterar', async () => {
      desativarBiometria.mockRejectedValue(new Error('falhou'));
      await abrirSeguranca({ biometriaLigada: true });

      await fireEvent(screen.getByRole('switch'), 'valueChange', false);

      expect(Alert.alert).toHaveBeenCalledWith('Erro', 'Não foi possível alterar a biometria. Tente novamente.');
    });

    it('aparelho sem biometria: chave travada e aviso', async () => {
      biometriaDisponivel.mockResolvedValue(false);

      await abrirSeguranca();

      expect(screen.getByRole('switch').props.disabled).toBe(true);
      expect(screen.getByText(/Este aparelho não tem biometria cadastrada/)).toBeOnTheScreen();
    });

    it('sem biometria mas ligada: ainda dá para desligar', async () => {
      biometriaDisponivel.mockResolvedValue(false);

      await abrirSeguranca({ biometriaLigada: true });

      expect(screen.getByRole('switch').props.disabled).toBe(false);
    });

    it('volta para Configurações', async () => {
      await abrirSeguranca();

      await fireEvent.press(screen.getByText('Configurações'));

      expect(screen.getByText('Editar informações')).toBeOnTheScreen();
    });
  });
});
