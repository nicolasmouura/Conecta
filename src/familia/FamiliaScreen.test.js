/*
 * Testes da tela Minha Família (FamiliaScreen.js), com o Firestore falso.
 */

import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import FamiliaScreen from './FamiliaScreen';

const firestore = require('firebase/firestore');
const config = require('../config/firebase');
const { apagarDadosLocais } = require('../dados/armazenamentoLocal');

const ANA = { uid: 'a', nome: 'Ana' };

beforeEach(async () => {
  firestore.__limpar();
  await apagarDadosLocais();
  config.auth.currentUser = { uid: 'a', email: 'ana@exemplo.com' };

  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function semearFamilia() {
  firestore.__semear('grupos/g1', { nome: 'Família Silva', administradorUid: 'a', membros: ['a', 'b'] });
  firestore.__semear('grupos/g1/membros/a', { uid: 'a', nome: 'Ana', papel: 'administrador', status: 'ativo', entrouEm: '2026-01-01' });
  firestore.__semear('grupos/g1/membros/b', { uid: 'b', nome: 'Bia', papel: 'membro', status: 'ativo', entrouEm: '2026-02-01' });
  firestore.__semear('usuarios/a', { nome: 'Ana', grupoId: 'g1', telefone: '(11) 98765-4321' });
  firestore.__semear('usuarios/b', { nome: 'Bia', grupoId: 'g1', telefone: '(21) 91234-5678' });
  firestore.__semear('familiares/a', { uid: 'a' });
  firestore.__semear('convites/g1_caio@exemplo.com', { grupoId: 'g1', status: 'pendente', paraEmail: 'caio@exemplo.com' });
}

async function abrir(props = {}) {
  await render(<FamiliaScreen grupoId="g1" usuario={ANA} onGrupoConcluido={jest.fn()} {...props} />);
  await act(() => esperar());
}

// Botões do Alert de confirmação.
function botaoDoAlerta(texto) {
  return Alert.alert.mock.calls.at(-1)[2].find((botao) => botao.text === texto);
}

describe('FamiliaScreen', () => {
  it('sem família, mostra a tela de criar ou aceitar convite', async () => {
    await abrir({ grupoId: null });

    expect(screen.getByText('Grupo Familiar')).toBeOnTheScreen();
  });

  it('mostra a família, os membros com contato e os convites pendentes', async () => {
    semearFamilia();

    await abrir();

    expect(screen.getByText('Família Silva')).toBeOnTheScreen();
    expect(screen.getByText('2 membros ativos')).toBeOnTheScreen();
    expect(screen.getByText('Ana (você)')).toBeOnTheScreen();
    expect(screen.getByText(/\(21\) 91234-5678/)).toBeOnTheScreen();
    expect(screen.getByText('caio@exemplo.com')).toBeOnTheScreen();
    expect(screen.getByText('Convite pendente')).toBeOnTheScreen();
  });

  it('1 membro ativo no singular', async () => {
    semearFamilia();
    firestore.__semear('grupos/g1/membros/b', undefined);
    firestore.__limpar();
    firestore.__semear('grupos/g1', { nome: 'Família Silva', administradorUid: 'a', membros: ['a'] });
    firestore.__semear('grupos/g1/membros/a', { uid: 'a', nome: 'Ana', status: 'ativo' });

    await abrir();

    expect(screen.getByText('1 membro ativo')).toBeOnTheScreen();
  });

  it('família não encontrada', async () => {
    await abrir();

    expect(screen.getByText('Família não encontrada.')).toBeOnTheScreen();
  });

  it('erro ao carregar', async () => {
    firestore.__falhar('getDoc', { code: 'permission-denied' });

    await abrir();

    expect(screen.getByText('Não foi possível carregar sua família.')).toBeOnTheScreen();
  });

  it('abre a janela de convite', async () => {
    semearFamilia();
    await abrir();

    await fireEvent.press(screen.getByText('+ Convidar familiar'));

    expect(screen.getByText('Convidar familiar')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Fechar'));
    expect(screen.queryByText('Convidar familiar')).toBeNull();
  });

  it('administrador saindo: avisa quem assume e sai ao confirmar', async () => {
    semearFamilia();
    const onSaiu = jest.fn();
    await abrir({ onSaiu });

    await fireEvent.press(screen.getByText('Sair da família'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Sair da família',
      'Você deixa de ver a família no mapa e ela deixa de ver você. Bia passa a ser o administrador.',
      expect.any(Array)
    );

    await act(() => botaoDoAlerta('Sair').onPress());

    expect(onSaiu).toHaveBeenCalled();
    expect(firestore.__ler('grupos/g1').administradorUid).toBe('b');
  });

  it('único membro: avisa que a família será apagada', async () => {
    firestore.__semear('grupos/g1', { nome: 'Família Silva', administradorUid: 'a', membros: ['a'] });
    firestore.__semear('grupos/g1/membros/a', { uid: 'a', nome: 'Ana', status: 'ativo' });
    await abrir();

    await fireEvent.press(screen.getByText('Sair da família'));

    expect(Alert.alert.mock.calls[0][1]).toBe('Você é o único membro: a família será apagada.');
  });

  it('com SOS ativo, não sai e explica', async () => {
    semearFamilia();
    firestore.__semear('alertasSOS/s1', { uid: 'a', grupoId: 'g1', status: 'ativo' });
    const onSaiu = jest.fn();
    await abrir({ onSaiu });

    await fireEvent.press(screen.getByText('Sair da família'));
    await act(() => botaoDoAlerta('Sair').onPress());

    expect(onSaiu).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenLastCalledWith('Não foi possível sair', expect.stringContaining('SOS ativo'));
    expect(screen.getByText('Sair da família')).toBeOnTheScreen();
  });

  it('outro erro ao sair', async () => {
    semearFamilia();
    await abrir();
    firestore.__falhar('commit', { code: 'unavailable' });

    await fireEvent.press(screen.getByText('Sair da família'));
    await act(() => botaoDoAlerta('Sair').onPress());

    expect(Alert.alert).toHaveBeenLastCalledWith('Não foi possível sair', 'Tente novamente em instantes.');
  });

  it('sem registro na família, não convida nem sai', async () => {
    semearFamilia();
    await render(<FamiliaScreen grupoId="g1" usuario={{ uid: 'x', nome: 'X' }} onGrupoConcluido={jest.fn()} />);
    await act(() => esperar());

    expect(screen.getByText('+ Convidar familiar')).toBeDisabled();
    expect(screen.getByText('Sair da família')).toBeDisabled();
  });
});
