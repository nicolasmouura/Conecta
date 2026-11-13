/*
 * Testes da tela de SOS (SOSScreen.js). Os alertas vêm do Firestore
 * falso; acionar e o SMS são simulados (têm testes próprios).
 */

import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import SOSScreen, { resumoDaEmergencia } from './SOSScreen';
import { acionarEmergencia } from '../dados/emergencia';
import { enviarSOSPorSMS } from '../dados/smsSOS';
import { pedirPermissaoSMS } from '../dados/smsAutomatico';
import { ligarParaEmergencia } from '../dados/ligacao';

jest.mock('../dados/emergencia', () => ({
  acionarEmergencia: jest.fn(),
}));

jest.mock('../dados/smsAutomatico', () => ({
  pedirPermissaoSMS: jest.fn(),
}));

jest.mock('../dados/ligacao', () => ({
  ...jest.requireActual('../dados/ligacao'),
  ligarParaEmergencia: jest.fn(),
}));

jest.mock('../dados/smsSOS', () => ({
  ...jest.requireActual('../dados/smsSOS'),
  enviarSOSPorSMS: jest.fn(),
}));

const firestore = require('firebase/firestore');

const ANA = { uid: 'a', nome: 'Ana' };

const SOS_ENVIADO = { id: 's1', jaExistia: false, comLocalizacao: true, enviado: true };
const RESULTADO_OK = { sms: { resultado: 'aberto', enviados: 0, falhas: 0 }, sos: SOS_ENVIADO };

beforeEach(() => {
  firestore.__limpar();
  acionarEmergencia.mockResolvedValue(RESULTADO_OK);
  pedirPermissaoSMS.mockResolvedValue(true);
  ligarParaEmergencia.mockResolvedValue(true);
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
    expect(acionarEmergencia).not.toHaveBeenCalled();
  });

  it('pede a permissão do SMS ao abrir', async () => {
    await abrir();

    expect(pedirPermissaoSMS).toHaveBeenCalledTimes(1);
  });

  it('aciona SMS e alerta juntos, com a minha posição', async () => {
    await abrir({ posicaoAtual: { latitude: 1, longitude: 2 }, posicaoEm: 123 });

    await acionar();

    expect(acionarEmergencia).toHaveBeenCalledWith({
      uid: 'a',
      grupoId: 'g1',
      nome: 'Ana',
      posicao: { latitude: 1, longitude: 2 },
      posicaoEm: 123,
    });
  });

  it('app de mensagens aberto e alerta registrado: nenhum aviso extra', async () => {
    await abrir();

    await acionar();

    expect(ultimoAlerta().titulo).toBe('Acionar SOS?');
  });

  it('SMS automático enviado', async () => {
    acionarEmergencia.mockResolvedValue({ sms: { resultado: 'automatico', enviados: 2, falhas: 0 }, sos: SOS_ENVIADO });
    await abrir();

    await acionar();

    expect(ultimoAlerta()).toEqual({
      titulo: 'SOS acionado',
      mensagem: 'SMS enviado para 2 familiares.\nAlerta enviado no app.',
      botoes: ['OK'],
    });
  });

  it('erro inesperado ao acionar', async () => {
    acionarEmergencia.mockRejectedValue(new Error('falhou'));
    await abrir();

    await acionar();

    expect(ultimoAlerta()).toMatchObject({ titulo: 'Não foi possível acionar o SOS', botoes: ['OK'] });
  });

  it('destaca o 112: funciona sem internet e sem sinal da própria operadora', async () => {
    await abrir();

    expect(screen.getByText('PEDIR SOCORRO')).toBeOnTheScreen();
    expect(screen.getByText('Liga para a emergência (112)')).toBeOnTheScreen();
    expect(screen.getByText('Funciona sem internet e sem sinal da sua operadora, até sem chip')).toBeOnTheScreen();
  });

  it('os outros serviços dizem quando usar', async () => {
    await abrir();

    for (const uso of ['perigo, crime', 'saúde', 'fogo, resgate']) {
      expect(screen.getByText(uso)).toBeOnTheScreen();
    }
  });

  it('botões de ligar abrem o discador', async () => {
    await abrir();

    for (const numero of ['190', '192', '193', '112']) {
      await fireEvent.press(screen.getByLabelText(new RegExp(`^Ligar ${numero}`)));
      expect(ligarParaEmergencia).toHaveBeenLastCalledWith(numero);
    }
  });

  it('discador que não abre orienta a discar', async () => {
    ligarParaEmergencia.mockResolvedValue(false);
    await abrir();

    await fireEvent.press(screen.getByLabelText(/^Ligar 190/));

    expect(ultimoAlerta()).toMatchObject({ titulo: 'Não foi possível ligar', mensagem: 'Disque 190 no seu telefone.' });
  });

  it('sem família: também dá para ligar', async () => {
    await abrir({ grupoId: null });

    await fireEvent.press(screen.getByLabelText(/^Ligar 112/));

    expect(ligarParaEmergencia).toHaveBeenCalledWith('112');
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

describe('resumoDaEmergencia', () => {
  const sms = (extra) => ({ resultado: 'automatico', enviados: 1, falhas: 0, ...extra });

  it('um familiar, alerta enviado', () => {
    expect(resumoDaEmergencia({ sms: sms(), sos: SOS_ENVIADO })).toEqual({
      titulo: 'SOS acionado',
      mensagem: 'SMS enviado para 1 familiar.\nAlerta enviado no app.',
    });
  });

  it('sem internet: o alerta do app fica para depois', () => {
    expect(resumoDaEmergencia({ sms: sms(), sos: { ...SOS_ENVIADO, enviado: false } }).mensagem).toBe(
      'SMS enviado para 1 familiar.\nSem internet: o alerta no app sai quando a conexão voltar.'
    );
  });

  it('SMS que não saiu para todos chama atenção', () => {
    expect(resumoDaEmergencia({ sms: sms({ enviados: 2, falhas: 1 }), sos: SOS_ENVIADO })).toMatchObject({
      titulo: 'Atenção',
      mensagem: expect.stringContaining('Não saiu para 1.'),
    });
  });

  it('sem nenhum SMS, manda ligar', () => {
    for (const resultado of ['indisponivel', 'erro']) {
      expect(resumoDaEmergencia({ sms: { resultado }, sos: SOS_ENVIADO })).toMatchObject({
        titulo: 'Atenção',
        mensagem: expect.stringContaining('Ligue para o 112'),
      });
    }
  });

  it('alerta do app recusado', () => {
    expect(resumoDaEmergencia({ sms: sms(), sos: { erro: new Error('x') } })).toMatchObject({
      titulo: 'Atenção',
      mensagem: expect.stringContaining('O alerta no app não foi registrado.'),
    });
  });

  it('SOS que já existia não repete o aviso do app', () => {
    expect(resumoDaEmergencia({ sms: sms(), sos: { id: 's1', jaExistia: true } }).mensagem).toBe(
      'SMS enviado para 1 familiar.'
    );
  });

  it('sem família só há o SMS', () => {
    expect(resumoDaEmergencia({ sms: sms({ enviados: 3 }), sos: null }).mensagem).toBe(
      'SMS enviado para 3 familiares.'
    );
  });
});
