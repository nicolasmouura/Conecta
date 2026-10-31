/*
 * Testes do SOS por SMS (smsSOS.js).
 */

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
}));

jest.mock('expo-sms', () => ({
  isAvailableAsync: jest.fn(),
  sendSMSAsync: jest.fn(),
}));

let smsSOS;
let firestore;
let local;
let Location;
let SMS;

beforeEach(() => {
  jest.resetModules();

  Location = require('expo-location');
  SMS = require('expo-sms');
  firestore = require('firebase/firestore');
  local = require('./armazenamentoLocal');
  smsSOS = require('./smsSOS');

  Location.getForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  Location.getLastKnownPositionAsync.mockResolvedValue(null);
  SMS.isAvailableAsync.mockResolvedValue(true);
  SMS.sendSMSAsync.mockResolvedValue({ result: 'sent' });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function semearFamilia() {
  for (const [uid, telefone] of [
    ['a', '(11) 98765-4321'],
    ['b', '(21) 91234-5678'],
    ['c', '21 91234 5678'],
    ['d', ''],
  ]) {
    firestore.__semear(`grupos/g1/membros/${uid}`, { uid });
    firestore.__semear(`usuarios/${uid}`, { nome: uid, telefone });
  }
}

describe('telefoneParaSMS', () => {
  it('deixa só os números', () => {
    expect(smsSOS.telefoneParaSMS('(21) 98765-4321')).toBe('21987654321');
    expect(smsSOS.telefoneParaSMS('+55 21 98765-4321')).toBe('5521987654321');
  });

  it('ignora números curtos ou longos demais', () => {
    expect(smsSOS.telefoneParaSMS('1234567')).toBeNull();
    expect(smsSOS.telefoneParaSMS('1'.repeat(16))).toBeNull();
    expect(smsSOS.telefoneParaSMS(undefined)).toBeNull();
  });
});

describe('telefonesDaFamilia', () => {
  it('sem o meu, sem repetir e sem vazios', () => {
    const perfis = {
      a: { telefone: '11987654321' },
      b: { telefone: '(21) 91234-5678' },
      c: { telefone: '21912345678' },
      d: { telefone: '' },
      e: null,
    };

    expect(smsSOS.telefonesDaFamilia(perfis, 'a')).toEqual(['21912345678']);
    expect(smsSOS.telefonesDaFamilia(undefined, 'a')).toEqual([]);
  });
});

describe('montarMensagemSOS', () => {
  const AGORA = new Date(2026, 9, 30, 14, 5).getTime();

  it('com a localização recente', () => {
    expect(
      smsSOS.montarMensagemSOS({
        nome: 'Ana',
        posicao: { latitude: -23.550519, longitude: -46.633309 },
        posicaoEm: AGORA - 60 * 1000,
        agora: AGORA,
      })
    ).toBe(
      'SOS! Ana precisa de ajuda.\n' +
        'Localização (14:04): https://maps.google.com/?q=-23.55052,-46.63331\n' +
        'Enviado pelo app Conecta.'
    );
  });

  it('sem hora da posição, usa a de agora', () => {
    expect(
      smsSOS.montarMensagemSOS({ nome: 'Ana', posicao: { latitude: 1, longitude: 2 }, agora: AGORA })
    ).toContain('Localização (14:05)');
  });

  it('posição velha, inválida ou ausente não vai na mensagem', () => {
    const indisponivel = 'Localização indisponível no momento.';

    expect(
      smsSOS.montarMensagemSOS({
        nome: 'Ana',
        posicao: { latitude: 1, longitude: 2 },
        posicaoEm: AGORA - smsSOS.IDADE_MAXIMA_POSICAO - 1,
        agora: AGORA,
      })
    ).toContain(indisponivel);
    expect(smsSOS.montarMensagemSOS({ nome: 'Ana', posicao: { latitude: 99, longitude: 0 } })).toContain(indisponivel);
    expect(smsSOS.montarMensagemSOS({ nome: 'Ana' })).toContain(indisponivel);
  });

  it('sem nome: "Um familiar"', () => {
    expect(smsSOS.montarMensagemSOS({})).toMatch(/^SOS! Um familiar precisa de ajuda\./);
  });
});

describe('buscarTelefonesDaFamilia', () => {
  it('sem família, lista vazia', async () => {
    expect(await smsSOS.buscarTelefonesDaFamilia(null, 'a')).toEqual([]);
  });

  it('busca os telefones e guarda a cópia', async () => {
    semearFamilia();

    expect(await smsSOS.buscarTelefonesDaFamilia('g1', 'a')).toEqual(['21912345678']);
    await esperar();
    expect(await local.lerLocal('telefones:g1')).toEqual(['21912345678']);
  });

  it('sem internet, usa a cópia', async () => {
    await local.gravarLocal('telefones:g1', ['21900000000']);
    firestore.__falhar('getDocs', { code: 'unavailable' });

    expect(await smsSOS.buscarTelefonesDaFamilia('g1', 'a')).toEqual(['21900000000']);
  });

  it('resposta só da memória do Firebase conta como sem internet', async () => {
    semearFamilia();
    await local.gravarLocal('telefones:g1', ['21900000000']);
    firestore.getDocs.mockResolvedValueOnce({ docs: [], metadata: { fromCache: true } });

    expect(await smsSOS.buscarTelefonesDaFamilia('g1', 'a')).toEqual(['21900000000']);
  });

  it('sem internet e sem cópia, lista vazia', async () => {
    firestore.__falhar('getDocs', { code: 'unavailable' });

    expect(await smsSOS.buscarTelefonesDaFamilia('g1', 'a')).toEqual([]);
  });
});

describe('ultimaPosicaoDoAparelho', () => {
  it('devolve a última posição do sistema', async () => {
    Location.getLastKnownPositionAsync.mockResolvedValue({ coords: { latitude: 1, longitude: 2 }, timestamp: 50 });

    expect(await smsSOS.ultimaPosicaoDoAparelho()).toEqual({ posicao: { latitude: 1, longitude: 2 }, posicaoEm: 50 });
    expect(Location.getLastKnownPositionAsync).toHaveBeenCalledWith({ maxAge: smsSOS.IDADE_MAXIMA_POSICAO });
  });

  it('null sem permissão, sem posição ou com erro', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValueOnce({ granted: false });
    expect(await smsSOS.ultimaPosicaoDoAparelho()).toBeNull();

    expect(await smsSOS.ultimaPosicaoDoAparelho()).toBeNull();

    Location.getForegroundPermissionsAsync.mockRejectedValueOnce(new Error('falhou'));
    expect(await smsSOS.ultimaPosicaoDoAparelho()).toBeNull();
  });
});

describe('enviarSOSPorSMS', () => {
  it('abre o app de mensagens com os telefones e o texto', async () => {
    semearFamilia();

    const resultado = await smsSOS.enviarSOSPorSMS({
      uid: 'a',
      grupoId: 'g1',
      nome: 'Ana',
      posicao: { latitude: 1, longitude: 2 },
      posicaoEm: Date.now(),
    });

    expect(resultado).toEqual({ resultado: 'aberto', telefones: 1 });
    expect(SMS.sendSMSAsync).toHaveBeenCalledWith(['21912345678'], expect.stringContaining('q=1.00000,2.00000'));
  });

  it('sem posição informada, usa a última do aparelho', async () => {
    Location.getLastKnownPositionAsync.mockResolvedValue({
      coords: { latitude: 3, longitude: 4 },
      timestamp: Date.now(),
    });

    await smsSOS.enviarSOSPorSMS({ uid: 'a', grupoId: null, nome: 'Ana' });

    expect(SMS.sendSMSAsync).toHaveBeenCalledWith([], expect.stringContaining('q=3.00000,4.00000'));
  });

  it('aparelho sem SMS', async () => {
    SMS.isAvailableAsync.mockResolvedValue(false);

    expect(await smsSOS.enviarSOSPorSMS({ uid: 'a', grupoId: 'g1' })).toEqual({
      resultado: 'indisponivel',
      telefones: 0,
    });
    expect(SMS.sendSMSAsync).not.toHaveBeenCalled();
  });
});
