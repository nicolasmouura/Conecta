/*
 * Testes do banco no Emulador do Firestore, com as regras de verdade:
 * o app de ponta a ponta e tudo o que deve ser negado.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
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
import { buscarGrupoPorId, criarGrupo, observarMembros, sairDaFamilia } from '../src/dados/grupo';
import { excluirConta } from '../src/dados/conta';
import { avisarQueEstouBem, descreverEstouBem } from '../src/dados/estouBem';
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

// Últimas 24 h (pega todos os pontos registrados nos testes).
const periodoAmplo = () => ({
  inicio: new Date(Date.now() - 24 * 60 * 60 * 1000),
  fim: new Date(Date.now() + 60 * 60 * 1000),
});

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

    // O CPF ficou na área privada e no índice de CPFs (um CPF, uma conta).
    const [privado, cpf] = await semRegras((db) =>
      Promise.all([
        getDoc(doc(db, 'usuarios', pessoa.uid, 'privado', 'documentos')),
        getDoc(doc(db, 'cpfs', pessoa.cpf.replace(/\D/g, ''))),
      ])
    );
    expect(privado.data()).toEqual({ cpf: pessoa.cpf });
    expect(cpf.data()).toEqual({ uid: pessoa.uid });

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
    // A família lê só os pontos registrados nela: filtra pelo grupo.
    const daFamilia = await buscarHistorico(BRUNO.uid, periodo(), grupo.id);
    expect(daFamilia.pontos).toHaveLength(2);

    // Sem o filtro da família, a consulta é recusada.
    await assertFails(buscarHistorico(BRUNO.uid, periodo()));
  });

  test('Carlos não lê o histórico; ninguém grava no histórico de outro', async () => {
    entrarComo(CARLOS);
    await assertFails(buscarHistorico(BRUNO.uid, periodo()));
    await assertFails(buscarHistorico(BRUNO.uid, periodo(), grupo.id));

    entrarComo(ANA);
    await assertFails(
      registrarPontoHistorico({
        uid: BRUNO.uid,
        grupoId: grupo.id,
        coordenadas: { latitude: 0, longitude: 0 },
      })
    );
  });

  test('pontos não são alterados; só o dono apaga (excluir conta)', async () => {
    let db = entrarComo(BRUNO);
    const pontos = await getDocs(collection(db, 'historicoLocalizacoes', BRUNO.uid, 'pontos'));
    const caminho = pontos.docs[0].ref.path;

    await assertFails(updateDoc(doc(db, caminho), { latitude: 0 }));

    db = entrarComo(ANA);
    await assertFails(deleteDoc(doc(db, caminho)));
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

  test('só o autor apaga o próprio alerta (excluir conta)', async () => {
    const db = entrarComo(ANA);

    await assertFails(deleteDoc(doc(db, 'alertasSOS', alertaId)));
  });
});

describe('8b. "Estou bem"', () => {
  test('Bruno avisa; a família vê na hora no registro dele', async () => {
    entrarComo(BRUNO);
    await avisarQueEstouBem(grupo.id, BRUNO.uid);

    entrarComo(ANA);
    const membros = await emissaoQue(
      (ok, erro) => observarMembros(grupo.id, ok, erro),
      (lista) => lista.some((membro) => membro.uid === BRUNO.uid && membro.estouBemEm)
    );
    const bruno = membros.find((membro) => membro.uid === BRUNO.uid);

    expect(descreverEstouBem(bruno.estouBemEm, Date.now())).toBe('Está bem · agora');
  });

  test('ninguém avisa por outra pessoa nem inventa o horário', async () => {
    let db = entrarComo(ANA);
    await assertFails(avisarQueEstouBem(grupo.id, BRUNO.uid));

    db = entrarComo(BRUNO);
    await assertFails(
      updateDoc(doc(db, 'grupos', grupo.id, 'membros', BRUNO.uid), {
        estouBemEm: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
    );
    // Junto com outro campo (ex.: virar administrador) também não.
    await assertFails(
      updateDoc(doc(db, 'grupos', grupo.id, 'membros', BRUNO.uid), {
        estouBemEm: serverTimestamp(),
        papel: 'administrador',
      })
    );
  });

  test('quem é de fora não avisa na família', async () => {
    entrarComo(CARLOS);

    await assertFails(avisarQueEstouBem(grupo.id, CARLOS.uid));
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

describe('10. um CPF, uma conta', () => {
  const OUTRA = { uid: 'outra', email: 'outra@teste.com', nome: 'Outra Pessoa', telefone: '(21) 94444-3333' };
  const numero = (cpf) => cpf.replace(/\D/g, '');

  test('cadastro com o CPF de outra conta é recusado (e nada é gravado)', async () => {
    entrarComo(OUTRA);

    await expect(salvarPerfilUsuario({ ...OUTRA, cpf: ANA.cpf })).rejects.toThrow('CPF_JA_CADASTRADO');

    const perfil = await semRegras((db) => getDoc(doc(db, 'usuarios', OUTRA.uid)));
    expect(perfil.exists()).toBe(false);
  });

  test('nem gravando direto, sem passar pelo app', async () => {
    const db = entrarComo(OUTRA);
    const lote = writeBatch(db);

    lote.set(doc(db, 'usuarios', OUTRA.uid), {
      nome: OUTRA.nome,
      uid: OUTRA.uid,
      email: OUTRA.email,
      criadoEm: new Date().toISOString(),
    });
    lote.set(doc(db, 'usuarios', OUTRA.uid, 'privado', 'documentos'), { cpf: ANA.cpf });
    lote.set(doc(db, 'cpfs', numero(ANA.cpf)), { uid: OUTRA.uid });

    await assertFails(lote.commit());
  });

  test('o índice só responde "livre" ou "é seu"; listar é proibido', async () => {
    let db = entrarComo(OUTRA);

    await assertFails(getDoc(doc(db, 'cpfs', numero(ANA.cpf))));
    await assertSucceeds(getDoc(doc(db, 'cpfs', '98765432100')));
    await assertFails(getDocs(collection(db, 'cpfs')));

    db = entrarComo(ANA);
    await assertSucceeds(getDoc(doc(db, 'cpfs', numero(ANA.cpf))));
  });

  test('CPF privado e índice só existem juntos, com o mesmo número', async () => {
    const db = entrarComo(OUTRA);

    await assertFails(setDoc(doc(db, 'cpfs', '98765432100'), { uid: OUTRA.uid }));
    await assertFails(
      setDoc(doc(db, 'usuarios', OUTRA.uid, 'privado', 'documentos'), { cpf: '987.654.321-00' })
    );

    const lote = writeBatch(db);

    lote.set(doc(db, 'usuarios', OUTRA.uid, 'privado', 'documentos'), { cpf: '987.654.321-00' });
    lote.set(doc(db, 'cpfs', '24681357928'), { uid: OUTRA.uid });

    await assertFails(lote.commit());
  });

  test('com um CPF livre, cadastra normalmente', async () => {
    entrarComo(OUTRA);

    await salvarPerfilUsuario({ ...OUTRA, cpf: '987.654.321-00' });

    expect((await buscarPerfil(OUTRA.uid)).documento).toBe('987.654.321-00');
  });

  test('enquanto a conta existe, o índice não muda nem é apagado', async () => {
    const db = entrarComo(OUTRA);

    await assertFails(updateDoc(doc(db, 'cpfs', '98765432100'), { uid: 'outro-uid' }));
    await assertFails(deleteDoc(doc(db, 'cpfs', '98765432100')));
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

const HUGO = {
  uid: 'hugo',
  email: 'hugo@teste.com',
  nome: 'Hugo Reis',
  cpf: '123.456.789-09',
  telefone: '(21) 95555-4444',
};

// Convite pendente recebido pela pessoa logada (ou undefined).
async function convitePendente(grupoId) {
  const recebidos = await primeiraEmissao((ok, erro) => observarConvitesRecebidos(ok, erro));

  return recebidos.find((convite) => convite.grupoId === grupoId);
}

describe('13. e-mail não confirmado', () => {
  test('cadastra o perfil, mas fica fora do índice de convites', async () => {
    entrarComo({ ...HUGO, verificado: false });

    await salvarPerfilUsuario(HUGO);

    const indice = await semRegras((db) =>
      getDoc(doc(db, 'diretorioConvites', chaveDiretorio(HUGO.nome, HUGO.email)))
    );
    expect(indice.exists()).toBe(false);
  });

  test('não entra no índice, não cria família, não convida', async () => {
    const db = entrarComo({ ...HUGO, verificado: false });

    await assertFails(
      setDoc(doc(db, 'diretorioConvites', chaveDiretorio(HUGO.nome, HUGO.email)), { uid: HUGO.uid })
    );
    await assertFails(criarGrupo('Família Reis', HUGO));
  });

  test('não aceita nem recusa convite', async () => {
    entrarComo(ANA);
    await enviarConvite({
      grupo,
      remetente: { uid: ANA.uid, nome: 'Ana Souza Lima' },
      nome: CARLOS.nome,
      email: CARLOS.email,
    });

    entrarComo({ ...CARLOS, verificado: false });
    const convite = await convitePendente(grupo.id);

    await assertFails(aceitarConvite(convite, CARLOS));
    await assertFails(recusarConvite(convite, CARLOS));

    // Confirmado: aceita (e a família fica com 3 membros).
    entrarComo(CARLOS);
    await aceitarConvite(convite, CARLOS);
    expect((await buscarGrupoPorId(grupo.id)).membros).toEqual([ANA.uid, BRUNO.uid, CARLOS.uid]);
  });

  test('depois de confirmar, entra no índice ao abrir o app', async () => {
    entrarComo(HUGO);

    await garantirEntradaDiretorio(HUGO.uid);

    const indice = await semRegras((db) =>
      getDoc(doc(db, 'diretorioConvites', chaveDiretorio(HUGO.nome, HUGO.email)))
    );
    expect(indice.data()).toEqual({ uid: HUGO.uid });
  });
});

describe('14. sair da família', () => {
  let familiaLima;

  test('com SOS ativo não sai', async () => {
    entrarComo(BRUNO);

    const { id } = await acionarSOS({ uid: BRUNO.uid, grupoId: grupo.id, nome: BRUNO.nome });

    await expect(sairDaFamilia(BRUNO.uid)).rejects.toThrow('SOS_ATIVO');

    await encerrarSOS(id);
  });

  test('ninguém tira outra pessoa da família (nem o administrador)', async () => {
    let db = entrarComo(CARLOS);
    await assertFails(updateDoc(doc(db, 'grupos', grupo.id), { membros: [ANA.uid, CARLOS.uid] }));

    db = entrarComo(ANA);
    await assertFails(updateDoc(doc(db, 'grupos', grupo.id), { membros: [ANA.uid, CARLOS.uid] }));
    await assertFails(deleteDoc(doc(db, 'grupos', grupo.id, 'membros', BRUNO.uid)));
  });

  test('não dá para sair deixando a família no perfil', async () => {
    const db = entrarComo(CARLOS);
    const lote = writeBatch(db);

    lote.update(doc(db, 'grupos', grupo.id), { membros: [ANA.uid, BRUNO.uid] });
    lote.delete(doc(db, 'grupos', grupo.id, 'membros', CARLOS.uid));

    await assertFails(lote.commit());
  });

  test('a administradora sai: o membro mais antigo (Bruno) assume', async () => {
    entrarComo(ANA);

    expect(await sairDaFamilia(ANA.uid)).toEqual({ familiaApagada: false, novoAdministrador: BRUNO.uid });

    const [familia, registroBruno, registroAna, perfilAna] = await semRegras((db) =>
      Promise.all([
        getDoc(doc(db, 'grupos', grupo.id)),
        getDoc(doc(db, 'grupos', grupo.id, 'membros', BRUNO.uid)),
        getDoc(doc(db, 'grupos', grupo.id, 'membros', ANA.uid)),
        getDoc(doc(db, 'usuarios', ANA.uid)),
      ])
    );

    expect(familia.data()).toMatchObject({
      administradorUid: BRUNO.uid,
      membros: [BRUNO.uid, CARLOS.uid],
    });
    expect(registroBruno.data().papel).toBe('administrador');
    expect(registroAna.exists()).toBe(false);
    expect(perfilAna.data()).not.toHaveProperty('grupoId');
  });

  test('quem saiu não vê mais nada da família', async () => {
    const db = entrarComo(ANA);

    await assertFails(getDoc(doc(db, 'grupos', grupo.id)));
    expect(await erroDoListener((ok, erro) => observarFamiliares(grupo.id, ok, erro))).toBe(
      'permission-denied'
    );
    await assertFails(buscarHistorico(BRUNO.uid, periodoAmplo(), grupo.id));
    await assertFails(buscarPerfil(BRUNO.uid));
  });

  test('não volta sozinha: só com um convite novo', async () => {
    const db = entrarComo(ANA);
    await assertFails(updateDoc(doc(db, 'usuarios', ANA.uid), { grupoId: grupo.id }));

    // Bruno (agora administrador) convida de novo (o convite antigo era "aceito").
    entrarComo(BRUNO);
    await enviarConvite({ grupo, remetente: BRUNO, nome: 'Ana Souza Lima', email: ANA.email });

    entrarComo(ANA);
    await aceitarConvite(await convitePendente(grupo.id), { uid: ANA.uid, nome: 'Ana Souza Lima' });

    expect((await buscarGrupoPorId(grupo.id)).membros).toEqual([BRUNO.uid, CARLOS.uid, ANA.uid]);
    expect((await buscarHistorico(BRUNO.uid, periodoAmplo(), grupo.id)).pontos).toHaveLength(2);
  });

  test('o histórico fica com a família em que foi registrado', async () => {
    // Bruno sai (Carlos é o mais antigo e assume) e cria outra família com o Hugo.
    entrarComo(BRUNO);
    expect((await sairDaFamilia(BRUNO.uid)).novoAdministrador).toBe(CARLOS.uid);

    familiaLima = await criarGrupo('Família Lima', BRUNO);
    await enviarConvite({ grupo: familiaLima, remetente: BRUNO, nome: HUGO.nome, email: HUGO.email });

    entrarComo(HUGO);
    await aceitarConvite(await convitePendente(familiaLima.id), HUGO);

    // A família nova não vê os pontos da família antiga.
    expect((await buscarHistorico(BRUNO.uid, periodoAmplo(), familiaLima.id)).pontos).toEqual([]);
    await assertFails(buscarHistorico(BRUNO.uid, periodoAmplo()));

    // E a família antiga também não vê mais nada do Bruno.
    entrarComo(ANA);
    await assertFails(buscarHistorico(BRUNO.uid, periodoAmplo(), grupo.id));
  });

  test('o último a sair apaga a família e cancela os convites pendentes', async () => {
    entrarComo(BRUNO);
    await enviarConvite({ grupo: familiaLima, remetente: BRUNO, nome: CARLOS.nome, email: CARLOS.email });

    entrarComo(HUGO);
    expect((await sairDaFamilia(HUGO.uid)).familiaApagada).toBe(false);

    entrarComo(BRUNO);
    expect(await sairDaFamilia(BRUNO.uid)).toEqual({ familiaApagada: true, novoAdministrador: null });

    const [familia, convite] = await semRegras((db) =>
      Promise.all([
        getDoc(doc(db, 'grupos', familiaLima.id)),
        getDoc(doc(db, 'convites', `${familiaLima.id}_${CARLOS.email}`)),
      ])
    );

    expect(familia.exists()).toBe(false);
    expect(convite.data().status).toBe('cancelado');

    entrarComo(CARLOS);
    expect(await convitePendente(familiaLima.id)).toBeUndefined();
  });
});

describe('15. excluir conta', () => {
  const contasApagadas = () => jest.requireMock('firebase/auth').contasApagadas;

  async function existe(caminho) {
    return semRegras(async (db) => (await getDoc(doc(db, caminho))).exists());
  }

  async function quantos(consulta) {
    return semRegras(async (db) => (await getDocs(consulta(db))).size);
  }

  test('senha errada não apaga nada', async () => {
    entrarComo(ANA);

    await expect(excluirConta('errada')).rejects.toMatchObject({ code: 'auth/invalid-credential' });
    expect(await existe(`usuarios/${ANA.uid}`)).toBe(true);
    expect(contasApagadas()).toEqual([]);
  });

  test('ninguém apaga os dados de outra pessoa', async () => {
    const db = entrarComo(CARLOS);

    await assertFails(deleteDoc(doc(db, 'usuarios', ANA.uid)));
    await assertFails(deleteDoc(doc(db, 'usuarios', ANA.uid, 'privado', 'documentos')));
    await assertFails(deleteDoc(doc(db, 'usuarios', ANA.uid, 'lugares', 'casa')));
  });

  test('o perfil só sai fora da família, e o CPF só sai junto com o perfil', async () => {
    const db = entrarComo(ANA);

    await assertFails(deleteDoc(doc(db, 'usuarios', ANA.uid)));
    await assertFails(deleteDoc(doc(db, 'usuarios', ANA.uid, 'privado', 'documentos')));
  });

  test('Ana exclui a conta: sai da família e tudo dela é apagado', async () => {
    entrarComo(ANA);

    await excluirConta('senha-certa');

    expect(contasApagadas()).toEqual([ANA.uid]);
    expect(await existe(`usuarios/${ANA.uid}`)).toBe(false);
    expect(await existe(`usuarios/${ANA.uid}/privado/documentos`)).toBe(false);
    expect(await existe(`usuarios/${ANA.uid}/lugares/casa`)).toBe(false);
    expect(await existe(`familiares/${ANA.uid}`)).toBe(false);
    expect(await existe(`grupos/${grupo.id}/membros/${ANA.uid}`)).toBe(false);
    expect(await existe(`diretorioConvites/${chaveDiretorio('Ana Souza Lima', ANA.email)}`)).toBe(false);
    expect(await quantos((db) => query(collection(db, 'convites'), where('deUid', '==', ANA.uid)))).toBe(0);
    expect(await quantos((db) => query(collection(db, 'convites'), where('paraEmail', '==', ANA.email)))).toBe(0);

    // A família continua, sem ela.
    const familia = await semRegras((db) => getDoc(doc(db, 'grupos', grupo.id)));
    expect(familia.data().membros).toEqual([CARLOS.uid]);

    // O CPF dela ficou livre: uma conta nova pode usá-lo.
    expect(await existe(`cpfs/${ANA.cpf.replace(/\D/g, '')}`)).toBe(false);

    const NOVA = { uid: 'nova-ana', email: 'nova@teste.com', nome: 'Ana Nova', telefone: '(21) 93333-2222' };
    entrarComo(NOVA);
    await salvarPerfilUsuario({ ...NOVA, cpf: ANA.cpf });
    expect((await buscarPerfil(NOVA.uid)).documento).toBe(ANA.cpf);
  });

  test('Bruno exclui a conta: histórico e alertas de SOS também saem', async () => {
    expect(await quantos((db) => collection(db, 'historicoLocalizacoes', BRUNO.uid, 'pontos'))).toBe(2);
    expect(await quantos((db) => query(collection(db, 'alertasSOS'), where('uid', '==', BRUNO.uid)))).toBe(2);

    entrarComo(BRUNO);
    await excluirConta('senha-certa');

    expect(await quantos((db) => collection(db, 'historicoLocalizacoes', BRUNO.uid, 'pontos'))).toBe(0);
    expect(await quantos((db) => query(collection(db, 'alertasSOS'), where('uid', '==', BRUNO.uid)))).toBe(0);
    expect(await quantos((db) => query(collection(db, 'convites'), where('deUid', '==', BRUNO.uid)))).toBe(0);
    expect(await existe(`usuarios/${BRUNO.uid}`)).toBe(false);
  });

  test('o último membro exclui a conta: a família é apagada', async () => {
    entrarComo(CARLOS);
    await excluirConta('senha-certa');

    expect(await existe(`grupos/${grupo.id}`)).toBe(false);
    expect(contasApagadas()).toEqual([ANA.uid, BRUNO.uid, CARLOS.uid]);
  });
});
