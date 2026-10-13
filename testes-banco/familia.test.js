import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { encerrarBanco, entrarComo, iniciarBanco, limparBanco, sair, semRegras } from './contexto';
import {
  atualizarPerfil,
  buscarPerfil,
  buscarPerfisDosMembros,
  chaveDiretorio,
  garantirEntradaDiretorio,
  protegerDocumento,
  salvarFotoPerfil,
  salvarPerfilUsuario,
} from '../src/dados/salvarUsuario';
import { buscarGrupoPorId, criarGrupo, observarMembros } from '../src/dados/grupo';
import {
  aceitarConvite,
  enviarConvite,
  observarConvitesPendentesDoGrupo,
  observarConvitesRecebidos,
  recusarConvite,
} from '../src/dados/convites';
import { observarFamiliares, salvarLocalizacao } from '../src/dados/buscarFamiliares';
import { buscarLugares, salvarLugar } from '../src/dados/lugares';
import { buscarHistorico, registrarPontoHistorico } from '../src/dados/historico';
import { acionarSOS, encerrarSOS, observarMeuSOS, observarSOSAtivos } from '../src/dados/sos';
import { buscarTelefonesDaFamilia } from '../src/dados/smsSOS';

/*
 * O app de ponta a ponta no banco, com as regras de verdade (emulador):
 * Ana cria a família e convida o Bruno; Carlos é de fora.
 * Os testes rodam em ordem e um usa o que o anterior gravou.
 */

const ANA = {
  uid: 'ana',
  email: 'ana@teste.com',
  nome: 'Ana Souza',
  cpf: '529.982.247-25',
  telefone: '(21) 98765-4321',
  endereco: 'Rua A, 1, Centro, Rio de Janeiro - RJ',
};

const BRUNO = {
  uid: 'bruno',
  email: 'bruno@teste.com',
  nome: 'Bruno Lima',
  cpf: '111.444.777-35',
  telefone: '(21) 91234-5678',
  endereco: 'Rua B, 2, Centro, Rio de Janeiro - RJ',
};

const CARLOS = {
  uid: 'carlos',
  email: 'carlos@teste.com',
  nome: 'Carlos Dias',
  cpf: '935.411.347-80',
  telefone: '(21) 99876-5432',
  endereco: 'Rua C, 3, Centro, Niterói - RJ',
};

const CASA_ANA = {
  pais: 'Brasil',
  estado: 'RJ',
  cidade: 'Rio de Janeiro',
  bairro: 'Copacabana',
  rua: 'Rua Barata Ribeiro',
  numero: '100',
  cep: '22040-002',
};

let grupo;

// Primeira emissão de um listener (onSnapshot) do app.
function primeiraEmissao(observar) {
  return new Promise((resolve, reject) => {
    let cancelar = null;
    let pronto = false;

    cancelar = observar(
      (valor) => {
        pronto = true;
        cancelar?.();
        resolve(valor);
      },
      (erro) => reject(erro)
    );

    if (pronto) cancelar?.();
  });
}

// Emissão que já atende à condição. A primeira pode vir do cache local
// do aparelho (incompleta) e a do servidor chega logo depois.
function emissaoQue(observar, condicao) {
  return new Promise((resolve, reject) => {
    let cancelar = null;
    let pronto = false;

    cancelar = observar(
      (valor) => {
        if (pronto || !condicao(valor)) return;
        pronto = true;
        cancelar?.();
        resolve(valor);
      },
      (erro) => reject(erro)
    );

    if (pronto) cancelar?.();
  });
}

// Mesmo listener, esperando um erro (leitura negada pelas regras).
async function erroDoListener(observar) {
  try {
    await primeiraEmissao(observar);
  } catch (erro) {
    return erro.code;
  }

  return null;
}

beforeAll(async () => {
  await iniciarBanco();
  await limparBanco();
});

afterAll(async () => {
  await encerrarBanco();
});

