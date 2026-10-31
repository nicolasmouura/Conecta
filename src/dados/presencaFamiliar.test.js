/*
 * Testes dos textos dos cards da família (presencaFamiliar.js).
 */

const {
  LIMITE_ONLINE,
  descreverCasa,
  formatarDistancia,
  montarCardsFamiliares,
  statusPresenca,
} = require('./presencaFamiliar');

const AGORA = 10_000_000_000;
const MINUTO = 60 * 1000;

describe('statusPresenca', () => {
  it('sem hora: offline e sem atualização', () => {
    expect(statusPresenca(null, AGORA)).toEqual({ online: false, visto: 'Sem atualização recente' });
    expect(statusPresenca(undefined, AGORA)).toEqual({ online: false, visto: 'Sem atualização recente' });
  });

  it('online até o limite', () => {
    expect(statusPresenca(AGORA - 30 * 1000, AGORA)).toEqual({ online: true, visto: 'Atualizado agora' });
    expect(statusPresenca(AGORA - LIMITE_ONLINE, AGORA)).toEqual({ online: true, visto: 'Visto há 10 min' });
    expect(statusPresenca(AGORA - LIMITE_ONLINE - 1, AGORA).online).toBe(false);
  });

  it('mostra horas e dias', () => {
    expect(statusPresenca(AGORA - 3 * 60 * MINUTO, AGORA).visto).toBe('Visto há 3 h');
    expect(statusPresenca(AGORA - 50 * 60 * MINUTO, AGORA).visto).toBe('Visto há 2 d');
  });
});

describe('formatarDistancia', () => {
  it('metros abaixo de 1 km', () => {
    expect(formatarDistancia(349.6)).toBe('350 m');
    expect(formatarDistancia(0)).toBe('0 m');
  });

  it('km com vírgula a partir de 1 km', () => {
    expect(formatarDistancia(999.6)).toBe('1,0 km');
    expect(formatarDistancia(1234)).toBe('1,2 km');
    expect(formatarDistancia(15400)).toBe('15,4 km');
  });

  it('null para valores que não são distância', () => {
    expect(formatarDistancia(undefined)).toBeNull();
    expect(formatarDistancia(NaN)).toBeNull();
    expect(formatarDistancia('10')).toBeNull();
  });
});

describe('descreverCasa', () => {
  it('em casa', () => {
    expect(descreverCasa({ emCasa: true, distanciaCasa: 0 })).toBe('Em casa');
  });

  it('distância até a casa', () => {
    expect(descreverCasa({ emCasa: false, distanciaCasa: 750 })).toBe('750 m de casa');
    expect(descreverCasa({ emCasa: false, distanciaCasa: 1500 })).toBe('1,5 km de casa');
  });

  it('nada sem os derivados', () => {
    expect(descreverCasa({})).toBeNull();
  });
});

describe('montarCardsFamiliares', () => {
  const marcador = (uid, nome, extra = {}) => ({
    uid,
    nome,
    voce: false,
    latitude: 0,
    longitude: 0,
    atualizadoEm: AGORA - MINUTO,
    ...extra,
  });

  const montar = (extra) =>
    montarCardsFamiliares({
      marcadores: [],
      semLocalizacao: [],
      perfis: {},
      membros: [],
      minhaPosicao: null,
      minhaCasa: undefined,
      agora: AGORA,
      ...extra,
    });

  it('monta o card completo de um familiar', () => {
    const [card] = montar({
      marcadores: [
        marcador('b', 'Bia', {
          latitude: 0.001,
          rua: 'Rua das Flores',
          emCasa: false,
          distanciaCasa: 500,
          bateria: 15,
          carregando: false,
        }),
      ],
      perfis: { b: { foto: 'data:foto' } },
      membros: [{ uid: 'b', estouBemEm: AGORA - 5 * MINUTO }],
      minhaPosicao: { latitude: 0, longitude: 0 },
    });

    expect(card).toEqual({
      uid: 'b',
      nome: 'Bia',
      voce: false,
      foto: 'data:foto',
      temLocalizacao: true,
      online: true,
      visto: 'Visto há 1 min',
      distancia: '111 m',
      rua: 'Rua das Flores',
      casa: '500 m de casa',
      estouBem: 'Está bem · há 5 min',
      bateria: { texto: '15%', icone: 'battery', baixa: true },
    });
  });

  it('não mostra distância no seu próprio card', () => {
    const [card] = montar({
      marcadores: [marcador('a', 'Ana', { voce: true })],
      minhaPosicao: { latitude: 1, longitude: 1 },
    });

    expect(card.distancia).toBeNull();
  });

  describe('linha da casa no seu card', () => {
    const eu = (extra) => marcador('a', 'Ana', { voce: true, ...extra });

    it('avisa quando a casa não foi cadastrada', () => {
      expect(montar({ marcadores: [eu()], minhaCasa: null })[0].casa).toBe('Casa não cadastrada');
    });

    it('usa o que já foi publicado para a família', () => {
      expect(montar({ marcadores: [eu({ emCasa: true })], minhaCasa: { latitude: 5, longitude: 5 } })[0].casa).toBe(
        'Em casa'
      );
    });

    it('calcula com a casa quando nada foi publicado', () => {
      expect(montar({ marcadores: [eu()], minhaCasa: { latitude: 0, longitude: 0 } })[0].casa).toBe('Em casa');
    });

    it('fica vazia enquanto a casa carrega', () => {
      expect(montar({ marcadores: [eu()], minhaCasa: undefined })[0].casa).toBeNull();
    });
  });

  it('monta cards de quem não tem localização', () => {
    const cards = montar({
      semLocalizacao: [
        { uid: 'b', nome: 'Bia', voce: false, motivo: 'invalida' },
        { uid: 'a', nome: 'Ana', voce: true, motivo: 'indisponivel' },
      ],
      minhaCasa: null,
    });

    expect(cards).toEqual([
      expect.objectContaining({ uid: 'a', visto: 'Localização indisponível', casa: 'Casa não cadastrada' }),
      expect.objectContaining({ uid: 'b', visto: 'Localização inválida', temLocalizacao: false, casa: null }),
    ]);
  });

  it('ordena: você, depois online, depois por nome', () => {
    const cards = montar({
      marcadores: [
        marcador('c', 'Carla', { atualizadoEm: AGORA - 60 * MINUTO }),
        marcador('b', 'Bruno'),
        marcador('z', 'Zé'),
        marcador('a', 'Ana', { voce: true, atualizadoEm: AGORA - 60 * MINUTO }),
      ],
      semLocalizacao: [{ uid: 'd', nome: 'Ágata', voce: false }],
    });

    expect(cards.map((card) => card.nome)).toEqual(['Ana', 'Bruno', 'Zé', 'Ágata', 'Carla']);
  });

  it('aceita membros com id em vez de uid e sem foto', () => {
    const [card] = montar({
      marcadores: [marcador('b', 'Bia')],
      membros: [{ id: 'b', estouBemEm: AGORA }],
      perfis: undefined,
    });

    expect(card.estouBem).toBe('Está bem · agora');
    expect(card.foto).toBeNull();
  });
});
