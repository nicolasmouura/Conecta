/*
 * Testes dos lugares (lugares.js): salvar a Casa e calcular "em casa".
 */

let lugares;
let firestore;

beforeEach(() => {
  jest.resetModules();

  firestore = require('firebase/firestore');
  lugares = require('./lugares');

  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

const ENDERECO = {
  pais: 'Brasil',
  estado: 'SP',
  cidade: 'São Paulo',
  bairro: 'Centro',
  rua: 'Rua A',
  numero: '10',
  cep: '01001-000',
};

describe('arredondarDistanciaCasa', () => {
  it('até 1 km: múltiplos de 100 m, no mínimo 100 m', () => {
    expect(lugares.arredondarDistanciaCasa(10)).toBe(100);
    expect(lugares.arredondarDistanciaCasa(149)).toBe(100);
    expect(lugares.arredondarDistanciaCasa(151)).toBe(200);
    expect(lugares.arredondarDistanciaCasa(949)).toBe(900);
  });

  it('acima de 1 km: múltiplos de 500 m', () => {
    expect(lugares.arredondarDistanciaCasa(1000)).toBe(1000);
    expect(lugares.arredondarDistanciaCasa(1249)).toBe(1000);
    expect(lugares.arredondarDistanciaCasa(1250)).toBe(1500);
  });
});

describe('calcularEstadoCasa', () => {
  const casa = { latitude: 0, longitude: 0 };
  // Graus de latitude para andar ~metros ao norte.
  const aNorte = (metros) => ({ latitude: metros / 111195, longitude: 0 });

  it('null sem casa ou sem posição válida', () => {
    expect(lugares.calcularEstadoCasa({ posicao: aNorte(0), casa: null })).toBeNull();
    expect(lugares.calcularEstadoCasa({ posicao: null, casa })).toBeNull();
    expect(lugares.calcularEstadoCasa({ posicao: { latitude: 200, longitude: 0 }, casa })).toBeNull();
  });

  it('em casa dentro do raio', () => {
    expect(lugares.calcularEstadoCasa({ posicao: aNorte(140), casa, estavaEmCasa: false })).toEqual({
      emCasa: true,
      distanciaCasa: 0,
    });
  });

  it('fora de casa: distância arredondada', () => {
    expect(lugares.calcularEstadoCasa({ posicao: aNorte(160), casa, estavaEmCasa: false })).toEqual({
      emCasa: false,
      distanciaCasa: 200,
    });
  });

  it('soma a imprecisão do GPS (com teto) para entrar', () => {
    expect(lugares.calcularEstadoCasa({ posicao: aNorte(200), casa, precisao: 60 }).emCasa).toBe(true);
    expect(lugares.calcularEstadoCasa({ posicao: aNorte(260), casa, precisao: 500 }).emCasa).toBe(false);
    expect(lugares.calcularEstadoCasa({ posicao: aNorte(240), casa, precisao: 500 }).emCasa).toBe(true);
  });

  it('quem já estava em casa só sai acima do raio de saída', () => {
    expect(lugares.calcularEstadoCasa({ posicao: aNorte(290), casa, estavaEmCasa: true }).emCasa).toBe(true);
    expect(lugares.calcularEstadoCasa({ posicao: aNorte(310), casa, estavaEmCasa: true }).emCasa).toBe(false);
  });
});

describe('salvarLugar', () => {
  it('grava a casa no lugar e no perfil, juntos', async () => {
    const lugar = await lugares.salvarLugar('u1', 'casa', {
      enderecoDetalhado: ENDERECO,
      latitude: -23.5,
      longitude: -46.6,
    });

    expect(lugar).toMatchObject({ id: 'casa', tipo: 'casa', nome: 'Casa', latitude: -23.5, longitude: -46.6 });
    expect(firestore.__ler('usuarios/u1/lugares/casa')).toMatchObject({
      tipo: 'casa',
      endereco: lugar.endereco,
      atualizadoEm: expect.any(firestore.Timestamp),
    });
    expect(firestore.__ler('usuarios/u1')).toMatchObject({ endereco: lugar.endereco });
  });

  it('mantém os outros campos do perfil', async () => {
    firestore.__semear('usuarios/u1', { nome: 'Ana' });

    await lugares.salvarLugar('u1', 'casa', { enderecoDetalhado: ENDERECO, latitude: 1, longitude: 1 });

    expect(firestore.__ler('usuarios/u1').nome).toBe('Ana');
  });

  it('outros lugares não mexem no perfil', async () => {
    await lugares.salvarLugar('u1', 'trabalho', { enderecoDetalhado: ENDERECO, latitude: 1, longitude: 1 });

    expect(firestore.__ler('usuarios/u1/lugares/trabalho')).toBeDefined();
    expect(firestore.__ler('usuarios/u1')).toBeUndefined();
  });

  it('recusa lugar desconhecido, coordenada inválida e endereço incompleto', async () => {
    await expect(
      lugares.salvarLugar('u1', 'praia', { enderecoDetalhado: ENDERECO, latitude: 1, longitude: 1 })
    ).rejects.toThrow('LUGAR_INVALIDO');
    await expect(
      lugares.salvarLugar('u1', 'casa', { enderecoDetalhado: ENDERECO, latitude: 100, longitude: 1 })
    ).rejects.toThrow('COORDENADA_INVALIDA');
    await expect(
      lugares.salvarLugar('u1', 'casa', { enderecoDetalhado: { ...ENDERECO, rua: '' }, latitude: 1, longitude: 1 })
    ).rejects.toThrow('ENDERECO_INCOMPLETO');
  });
});

describe('buscarLugares', () => {
  it('devolve os lugares por id', async () => {
    firestore.__semear('usuarios/u1/lugares/casa', { nome: 'Casa' });
    firestore.__semear('usuarios/u2/lugares/casa', { nome: 'Outra' });

    expect(await lugares.buscarLugares('u1')).toEqual({ casa: { id: 'casa', nome: 'Casa' } });
  });
});

describe('observarLugar', () => {
  it('entrega o lugar e null quando não existe', async () => {
    const callback = jest.fn();

    const cancelar = lugares.observarLugar('u1', 'casa', callback);
    await esperar();
    expect(callback).toHaveBeenLastCalledWith(null);

    firestore.__semear('usuarios/u1/lugares/casa', { nome: 'Casa' });
    await esperar();
    expect(callback).toHaveBeenLastCalledWith({ id: 'casa', nome: 'Casa' });

    cancelar();
  });
});
