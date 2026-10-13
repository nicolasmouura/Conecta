import * as Location from 'expo-location';
import * as SMS from 'expo-sms';

import { db } from '../src/config/armazenamento';
import { doc, setDoc } from '../src/armazenamento/bancoLocal';
import {
  enviarSOSPorSMS,
  IDADE_MAXIMA_POSICAO,
  montarMensagemSOS,
  telefoneParaSMS,
  telefonesDaFamilia,
} from '../src/dados/smsSOS';

jest.mock('expo-sms', () => ({
  isAvailableAsync: jest.fn(async () => true),
  sendSMSAsync: jest.fn(async () => ({ result: 'sent' })),
}));

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getLastKnownPositionAsync: jest.fn(async () => null),
}));

const AGORA = new Date(2026, 9, 13, 14, 5).getTime();
const POSICAO = { latitude: -22.906847, longitude: -43.172897 };

beforeAll(() => jest.spyOn(console, 'log').mockImplementation(() => {}));

describe('mensagem do SMS', () => {
  test('com posição recente: nome, horário e link do mapa', () => {
    expect(montarMensagemSOS({ nome: 'Ana', posicao: POSICAO, posicaoEm: AGORA - 60000, agora: AGORA })).toBe(
      'SOS! Ana precisa de ajuda.\n'
      + 'Localização (14:04): https://maps.google.com/?q=-22.90685,-43.17290\n'
      + 'Enviado pelo app Conecta.'
    );
  });

  test('posição velha demais ou inválida não vai para a mensagem', () => {
    const velha = montarMensagemSOS({
      nome: 'Ana', posicao: POSICAO, posicaoEm: AGORA - IDADE_MAXIMA_POSICAO - 1, agora: AGORA,
    });
    const invalida = montarMensagemSOS({ nome: 'Ana', posicao: { latitude: 999, longitude: 0 }, agora: AGORA });

    for (const mensagem of [velha, invalida]) {
      expect(mensagem).toContain('Localização indisponível no momento.');
      expect(mensagem).not.toContain('maps.google.com');
    }
  });

  test('sem nome e sem posição', () => {
    expect(montarMensagemSOS({ agora: AGORA })).toBe(
      'SOS! Um familiar precisa de ajuda.\nLocalização indisponível no momento.\nEnviado pelo app Conecta.'
    );
  });
});

describe('telefones', () => {
  test('só dígitos; números curtos ou vazios são ignorados', () => {
    expect(telefoneParaSMS('(21) 98765-4321')).toBe('21987654321');
    expect(telefoneParaSMS('+55 21 98765-4321')).toBe('5521987654321');
    expect(telefoneParaSMS('123')).toBeNull();
    expect(telefoneParaSMS('')).toBeNull();
    expect(telefoneParaSMS(undefined)).toBeNull();
  });

  test('família: sem o meu, sem repetir e sem quem não tem telefone', () => {
    const perfis = {
      eu: { telefone: '(21) 90000-0000' },
      mae: { telefone: '(21) 98765-4321' },
      pai: { telefone: '21 98765-4321' }, // mesmo número
      avo: { telefone: '' },
      sumido: null,
    };

    expect(telefonesDaFamilia(perfis, 'eu')).toEqual(['21987654321']);
  });
});

describe('enviarSOSPorSMS', () => {
  const GRUPO = 'familia-sms';

  beforeAll(async () => {
    for (const [uid, telefone] of [['eu', '(21) 90000-0000'], ['mae', '(21) 98765-4321'], ['irmao', '(11) 91234-5678']]) {
      await setDoc(doc(db, 'grupos', GRUPO, 'membros', uid), { nome: uid });
      await setDoc(doc(db, 'usuarios', uid), { nome: uid, telefone });
    }
  });

  beforeEach(() => jest.clearAllMocks());

  test('abre o SMS com os telefones da família e a posição atual', async () => {
    const resposta = await enviarSOSPorSMS({
      uid: 'eu', grupoId: GRUPO, nome: 'Eu', posicao: POSICAO, posicaoEm: Date.now(),
    });

    expect(resposta).toEqual({ resultado: 'aberto', telefones: 2 });

    const [telefones, mensagem] = SMS.sendSMSAsync.mock.calls[0];
    expect(telefones.sort()).toEqual(['11912345678', '21987654321']);
    expect(mensagem).toContain('https://maps.google.com/?q=-22.90685,-43.17290');
    expect(Location.getLastKnownPositionAsync).not.toHaveBeenCalled();
  });

  test('sem posição do app: usa a última posição guardada pelo aparelho', async () => {
    Location.getLastKnownPositionAsync.mockResolvedValueOnce({
      coords: { latitude: -23.5, longitude: -46.6 },
      timestamp: Date.now(),
    });

    await enviarSOSPorSMS({ uid: 'eu', grupoId: GRUPO, nome: 'Eu' });

    expect(SMS.sendSMSAsync.mock.calls[0][1]).toContain('?q=-23.50000,-46.60000');
  });

  test('sem permissão de localização: envia sem a posição', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValueOnce({ granted: false });

    await enviarSOSPorSMS({ uid: 'eu', grupoId: GRUPO, nome: 'Eu' });

    expect(Location.getLastKnownPositionAsync).not.toHaveBeenCalled();
    expect(SMS.sendSMSAsync.mock.calls[0][1]).toContain('Localização indisponível');
  });

  test('sem família: abre o SMS sem destinatários (a pessoa escolhe)', async () => {
    const resposta = await enviarSOSPorSMS({ uid: 'eu', grupoId: null, nome: 'Eu', posicao: POSICAO });

    expect(resposta).toEqual({ resultado: 'aberto', telefones: 0 });
    expect(SMS.sendSMSAsync).toHaveBeenCalledWith([], expect.any(String));
  });

  test('aparelho sem SMS: não tenta abrir', async () => {
    SMS.isAvailableAsync.mockResolvedValueOnce(false);

    const resposta = await enviarSOSPorSMS({ uid: 'eu', grupoId: GRUPO, nome: 'Eu' });

    expect(resposta.resultado).toBe('indisponivel');
    expect(SMS.sendSMSAsync).not.toHaveBeenCalled();
  });
});
