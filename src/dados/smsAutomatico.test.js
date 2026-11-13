/*
 * Testes do SMS automático (smsAutomatico.js). O módulo nativo é simulado:
 * o de verdade só existe num build do Android (modules/conecta-sms).
 */

const modulo = { temPermissao: jest.fn(), enviar: jest.fn() };

let smsAutomatico;
let PermissionsAndroid;

// "android": com o módulo; "ios": sem ele (ou Expo Go).
function carregar(plataforma) {
  jest.resetModules();

  jest.doMock('expo', () => ({
    requireOptionalNativeModule: jest.fn(() => (plataforma === 'android' ? modulo : null)),
  }));

  const reactNative = require('react-native');

  reactNative.Platform.OS = plataforma;
  PermissionsAndroid = reactNative.PermissionsAndroid;
  smsAutomatico = require('./smsAutomatico');
}

beforeEach(() => {
  modulo.temPermissao.mockReset().mockReturnValue(true);
  modulo.enviar.mockReset().mockResolvedValue({ enviados: 2, falhas: [] });

  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('no Android (com o módulo)', () => {
  beforeEach(() => carregar('android'));

  it('suportado', () => {
    expect(smsAutomatico.smsAutomaticoSuportado()).toBe(true);
  });

  it('lê a permissão do módulo', () => {
    expect(smsAutomatico.permissaoSMSConcedida()).toBe(true);

    modulo.temPermissao.mockReturnValue(false);
    expect(smsAutomatico.permissaoSMSConcedida()).toBe(false);

    modulo.temPermissao.mockImplementation(() => { throw new Error('falhou'); });
    expect(smsAutomatico.permissaoSMSConcedida()).toBe(false);
  });

  it('já com permissão, não pergunta de novo', async () => {
    const pedir = jest.spyOn(PermissionsAndroid, 'request');

    expect(await smsAutomatico.pedirPermissaoSMS()).toBe(true);
    expect(pedir).not.toHaveBeenCalled();
  });

  it('pede a permissão explicando o motivo', async () => {
    modulo.temPermissao.mockReturnValue(false);
    const pedir = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('granted');

    expect(await smsAutomatico.pedirPermissaoSMS()).toBe(true);
    expect(pedir).toHaveBeenCalledWith(
      PermissionsAndroid.PERMISSIONS.SEND_SMS,
      expect.objectContaining({ message: expect.stringContaining('sem internet') })
    );
  });

  it('permissão negada ou erro ao pedir: false', async () => {
    modulo.temPermissao.mockReturnValue(false);
    const pedir = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('denied');

    expect(await smsAutomatico.pedirPermissaoSMS()).toBe(false);

    pedir.mockRejectedValue(new Error('falhou'));
    expect(await smsAutomatico.pedirPermissaoSMS()).toBe(false);
  });

  it('envia sem acentos (cabe mais no SMS)', async () => {
    const resultado = await smsAutomatico.enviarSMSAutomatico(['21911111111', '21922222222'], 'Localização: ação');

    expect(modulo.enviar).toHaveBeenCalledWith(['21911111111', '21922222222'], 'Localizacao: acao');
    expect(resultado).toEqual({ enviados: 2, falhas: [] });
  });

  it('sem telefones, nada é enviado', async () => {
    expect(await smsAutomatico.enviarSMSAutomatico([], 'oi')).toEqual({ enviados: 0, falhas: [] });
    expect(modulo.enviar).not.toHaveBeenCalled();
  });

  it('erro do módulo conta como falha de todos', async () => {
    modulo.enviar.mockRejectedValue(new Error('sem sinal'));

    expect(await smsAutomatico.enviarSMSAutomatico(['1', '2'], 'oi')).toEqual({ enviados: 0, falhas: ['1', '2'] });
  });
});

describe('no iOS ou sem o módulo', () => {
  beforeEach(() => carregar('ios'));

  it('tudo desligado', async () => {
    expect(smsAutomatico.smsAutomaticoSuportado()).toBe(false);
    expect(smsAutomatico.permissaoSMSConcedida()).toBe(false);
    expect(await smsAutomatico.pedirPermissaoSMS()).toBe(false);
    expect(await smsAutomatico.enviarSMSAutomatico(['1'], 'oi')).toEqual({ enviados: 0, falhas: ['1'] });
  });
});

describe('semAcentos', () => {
  beforeEach(() => carregar('android'));

  it('tira os acentos e mantém o resto', () => {
    expect(smsAutomatico.semAcentos('SOS! Cláudia está em São João.\nhttps://maps.google.com/?q=1,2')).toBe(
      'SOS! Claudia esta em Sao Joao.\nhttps://maps.google.com/?q=1,2'
    );
  });
});
