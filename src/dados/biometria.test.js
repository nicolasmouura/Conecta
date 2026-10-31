/*
 * Testes da biometria (biometria.js): escolha, contador de falhas,
 * classificação do resultado e próximo passo da tela de bloqueio.
 */

jest.mock('expo-secure-store', () => {
  const guardado = new Map();

  return {
    __guardado: guardado,
    getItemAsync: jest.fn(async (chave) => (guardado.has(chave) ? guardado.get(chave) : null)),
    setItemAsync: jest.fn(async (chave, valor) => void guardado.set(chave, valor)),
    deleteItemAsync: jest.fn(async (chave) => void guardado.delete(chave)),
  };
});

jest.mock('expo-local-authentication', () => ({
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2 },
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));

const SecureStore = require('expo-secure-store');
const LocalAuthentication = require('expo-local-authentication');
const biometria = require('./biometria');

beforeEach(() => {
  SecureStore.__guardado.clear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function comBiometria(disponivel = true) {
  LocalAuthentication.hasHardwareAsync.mockResolvedValue(disponivel);
  LocalAuthentication.isEnrolledAsync.mockResolvedValue(disponivel);
}

describe('biometriaAtiva e desativarBiometria', () => {
  it('começa desligada', async () => {
    expect(await biometria.biometriaAtiva('u1')).toBe(false);
  });

  it('lê a escolha guardada e apaga ao desativar', async () => {
    SecureStore.__guardado.set('conecta.biometria.ativa.u1', '1');
    expect(await biometria.biometriaAtiva('u1')).toBe(true);

    await biometria.desativarBiometria('u1');
    expect(await biometria.biometriaAtiva('u1')).toBe(false);
  });

  it('é por conta', async () => {
    SecureStore.__guardado.set('conecta.biometria.ativa.u1', '1');

    expect(await biometria.biometriaAtiva('u2')).toBe(false);
  });

  it('erro de leitura conta como desligada', async () => {
    SecureStore.getItemAsync.mockRejectedValueOnce(new Error('falhou'));

    expect(await biometria.biometriaAtiva('u1')).toBe(false);
  });
});

describe('ativarBiometria', () => {
  it('liga depois de confirmar a biometria uma vez e zera as falhas', async () => {
    comBiometria();
    LocalAuthentication.authenticateAsync.mockResolvedValue({ success: true });
    SecureStore.__guardado.set('conecta.biometria.falhas.u1', '2');

    expect(await biometria.ativarBiometria('u1')).toEqual({ ativada: true, mensagem: '' });
    expect(await biometria.biometriaAtiva('u1')).toBe(true);
    expect(await biometria.lerFalhas('u1')).toBe(0);
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ promptMessage: 'Ativar a biometria', disableDeviceFallback: true })
    );
  });

  it('não liga sem biometria no aparelho', async () => {
    comBiometria(false);

    const resultado = await biometria.ativarBiometria('u1');

    expect(resultado.ativada).toBe(false);
    expect(resultado.mensagem).toMatch(/não tem biometria cadastrada/);
    expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
  });

  it('não liga quando a pessoa não confirma', async () => {
    comBiometria();
    LocalAuthentication.authenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' });

    const resultado = await biometria.ativarBiometria('u1');

    expect(resultado.ativada).toBe(false);
    expect(resultado.mensagem).toMatch(/não foi confirmada/);
    expect(await biometria.biometriaAtiva('u1')).toBe(false);
  });
});

describe('biometriaDisponivel', () => {
  it('precisa de sensor e de biometria cadastrada', async () => {
    LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
    LocalAuthentication.isEnrolledAsync.mockResolvedValue(false);
    expect(await biometria.biometriaDisponivel()).toBe(false);

    comBiometria();
    expect(await biometria.biometriaDisponivel()).toBe(true);
  });

  it('erro conta como indisponível', async () => {
    LocalAuthentication.hasHardwareAsync.mockRejectedValue(new Error('falhou'));
    LocalAuthentication.isEnrolledAsync.mockResolvedValue(true);

    expect(await biometria.biometriaDisponivel()).toBe(false);
  });
});

describe('temReconhecimentoFacial', () => {
  it('verifica se o aparelho tem rosto', async () => {
    LocalAuthentication.supportedAuthenticationTypesAsync.mockResolvedValueOnce([1, 2]);
    expect(await biometria.temReconhecimentoFacial()).toBe(true);

    LocalAuthentication.supportedAuthenticationTypesAsync.mockResolvedValueOnce([1]);
    expect(await biometria.temReconhecimentoFacial()).toBe(false);

    LocalAuthentication.supportedAuthenticationTypesAsync.mockRejectedValueOnce(new Error('falhou'));
    expect(await biometria.temReconhecimentoFacial()).toBe(false);
  });
});