describe('1. cadastro', () => {
  test.each([ANA, BRUNO, CARLOS])('$nome cria o perfil e a entrada no índice de convites', async (pessoa) => {
    entrarComo(pessoa);

    await salvarPerfilUsuario(pessoa);

    const perfil = await buscarPerfil(pessoa.uid);

    expect(perfil).toMatchObject({
      uid: pessoa.uid,
      nome: pessoa.nome,
      email: pessoa.email,
      documento: pessoa.cpf,
      telefone: pessoa.telefone,
    });

    const indice = await semRegras((db) =>
      getDoc(doc(db, 'diretorioConvites', chaveDiretorio(pessoa.nome, pessoa.email)))
    );

    expect(indice.data()).toEqual({ uid: pessoa.uid });

    // Entrar de novo no app não duplica nem quebra.
    await expect(garantirEntradaDiretorio(pessoa.uid)).resolves.toBeUndefined();
  });

  test('ninguém cria perfil em nome de outra pessoa', async () => {
    const db = entrarComo(CARLOS);

    await assertFails(setDoc(doc(db, 'usuarios', 'falso'), { nome: 'Falso', uid: 'falso' }));
  });

  test('sem login não lê nenhum perfil', async () => {
    sair();

    await assertFails(buscarPerfil(ANA.uid));
  });
});

describe('2. família', () => {
  test('Ana cria a família e vira administradora', async () => {
    entrarComo(ANA);

    grupo = await criarGrupo('Família Souza', ANA);

    expect(await buscarGrupoPorId(grupo.id)).toMatchObject({
      nome: 'Família Souza',
      administradorUid: ANA.uid,
      membros: [ANA.uid],
    });

    expect((await buscarPerfil(ANA.uid)).grupoId).toBe(grupo.id);
  });

  test('quem já tem família não cria outra', async () => {
    entrarComo(ANA);

    await expect(criarGrupo('Outra', ANA)).rejects.toThrow('JA_POSSUI_FAMILIA');
  });

  test('Carlos não lê a família de Ana nem se coloca nela sem convite', async () => {
    const db = entrarComo(CARLOS);

    await assertFails(getDoc(doc(db, 'grupos', grupo.id)));
    await assertFails(getDocs(collection(db, 'grupos', grupo.id, 'membros')));
    await assertFails(
      setDoc(doc(db, 'grupos', grupo.id, 'membros', CARLOS.uid), {
        uid: CARLOS.uid,
        nome: CARLOS.nome,
        papel: 'membro',
        status: 'ativo',
        entrouEm: new Date().toISOString(),
      })
    );
  });
});

describe('3. convites', () => {
  test('Ana convida o Bruno pelo nome + e-mail', async () => {
    entrarComo(ANA);

    await enviarConvite({ grupo, remetente: ANA, nome: BRUNO.nome, email: BRUNO.email });

    const pendentes = await primeiraEmissao((ok, erro) =>
      observarConvitesPendentesDoGrupo(grupo.id, ok, erro)
    );

    expect(pendentes.map((convite) => convite.paraEmail)).toEqual([BRUNO.email]);
  });

  test('convite repetido, para si mesma ou para quem não existe é barrado', async () => {
    entrarComo(ANA);

    await expect(
      enviarConvite({ grupo, remetente: ANA, nome: BRUNO.nome, email: BRUNO.email })
    ).rejects.toThrow('CONVITE_JA_PENDENTE');
    await expect(
      enviarConvite({ grupo, remetente: ANA, nome: ANA.nome, email: ANA.email })
    ).rejects.toThrow('CONVITE_PARA_SI_MESMO');
    await expect(
      enviarConvite({ grupo, remetente: ANA, nome: 'Ninguém', email: 'ninguem@teste.com' })
    ).rejects.toThrow('USUARIO_NAO_ENCONTRADO');
  });

  test('Carlos não vê o convite do Bruno', async () => {
    entrarComo(CARLOS);

    const recebidos = await primeiraEmissao((ok, erro) => observarConvitesRecebidos(ok, erro));

    expect(recebidos).toEqual([]);
    expect(
      await erroDoListener((ok, erro) => observarConvitesPendentesDoGrupo(grupo.id, ok, erro))
    ).toBe('permission-denied');
  });

  test('Bruno vê o convite e aceita: entra na família', async () => {
    entrarComo(BRUNO);

    const [convite] = await primeiraEmissao((ok, erro) => observarConvitesRecebidos(ok, erro));

    expect(convite).toMatchObject({ grupoId: grupo.id, deNome: ANA.nome, status: 'pendente' });

    await aceitarConvite(convite, BRUNO);

    expect((await buscarGrupoPorId(grupo.id)).membros).toEqual([ANA.uid, BRUNO.uid]);
    expect((await buscarPerfil(BRUNO.uid)).grupoId).toBe(grupo.id);

    const membros = await emissaoQue(
      (ok, erro) => observarMembros(grupo.id, ok, erro),
      (lista) => lista.length === 2
    );

    expect(membros.map((membro) => [membro.uid, membro.papel]).sort()).toEqual([
      [ANA.uid, 'administrador'],
      [BRUNO.uid, 'membro'],
    ]);
  });

  test('Carlos recusa um convite; Ana pode convidar de novo', async () => {
    entrarComo(ANA);
    await enviarConvite({ grupo, remetente: ANA, nome: CARLOS.nome, email: CARLOS.email });

    entrarComo(CARLOS);
    const [convite] = await primeiraEmissao((ok, erro) => observarConvitesRecebidos(ok, erro));
    await recusarConvite(convite, CARLOS);

    expect(await primeiraEmissao((ok, erro) => observarConvitesRecebidos(ok, erro))).toEqual([]);

    entrarComo(ANA);
    await expect(
      enviarConvite({ grupo, remetente: ANA, nome: CARLOS.nome, email: CARLOS.email })
    ).resolves.toBeUndefined();

    // Deixa Carlos de fora para os próximos testes.
    entrarComo(CARLOS);
    const [reenviado] = await primeiraEmissao((ok, erro) => observarConvitesRecebidos(ok, erro));
    await recusarConvite(reenviado, CARLOS);
  });

  test('ninguém aceita convite de outra pessoa', async () => {
    const db = entrarComo(CARLOS);

    await assertFails(
      updateDoc(doc(db, 'grupos', grupo.id), { membros: [ANA.uid, BRUNO.uid, CARLOS.uid] })
    );
  });
});

