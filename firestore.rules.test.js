/*
 * Testes das regras do Firestore (firestore.rules) no emulador local,
 * usando as funções de dados do próprio app: o que o app grava e lê
 * precisa passar pelas regras, e o que não é da pessoa precisa ser
 * recusado.
 *
 *   npm run test:regras
 *
 * Só o Firestore é real (emulador). O login (firebase/auth) continua
 * simulado: cada usuário entra com um token do emulador.
 */

jest.unmock('firebase/app');
jest.unmock('firebase/firestore');

// Módulos nativos do Expo usados pelos dados (sem GPS nem SMS aqui).
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: async () => ({ granted: false }),
  getLastKnownPositionAsync: async () => null,
  reverseGeocodeAsync: async () => [],
  geocodeAsync: async () => [],
}));
jest.mock('expo-sms', () => ({ isAvailableAsync: async () => false, sendSMSAsync: async () => ({}) }));

const fs = require('fs');
const path = require('path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');

// Sessão atual do app: db e auth.currentUser trocam conforme quem "entra".
const mockSessao = { db: null, usuario: null };

jest.mock('./src/config/firebase', () => ({
  get db() {
    return mockSessao.db;
  },
  auth: {
    get currentUser() {
      return mockSessao.usuario;
    },
  },
}));

const firestore = require('firebase/firestore');
const { doc, getDoc, getDocs, collection, setDoc, updateDoc, Timestamp } = firestore;

const usuario = require('./src/dados/salvarUsuario');
const grupo = require('./src/dados/grupo');
const convites = require('./src/dados/convites');
const familiares = require('./src/dados/buscarFamiliares');
const lugares = require('./src/dados/lugares');
const sos = require('./src/dados/sos');
const estouBem = require('./src/dados/estouBem');
const historico = require('./src/dados/historico');
const fila = require('./src/dados/filaEnvio');
const conta = require('./src/dados/conta');
const { banco } = require('./src/dados/bancoLocal');
const { apagarDadosLocais } = require('./src/dados/armazenamentoLocal');

let ambiente;
const contextos = new Map();

