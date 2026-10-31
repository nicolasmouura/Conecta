/*
 * Testes do perfil do usuário (salvarUsuario.js): validações, cadastro,
 * leitura com cópia local, edição e índice de convites.
 */

let usuario;
let firestore;
let config;
let local;

const CPF = '529.982.247-25';
const OUTRO_CPF = '111.444.777-35';

beforeEach(() => {
  jest.resetModules();

  firestore = require('firebase/firestore');
  config = require('../config/firebase');
  local = require('./armazenamentoLocal');
  usuario = require('./salvarUsuario');

  config.auth.currentUser = { uid: 'u1', email: 'ana@exemplo.com', emailVerified: true };
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

const CADASTRO = {
  nome: 'Ana Souza',
  email: 'ana@exemplo.com',
  cpf: '52998224725',
  telefone: '11987654321',
  senha: 'segredo',
  confirmacao: 'segredo',
};

describe('normalização e chave do diretório', () => {
  it('normalizarNome junta espaços e põe em minúsculas', () => {
    expect(usuario.normalizarNome('  Ana   Souza\t')).toBe('ana souza');
    expect(usuario.normalizarNome(null)).toBe('');
  });

  it('normalizarEmailCadastro', () => {
    expect(usuario.normalizarEmailCadastro(' Ana@Exemplo.COM ')).toBe('ana@exemplo.com');
    expect(usuario.normalizarEmailCadastro(undefined)).toBe('');
  });

  it('chaveDiretorio junta nome e e-mail', () => {
    expect(usuario.chaveDiretorio('Ana  Souza', 'ANA@exemplo.com')).toBe('ana souza|ana@exemplo.com');
  });

  it('chaveDiretorio recusa vazio e barra (caminho do Firestore)', () => {
    expect(usuario.chaveDiretorio('', 'a@b.com')).toBeNull();
    expect(usuario.chaveDiretorio('Ana', '')).toBeNull();
    expect(usuario.chaveDiretorio('Ana/Bia', 'a@b.com')).toBeNull();
  });
});

describe('cpfValido e formatarCPF', () => {
  it.each([CPF, '52998224725', OUTRO_CPF])('aceita %p', (cpf) => {
    expect(usuario.cpfValido(cpf)).toBe(true);
  });

  it.each(['529.982.247-24', '111.111.111-11', '123', '', null])('recusa %p', (cpf) => {
    expect(usuario.cpfValido(cpf)).toBe(false);
  });

  it('formata com pontos e hífen', () => {
    expect(usuario.formatarCPF('52998224725')).toBe(CPF);
    expect(usuario.formatarCPF(CPF)).toBe(CPF);
  });
});

describe('validarDadosEditaveis', () => {
  it('aceita nome e telefone com DDD', () => {
    expect(usuario.validarDadosEditaveis({ nome: 'Ana', telefone: '(11) 98765-4321' })).toBeNull();
    expect(usuario.validarDadosEditaveis({ nome: 'Ana', telefone: '1133334444' })).toBeNull();
  });

  it('pede nome e telefone', () => {
    expect(usuario.validarDadosEditaveis({ nome: ' ', telefone: '11987654321' })).toBe('Digite seu nome.');
    expect(usuario.validarDadosEditaveis({ nome: 'Ana', telefone: '' })).toBe('Digite seu telefone.');
  });

  it('recusa telefone sem DDD ou longo demais', () => {
    expect(usuario.validarDadosEditaveis({ nome: 'Ana', telefone: '987654321' })).toBe(
      'Digite um telefone válido, com DDD.'
    );
    expect(usuario.validarDadosEditaveis({ nome: 'Ana', telefone: '119876543210' })).toBe(
      'Digite um telefone válido, com DDD.'
    );
  });
});

describe('validarCadastro', () => {
  it('aceita um cadastro completo', () => {
    expect(usuario.validarCadastro(CADASTRO)).toBeNull();
  });

  it.each([
    [{ nome: '' }, 'Digite seu nome completo.'],
    [{ email: ' ' }, 'Digite seu e-mail.'],
    [{ email: 'ana@exemplo' }, 'Digite um e-mail válido.'],
    [{ cpf: '' }, 'Digite seu CPF.'],
    [{ cpf: '12345678900' }, 'Digite um CPF válido.'],
    [{ telefone: '' }, 'Digite seu telefone.'],
    [{ senha: '' }, 'Digite uma senha.'],
    [{ senha: '12345', confirmacao: '12345' }, 'A senha precisa ter pelo menos 6 caracteres.'],
    [{ confirmacao: '' }, 'Confirme sua senha.'],
    [{ confirmacao: 'outra1' }, 'As senhas não conferem.'],
  ])('%p → %s', (alteracao, mensagem) => {
    expect(usuario.validarCadastro({ ...CADASTRO, ...alteracao })).toBe(mensagem);
  });
});

describe('montarAlteracoes e mascararDocumento', () => {
  it('só nome e telefone são enviados', () => {
    expect(usuario.montarAlteracoes({ nome: 'Ana', telefone: '1', email: 'x', documento: 'y' })).toEqual({
      nome: 'Ana',
      telefone: '1',
    });
  });

  it('mostra só os 2 últimos caracteres', () => {
    expect(usuario.mascararDocumento(CPF)).toBe('•••.•••.•••-25');
    expect(usuario.mascararDocumento('')).toBe('');
  });
});

describe('salvarPerfilUsuario', () => {
  const novo = { uid: 'u1', nome: '  Ana Souza ', email: 'ana@exemplo.com', cpf: '52998224725', telefone: '11987654321' };

  it('grava o perfil, o CPF na área privada e o índice de CPFs', async () => {
    await usuario.salvarPerfilUsuario(novo);

    expect(firestore.__ler('usuarios/u1')).toEqual({
      nome: 'Ana Souza',
      email: 'ana@exemplo.com',
      uid: 'u1',
      telefone: '(11) 98765-4321',
      criadoEm: expect.any(String),
    });
    expect(firestore.__ler('usuarios/u1/privado/documentos')).toEqual({ cpf: CPF });
    expect(firestore.__ler('cpfs/52998224725')).toEqual({ uid: 'u1' });
  });

  it('o perfil nunca leva o CPF', async () => {
    await usuario.salvarPerfilUsuario(novo);

    expect(JSON.stringify(firestore.__ler('usuarios/u1'))).not.toContain('52998224725');
  });

  it('com e-mail confirmado, cria a entrada no diretório de convites', async () => {
    await usuario.salvarPerfilUsuario(novo);

    expect(firestore.__ler('diretorioConvites/ana souza|ana@exemplo.com')).toEqual({ uid: 'u1' });
  });

  it('sem e-mail confirmado, deixa o diretório para depois', async () => {
    config.auth.currentUser.emailVerified = false;

    await usuario.salvarPerfilUsuario(novo);

    expect(firestore.__ler('diretorioConvites/ana souza|ana@exemplo.com')).toBeUndefined();
  });

  it('recusa CPF de outra conta', async () => {
    firestore.__semear('cpfs/52998224725', { uid: 'outra' });

    await expect(usuario.salvarPerfilUsuario(novo)).rejects.toThrow('CPF_JA_CADASTRADO');
    expect(firestore.__ler('usuarios/u1')).toBeUndefined();
  });

  it('leitura recusada pelas regras também é CPF de outra conta', async () => {
    firestore.__falhar('getDoc', { code: 'permission-denied' });

    await expect(usuario.salvarPerfilUsuario(novo)).rejects.toThrow('CPF_JA_CADASTRADO');
  });

  it('aceita o próprio CPF (cadastro refeito)', async () => {
    firestore.__semear('cpfs/52998224725', { uid: 'u1' });

    await expect(usuario.salvarPerfilUsuario(novo)).resolves.toBeUndefined();
  });

  it('se outra conta pegou o CPF durante a gravação, avisa isso', async () => {
    firestore.__falhar('commit', { code: 'permission-denied' });
    // Na conferência depois da falha, o CPF já é de outra conta.
    const getDoc = firestore.getDoc.getMockImplementation();
    firestore.getDoc.mockImplementation(async (referencia) => {
      if (referencia.path === 'cpfs/52998224725' && firestore.writeBatch.mock.calls.length) {
        firestore.__semear('cpfs/52998224725', { uid: 'outra' });
      }
      return getDoc(referencia);
    });

    await expect(usuario.salvarPerfilUsuario(novo)).rejects.toThrow('CPF_JA_CADASTRADO');
  });

  it('repassa outros erros da gravação', async () => {
    firestore.__falhar('commit', { code: 'unavailable' });

    await expect(usuario.salvarPerfilUsuario(novo)).rejects.toEqual({ code: 'unavailable' });
  });

  it('mantém telefone fora do padrão como foi digitado', async () => {
    await usuario.salvarPerfilUsuario({ ...novo, telefone: ' +351 912 ' });

    expect(firestore.__ler('usuarios/u1').telefone).toBe('+351 912');
  });
});

describe('garantirEntradaDiretorio', () => {
  it('cria a entrada que falta para o usuário logado', async () => {
    firestore.__semear('usuarios/u1', { nome: 'Ana Souza' });

    await usuario.garantirEntradaDiretorio('u1');

    expect(firestore.__ler('diretorioConvites/ana souza|ana@exemplo.com')).toEqual({ uid: 'u1' });
  });

  it('não faz nada para outro usuário, sem perfil ou sem nome', async () => {
    await usuario.garantirEntradaDiretorio('u2');
    await usuario.garantirEntradaDiretorio('u1');
    firestore.__semear('usuarios/u1', {});
    await usuario.garantirEntradaDiretorio('u1');

    expect(Object.keys(firestore.__todos()).filter((c) => c.startsWith('diretorio'))).toEqual([]);
  });

  it('não sobrescreve uma entrada existente', async () => {
    firestore.__semear('usuarios/u1', { nome: 'Ana Souza' });
    firestore.__semear('diretorioConvites/ana souza|ana@exemplo.com', { uid: 'antigo' });

    await usuario.garantirEntradaDiretorio('u1');

    expect(firestore.__ler('diretorioConvites/ana souza|ana@exemplo.com')).toEqual({ uid: 'antigo' });
  });
});

describe('buscarPerfil', () => {
  it('o próprio perfil vem com o CPF e sem campos faltando', async () => {
    firestore.__semear('usuarios/u1', { nome: 'Ana', grupoId: 'g1' });
    firestore.__semear('usuarios/u1/privado/documentos', { cpf: CPF });

    expect(await usuario.buscarPerfil('u1')).toEqual({
      uid: 'u1',
      nome: 'Ana',
      email: '',
      telefone: '',
      documento: CPF,
      endereco: '',
      enderecoDetalhado: null,
      grupoId: 'g1',
    });
  });

  it('guarda a cópia do próprio perfil sem o CPF', async () => {
    firestore.__semear('usuarios/u1', { nome: 'Ana' });
    firestore.__semear('usuarios/u1/privado/documentos', { cpf: CPF });

    await usuario.buscarPerfil('u1');
    await esperar();

    expect(await local.lerLocal('perfil')).toMatchObject({ nome: 'Ana', documento: '' });
  });

  it('o perfil de outra pessoa vem sem CPF', async () => {
    firestore.__semear('usuarios/u2', { nome: 'Bia' });
    firestore.__semear('usuarios/u2/privado/documentos', { cpf: CPF });

    expect((await usuario.buscarPerfil('u2')).documento).toBe('');
  });

  it('sem internet, usa a cópia do próprio perfil', async () => {
    await local.gravarLocal('perfil', { uid: 'u1', nome: 'Ana (cópia)' });
    firestore.__falhar('getDoc', { code: 'unavailable' });

    expect(await usuario.buscarPerfil('u1')).toEqual({ uid: 'u1', nome: 'Ana (cópia)' });
  });

  it('sem internet e sem cópia (ou cópia de outra conta), repassa o erro', async () => {
    await local.gravarLocal('perfil', { uid: 'outra', nome: 'X' });
    firestore.__falhar('getDoc', { code: 'unavailable' });

    await expect(usuario.buscarPerfil('u1')).rejects.toEqual({ code: 'unavailable' });
  });
});

describe('buscarPerfisDosMembros', () => {
  it('lê os perfis e guarda a cópia', async () => {
    firestore.__semear('usuarios/a', { nome: 'Ana', foto: 'f' });

    const perfis = await usuario.buscarPerfisDosMembros(['a', 'b']);

    expect(perfis.a).toMatchObject({ uid: 'a', nome: 'Ana', foto: 'f' });
    expect(perfis.b).toBeNull();
    await esperar();
    expect((await local.lerLocal('perfis')).a.nome).toBe('Ana');
  });

  it('um perfil indisponível usa a cópia e não derruba os outros', async () => {
    await local.gravarLocal('perfis', { b: { uid: 'b', nome: 'Bia (cópia)' } });
    firestore.__semear('usuarios/a', { nome: 'Ana' });
    firestore.__semear('usuarios/b', { nome: 'Bia' });
    firestore.__semear('usuarios/c', { nome: 'Caio' });

    const getDoc = firestore.getDoc.getMockImplementation();
    firestore.getDoc.mockImplementation((referencia) =>
      referencia.path === 'usuarios/a' ? getDoc(referencia) : Promise.reject({ code: 'unavailable' })
    );

    const perfis = await usuario.buscarPerfisDosMembros(['a', 'b', 'c']);

    expect(perfis.a.nome).toBe('Ana');
    expect(perfis.b.nome).toBe('Bia (cópia)');
    expect(perfis.c).toBeNull();
  });
});

describe('salvarFotoPerfil', () => {
  it('grava a foto no perfil sem apagar o resto', async () => {
    firestore.__semear('usuarios/u1', { nome: 'Ana' });

    await usuario.salvarFotoPerfil('u1', 'data:foto');

    expect(firestore.__ler('usuarios/u1')).toMatchObject({ nome: 'Ana', foto: 'data:foto' });
  });
});

describe('atualizarPerfil', () => {
  beforeEach(() => {
    firestore.__semear('usuarios/u1', { nome: 'Ana Souza', email: 'ana@exemplo.com', grupoId: 'g1' });
    firestore.__semear('grupos/g1/membros/u1', { nome: 'Ana Souza', status: 'ativo' });
    firestore.__semear('diretorioConvites/ana souza|ana@exemplo.com', { uid: 'u1' });
  });

  it('atualiza nome e telefone formatado', async () => {
    const perfil = await usuario.atualizarPerfil('u1', { nome: ' Ana Lima ', telefone: '1133334444' });

    expect(perfil).toEqual({ nome: 'Ana Lima', telefone: '(11) 3333-4444' });
    expect(firestore.__ler('usuarios/u1')).toMatchObject({ nome: 'Ana Lima', email: 'ana@exemplo.com' });
  });

  it('atualiza o nome no registro da família', async () => {
    await usuario.atualizarPerfil('u1', { nome: 'Ana Lima', telefone: '1133334444' });

    expect(firestore.__ler('grupos/g1/membros/u1')).toEqual({ nome: 'Ana Lima', status: 'ativo' });
  });

  it('troca a entrada do diretório de convites', async () => {
    await usuario.atualizarPerfil('u1', { nome: 'Ana Lima', telefone: '1133334444' });

    expect(firestore.__ler('diretorioConvites/ana souza|ana@exemplo.com')).toBeUndefined();
    expect(firestore.__ler('diretorioConvites/ana lima|ana@exemplo.com')).toEqual({ uid: 'u1' });
  });

  it('não apaga entrada antiga de outra conta', async () => {
    firestore.__semear('diretorioConvites/ana souza|ana@exemplo.com', { uid: 'outra' });

    await usuario.atualizarPerfil('u1', { nome: 'Ana Lima', telefone: '1133334444' });

    expect(firestore.__ler('diretorioConvites/ana souza|ana@exemplo.com')).toEqual({ uid: 'outra' });
  });

  it('mesmo nome: não mexe no diretório nem na família', async () => {
    const lote = jest.spyOn(firestore, 'writeBatch');

    await usuario.atualizarPerfil('u1', { nome: 'Ana Souza', telefone: '1133334444' });

    const [{ value }] = lote.mock.results;
    expect(value.update).not.toHaveBeenCalled();
    expect(value.delete).not.toHaveBeenCalled();
  });

  it('sem e-mail confirmado, não mexe no diretório', async () => {
    config.auth.currentUser.emailVerified = false;

    await usuario.atualizarPerfil('u1', { nome: 'Ana Lima', telefone: '1133334444' });

    expect(firestore.__ler('diretorioConvites/ana souza|ana@exemplo.com')).toEqual({ uid: 'u1' });
    expect(firestore.__ler('diretorioConvites/ana lima|ana@exemplo.com')).toBeUndefined();
  });

  it('sem família, só atualiza o perfil', async () => {
    firestore.__semear('usuarios/u1', { nome: 'Ana Souza' });

    await usuario.atualizarPerfil('u1', { nome: 'Ana Lima', telefone: '1133334444' });

    expect(firestore.__ler('grupos/g1/membros/u1').nome).toBe('Ana Souza');
  });
});