describe('4. perfil', () => {
  test('a família lê o perfil; quem é de fora não', async () => {
    entrarComo(BRUNO);

    expect((await buscarPerfil(ANA.uid)).nome).toBe(ANA.nome);

    const perfis = await buscarPerfisDosMembros([ANA.uid, BRUNO.uid]);
    expect(perfis[ANA.uid].nome).toBe(ANA.nome);
    expect(perfis[BRUNO.uid].nome).toBe(BRUNO.nome);

    entrarComo(CARLOS);
    await assertFails(buscarPerfil(ANA.uid));
  });

  test('Ana muda o nome: perfil, cópia na família e índice mudam juntos', async () => {
    entrarComo(ANA);

    await atualizarPerfil(ANA.uid, { nome: 'Ana Souza Lima', telefone: ANA.telefone });

    expect((await buscarPerfil(ANA.uid)).nome).toBe('Ana Souza Lima');

    const membro = await semRegras((db) => getDoc(doc(db, 'grupos', grupo.id, 'membros', ANA.uid)));
    expect(membro.data().nome).toBe('Ana Souza Lima');

    const [antiga, nova] = await semRegras((db) =>
      Promise.all([
        getDoc(doc(db, 'diretorioConvites', chaveDiretorio(ANA.nome, ANA.email))),
        getDoc(doc(db, 'diretorioConvites', chaveDiretorio('Ana Souza Lima', ANA.email))),
      ])
    );

    expect(antiga.exists()).toBe(false);
    expect(nova.data()).toEqual({ uid: ANA.uid });
  });

  test('o CPF não muda depois de preenchido', async () => {
    const db = entrarComo(ANA);

    await assertFails(updateDoc(doc(db, 'usuarios', ANA.uid), { documento: '111.444.777-35' }));
  });

  test('foto de perfil: o dono grava; formato inválido é recusado', async () => {
    entrarComo(ANA);

    await salvarFotoPerfil(ANA.uid, 'data:image/jpeg;base64,AAAA');
    expect((await buscarPerfil(ANA.uid)).foto).toBe('data:image/jpeg;base64,AAAA');

    await assertFails(salvarFotoPerfil(ANA.uid, 'data:image/png;base64,AAAA'));
  });

  test('ninguém altera o perfil de outra pessoa', async () => {
    const db = entrarComo(BRUNO);

    await assertFails(updateDoc(doc(db, 'usuarios', ANA.uid), { nome: 'Invasor' }));
    await assertFails(updateDoc(doc(db, 'usuarios', BRUNO.uid), { grupoId: 'outro-grupo' }));
  });
});

