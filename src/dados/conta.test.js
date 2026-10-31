/*
 * Testes de excluir a conta (conta.js).
 */

let conta;
let firestore;
let authFirebase;
let config;

beforeEach(() => {
  jest.resetModules();

  firestore = require('firebase/firestore');
  authFirebase = require('firebase/auth');
  config = require('../config/firebase');
  conta = require('./conta');

  config.auth.currentUser = { uid: 'u1', email: 'Ana@Exemplo.com' };
  authFirebase.reauthenticateWithCredential.mockResolvedValue();
  authFirebase.deleteUser.mockResolvedValue();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function semearConta() {
  firestore.__semear('usuarios/u1', { nome: 'Ana Souza', email: 'ana@exemplo.com' });
  firestore.__semear('usuarios/u1/privado/documentos', { cpf: '529.982.247-25' });
  firestore.__semear('cpfs/52998224725', { uid: 'u1' });
  firestore.__semear('diretorioConvites/ana souza|ana@exemplo.com', { uid: 'u1' });
  firestore.__semear('usuarios/u1/lugares/casa', { nome: 'Casa' });
  firestore.__semear('historicoLocalizacoes/u1/pontos/p1', { latitude: 1 });
  firestore.__semear('historicoLocalizacoes/u1/pontos/p2', { latitude: 2 });
  firestore.__semear('alertasSOS/s1', { uid: 'u1', status: 'encerrado' });
  firestore.__semear('convites/enviado', { deUid: 'u1' });
  firestore.__semear('convites/recebido', { paraEmail: 'ana@exemplo.com' });
  firestore.__semear('familiares/u1', { uid: 'u1' });
  // De outras pessoas: não podem ser apagados.
  firestore.__semear('usuarios/u2', { nome: 'Bia' });
  firestore.__semear('alertasSOS/s2', { uid: 'u2' });
  firestore.__semear('convites/outro', { deUid: 'u2', paraEmail: 'caio@exemplo.com' });
}

describe('excluirConta', () => {
  it('confere a senha antes de apagar qualquer coisa', async () => {
    semearConta();
    authFirebase.reauthenticateWithCredential.mockRejectedValue({ code: 'auth/invalid-credential' });

    await expect(conta.excluirConta('errada')).rejects.toEqual({ code: 'auth/invalid-credential' });

    expect(authFirebase.EmailAuthProvider.credential).toHaveBeenCalledWith('Ana@Exemplo.com', 'errada');
    expect(firestore.__ler('usuarios/u1')).toBeDefined();
    expect(authFirebase.deleteUser).not.toHaveBeenCalled();
  });

  it('apaga todos os dados da pessoa e o login', async () => {
    semearConta();

    await conta.excluirConta('segredo');

    expect(Object.keys(firestore.__todos()).sort()).toEqual(['alertasSOS/s2', 'convites/outro', 'usuarios/u2']);
    expect(authFirebase.deleteUser).toHaveBeenCalledWith(config.auth.currentUser);
  });

  it('sai da família antes de apagar o perfil', async () => {
    semearConta();
    firestore.__semear('usuarios/u1', { nome: 'Ana Souza', grupoId: 'g1' });
    firestore.__semear('grupos/g1', { administradorUid: 'u1', membros: ['u1', 'u2'] });
    firestore.__semear('grupos/g1/membros/u1', { uid: 'u1', entrouEm: '2026-01-01' });
    firestore.__semear('grupos/g1/membros/u2', { uid: 'u2', entrouEm: '2026-02-01', papel: 'membro' });

    await conta.excluirConta('segredo');

    expect(firestore.__ler('grupos/g1')).toMatchObject({ administradorUid: 'u2', membros: ['u2'] });
    expect(firestore.__ler('grupos/g1/membros/u1')).toBeUndefined();
    expect(firestore.__ler('usuarios/u1')).toBeUndefined();
  });

  it('não apaga a entrada do diretório de outra conta', async () => {
    semearConta();
    firestore.__semear('diretorioConvites/ana souza|ana@exemplo.com', { uid: 'outra' });

    await conta.excluirConta('segredo');

    expect(firestore.__ler('diretorioConvites/ana souza|ana@exemplo.com')).toEqual({ uid: 'outra' });
  });

  it('funciona para conta sem perfil (cadastro incompleto)', async () => {
    await conta.excluirConta('segredo');

    expect(authFirebase.deleteUser).toHaveBeenCalled();
  });

  it('apaga em vários lotes quando há muitos pontos', async () => {
    semearConta();
    for (let i = 0; i < 850; i++) {
      firestore.__semear(`historicoLocalizacoes/u1/pontos/x${i}`, { latitude: 1 });
    }

    await conta.excluirConta('segredo');

    expect(Object.keys(firestore.__todos()).some((caminho) => caminho.startsWith('historico'))).toBe(false);
  });

  it('se falhar no meio, tentar de novo termina o trabalho', async () => {
    semearConta();
    firestore.__falhar('commit', { code: 'unavailable' });

    await expect(conta.excluirConta('segredo')).rejects.toEqual({ code: 'unavailable' });
    expect(authFirebase.deleteUser).not.toHaveBeenCalled();

    await conta.excluirConta('segredo');

    expect(firestore.__ler('usuarios/u1')).toBeUndefined();
    expect(authFirebase.deleteUser).toHaveBeenCalled();
  });

  it('sem usuário logado', async () => {
    config.auth.currentUser = null;

    await expect(conta.excluirConta('x')).rejects.toMatchObject({ code: 'auth/no-current-user' });
  });
});