describe('contador de falhas', () => {
  it('soma e zera', async () => {
    expect(await biometria.lerFalhas('u1')).toBe(0);
    expect(await biometria.registrarFalha('u1')).toBe(1);
    expect(await biometria.registrarFalha('u1')).toBe(2);
    expect(await biometria.lerFalhas('u1')).toBe(2);

    await biometria.zerarFalhas('u1');
    expect(await biometria.lerFalhas('u1')).toBe(0);
  });

  it('valor estranho conta como zero', async () => {
    SecureStore.__guardado.set('conecta.biometria.falhas.u1', 'abc');
    expect(await biometria.lerFalhas('u1')).toBe(0);

    SecureStore.__guardado.set('conecta.biometria.falhas.u1', '-3');
    expect(await biometria.lerFalhas('u1')).toBe(0);
  });

  it('a senha do SOS tem um contador separado', async () => {
    await biometria.registrarFalha('u1');

    expect(await biometria.registrarFalhaSenhaSOS('u1')).toBe(1);
    expect(await biometria.registrarFalhaSenhaSOS('u1')).toBe(2);
    expect(await biometria.lerFalhas('u1')).toBe(1);

    await biometria.zerarFalhasSenhaSOS('u1');
    expect(await biometria.registrarFalhaSenhaSOS('u1')).toBe(1);
  });
});

describe('classificarResultado', () => {
  it.each([
    [{ success: true }, 'sucesso'],
    [{ success: false, error: 'user_cancel' }, 'cancelado'],
    [{ success: false, error: 'system_cancel' }, 'cancelado'],
    [{ success: false, error: 'app_cancel' }, 'cancelado'],
    [{ success: false, error: 'user_fallback' }, 'cancelado'],
    [{ success: false, error: 'lockout' }, 'bloqueado'],
    [{ success: false, error: 'not_enrolled' }, 'indisponivel'],
    [{ success: false, error: 'not_available' }, 'indisponivel'],
    [{ success: false, error: 'passcode_not_set' }, 'indisponivel'],
    [{ success: false, error: 'missing_usage_description' }, 'nao_configurado'],
    [{ success: false, error: 'authentication_failed' }, 'falha'],
    [undefined, 'falha'],
  ])('%p → %s', (resultado, esperado) => {
    expect(biometria.classificarResultado(resultado)).toBe(esperado);
  });
});

describe('proximoPasso', () => {
  it('sucesso entra e zera as falhas', () => {
    expect(biometria.proximoPasso('sucesso', 2)).toEqual({ acao: 'entrar', falhas: 0 });
  });

  it('falha soma e avisa a tentativa', () => {
    expect(biometria.proximoPasso('falha', 0)).toEqual({
      acao: 'tentar',
      falhas: 1,
      mensagem: 'Não reconhecemos você (tentativa 1 de 3).',
    });
  });

  it('a terceira falha encerra a sessão', () => {
    expect(biometria.proximoPasso('falha', biometria.MAXIMO_FALHAS - 1)).toMatchObject({
      acao: 'encerrar',
      falhas: biometria.MAXIMO_FALHAS,
    });
  });

  it.each(['cancelado', 'bloqueado', 'nao_configurado', 'indisponivel'])(
    '%s continua na tela sem contar falha',
    (classificacao) => {
      const passo = biometria.proximoPasso(classificacao, 1);

      expect(passo.acao).toBe('tentar');
      expect(passo.falhas).toBe(1);
      expect(passo.mensagem).toEqual(expect.any(String));
    }
  );
});

describe('autenticarComBiometria', () => {
  it('pede só a biometria, sem a senha do aparelho', async () => {
    LocalAuthentication.authenticateAsync.mockResolvedValue({ success: true });

    expect(await biometria.autenticarComBiometria()).toBe('sucesso');
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ promptMessage: 'Entrar no Conecta', disableDeviceFallback: true })
    );
  });

  it('em desenvolvimento, sem permissão do Face ID, usa o código do aparelho', async () => {
    LocalAuthentication.authenticateAsync
      .mockResolvedValueOnce({ success: false, error: 'missing_usage_description' })
      .mockResolvedValueOnce({ success: true });

    expect(await biometria.autenticarComBiometria()).toBe('sucesso');
    expect(LocalAuthentication.authenticateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ disableDeviceFallback: false })
    );
  });

  it('erro conta como indisponível', async () => {
    LocalAuthentication.authenticateAsync.mockRejectedValue(new Error('falhou'));

    expect(await biometria.autenticarComBiometria()).toBe('indisponivel');
  });
});
