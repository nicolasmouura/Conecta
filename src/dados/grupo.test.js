/*
 * Testes da família (grupo.js): criar, buscar, ouvir membros e sair.
 */

let grupo;
let firestore;
let local;

beforeEach(() => {
  jest.resetModules();

  firestore = require('firebase/firestore');
  local = require('./armazenamentoLocal');
  grupo = require('./grupo');

  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Família g1 com os membros indicados ([uid, entrouEm]).
function semearFamilia(membros, administradorUid = membros[0][0]) {
  firestore.__semear('grupos/g1', {
    nome: 'Silva',
    administradorUid,
    membros: membros.map(([uid]) => uid),
  });

  for (const [uid, entrouEm] of membros) {
    firestore.__semear(`usuarios/${uid}`, { nome: uid, grupoId: 'g1' });
    firestore.__semear(`familiares/${uid}`, { uid, grupoId: 'g1' });

    if (entrouEm !== null) {
      firestore.__semear(`grupos/g1/membros/${uid}`, {
        uid,
        nome: uid,
        papel: uid === administradorUid ? 'administrador' : 'membro',
        status: 'ativo',
        entrouEm,
      });
    }
  }
}

describe('garantirSemFamilia', () => {
  it('passa para quem não tem família ou perfil', async () => {
    await expect(grupo.garantirSemFamilia('u1')).resolves.toBeUndefined();

    firestore.__semear('usuarios/u1', { nome: 'Ana' });
    await expect(grupo.garantirSemFamilia('u1')).resolves.toBeUndefined();
  });

  it('lança JA_POSSUI_FAMILIA', async () => {
    firestore.__semear('usuarios/u1', { grupoId: 'g1' });

    await expect(grupo.garantirSemFamilia('u1')).rejects.toThrow('JA_POSSUI_FAMILIA');
  });
});

describe('criarGrupo', () => {
  it('cria a família, o registro de administrador e o vínculo no perfil', async () => {
    firestore.__semear('usuarios/u1', { nome: 'Ana' });

    const criado = await grupo.criarGrupo('  Silva ', { uid: 'u1', nome: 'Ana' });

    expect(criado).toEqual({
      id: expect.any(String),
      nome: 'Silva',
      administradorUid: 'u1',
      membros: ['u1'],
      criadoEm: expect.any(String),
    });
    expect(firestore.__ler(`grupos/${criado.id}`)).toMatchObject({ nome: 'Silva', membros: ['u1'] });
    expect(firestore.__ler(`grupos/${criado.id}/membros/u1`)).toMatchObject({
      nome: 'Ana',
      papel: 'administrador',
      status: 'ativo',
    });
    expect(firestore.__ler('usuarios/u1')).toEqual({ nome: 'Ana', grupoId: criado.id });
  });

  it('usa "Usuário" quando o nome não veio', async () => {
    const criado = await grupo.criarGrupo('Silva', { uid: 'u1' });

    expect(firestore.__ler(`grupos/${criado.id}/membros/u1`).nome).toBe('Usuário');
  });

  it('não cria se já tem família', async () => {
    firestore.__semear('usuarios/u1', { grupoId: 'g0' });

    await expect(grupo.criarGrupo('Silva', { uid: 'u1' })).rejects.toThrow('JA_POSSUI_FAMILIA');
    expect(firestore.writeBatch).not.toHaveBeenCalled();
  });
});

describe('buscarGrupoPorId', () => {
  it('null sem id ou sem família', async () => {
    expect(await grupo.buscarGrupoPorId(null)).toBeNull();
    expect(await grupo.buscarGrupoPorId('nada')).toBeNull();
  });

  it('devolve a família e guarda a cópia', async () => {
    firestore.__semear('grupos/g1', { nome: 'Silva' });

    expect(await grupo.buscarGrupoPorId('g1')).toEqual({ id: 'g1', nome: 'Silva' });
    await esperar();
    expect(await local.lerLocal('grupo:g1')).toEqual({ id: 'g1', nome: 'Silva' });
  });

  it('sem internet, usa a cópia', async () => {
    await local.gravarLocal('grupo:g1', { id: 'g1', nome: 'Silva (cópia)' });
    firestore.__falhar('getDoc', { code: 'unavailable' });

    expect(await grupo.buscarGrupoPorId('g1')).toEqual({ id: 'g1', nome: 'Silva (cópia)' });
  });

  it('sem internet e sem cópia, repassa o erro', async () => {
    firestore.__falhar('getDoc', { code: 'unavailable' });

    await expect(grupo.buscarGrupoPorId('g1')).rejects.toEqual({ code: 'unavailable' });
  });
});

describe('observarMembros', () => {
  it('entrega os membros e acompanha mudanças', async () => {
    semearFamilia([['a', '2026-01-01']]);
    const callback = jest.fn();

    const cancelar = grupo.observarMembros('g1', callback);
    await esperar();
    expect(callback).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'a', nome: 'a' })]);

    firestore.__semear('grupos/g1/membros/b', { uid: 'b', nome: 'b' });
    await esperar();
    expect(callback.mock.calls.at(-1)[0]).toHaveLength(2);

    cancelar();
  });
});