describe('5. casa (Meus lugares)', () => {
  test('Ana salva a casa; o endereço do perfil muda junto', async () => {
    entrarComo(ANA);

    await salvarLugar(ANA.uid, 'casa', {
      enderecoDetalhado: CASA_ANA,
      latitude: -22.9668,
      longitude: -43.1869,
    });

    const lugares = await buscarLugares(ANA.uid);
    expect(lugares.casa).toMatchObject({ tipo: 'casa', enderecoDetalhado: CASA_ANA, latitude: -22.9668 });

    const perfil = await buscarPerfil(ANA.uid);
    expect(perfil.enderecoDetalhado).toEqual(CASA_ANA);
    expect(perfil.endereco).toContain('Rua Barata Ribeiro, 100');
  });

  test('a posição da casa é só da dona (nem a família lê)', async () => {
    const db = entrarComo(BRUNO);

    await assertFails(getDoc(doc(db, 'usuarios', ANA.uid, 'lugares', 'casa')));
  });
});

describe('6. localização no mapa', () => {
  test('Bruno envia a posição; Ana vê no mapa', async () => {
    entrarComo(BRUNO);

    await salvarLocalizacao({
      uid: BRUNO.uid,
      grupoId: grupo.id,
      nome: BRUNO.nome,
      coordenadas: { latitude: -22.95, longitude: -43.2, accuracy: 12.4 },
      rua: 'Rua B',
      estadoCasa: { emCasa: false, distanciaCasa: 500 },
    });

    entrarComo(ANA);

    const familiares = await primeiraEmissao((ok, erro) => observarFamiliares(grupo.id, ok, erro));

    expect(familiares).toEqual([
      expect.objectContaining({
        uid: BRUNO.uid,
        nome: BRUNO.nome,
        latitude: -22.95,
        longitude: -43.2,
        precisao: 12,
        rua: 'Rua B',
        emCasa: false,
        distanciaCasa: 500,
      }),
    ]);
  });

  test('Carlos não vê o mapa da família', async () => {
    entrarComo(CARLOS);

    expect(await erroDoListener((ok, erro) => observarFamiliares(grupo.id, ok, erro))).toBe(
      'permission-denied'
    );
  });

  test('ninguém envia posição em nome de outra pessoa', async () => {
    entrarComo(BRUNO);

    await assertFails(
      salvarLocalizacao({
        uid: ANA.uid,
        grupoId: grupo.id,
        nome: ANA.nome,
        coordenadas: { latitude: 0, longitude: 0 },
      })
    );
  });

  test('ninguém se coloca no mapa de uma família que não é a sua', async () => {
    entrarComo(CARLOS);

    await assertFails(
      salvarLocalizacao({
        uid: CARLOS.uid,
        grupoId: grupo.id,
        nome: CARLOS.nome,
        coordenadas: { latitude: 0, longitude: 0 },
      })
    );
  });
});

describe('7. histórico', () => {
  const periodo = () => ({
    inicio: new Date(Date.now() - 60 * 60 * 1000),
    fim: new Date(Date.now() + 60 * 60 * 1000),
  });

  test('Bruno registra pontos; ele e a família leem, em ordem', async () => {
    entrarComo(BRUNO);

    await registrarPontoHistorico({
      uid: BRUNO.uid,
      grupoId: grupo.id,
      coordenadas: { latitude: -22.95, longitude: -43.2 },
    });
    await registrarPontoHistorico({
      uid: BRUNO.uid,
      grupoId: grupo.id,
      coordenadas: { latitude: -22.96, longitude: -43.21, accuracy: 8 },
    });

    const meus = await buscarHistorico(BRUNO.uid, periodo());
    expect(meus.pontos.map((ponto) => ponto.latitude)).toEqual([-22.95, -22.96]);
    expect(meus.pontos[1].precisao).toBe(8);

    entrarComo(ANA);
    const daFamilia = await buscarHistorico(BRUNO.uid, periodo());
    expect(daFamilia.pontos).toHaveLength(2);
  });

  test('Carlos não lê o histórico; ninguém grava no histórico de outro', async () => {
    entrarComo(CARLOS);
    await assertFails(buscarHistorico(BRUNO.uid, periodo()));

    entrarComo(ANA);
    await assertFails(
      registrarPontoHistorico({
        uid: BRUNO.uid,
        grupoId: grupo.id,
        coordenadas: { latitude: 0, longitude: 0 },
      })
    );
  });

  test('pontos do histórico não são alterados nem apagados', async () => {
    const db = entrarComo(BRUNO);
    const pontos = await getDocs(collection(db, 'historicoLocalizacoes', BRUNO.uid, 'pontos'));
    const ponto = pontos.docs[0].ref;

    await assertFails(updateDoc(ponto, { latitude: 0 }));
    await assertFails(deleteDoc(ponto));
  });
});

