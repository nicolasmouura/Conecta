/*
 * Testes dos convites para a família (convites.js).
 */

let convites;
let firestore;
let config;

beforeEach(() => {
  jest.resetModules();

  firestore = require('firebase/firestore');
  config = require('../config/firebase');
  convites = require('./convites');

  config.auth.currentUser = { uid: 'a', email: 'Ana@Exemplo.com' };
  jest.spyOn(console, 'log').mockImplementation(() => {});

  firestore.__semear('grupos/g1', { nome: 'Silva', membros: ['a'] });
  firestore.__semear('diretorioConvites/bia lima|bia@exemplo.com', { uid: 'b' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const GRUPO = { id: 'g1', nome: 'Silva' };
const REMETENTE = { uid: 'a', nome: 'Ana' };
const enviar = (extra) =>
  convites.enviarConvite({ grupo: GRUPO, remetente: REMETENTE, nome: 'Bia Lima', email: 'bia@exemplo.com', ...extra });

describe('mensagemDeErro', () => {
  it('traduz os erros conhecidos', () => {
    expect(convites.mensagemDeErro(new Error('USUARIO_NAO_ENCONTRADO'), 'padrão')).toMatch(/Usuário não encontrado/);
    expect(convites.mensagemDeErro(new Error('JA_POSSUI_FAMILIA'), 'padrão')).toBe('Você já pertence a uma família.');
  });

  it('usa a mensagem padrão para o resto', () => {
    expect(convites.mensagemDeErro(new Error('outro'), 'padrão')).toBe('padrão');
    expect(convites.mensagemDeErro(undefined, 'padrão')).toBe('padrão');
  });
});

describe('encontrarUsuarioConvidavel', () => {
  it('acha pelo nome completo + e-mail, sem diferenciar maiúsculas', async () => {
    expect(await convites.encontrarUsuarioConvidavel(' Bia  LIMA ', 'BIA@exemplo.com')).toBe('b');
  });

  it('null quando algo não confere ou falta', async () => {
    expect(await convites.encontrarUsuarioConvidavel('Bia', 'bia@exemplo.com')).toBeNull();
    expect(await convites.encontrarUsuarioConvidavel('', 'bia@exemplo.com')).toBeNull();
  });
});

describe('enviarConvite', () => {
  it('cria o convite pendente com o id família_e-mail', async () => {
    await enviar({ email: ' BIA@exemplo.com ' });

    expect(firestore.__ler('convites/g1_bia@exemplo.com')).toEqual({
      grupoId: 'g1',
      grupoNome: 'Silva',
      deUid: 'a',
      deNome: 'Ana',
      paraEmail: 'bia@exemplo.com',
      paraNome: 'bia lima',
      paraUid: 'b',
      status: 'pendente',
      criadoEm: expect.any(String),
    });
  });

  it.each([
    [{ nome: '' }, 'CAMPOS_OBRIGATORIOS'],
    [{ email: ' ' }, 'CAMPOS_OBRIGATORIOS'],
    [{ email: 'bia@exemplo' }, 'EMAIL_INVALIDO'],
    [{ email: 'bia/x@exemplo.com' }, 'EMAIL_INVALIDO'],
    [{ email: 'ana@exemplo.com' }, 'CONVITE_PARA_SI_MESMO'],
    [{ nome: 'Bia' }, 'USUARIO_NAO_ENCONTRADO'],
  ])('%p → %s', async (alteracao, erro) => {
    await expect(enviar(alteracao)).rejects.toThrow(erro);
  });

  it('não convida quem já é da família', async () => {
    firestore.__semear('grupos/g1', { nome: 'Silva', membros: ['a', 'b'] });

    await expect(enviar()).rejects.toThrow('JA_E_MEMBRO');
  });

  it('não repete convite pendente', async () => {
    await enviar();

    await expect(enviar()).rejects.toThrow('CONVITE_JA_PENDENTE');
  });

  it('reenvia convite recusado, cancelado ou aceito antes', async () => {
    for (const status of ['recusado', 'cancelado', 'aceito']) {
      firestore.__semear('convites/g1_bia@exemplo.com', { status });

      await enviar();

      expect(firestore.__ler('convites/g1_bia@exemplo.com').status).toBe('pendente');
    }
  });
});

describe('observarConvitesRecebidos', () => {
  it('lista só os pendentes para o meu e-mail', async () => {
    firestore.__semear('convites/g2_ana@exemplo.com', { paraEmail: 'ana@exemplo.com', status: 'pendente' });
    firestore.__semear('convites/g3_ana@exemplo.com', { paraEmail: 'ana@exemplo.com', status: 'recusado' });
    firestore.__semear('convites/g1_bia@exemplo.com', { paraEmail: 'bia@exemplo.com', status: 'pendente' });
    const callback = jest.fn();

    const cancelar = convites.observarConvitesRecebidos(callback);

    expect(callback).toHaveBeenLastCalledWith([
      { id: 'g2_ana@exemplo.com', paraEmail: 'ana@exemplo.com', status: 'pendente' },
    ]);
    cancelar();
  });

  it('sem e-mail na sessão, lista vazia', () => {
    config.auth.currentUser = null;
    const callback = jest.fn();

    convites.observarConvitesRecebidos(callback)();

    expect(callback).toHaveBeenCalledWith([]);
    expect(firestore.onSnapshot).not.toHaveBeenCalled();
  });
});

describe('observarConvitesPendentesDoGrupo', () => {
  it('lista os pendentes da família', () => {
    firestore.__semear('convites/c1', { grupoId: 'g1', status: 'pendente' });
    firestore.__semear('convites/c2', { grupoId: 'g1', status: 'aceito' });
    firestore.__semear('convites/c3', { grupoId: 'g2', status: 'pendente' });
    const callback = jest.fn();

    convites.observarConvitesPendentesDoGrupo('g1', callback)();

    expect(callback).toHaveBeenCalledWith([{ id: 'c1', grupoId: 'g1', status: 'pendente' }]);
  });
});

describe('aceitarConvite', () => {
  const CONVITE = { id: 'g1_bia@exemplo.com', grupoId: 'g1' };

  beforeEach(() => {
    firestore.__semear('convites/g1_bia@exemplo.com', { status: 'pendente' });
    firestore.__semear('usuarios/b', { nome: 'Bia' });
  });

  it('entra na família: convite, grupo, registro e perfil juntos', async () => {
    await convites.aceitarConvite(CONVITE, { uid: 'b', nome: 'Bia' });

    expect(firestore.__ler('convites/g1_bia@exemplo.com')).toMatchObject({ status: 'aceito', paraUid: 'b' });
    expect(firestore.__ler('grupos/g1').membros).toEqual(['a', 'b']);
    expect(firestore.__ler('grupos/g1/membros/b')).toMatchObject({
      nome: 'Bia',
      papel: 'membro',
      status: 'ativo',
      conviteId: 'g1_bia@exemplo.com',
    });
    expect(firestore.__ler('usuarios/b')).toEqual({ nome: 'Bia', grupoId: 'g1' });
  });

  it('não entra quem já tem família', async () => {
    firestore.__semear('usuarios/b', { grupoId: 'g9' });

    await expect(convites.aceitarConvite(CONVITE, { uid: 'b' })).rejects.toThrow('JA_POSSUI_FAMILIA');
    expect(firestore.__ler('grupos/g1').membros).toEqual(['a']);
  });

  it('nada muda se a família não existe mais', async () => {
    await expect(
      convites.aceitarConvite({ id: 'g1_bia@exemplo.com', grupoId: 'sumiu' }, { uid: 'b' })
    ).rejects.toMatchObject({ code: 'not-found' });
    expect(firestore.__ler('convites/g1_bia@exemplo.com').status).toBe('pendente');
  });
});

describe('recusarConvite', () => {
  it('marca como recusado', async () => {
    firestore.__semear('convites/c1', { status: 'pendente' });

    await convites.recusarConvite({ id: 'c1' }, { uid: 'b' });

    expect(firestore.__ler('convites/c1')).toMatchObject({ status: 'recusado', paraUid: 'b' });
  });
});
