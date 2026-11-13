/*
 * Testes de acionarEmergencia (emergencia.js): SMS e alerta do app
 * saem juntos e nenhum depende do outro. Os envios têm testes próprios.
 */

import { acionarEmergencia } from './emergencia';
import { acionarSOS } from './sos';
import { enviarSMSAutomatico, permissaoSMSConcedida, smsAutomaticoSuportado } from './smsAutomatico';
import { enviarSOSPorSMS, telefonesParaSOS, ultimaPosicaoDoAparelho } from './smsSOS';

jest.mock('./sos', () => ({ acionarSOS: jest.fn() }));

jest.mock('./smsAutomatico', () => ({
  enviarSMSAutomatico: jest.fn(),
  permissaoSMSConcedida: jest.fn(),
  smsAutomaticoSuportado: jest.fn(),
}));

jest.mock('./smsSOS', () => ({
  ...jest.requireActual('./smsSOS'),
  enviarSOSPorSMS: jest.fn(),
  telefonesParaSOS: jest.fn(),
  ultimaPosicaoDoAparelho: jest.fn(),
}));

const DADOS = {
  uid: 'a',
  grupoId: 'g1',
  nome: 'Ana',
  posicao: { latitude: 1, longitude: 2 },
  posicaoEm: Date.now(),
};

const SOS = { id: 's1', jaExistia: false, comLocalizacao: true, enviado: true };

beforeEach(() => {
  acionarSOS.mockResolvedValue(SOS);
  smsAutomaticoSuportado.mockReturnValue(true);
  permissaoSMSConcedida.mockReturnValue(true);
  telefonesParaSOS.mockResolvedValue(['21911111111', '21922222222']);
  enviarSMSAutomatico.mockResolvedValue({ enviados: 2, falhas: [] });
  enviarSOSPorSMS.mockResolvedValue({ resultado: 'aberto', telefones: 2 });
  ultimaPosicaoDoAparelho.mockResolvedValue(null);

  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('acionarEmergencia', () => {
  it('Android com permissão: SMS automático para a família e alerta no app', async () => {
    const resultado = await acionarEmergencia(DADOS);

    expect(enviarSMSAutomatico).toHaveBeenCalledWith(
      ['21911111111', '21922222222'],
      expect.stringContaining('SOS! Ana precisa de ajuda.')
    );
    expect(enviarSMSAutomatico.mock.calls[0][1]).toContain('q=1.00000,2.00000');
    expect(enviarSOSPorSMS).not.toHaveBeenCalled();
    expect(acionarSOS).toHaveBeenCalledWith({ uid: 'a', grupoId: 'g1', nome: 'Ana' });
    expect(resultado).toEqual({ sms: { resultado: 'automatico', enviados: 2, falhas: 0 }, sos: SOS });
  });

  it('sem posição informada, usa a última do aparelho', async () => {
    ultimaPosicaoDoAparelho.mockResolvedValue({ posicao: { latitude: 3, longitude: 4 }, posicaoEm: Date.now() });

    await acionarEmergencia({ ...DADOS, posicao: undefined });

    expect(enviarSMSAutomatico.mock.calls[0][1]).toContain('q=3.00000,4.00000');
  });

  it('conta os telefones que falharam', async () => {
    enviarSMSAutomatico.mockResolvedValue({ enviados: 1, falhas: ['21922222222'] });

    expect((await acionarEmergencia(DADOS)).sms).toEqual({ resultado: 'automatico', enviados: 1, falhas: 1 });
  });

  it.each([
    ['iOS ou Expo Go (sem o módulo)', () => smsAutomaticoSuportado.mockReturnValue(false)],
    ['Android sem a permissão', () => permissaoSMSConcedida.mockReturnValue(false)],
    ['família sem telefones', () => telefonesParaSOS.mockResolvedValue([])],
    ['nenhum SMS saiu', () => enviarSMSAutomatico.mockResolvedValue({ enviados: 0, falhas: ['1', '2'] })],
  ])('%s: abre o app de mensagens', async (_, preparar) => {
    preparar();

    const resultado = await acionarEmergencia(DADOS);

    expect(enviarSOSPorSMS).toHaveBeenCalledWith({
      uid: 'a',
      grupoId: 'g1',
      nome: 'Ana',
      posicao: DADOS.posicao,
      posicaoEm: DADOS.posicaoEm,
    });
    expect(resultado.sms).toEqual({ resultado: 'aberto', enviados: 0, falhas: 0 });
  });

  it('aparelho sem SMS', async () => {
    smsAutomaticoSuportado.mockReturnValue(false);
    enviarSOSPorSMS.mockResolvedValue({ resultado: 'indisponivel', telefones: 0 });

    expect((await acionarEmergencia(DADOS)).sms.resultado).toBe('indisponivel');
  });

  it('erro no SMS não derruba o alerta do app', async () => {
    smsAutomaticoSuportado.mockReturnValue(false);
    enviarSOSPorSMS.mockRejectedValue(new Error('falhou'));

    const resultado = await acionarEmergencia(DADOS);

    expect(resultado.sms.resultado).toBe('erro');
    expect(resultado.sos).toEqual(SOS);
  });

  it('alerta do app recusado não impede o SMS', async () => {
    const erro = new Error('recusado');
    acionarSOS.mockRejectedValue(erro);

    const resultado = await acionarEmergencia(DADOS);

    expect(resultado.sms.resultado).toBe('automatico');
    expect(resultado.sos).toEqual({ erro });
  });

  it('o SMS não espera o alerta do app (sem internet ele demora)', async () => {
    let liberar;
    acionarSOS.mockReturnValue(new Promise((resolver) => { liberar = resolver; }));

    const emergencia = acionarEmergencia(DADOS);
    await esperar();

    expect(enviarSMSAutomatico).toHaveBeenCalled();

    liberar(SOS);
    await emergencia;
  });

  it('sem família: só o SMS', async () => {
    const resultado = await acionarEmergencia({ ...DADOS, grupoId: null });

    expect(acionarSOS).not.toHaveBeenCalled();
    expect(resultado.sos).toBeNull();
  });
});