describe('8. SOS', () => {
  let alertaId;

  test('Bruno aciona o SOS com a última posição; a família vê', async () => {
    entrarComo(BRUNO);

    const resultado = await acionarSOS({ uid: BRUNO.uid, grupoId: grupo.id, nome: BRUNO.nome });
    alertaId = resultado.id;

    expect(resultado).toMatchObject({ jaExistia: false, comLocalizacao: true });

    // Acionar de novo reaproveita o mesmo alerta.
    expect(await acionarSOS({ uid: BRUNO.uid, grupoId: grupo.id, nome: BRUNO.nome })).toEqual({
      id: alertaId,
      jaExistia: true,
    });

    entrarComo(ANA);

    const ativos = await primeiraEmissao((ok, erro) => observarSOSAtivos(grupo.id, ok, erro));

    expect(ativos).toEqual([
      expect.objectContaining({
        id: alertaId,
        uid: BRUNO.uid,
        nome: BRUNO.nome,
        status: 'ativo',
        latitude: -22.95,
        longitude: -43.2,
      }),
    ]);
    expect(typeof ativos[0].criadoEm).toBe('number');
  });

  test('SMS: o Bruno encontra o telefone da Ana (e não o próprio)', async () => {
    entrarComo(BRUNO);

    const telefones = await buscarTelefonesDaFamilia(grupo.id, BRUNO.uid);

    expect(telefones).toHaveLength(1);
    expect(telefones[0].replace(/\D/g, '')).toContain('21987654321');
  });

  test('Carlos não vê o SOS nem cria SOS na família', async () => {
    const db = entrarComo(CARLOS);

    expect(await erroDoListener((ok, erro) => observarSOSAtivos(grupo.id, ok, erro))).toBe(
      'permission-denied'
    );
    await assertFails(
      addDoc(collection(db, 'alertasSOS'), {
        uid: CARLOS.uid,
        grupoId: grupo.id,
        nome: CARLOS.nome,
        criadoEm: serverTimestamp(),
        status: 'ativo',
      })
    );
    expect(await buscarTelefonesDaFamilia(grupo.id, CARLOS.uid)).toEqual([]);
  });

  test('só o Bruno encerra o próprio SOS', async () => {
    entrarComo(ANA);
    await assertFails(encerrarSOS(alertaId));

    entrarComo(BRUNO);
    await assertSucceeds(encerrarSOS(alertaId));

    const meu = await primeiraEmissao((ok, erro) =>
      observarMeuSOS(grupo.id, BRUNO.uid, ok, erro)
    );
    expect(meu).toBeNull();
  });

  test('alertas não são apagados', async () => {
    const db = entrarComo(BRUNO);

    await assertFails(deleteDoc(doc(db, 'alertasSOS', alertaId)));
  });
});

