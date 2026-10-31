/*
 * Testes da tela de SOS (SOSScreen.js). Os alertas vêm do Firestore
 * falso; acionar e o SMS são simulados (têm testes próprios).
 */

import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import SOSScreen from './SOSScreen';
import { acionarSOS } from '../dados/sos';
import { enviarSOSPorSMS } from '../dados/smsSOS';

jest.mock('../dados/sos', () => ({
  ...jest.requireActual('../dados/sos'),
  acionarSOS: jest.fn(),
}));

jest.mock('../dados/smsSOS', () => ({
  ...jest.requireActual('../dados/smsSOS'),
  enviarSOSPorSMS: jest.fn(),
}));

const firestore = require('firebase/firestore');

const ANA = { uid: 'a', nome: 'Ana' };

beforeEach(() => {
  firestore.__limpar();
  acionarSOS.mockResolvedValue({ id: 's1', jaExistia: false, comLocalizacao: true, enviado: true });
  enviarSOSPorSMS.mockResolvedValue({ resultado: 'aberto', telefones: 1 });

  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function abrir(props = {}) {
  await render(<SOSScreen usuario={ANA} grupoId="g1" {...props} />);
}

// Confirma o Alert "Acionar SOS?".
async function acionar() {
  await fireEvent.press(screen.getByText('ACIONAR SOS'));
  const botoes = Alert.alert.mock.calls.at(-1)[2];
  await act(() => botoes.find((botao) => botao.text === 'Acionar SOS').onPress());
}

function ultimoAlerta() {
  const [titulo, mensagem, botoes] = Alert.alert.mock.calls.at(-1);
  return { titulo, mensagem, botoes: botoes?.map((botao) => botao.text) };
}

describe('SOSScreen', () => {
  it('sem família: só o SMS', async () => {
    await abrir({ grupoId: null });

    expect(screen.getByText('Entre em uma família para usar o SOS.')).toBeOnTheScreen();
    expect(screen.queryByText('ACIONAR SOS')).toBeNull();

    await fireEvent.press(screen.getByText('Avisar por SMS'));
    expect(enviarSOSPorSMS).toHaveBeenCalledWith(expect.objectContaining({ uid: 'a', grupoId: null }));
  });

  it('sem alertas: botão de acionar e nenhum outro SOS', async () => {
    await abrir();

    expect(screen.getByText('ACIONAR SOS')).toBeOnTheScreen();
    expect(screen.getByText('Nenhum outro SOS ativo na família.')).toBeOnTheScreen();
  });

  it('pede confirmação antes de acionar', async () => {
    await abrir();

    await fireEvent.press(screen.getByText('ACIONAR SOS'));

    expect(ultimoAlerta()).toMatchObject({ titulo: 'Acionar SOS?', botoes: ['Cancelar', 'Acionar SOS'] });
    expect(acionarSOS).not.toHaveBeenCalled();
  });

  it('acionado com localização', async () => {
    await abrir();

    await acionar();

    expect(acionarSOS).toHaveBeenCalledWith({ uid: 'a', grupoId: 'g1', nome: 'Ana' });
    expect(ultimoAlerta()).toEqual({
      titulo: 'SOS acionado',
      mensagem: 'Sua família foi avisada com sua última localização.',
      botoes: ['OK', 'Avisar por SMS'],
    });
  });

  it('acionado sem localização', async () => {
    acionarSOS.mockResolvedValue({ id: 's1', jaExistia: false, comLocalizacao: false, enviado: true });
    await abrir();

    await acionar();

    expect(ultimoAlerta().mensagem).toBe('Sua família foi avisada. Não havia localização disponível.');
  });

  it('sem internet: guardado para enviar depois', async () => {
    acionarSOS.mockResolvedValue({ id: 's1', jaExistia: false, comLocalizacao: false, enviado: false });
    await abrir();

    await acionar();

    expect(ultimoAlerta()).toMatchObject({ titulo: 'Sem internet', botoes: ['OK', 'Avisar por SMS'] });
  });

  it('SOS que já existia: nenhum aviso novo', async () => {
    acionarSOS.mockResolvedValue({ id: 's1', jaExistia: true });
    await abrir();

    await acionar();

    expect(ultimoAlerta().titulo).toBe('Acionar SOS?');
  });

  it('erro ao acionar oferece o SMS', async () => {
    acionarSOS.mockRejectedValue(new Error('falhou'));
    await abrir();

    await acionar();

    expect(ultimoAlerta()).toMatchObject({ titulo: 'Não foi possível acionar o SOS', botoes: ['OK', 'Avisar por SMS'] });

    const sms = Alert.alert.mock.calls.at(-1)[2].find((botao) => botao.text === 'Avisar por SMS');
    await act(() => sms.onPress());
    expect(enviarSOSPorSMS).toHaveBeenCalled();
  });

  it('o meu SOS ativo aparece no lugar do botão', async () => {
    firestore.__semear('alertasSOS/s1', {
      uid: 'a',
      grupoId: 'g1',
      status: 'ativo',
      nome: 'Ana',
      latitude: 1,
      longitude: 2,
      criadoEm: firestore.Timestamp.fromMillis(Date.now()),
    });

    await abrir();

    expect(screen.queryByText('ACIONAR SOS')).toBeNull();
    expect(screen.getByText('Acionado por você')).toBeOnTheScreen();
    expect(screen.getByText(/Para encerrar, vá em Meu Perfil/)).toBeOnTheScreen();
    expect(screen.getByTestId('marcador')).toHaveProp('coordinate', { latitude: 1, longitude: 2 });
  });

  it('SOS de outros membros, com e sem localização', async () => {
    firestore.__semear('alertasSOS/s2', { uid: 'b', grupoId: 'g1', status: 'ativo', nome: 'Bia' });
    firestore.__semear('alertasSOS/s3', { uid: 'c', grupoId: 'g1', status: 'ativo', latitude: 1, longitude: 1 });

    await abrir();

    expect(screen.getByText('ACIONAR SOS')).toBeOnTheScreen();
    expect(screen.getByText('Acionado por Bia')).toBeOnTheScreen();
    expect(screen.getByText('Acionado por membro da família')).toBeOnTheScreen();
    expect(screen.getByText('Localização indisponível.')).toBeOnTheScreen();
  });

  it('erro ao carregar os alertas', async () => {
    firestore.__falhar('onSnapshot', { code: 'permission-denied' });

    await abrir();
    await act(() => esperar());

    expect(screen.getByText('Não foi possível carregar os alertas.')).toBeOnTheScreen();
  });

  it('SMS com a minha posição', async () => {
    await abrir({ posicaoAtual: { latitude: 1, longitude: 2 }, posicaoEm: 123 });

    await fireEvent.press(screen.getByText('Avisar por SMS'));

    expect(enviarSOSPorSMS).toHaveBeenCalledWith({
      uid: 'a',
      grupoId: 'g1',
      nome: 'Ana',
      posicao: { latitude: 1, longitude: 2 },
      posicaoEm: 123,
    });
  });

  it('aparelho sem SMS', async () => {
    enviarSOSPorSMS.mockResolvedValue({ resultado: 'indisponivel', telefones: 0 });
    await abrir();

    await fireEvent.press(screen.getByText('Avisar por SMS'));

    expect(ultimoAlerta()).toMatchObject({ titulo: 'SMS indisponível' });
  });

  it('erro ao abrir o SMS', async () => {
    enviarSOSPorSMS.mockRejectedValue(new Error('falhou'));
    await abrir();

    await fireEvent.press(screen.getByText('Avisar por SMS'));

    expect(ultimoAlerta()).toMatchObject({ titulo: 'Não foi possível abrir as mensagens' });
  });
});
