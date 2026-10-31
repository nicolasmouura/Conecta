/*
 * Testes dos convites recebidos (ConvitesRecebidos.js), com o
 * Firestore falso.
 */

import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import ConvitesRecebidos from './ConvitesRecebidos';

const firestore = require('firebase/firestore');
const config = require('../config/firebase');

const USUARIO = { uid: 'b', nome: 'Bia' };

beforeEach(() => {
  firestore.__limpar();
  firestore.__semear('grupos/g1', { nome: 'Silva', membros: ['a'] });
  firestore.__semear('usuarios/b', { nome: 'Bia' });
  firestore.__semear('convites/g1_bia@exemplo.com', {
    grupoId: 'g1',
    grupoNome: 'Família Silva',
    deNome: 'Ana',
    paraEmail: 'bia@exemplo.com',
    status: 'pendente',
  });
  config.auth.currentUser = { uid: 'b', email: 'bia@exemplo.com' };

  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ConvitesRecebidos', () => {
  it('mostra a família e quem convidou', async () => {
    await render(<ConvitesRecebidos usuario={USUARIO} onAceito={jest.fn()} />);

    expect(screen.getByText('Você recebeu um convite')).toBeOnTheScreen();
    expect(screen.getByText('Família Silva')).toBeOnTheScreen();
    expect(screen.getByText('Ana')).toBeOnTheScreen();
  });

  it('aceitar entra na família', async () => {
    const onAceito = jest.fn();
    await render(<ConvitesRecebidos usuario={USUARIO} onAceito={onAceito} />);

    await fireEvent.press(screen.getByText('Aceitar'));

    expect(onAceito).toHaveBeenCalledWith('g1');
    expect(Alert.alert).toHaveBeenCalledWith('Convite aceito.', 'Você agora faz parte da Família Silva.');
    expect(firestore.__ler('usuarios/b').grupoId).toBe('g1');
    // O convite aceito some da lista.
    expect(screen.queryByText('Você recebeu um convite')).toBeNull();
  });

  it('recusar tira o convite da lista', async () => {
    await render(<ConvitesRecebidos usuario={USUARIO} onAceito={jest.fn()} />);

    await fireEvent.press(screen.getByText('Recusar'));

    expect(Alert.alert).toHaveBeenCalledWith('Convite recusado.');
    expect(firestore.__ler('convites/g1_bia@exemplo.com').status).toBe('recusado');
    expect(screen.queryByText('Família Silva')).toBeNull();
  });

  it('erro ao aceitar: avisa com a mensagem certa', async () => {
    firestore.__semear('usuarios/b', { grupoId: 'g9' });
    const onAceito = jest.fn();
    await render(<ConvitesRecebidos usuario={USUARIO} onAceito={onAceito} />);

    await fireEvent.press(screen.getByText('Aceitar'));

    expect(Alert.alert).toHaveBeenCalledWith('Erro', 'Você já pertence a uma família.');
    expect(onAceito).not.toHaveBeenCalled();
    expect(screen.getByText('Aceitar')).toBeOnTheScreen();
  });

  it('erro ao recusar', async () => {
    firestore.__falhar('updateDoc', { code: 'unavailable' });
    await render(<ConvitesRecebidos usuario={USUARIO} onAceito={jest.fn()} />);

    await fireEvent.press(screen.getByText('Recusar'));

    expect(Alert.alert).toHaveBeenCalledWith('Erro', 'Não foi possível recusar o convite.');
  });

  it('enquanto responde, trava os dois botões', async () => {
    await render(<ConvitesRecebidos usuario={USUARIO} onAceito={jest.fn()} />);

    const durante = await duranteAEspera(
      'commit',
      () => fireEvent.press(screen.getByText('Aceitar')),
      () => ({ aceitar: screen.queryByText('Aceitar'), recusar: screen.getByText('Recusar') })
    );

    expect(durante.aceitar).toBeNull();
    expect(durante.recusar).toBeDisabled();
  });

  it('sem convites, não mostra nada', async () => {
    firestore.__limpar();

    await render(<ConvitesRecebidos usuario={USUARIO} onAceito={jest.fn()} />);

    expect(screen.toJSON()).toBeNull();
  });

  it('carregando e erro ao buscar', async () => {
    firestore.__semResposta('onSnapshot');
    await render(<ConvitesRecebidos usuario={USUARIO} onAceito={jest.fn()} />);
    expect(screen.getByText('Buscando convites...')).toBeOnTheScreen();

    firestore.__falhar('onSnapshot', { code: 'permission-denied' });
    await render(<ConvitesRecebidos usuario={USUARIO} onAceito={jest.fn()} />);
    expect(await screen.findByText('Não foi possível carregar seus convites.')).toBeOnTheScreen();
  });
});