describe('9. CPF só para o dono', () => {
  test('a família lê o perfil, mas sem o CPF (nem pela API)', async () => {
    const db = entrarComo(BRUNO);

    const perfilBruto = await getDoc(doc(db, 'usuarios', ANA.uid));
    expect(perfilBruto.data()).not.toHaveProperty('documento');
    expect((await buscarPerfil(ANA.uid)).documento).toBe('');
    expect((await buscarPerfisDosMembros([ANA.uid]))[ANA.uid].documento).toBe('');

    await assertFails(getDoc(doc(db, 'usuarios', ANA.uid, 'privado', 'documentos')));
  });

  test('o dono lê o próprio CPF', async () => {
    const db = entrarComo(ANA);

    await assertSucceeds(getDoc(doc(db, 'usuarios', ANA.uid, 'privado', 'documentos')));
    expect((await buscarPerfil(ANA.uid)).documento).toBe(ANA.cpf);
  });

  test('o CPF não muda, não é apagado e não volta para o perfil', async () => {
    const db = entrarComo(ANA);
    const privado = doc(db, 'usuarios', ANA.uid, 'privado', 'documentos');

    await assertFails(updateDoc(privado, { cpf: '111.444.777-35' }));
    await assertFails(deleteDoc(privado));
    await assertFails(setDoc(doc(db, 'usuarios', ANA.uid, 'privado', 'outro'), { cpf: ANA.cpf }));
    await assertFails(updateDoc(doc(db, 'usuarios', ANA.uid), { documento: ANA.cpf }));
  });

  test('ninguém grava CPF na área privada de outra pessoa', async () => {
    const db = entrarComo(CARLOS);

    await assertFails(
      setDoc(doc(db, 'usuarios', 'conta-sem-cpf', 'privado', 'documentos'), { cpf: CARLOS.cpf })
    );
  });

  test('cadastro novo não aceita CPF no perfil público', async () => {
    const db = entrarComo({ uid: 'nova', email: 'nova@teste.com' });

    await assertFails(
      setDoc(doc(db, 'usuarios', 'nova'), { nome: 'Nova', uid: 'nova', documento: ANA.cpf })
    );
  });
});

describe('10. conta antiga com CPF no perfil', () => {
  const DAVI = { uid: 'davi', email: 'davi@teste.com', nome: 'Davi Rocha', cpf: '935.411.347-80' };

  beforeAll(async () => {
    // Perfil gravado antes da mudança: CPF no campo "documento".
    await semRegras((db) =>
      setDoc(doc(db, 'usuarios', DAVI.uid), {
        nome: DAVI.nome,
        email: DAVI.email,
        uid: DAVI.uid,
        criadoEm: new Date().toISOString(),
        documento: DAVI.cpf,
      })
    );
  });

  test('não dá para tirar o CPF do perfil sem a cópia privada igual', async () => {
    const db = entrarComo(DAVI);

    await assertFails(updateDoc(doc(db, 'usuarios', DAVI.uid), { documento: deleteField() }));
    await assertFails(
      setDoc(doc(db, 'usuarios', DAVI.uid, 'privado', 'documentos'), { cpf: '111.444.777-35' })
    );
  });

  test('no login o CPF é movido para a área privada', async () => {
    entrarComo(DAVI);

    expect((await buscarPerfil(DAVI.uid)).documento).toBe(DAVI.cpf);
    expect(await protegerDocumento(DAVI.uid)).toBe(true);

    const [perfil, privado] = await semRegras((db) =>
      Promise.all([
        getDoc(doc(db, 'usuarios', DAVI.uid)),
        getDoc(doc(db, 'usuarios', DAVI.uid, 'privado', 'documentos')),
      ])
    );

    expect(perfil.data()).not.toHaveProperty('documento');
    expect(privado.data()).toEqual({ cpf: DAVI.cpf });
    expect((await buscarPerfil(DAVI.uid)).documento).toBe(DAVI.cpf);

    // Próximo login: nada a fazer.
    expect(await protegerDocumento(DAVI.uid)).toBe(false);
  });

  test('conta antiga sem CPF informa uma única vez', async () => {
    const EVA = { uid: 'eva', email: 'eva@teste.com', nome: 'Eva Melo' };

    await semRegras((db) =>
      setDoc(doc(db, 'usuarios', EVA.uid), {
        nome: EVA.nome,
        email: EVA.email,
        uid: EVA.uid,
        criadoEm: new Date().toISOString(),
      })
    );

    entrarComo(EVA);

    const salvo = await atualizarPerfil(EVA.uid, {
      nome: EVA.nome,
      telefone: '(21) 97777-6666',
      cpf: '111.444.777-35',
    });

    expect(salvo.documento).toBe('111.444.777-35');
    expect((await buscarPerfil(EVA.uid)).documento).toBe('111.444.777-35');

    // Outro CPF depois: o app ignora (e as regras recusariam).
    await atualizarPerfil(EVA.uid, {
      nome: EVA.nome,
      telefone: '(21) 97777-6666',
      cpf: '529.982.247-25',
    });
    expect((await buscarPerfil(EVA.uid)).documento).toBe('111.444.777-35');
  });
});

