import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { encerrarBanco, entrarComo, iniciarBanco, limparBanco, sair, semRegras } from './contexto';
import {
  atualizarPerfil,
  buscarPerfil,
  buscarPerfisDosMembros,
  chaveDiretorio,
  garantirEntradaDiretorio,
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