describe('sairDaFamilia', () => {
  it('membro comum sai: some da lista, do mapa e do perfil', async () => {
    semearFamilia([
      ['a', '2026-01-01'],
      ['b', '2026-02-01'],
    ]);

    expect(await grupo.sairDaFamilia('b')).toEqual({ familiaApagada: false, novoAdministrador: null });

    expect(firestore.__ler('grupos/g1')).toMatchObject({ membros: ['a'], administradorUid: 'a' });
    expect(firestore.__ler('grupos/g1/membros/b')).toBeUndefined();
    expect(firestore.__ler('familiares/b')).toBeUndefined();
    expect(firestore.__ler('usuarios/b')).toEqual({ nome: 'b' });
  });

  it('administrador sai: o membro mais antigo assume', async () => {
    semearFamilia([
      ['a', '2026-01-01'],
      ['c', '2026-03-01'],
      ['b', '2026-02-01'],
    ]);

    expect(await grupo.sairDaFamilia('a')).toEqual({ familiaApagada: false, novoAdministrador: 'b' });
    expect(firestore.__ler('grupos/g1')).toMatchObject({ administradorUid: 'b', membros: ['c', 'b'] });
    expect(firestore.__ler('grupos/g1/membros/b').papel).toBe('administrador');
  });

  it('membros sem registro ficam por último, na ordem da lista', async () => {
    semearFamilia([
      ['a', '2026-01-01'],
      ['x', null],
      ['y', null],
    ]);

    expect((await grupo.sairDaFamilia('a')).novoAdministrador).toBe('x');
    // Sem registro do membro, só o grupo muda.
    expect(firestore.__ler('grupos/g1/membros/x')).toBeUndefined();
  });

  it('registro com data assume antes de quem não tem', async () => {
    semearFamilia([
      ['a', '2026-01-01'],
      ['x', null],
      ['b', '2026-05-01'],
    ]);

    expect((await grupo.sairDaFamilia('a')).novoAdministrador).toBe('b');
  });

  it('último membro: apaga a família e cancela os convites pendentes', async () => {
    semearFamilia([['a', '2026-01-01']]);
    firestore.__semear('convites/c1', { grupoId: 'g1', status: 'pendente' });
    firestore.__semear('convites/c2', { grupoId: 'g1', status: 'aceito' });

    expect(await grupo.sairDaFamilia('a')).toEqual({ familiaApagada: true, novoAdministrador: null });
    expect(firestore.__ler('grupos/g1')).toBeUndefined();
    expect(firestore.__ler('convites/c1')).toMatchObject({ status: 'cancelado', respondidoEm: expect.any(String) });
    expect(firestore.__ler('convites/c2').status).toBe('aceito');
  });

  it('não sai sem família', async () => {
    firestore.__semear('usuarios/a', { nome: 'a' });

    await expect(grupo.sairDaFamilia('a')).rejects.toThrow('SEM_FAMILIA');
    await expect(grupo.sairDaFamilia('nada')).rejects.toThrow('SEM_FAMILIA');
  });

  it('não sai com SOS ativo', async () => {
    semearFamilia([
      ['a', '2026-01-01'],
      ['b', '2026-02-01'],
    ]);
    firestore.__semear('alertasSOS/s1', { grupoId: 'g1', status: 'ativo', uid: 'b' });

    await expect(grupo.sairDaFamilia('b')).rejects.toThrow('SOS_ATIVO');
    expect(firestore.__ler('grupos/g1').membros).toEqual(['a', 'b']);
  });

  it('SOS encerrado ou de outra pessoa não impede', async () => {
    semearFamilia([
      ['a', '2026-01-01'],
      ['b', '2026-02-01'],
    ]);
    firestore.__semear('alertasSOS/s1', { grupoId: 'g1', status: 'encerrado', uid: 'b' });
    firestore.__semear('alertasSOS/s2', { grupoId: 'g1', status: 'ativo', uid: 'a' });

    await expect(grupo.sairDaFamilia('b')).resolves.toMatchObject({ familiaApagada: false });
  });

  it('família já apagada: limpa só o que é do usuário', async () => {
    firestore.__semear('usuarios/a', { nome: 'a', grupoId: 'g1' });

    expect(await grupo.sairDaFamilia('a')).toEqual({ familiaApagada: true, novoAdministrador: null });
    expect(firestore.__ler('usuarios/a')).toEqual({ nome: 'a' });
  });
});