// CPF válido a partir de 9 números.
function gerarCPF(base) {
  const digitos = base.split('').map(Number);

  for (const tamanho of [9, 10]) {
    const soma = digitos.slice(0, tamanho).reduce((total, d, i) => total + d * (tamanho + 1 - i), 0);
    const resto = (soma * 10) % 11;
    digitos.push(resto === 10 ? 0 : resto);
  }

  const d = digitos.join('');
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

const PESSOAS = {
  ana: { uid: 'ana', nome: 'Ana Souza', email: 'ana@exemplo.com', cpf: gerarCPF('529982247'), telefone: '11987654321' },
  bia: { uid: 'bia', nome: 'Bia Lima', email: 'bia@exemplo.com', cpf: gerarCPF('111444777'), telefone: '21912345678' },
  caio: { uid: 'caio', nome: 'Caio Reis', email: 'caio@exemplo.com', cpf: gerarCPF('123456789'), telefone: '31998765432' },
  intruso: { uid: 'intruso', nome: 'Intruso', email: 'intruso@exemplo.com', cpf: gerarCPF('987654321'), telefone: '41987654321' },
};

const ENDERECO = {
  pais: 'Brasil',
  estado: 'SP',
  cidade: 'São Paulo',
  bairro: 'Centro',
  rua: 'Rua A',
  numero: '10',
  cep: '01001-000',
};

// "Entra" no app como essa pessoa (e-mail confirmado, salvo se dito).
function como(pessoa, { emailVerificado = true } = {}) {
  const chave = `${pessoa.uid}:${emailVerificado}`;

  if (!contextos.has(chave)) {
    contextos.set(
      chave,
      ambiente.authenticatedContext(pessoa.uid, { email: pessoa.email, email_verified: emailVerificado }).firestore()
    );
  }

  mockSessao.db = contextos.get(chave);
  mockSessao.usuario = { uid: pessoa.uid, email: pessoa.email, emailVerified: emailVerificado };

  return mockSessao.db;
}

// Lê direto do banco, sem regras (para conferir o resultado).
async function lerDireto(caminho) {
  let dados;

  await ambiente.withSecurityRulesDisabled(async (contexto) => {
    const documento = await getDoc(doc(contexto.firestore(), caminho));
    dados = documento.exists() ? documento.data() : undefined;
  });

  return dados;
}

async function gravarDireto(caminho, dados) {
  await ambiente.withSecurityRulesDisabled((contexto) => setDoc(doc(contexto.firestore(), caminho), dados));
}

// Cadastro como o app faz (perfil, CPF e índice de convites).
async function cadastrar(pessoa) {
  como(pessoa);
  await usuario.salvarPerfilUsuario(pessoa);
}

// Ana cria a família; quem estiver em "outros" é convidado e aceita.
async function montarFamilia(...outros) {
  await cadastrar(PESSOAS.ana);
  const familia = await grupo.criarGrupo('Família Souza', PESSOAS.ana);

  for (const pessoa of outros) {
    await cadastrar(pessoa);

    como(PESSOAS.ana);
    await convites.enviarConvite({ grupo: familia, remetente: PESSOAS.ana, nome: pessoa.nome, email: pessoa.email });

    como(pessoa);
    await convites.aceitarConvite({ id: `${familia.id}_${pessoa.email}`, grupoId: familia.id }, pessoa);
  }

  return familia;
}

/*
 * Entrega de um listener do app. A primeira pode vir só do cache do
 * aparelho (o que a própria pessoa gravou); "aceitar" espera a que
 * interessa ao teste.
 */
function primeiraEntrega(assinar, aceitar = () => true) {
  return new Promise((resolver, rejeitar) => {
    let cancelar = () => {};
    cancelar = assinar(
      (dados) => {
        if (!aceitar(dados)) return;
        resolver(dados);
        setTimeout(() => cancelar(), 0);
      },
      rejeitar
    );
  });
}

beforeAll(async () => {
  ambiente = await initializeTestEnvironment({
    projectId: 'demo-conecta',
    firestore: { rules: fs.readFileSync(path.join(__dirname, 'firestore.rules'), 'utf8') },
  });
});

afterAll(async () => {
  await ambiente?.cleanup();
});

beforeEach(async () => {
  await ambiente.clearFirestore();
  await apagarDadosLocais();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('cadastro e perfil', () => {
  it('o cadastro grava perfil, CPF privado e índice de CPF', async () => {
    await cadastrar(PESSOAS.ana);

    expect(await lerDireto('usuarios/ana')).toMatchObject({ nome: 'Ana Souza', telefone: '(11) 98765-4321' });
    expect(await lerDireto('usuarios/ana/privado/documentos')).toEqual({ cpf: PESSOAS.ana.cpf });
    expect(await lerDireto(`cpfs/${PESSOAS.ana.cpf.replace(/\D/g, '')}`)).toEqual({ uid: 'ana' });
    expect(await lerDireto('diretorioConvites/ana souza|ana@exemplo.com')).toEqual({ uid: 'ana' });
  });

  it('o mesmo CPF não cria uma segunda conta', async () => {
    await cadastrar(PESSOAS.ana);

    como(PESSOAS.bia);
    await expect(usuario.salvarPerfilUsuario({ ...PESSOAS.bia, cpf: PESSOAS.ana.cpf })).rejects.toThrow(
      'CPF_JA_CADASTRADO'
    );
    expect(await lerDireto('usuarios/bia')).toBeUndefined();
  });

  it('sem e-mail confirmado, o índice de convites fica para depois', async () => {
    como(PESSOAS.ana, { emailVerificado: false });
    await usuario.salvarPerfilUsuario(PESSOAS.ana);
    expect(await lerDireto('diretorioConvites/ana souza|ana@exemplo.com')).toBeUndefined();

    como(PESSOAS.ana);
    await usuario.garantirEntradaDiretorio('ana');
    expect(await lerDireto('diretorioConvites/ana souza|ana@exemplo.com')).toEqual({ uid: 'ana' });
  });

  it('o próprio perfil vem com o CPF; a família lê o perfil, mas nunca o CPF', async () => {
    await montarFamilia(PESSOAS.bia);

    como(PESSOAS.ana);
    expect((await usuario.buscarPerfil('ana')).documento).toBe(PESSOAS.ana.cpf);

    como(PESSOAS.bia);
    expect((await usuario.buscarPerfil('ana')).nome).toBe('Ana Souza');
    await assertFails(getDoc(doc(mockSessao.db, 'usuarios/ana/privado/documentos')));
  });

  it('quem não é da família não lê o perfil', async () => {
    await cadastrar(PESSOAS.ana);
    await cadastrar(PESSOAS.intruso);

    await assertFails(getDoc(doc(mockSessao.db, 'usuarios/ana')));
  });

  it('editar nome e telefone atualiza a cópia na família e o índice de convites', async () => {
    await montarFamilia(PESSOAS.bia);

    como(PESSOAS.ana);
    await usuario.atualizarPerfil('ana', { nome: 'Ana Lima', telefone: '1133334444' });

    expect(await lerDireto('usuarios/ana')).toMatchObject({ nome: 'Ana Lima', telefone: '(11) 3333-4444' });
    const familia = (await lerDireto('usuarios/ana')).grupoId;
    expect((await lerDireto(`grupos/${familia}/membros/ana`)).nome).toBe('Ana Lima');
    expect(await lerDireto('diretorioConvites/ana souza|ana@exemplo.com')).toBeUndefined();
    expect(await lerDireto('diretorioConvites/ana lima|ana@exemplo.com')).toEqual({ uid: 'ana' });
  });

  it('a foto de perfil é aceita', async () => {
    await cadastrar(PESSOAS.ana);

    await usuario.salvarFotoPerfil('ana', 'data:image/jpeg;base64,AAAA');

    expect((await lerDireto('usuarios/ana')).foto).toBe('data:image/jpeg;base64,AAAA');
  });

  it('salvar a Casa grava o lugar e o endereço do perfil juntos', async () => {
    await cadastrar(PESSOAS.ana);

    const casa = await lugares.salvarLugar('ana', 'casa', { enderecoDetalhado: ENDERECO, latitude: -23.5, longitude: -46.6 });

    expect(await lerDireto('usuarios/ana/lugares/casa')).toMatchObject({ endereco: casa.endereco, latitude: -23.5 });
    expect((await lerDireto('usuarios/ana')).endereco).toBe(casa.endereco);
    expect(await lugares.buscarLugares('ana')).toHaveProperty('casa');
  });

  it('a casa é privada, nem a família lê', async () => {
    await montarFamilia(PESSOAS.bia);
    como(PESSOAS.ana);
    await lugares.salvarLugar('ana', 'casa', { enderecoDetalhado: ENDERECO, latitude: -23.5, longitude: -46.6 });

    como(PESSOAS.bia);
    await assertFails(getDoc(doc(mockSessao.db, 'usuarios/ana/lugares/casa')));
  });
});

describe('família e convites', () => {
  it('criar a família vincula o perfil e o registro de administrador', async () => {
    await cadastrar(PESSOAS.ana);

    const familia = await grupo.criarGrupo('Família Souza', PESSOAS.ana);

    expect((await lerDireto('usuarios/ana')).grupoId).toBe(familia.id);
    expect(await lerDireto(`grupos/${familia.id}/membros/ana`)).toMatchObject({ papel: 'administrador' });
    expect(await grupo.buscarGrupoPorId(familia.id)).toMatchObject({ nome: 'Família Souza' });
  });

  it('não cria uma segunda família', async () => {
    await cadastrar(PESSOAS.ana);
    await grupo.criarGrupo('Família Souza', PESSOAS.ana);

    await expect(grupo.criarGrupo('Outra', PESSOAS.ana)).rejects.toThrow('JA_POSSUI_FAMILIA');
  });

  it('convite enviado e aceito: a pessoa entra na família', async () => {
    const familia = await montarFamilia(PESSOAS.bia);

    expect((await lerDireto(`grupos/${familia.id}`)).membros).toEqual(['ana', 'bia']);
    expect(await lerDireto(`grupos/${familia.id}/membros/bia`)).toMatchObject({ papel: 'membro', status: 'ativo' });
    expect((await lerDireto(`convites/${familia.id}_bia@exemplo.com`)).status).toBe('aceito');
  });

  it('o convidado vê o convite; recusar e reenviar funcionam', async () => {
    await cadastrar(PESSOAS.ana);
    const familia = await grupo.criarGrupo('Família Souza', PESSOAS.ana);
    await cadastrar(PESSOAS.bia);

    como(PESSOAS.ana);
    await convites.enviarConvite({ grupo: familia, remetente: PESSOAS.ana, nome: 'Bia Lima', email: 'bia@exemplo.com' });

    como(PESSOAS.bia);
    const recebidos = await primeiraEntrega((ok, erro) => convites.observarConvitesRecebidos(ok, erro));
    expect(recebidos).toEqual([expect.objectContaining({ grupoNome: 'Família Souza', deNome: 'Ana Souza' })]);

    await convites.recusarConvite(recebidos[0], PESSOAS.bia);
    expect((await lerDireto(`convites/${familia.id}_bia@exemplo.com`)).status).toBe('recusado');

    como(PESSOAS.ana);
    await convites.enviarConvite({ grupo: familia, remetente: PESSOAS.ana, nome: 'Bia Lima', email: 'bia@exemplo.com' });
    expect((await lerDireto(`convites/${familia.id}_bia@exemplo.com`)).status).toBe('pendente');
  });

  it('os pendentes aparecem para a família', async () => {
    await cadastrar(PESSOAS.ana);
    const familia = await grupo.criarGrupo('Família Souza', PESSOAS.ana);
    await cadastrar(PESSOAS.bia);
    como(PESSOAS.ana);
    await convites.enviarConvite({ grupo: familia, remetente: PESSOAS.ana, nome: 'Bia Lima', email: 'bia@exemplo.com' });

    const pendentes = await primeiraEntrega((ok, erro) => convites.observarConvitesPendentesDoGrupo(familia.id, ok, erro));

    expect(pendentes.map((convite) => convite.paraEmail)).toEqual(['bia@exemplo.com']);
  });

  it('não dá para se convidar para uma família sem convite', async () => {
    const familia = await montarFamilia();
    await cadastrar(PESSOAS.intruso);

    await expect(
      convites.aceitarConvite({ id: `${familia.id}_intruso@exemplo.com`, grupoId: familia.id }, PESSOAS.intruso)
    ).rejects.toMatchObject({ code: expect.stringMatching(/permission-denied|not-found/) });
    expect((await lerDireto(`grupos/${familia.id}`)).membros).toEqual(['ana']);
  });

  it('sem e-mail confirmado não envia convite', async () => {
    await cadastrar(PESSOAS.ana);
    const familia = await grupo.criarGrupo('Família Souza', PESSOAS.ana);
    await cadastrar(PESSOAS.bia);

    como(PESSOAS.ana, { emailVerificado: false });

    await expect(
      convites.enviarConvite({ grupo: familia, remetente: PESSOAS.ana, nome: 'Bia Lima', email: 'bia@exemplo.com' })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('a família vê os membros; quem é de fora não', async () => {
    const familia = await montarFamilia(PESSOAS.bia);

    como(PESSOAS.bia);
    const membros = await primeiraEntrega(
      (ok, erro) => grupo.observarMembros(familia.id, ok, erro),
      (lista) => lista.length === 2
    );
    expect(membros.map((membro) => membro.uid).sort()).toEqual(['ana', 'bia']);

    await cadastrar(PESSOAS.intruso);
    await assertFails(getDocs(collection(mockSessao.db, 'grupos', familia.id, 'membros')));
  });

  it('os perfis dos membros chegam com telefone (SMS do SOS)', async () => {
    const familia = await montarFamilia(PESSOAS.bia);

    como(PESSOAS.ana);
    const perfis = await usuario.buscarPerfisDosMembros(['ana', 'bia']);

    expect(perfis.bia.telefone).toBe('(21) 91234-5678');
    expect(familia.id).toBeTruthy();
  });
});

describe('sair da família', () => {
  it('administrador sai: o membro mais antigo assume', async () => {
    const familia = await montarFamilia(PESSOAS.bia, PESSOAS.caio);

    como(PESSOAS.ana);
    expect(await grupo.sairDaFamilia('ana')).toEqual({ familiaApagada: false, novoAdministrador: 'bia' });

    expect(await lerDireto(`grupos/${familia.id}`)).toMatchObject({ administradorUid: 'bia', membros: ['bia', 'caio'] });
    expect((await lerDireto(`grupos/${familia.id}/membros/bia`)).papel).toBe('administrador');
    expect((await lerDireto('usuarios/ana')).grupoId).toBeUndefined();
  });

  it('membro comum sai', async () => {
    const familia = await montarFamilia(PESSOAS.bia);

    como(PESSOAS.bia);
    await grupo.sairDaFamilia('bia');

    expect((await lerDireto(`grupos/${familia.id}`)).membros).toEqual(['ana']);
  });

  it('último membro sai: a família é apagada e os convites cancelados', async () => {
    await cadastrar(PESSOAS.ana);
    const familia = await grupo.criarGrupo('Família Souza', PESSOAS.ana);
    await cadastrar(PESSOAS.bia);
    como(PESSOAS.ana);
    await convites.enviarConvite({ grupo: familia, remetente: PESSOAS.ana, nome: 'Bia Lima', email: 'bia@exemplo.com' });

    expect(await grupo.sairDaFamilia('ana')).toEqual({ familiaApagada: true, novoAdministrador: null });

    expect(await lerDireto(`grupos/${familia.id}`)).toBeUndefined();
    expect((await lerDireto(`convites/${familia.id}_bia@exemplo.com`)).status).toBe('cancelado');
  });

  it('com SOS ativo não sai', async () => {
    await montarFamilia(PESSOAS.bia);

    como(PESSOAS.bia);
    await sos.acionarSOS({ uid: 'bia', grupoId: (await lerDireto('usuarios/bia')).grupoId, nome: 'Bia Lima' });

    await expect(grupo.sairDaFamilia('bia')).rejects.toThrow('SOS_ATIVO');
  });
});

describe('localização', () => {
  it('a posição com rua, casa e bateria passa; a família lê, quem é de fora não', async () => {
    const familia = await montarFamilia(PESSOAS.bia);

    como(PESSOAS.ana);
    await familiares.salvarLocalizacao({
      uid: 'ana',
      grupoId: familia.id,
      nome: 'Ana Souza',
      coordenadas: { latitude: -23.5, longitude: -46.6, accuracy: 12.4 },
      rua: 'Rua A',
      estadoCasa: lugares.calcularEstadoCasa({
        posicao: { latitude: -23.5, longitude: -46.6 },
        casa: { latitude: -23.51, longitude: -46.6 },
      }),
      energia: { bateria: 80, carregando: false },
    });

    como(PESSOAS.bia);
    const posicoes = await primeiraEntrega((ok, erro) => familiares.observarFamiliares(familia.id, ok, erro));
    expect(posicoes).toEqual([expect.objectContaining({ uid: 'ana', rua: 'Rua A', bateria: 80, distanciaCasa: 1000 })]);

    await cadastrar(PESSOAS.intruso);
    await assertFails(getDoc(doc(mockSessao.db, 'familiares/ana')));
  });

  it('não dá para publicar com outro nome ou em outra família', async () => {
    const familia = await montarFamilia();

    await expect(
      familiares.salvarLocalizacao({ uid: 'ana', grupoId: familia.id, nome: 'Outro nome', coordenadas: { latitude: 1, longitude: 1 } })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      familiares.salvarLocalizacao({ uid: 'ana', grupoId: 'outra', nome: 'Ana Souza', coordenadas: { latitude: 1, longitude: 1 } })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('fila de envio (SOS, Estou bem, histórico)', () => {
  it('SOS: acionar, reaproveitar o ativo e encerrar', async () => {
    const familia = await montarFamilia(PESSOAS.bia);
    como(PESSOAS.ana);
    await familiares.salvarLocalizacao({
      uid: 'ana',
      grupoId: familia.id,
      nome: 'Ana Souza',
      coordenadas: { latitude: -23.5, longitude: -46.6 },
    });

    const acionado = await sos.acionarSOS({ uid: 'ana', grupoId: familia.id, nome: 'Ana Souza' });
    expect(acionado).toMatchObject({ jaExistia: false, enviado: true, comLocalizacao: true });
    expect(await lerDireto(`alertasSOS/${acionado.id}`)).toMatchObject({ status: 'ativo', latitude: -23.5 });
    expect(await fila.lerFila('ana')).toEqual([]);

    expect(await sos.acionarSOS({ uid: 'ana', grupoId: familia.id, nome: 'Ana Souza' })).toEqual({
      id: acionado.id,
      jaExistia: true,
    });

    como(PESSOAS.bia);
    const ativos = await primeiraEntrega((ok, erro) => sos.observarSOSAtivos(familia.id, ok, erro));
    expect(ativos.map((alerta) => alerta.id)).toEqual([acionado.id]);

    como(PESSOAS.ana);
    expect(await sos.encerrarSOS(acionado.id, 'ana')).toEqual({ enviado: true });
    expect((await lerDireto(`alertasSOS/${acionado.id}`)).status).toBe('encerrado');
  });

  it('só o autor encerra o próprio SOS', async () => {
    const familia = await montarFamilia(PESSOAS.bia);
    como(PESSOAS.ana);
    const { id } = await sos.acionarSOS({ uid: 'ana', grupoId: familia.id, nome: 'Ana Souza' });

    como(PESSOAS.bia);
    await expect(sos.encerrarSOS(id, 'bia')).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await lerDireto(`alertasSOS/${id}`)).status).toBe('ativo');
  });

  it('SOS reenviado depois de reabrir o app não duplica (as regras recusam)', async () => {
    const familia = await montarFamilia();
    const { id } = await sos.acionarSOS({ uid: 'ana', grupoId: familia.id, nome: 'Ana Souza' });
    const antes = await lerDireto(`alertasSOS/${id}`);

    // Como se o app tivesse fechado antes de saber que o envio chegou.
    const local = await banco();
    await local.runAsync(
      'INSERT INTO fila (id, uid, tipo, dados, criado_em) VALUES (?, ?, ?, ?, ?)',
      id,
      'ana',
      'sos',
      JSON.stringify({ grupoId: familia.id, nome: 'Ana Souza' }),
      Date.now()
    );
    await fila.processarFila('ana');
    await esperar(50);

    expect(await fila.lerFila('ana')).toEqual([]);
    expect(await lerDireto(`alertasSOS/${id}`)).toEqual(antes);
  });

  it('"Estou bem" grava a hora do servidor no próprio registro', async () => {
    const familia = await montarFamilia(PESSOAS.bia);

    como(PESSOAS.bia);
    await estouBem.avisarQueEstouBem(familia.id, 'bia');
    await esperar(50);

    expect((await lerDireto(`grupos/${familia.id}/membros/bia`)).estouBemEm).toBeInstanceOf(Timestamp);
    expect(await fila.lerFila('bia')).toEqual([]);
  });

  it('"Estou bem" não mexe no registro de outra pessoa', async () => {
    const familia = await montarFamilia(PESSOAS.bia);

    como(PESSOAS.bia);
    await assertFails(
      updateDoc(doc(mockSessao.db, 'grupos', familia.id, 'membros', 'ana'), { estouBemEm: firestore.serverTimestamp() })
    );
  });

  it('histórico: o ponto sobe; a família lê só os pontos desta família', async () => {
    const familia = await montarFamilia(PESSOAS.bia);
    await gravarDireto('historicoLocalizacoes/ana/pontos/antigo', {
      uid: 'ana',
      grupoId: 'familia-antiga',
      latitude: 0,
      longitude: 0,
      registradoEm: Timestamp.now(),
    });

    como(PESSOAS.ana);
    await historico.registrarPontoHistorico({ uid: 'ana', grupoId: familia.id, coordenadas: { latitude: -23.5, longitude: -46.6, accuracy: 5 } });
    await esperar(50);

    const periodo = historico.calcularPeriodo('hoje');
    expect((await historico.buscarHistorico('ana', periodo)).pontos).toHaveLength(2);

    como(PESSOAS.bia);
    const daFamilia = await historico.buscarHistorico('ana', periodo, familia.id);
    expect(daFamilia.pontos).toEqual([expect.objectContaining({ latitude: -23.5, precisao: 5 })]);
    await assertFails(getDocs(collection(mockSessao.db, 'historicoLocalizacoes', 'ana', 'pontos')));
  });

  it('ponto guardado sem internet sobe depois com a hora em que foi registrado', async () => {
    const familia = await montarFamilia();
    const doisDiasAtras = Date.now() - 2 * 24 * 60 * 60 * 1000;

    const local = await banco();
    await local.runAsync(
      'INSERT INTO fila (id, uid, tipo, dados, criado_em) VALUES (?, ?, ?, ?, ?)',
      'pontoOffline',
      'ana',
      'ponto',
      JSON.stringify({ grupoId: familia.id, latitude: 1, longitude: 2 }),
      doisDiasAtras
    );
    await fila.processarFila('ana');
    await esperar(50);

    expect((await lerDireto('historicoLocalizacoes/ana/pontos/pontoOffline')).registradoEm.toMillis()).toBe(doisDiasAtras);
    expect(await fila.lerFila('ana')).toEqual([]);
  });

  it('as regras recusam ponto com mais de 8 dias (o app já descarta com 7)', async () => {
    const familia = await montarFamilia();

    await assertFails(
      setDoc(doc(mockSessao.db, 'historicoLocalizacoes/ana/pontos/velho'), {
        uid: 'ana',
        grupoId: familia.id,
        latitude: 1,
        longitude: 1,
        registradoEm: Timestamp.fromMillis(Date.now() - 9 * 24 * 60 * 60 * 1000),
      })
    );
    await assertSucceeds(
      setDoc(doc(mockSessao.db, 'historicoLocalizacoes/ana/pontos/novo'), {
        uid: 'ana',
        grupoId: familia.id,
        latitude: 1,
        longitude: 1,
        registradoEm: Timestamp.fromMillis(Date.now() - 6 * 24 * 60 * 60 * 1000),
      })
    );
  });
});

describe('excluir a conta', () => {
  it('apaga tudo da pessoa, passa a família adiante e libera o CPF', async () => {
    const familia = await montarFamilia(PESSOAS.bia);
    como(PESSOAS.ana);
    await lugares.salvarLugar('ana', 'casa', { enderecoDetalhado: ENDERECO, latitude: 1, longitude: 1 });
    await familiares.salvarLocalizacao({ uid: 'ana', grupoId: familia.id, nome: 'Ana Souza', coordenadas: { latitude: 1, longitude: 1 } });
    await historico.registrarPontoHistorico({ uid: 'ana', grupoId: familia.id, coordenadas: { latitude: 1, longitude: 1 } });
    const { id: alerta } = await sos.acionarSOS({ uid: 'ana', grupoId: familia.id, nome: 'Ana Souza' });
    await esperar(50);

    await conta.excluirConta('segredo');

    for (const caminho of [
      'usuarios/ana',
      'usuarios/ana/privado/documentos',
      'usuarios/ana/lugares/casa',
      `cpfs/${PESSOAS.ana.cpf.replace(/\D/g, '')}`,
      'diretorioConvites/ana souza|ana@exemplo.com',
      'familiares/ana',
      `alertasSOS/${alerta}`,
      `grupos/${familia.id}/membros/ana`,
      `convites/${familia.id}_bia@exemplo.com`,
    ]) {
      expect([caminho, await lerDireto(caminho)]).toEqual([caminho, undefined]);
    }
    expect(await lerDireto(`grupos/${familia.id}`)).toMatchObject({ administradorUid: 'bia', membros: ['bia'] });

    // O CPF ficou livre de novo.
    await cadastrar({ ...PESSOAS.caio, cpf: PESSOAS.ana.cpf });
    expect(await lerDireto('usuarios/caio')).toBeDefined();
  });
});