describe('11. convites: só o convidado responde', () => {
  let convite;

  beforeAll(async () => {
    entrarComo(ANA);
    await enviarConvite({
      grupo,
      remetente: { uid: ANA.uid, nome: 'Ana Souza Lima' },
      nome: CARLOS.nome,
      email: CARLOS.email,
    });

    entrarComo(CARLOS);
    [convite] = await primeiraEmissao((ok, erro) => observarConvitesRecebidos(ok, erro));
  });

  test('outra conta com o mesmo e-mail não aceita nem recusa', async () => {
    // Token com o e-mail do Carlos, mas outro uid.
    entrarComo({ uid: 'impostor', email: CARLOS.email });

    await assertFails(aceitarConvite(convite, { uid: 'impostor', nome: 'Impostor' }));
    await assertFails(recusarConvite(convite, { uid: 'impostor' }));
  });

  test('a resposta precisa da data em texto curto', async () => {
    const db = entrarComo(CARLOS);

    await assertFails(
      updateDoc(doc(db, 'convites', convite.id), {
        status: 'recusado',
        paraUid: CARLOS.uid,
        respondidoEm: 'x'.repeat(41),
      })
    );

    await assertSucceeds(recusarConvite(convite, CARLOS));
  });
});

describe('12. campos de texto com limite', () => {
  const GRANDE = { uid: 'grande', email: 'grande@teste.com' };

  test('perfil com criadoEm gigante é recusado', async () => {
    const db = entrarComo(GRANDE);

    await assertFails(
      setDoc(doc(db, 'usuarios', GRANDE.uid), { nome: 'Grande', uid: GRANDE.uid, criadoEm: 'x'.repeat(5000) })
    );
    await assertSucceeds(
      setDoc(doc(db, 'usuarios', GRANDE.uid), {
        nome: 'Grande',
        uid: GRANDE.uid,
        criadoEm: new Date().toISOString(),
      })
    );
  });

  test('convite com criadoEm gigante é recusado', async () => {
    const db = entrarComo(ANA);
    const indice = await semRegras((banco) =>
      getDoc(doc(banco, 'diretorioConvites', chaveDiretorio(CARLOS.nome, CARLOS.email)))
    );

    await assertFails(
      setDoc(doc(db, 'convites', `${grupo.id}_${CARLOS.email}`), {
        grupoId: grupo.id,
        grupoNome: 'Família Souza',
        deUid: ANA.uid,
        deNome: 'Ana Souza Lima',
        paraEmail: CARLOS.email,
        paraNome: 'carlos dias',
        paraUid: indice.data().uid,
        status: 'pendente',
        criadoEm: 'x'.repeat(5000),
      })
    );
  });

  test('família e membro com datas gigantes são recusados', async () => {
    const db = entrarComo(GRANDE);
    const grupoNovo = doc(collection(db, 'grupos'));

    // Mesmo lote do criarGrupo, só com os textos de data enormes.
    const montar = (criadoEm, entrouEm) => {
      const lote = writeBatch(db);

      lote.set(grupoNovo, {
        nome: 'Grande',
        administradorUid: GRANDE.uid,
        membros: [GRANDE.uid],
        criadoEm,
      });
      lote.set(doc(db, 'grupos', grupoNovo.id, 'membros', GRANDE.uid), {
        uid: GRANDE.uid,
        nome: 'Grande',
        papel: 'administrador',
        status: 'ativo',
        entrouEm,
      });
      lote.set(doc(db, 'usuarios', GRANDE.uid), { grupoId: grupoNovo.id }, { merge: true });

      return lote.commit();
    };

    const agora = new Date().toISOString();

    await assertFails(montar('x'.repeat(5000), agora));
    await assertFails(montar(agora, 'x'.repeat(5000)));
    await assertSucceeds(montar(agora, agora));
  });
});
