/*
 * Testes da localização da família (buscarFamiliares.js).
 */

let familiares;
let firestore;

beforeEach(() => {
  jest.resetModules();

  firestore = require('firebase/firestore');
  familiares = require('./buscarFamiliares');

  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

const AGORA = 10_000_000_000;
const MINUTO = 60 * 1000;

describe('coordenadaValida', () => {
  it('aceita coordenadas dentro dos limites', () => {
    expect(familiares.coordenadaValida(-23.5, -46.6)).toBe(true);
    expect(familiares.coordenadaValida(90, 180)).toBe(true);
    expect(familiares.coordenadaValida(-90, -180)).toBe(true);
  });

  it.each([
    [91, 0],
    [0, 181],
    [NaN, 0],
    [0, Infinity],
    ['10', 10],
    [null, 0],
    [undefined, undefined],
  ])('recusa (%p, %p)', (latitude, longitude) => {
    expect(familiares.coordenadaValida(latitude, longitude)).toBe(false);
  });
});

describe('descreverAtualizacao', () => {
  it('sem hora: só diz que há localização', () => {
    expect(familiares.descreverAtualizacao(null, AGORA)).toBe('Localização disponível');
  });

  it('mostra agora, minutos, horas e a data', () => {
    expect(familiares.descreverAtualizacao(AGORA - 20 * 1000, AGORA)).toBe('Atualizado agora');
    expect(familiares.descreverAtualizacao(AGORA - 7 * MINUTO, AGORA)).toBe('Atualizado há 7 min');
    expect(familiares.descreverAtualizacao(AGORA - 125 * MINUTO, AGORA)).toBe('Atualizado há 2 h');

    const anteontem = AGORA - 48 * 60 * MINUTO;
    expect(familiares.descreverAtualizacao(anteontem, AGORA)).toBe(
      `Atualizado em ${new Date(anteontem).toLocaleDateString('pt-BR')}`
    );
  });

  it('trata hora no futuro como agora', () => {
    expect(familiares.descreverAtualizacao(AGORA + MINUTO, AGORA)).toBe('Atualizado agora');
  });
});

describe('distanciaEmMetros', () => {
  it('é zero para o mesmo ponto', () => {
    expect(familiares.distanciaEmMetros({ latitude: 1, longitude: 1 }, { latitude: 1, longitude: 1 })).toBe(0);
  });

  it('1 grau de latitude tem cerca de 111 km', () => {
    const distancia = familiares.distanciaEmMetros({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });

    expect(distancia).toBeGreaterThan(111000);
    expect(distancia).toBeLessThan(111400);
  });

  it('é a mesma nos dois sentidos', () => {
    const a = { latitude: -23.55, longitude: -46.63 };
    const b = { latitude: -22.9, longitude: -43.2 };

    expect(familiares.distanciaEmMetros(a, b)).toBeCloseTo(familiares.distanciaEmMetros(b, a));
  });
});

describe('deveEnviarLocalizacao', () => {
  const origem = { latitude: 0, longitude: 0 };
  // ~111 m ao norte.
  const longe = { latitude: 0.001, longitude: 0 };

  it('envia o primeiro registro', () => {
    expect(familiares.deveEnviarLocalizacao(null, origem, AGORA)).toBe(true);
  });

  it('nunca envia antes do intervalo mínimo, mesmo andando', () => {
    const ultimo = { ...origem, em: AGORA - familiares.INTERVALO_MINIMO_ENVIO + 1 };

    expect(familiares.deveEnviarLocalizacao(ultimo, longe, AGORA)).toBe(false);
  });

  it('envia ao andar a distância mínima', () => {
    const ultimo = { ...origem, em: AGORA - familiares.INTERVALO_MINIMO_ENVIO };

    expect(familiares.deveEnviarLocalizacao(ultimo, longe, AGORA)).toBe(true);
  });

  it('parado, só envia depois do intervalo máximo', () => {
    expect(
      familiares.deveEnviarLocalizacao({ ...origem, em: AGORA - familiares.INTERVALO_MAXIMO_ENVIO + 1 }, origem, AGORA)
    ).toBe(false);
    expect(
      familiares.deveEnviarLocalizacao({ ...origem, em: AGORA - familiares.INTERVALO_MAXIMO_ENVIO }, origem, AGORA)
    ).toBe(true);
  });
});

describe('montarMarcadores', () => {
  const membro = (uid, nome, status = 'ativo') => ({ id: uid, uid, nome, status });
  const posicao = (uid, extra = {}) => ({
    id: uid,
    uid,
    latitude: -23.5,
    longitude: -46.6,
    atualizadoEm: AGORA - 2 * MINUTO,
    ...extra,
  });

  it('cria um marcador por membro ativo com localização', () => {
    const { marcadores, semLocalizacao } = familiares.montarMarcadores({
      membros: [membro('a', 'Ana'), membro('b', 'Bia', 'saiu')],
      localizacoes: [posicao('a'), posicao('b')],
      meuUid: 'a',
      meuNome: 'Ana',
      minhaPosicao: null,
      agora: AGORA,
    });

    expect(semLocalizacao).toEqual([]);
    expect(marcadores).toEqual([
      {
        uid: 'a',
        nome: 'Ana',
        voce: true,
        latitude: -23.5,
        longitude: -46.6,
        atualizadoEm: AGORA - 2 * MINUTO,
        recente: true,
        situacao: 'Localização atual',
        detalhe: 'Atualizado há 2 min',
        rua: null,
        emCasa: null,
        distanciaCasa: null,
        bateria: null,
        carregando: false,
      },
    ]);
  });

  it('usa a posição do próprio aparelho para você', () => {
    const { marcadores } = familiares.montarMarcadores({
      membros: [membro('a', 'Ana')],
      localizacoes: [posicao('a', { rua: 'Rua A', bateria: 50 })],
      meuUid: 'a',
      minhaPosicao: { latitude: 1, longitude: 2 },
      agora: AGORA,
    });

    expect(marcadores[0]).toMatchObject({
      latitude: 1,
      longitude: 2,
      atualizadoEm: AGORA,
      detalhe: 'Atualizado agora',
      // Derivados continuam vindo do documento publicado.
      rua: 'Rua A',
      bateria: 50,
    });
  });

  it('marca como "Última localização" o que passou do limite', () => {
    const { marcadores } = familiares.montarMarcadores({
      membros: [membro('b', 'Bia')],
      localizacoes: [posicao('b', { atualizadoEm: AGORA - familiares.LIMITE_LOCALIZACAO_ATUAL - 1 })],
      meuUid: 'a',
      agora: AGORA,
    });

    const bia = marcadores.find((marcador) => marcador.uid === 'b');
    expect(bia).toMatchObject({ recente: false, situacao: 'Última localização' });
  });

  it('aceita atualizadoEm como Timestamp ou Date', () => {
    const { marcadores } = familiares.montarMarcadores({
      membros: [membro('b', 'Bia'), membro('c', 'Caio')],
      localizacoes: [
        posicao('b', { atualizadoEm: { toMillis: () => AGORA - MINUTO } }),
        posicao('c', { atualizadoEm: new Date(AGORA - MINUTO) }),
      ],
      meuUid: 'x',
      agora: AGORA,
    });

    expect(marcadores.filter((m) => !m.voce).map((m) => m.atualizadoEm)).toEqual([AGORA - MINUTO, AGORA - MINUTO]);
  });

  it('separa quem não tem localização ou tem uma inválida', () => {
    const { marcadores, semLocalizacao } = familiares.montarMarcadores({
      membros: [membro('b', 'Bia'), membro('c', 'Caio')],
      localizacoes: [posicao('c', { latitude: 999 })],
      meuUid: 'a',
      meuNome: 'Ana',
      agora: AGORA,
    });

    expect(marcadores).toEqual([]);
    expect(semLocalizacao).toEqual([
      { uid: 'b', nome: 'Bia', voce: false, motivo: 'indisponivel' },
      { uid: 'c', nome: 'Caio', voce: false, motivo: 'invalida' },
      { uid: 'a', nome: 'Ana', voce: true, motivo: 'indisponivel' },
    ]);
  });

  it('ignora documento com uid diferente do id', () => {
    const { marcadores } = familiares.montarMarcadores({
      membros: [membro('b', 'Bia')],
      localizacoes: [posicao('b', { uid: 'outro' })],
      meuUid: 'b',
      agora: AGORA,
    });

    expect(marcadores).toEqual([]);
  });

  it('usa o nome da localização ou um nome padrão', () => {
    const { semLocalizacao, marcadores } = familiares.montarMarcadores({
      membros: [membro('b', '  '), membro('c', '')],
      localizacoes: [posicao('b', { nome: 'Bia' })],
      meuUid: 'z',
      meuNome: 'Zé',
      agora: AGORA,
    });

    expect(marcadores[0].nome).toBe('Bia');
    expect(semLocalizacao.find((p) => p.uid === 'c').nome).toBe('Membro da família');
  });

  it('não repete a mesma pessoa', () => {
    const { marcadores } = familiares.montarMarcadores({
      membros: [membro('b', 'Bia'), membro('b', 'Bia')],
      localizacoes: [posicao('b')],
      meuUid: 'b',
      agora: AGORA,
    });

    expect(marcadores).toHaveLength(1);
  });
});

describe('observarFamiliares', () => {
  it('sem grupo, devolve lista vazia e nada para cancelar', () => {
    const callback = jest.fn();

    const cancelar = familiares.observarFamiliares(null, callback);

    expect(callback).toHaveBeenCalledWith([]);
    expect(() => cancelar()).not.toThrow();
  });

  it('entrega só as localizações do grupo e acompanha mudanças', async () => {
    firestore.__semear('familiares/a', { uid: 'a', grupoId: 'g1', latitude: 1, longitude: 1 });
    firestore.__semear('familiares/x', { uid: 'x', grupoId: 'g2', latitude: 1, longitude: 1 });
    const callback = jest.fn();

    const cancelar = familiares.observarFamiliares('g1', callback);
    await esperar();

    expect(callback).toHaveBeenLastCalledWith([{ id: 'a', uid: 'a', grupoId: 'g1', latitude: 1, longitude: 1 }]);

    firestore.__semear('familiares/b', { uid: 'b', grupoId: 'g1', latitude: 2, longitude: 2 });
    await esperar();

    expect(callback.mock.calls.at(-1)[0].map((item) => item.id)).toEqual(['a', 'b']);
    cancelar();
  });
});

describe('salvarLocalizacao', () => {
  const base = {
    uid: 'a',
    grupoId: 'g1',
    nome: 'Ana',
    coordenadas: { latitude: 1, longitude: 2 },
  };

  it('grava a posição com a hora do servidor', async () => {
    await familiares.salvarLocalizacao(base);

    expect(firestore.__ler('familiares/a')).toEqual({
      uid: 'a',
      grupoId: 'g1',
      nome: 'Ana',
      latitude: 1,
      longitude: 2,
      atualizadoEm: expect.any(firestore.Timestamp),
      online: true,
    });
  });

  it('inclui precisão, rua, casa e bateria quando informados', async () => {
    await familiares.salvarLocalizacao({
      ...base,
      coordenadas: { latitude: 1, longitude: 2, accuracy: 12.6 },
      rua: 'R'.repeat(200),
      estadoCasa: { emCasa: false, distanciaCasa: 500 },
      energia: { bateria: 40, carregando: true },
    });

    expect(firestore.__ler('familiares/a')).toMatchObject({
      precisao: 13,
      rua: 'R'.repeat(120),
      emCasa: false,
      distanciaCasa: 500,
      bateria: 40,
      carregando: true,
    });
  });

  it('substitui o documento (sem merge): campos antigos somem', async () => {
    firestore.__semear('familiares/a', { precisao: 5, rua: 'velha' });

    await familiares.salvarLocalizacao(base);

    expect(firestore.__ler('familiares/a')).not.toHaveProperty('precisao');
    expect(firestore.__ler('familiares/a')).not.toHaveProperty('rua');
  });

  it('ignora precisão negativa e rua vazia', async () => {
    await familiares.salvarLocalizacao({ ...base, coordenadas: { latitude: 1, longitude: 2, accuracy: -1 }, rua: '' });

    expect(firestore.__ler('familiares/a')).not.toHaveProperty('precisao');
    expect(firestore.__ler('familiares/a')).not.toHaveProperty('rua');
  });
});
