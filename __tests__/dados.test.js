/*
 * Testes das regras de dados: casa (em casa, distância arredondada),
 * presença da família, rua atual, biometria e CPF.
 */

import { classificarResultado, MAXIMO_FALHAS, proximoPasso } from '../src/dados/biometria';
import { criarCacheRua, nomeDaRua } from '../src/dados/enderecos';
import { arredondarDistanciaCasa, calcularEstadoCasa } from '../src/dados/lugares';
import {
  descreverCasa,
  formatarDistancia,
  LIMITE_ONLINE,
  statusPresenca,
} from '../src/dados/presencaFamiliar';
import { cpfValido } from '../src/dados/salvarUsuario';

// Ponto a "metros" ao norte de "origem" (1° de latitude ≈ 111.195 m).
const aoNorte = (origem, metros) => ({
  latitude: origem.latitude + metros / 111195,
  longitude: origem.longitude,
});

const CASA = { latitude: -22.9068, longitude: -43.1729 };

describe('casa: arredondamento da distância publicada', () => {
  test.each([
    [10, 100], // mínimo 100 m
    [160, 200],
    [849, 800],
    [999, 1000],
    [1234, 1000],
    [1300, 1500],
  ])('%i m → %i m', (metros, esperado) => {
    expect(arredondarDistanciaCasa(metros)).toBe(esperado);
  });
});

describe('casa: em casa ou não', () => {
  const estado = (metros, extra = {}) =>
    calcularEstadoCasa({ posicao: aoNorte(CASA, metros), casa: CASA, precisao: 10, estavaEmCasa: false, ...extra });

  test('dentro do raio de 150 m + precisão', () => {
    expect(estado(140)).toEqual({ emCasa: true, distanciaCasa: 0 });
  });

  test('a precisão ruim conta no máximo 100 m', () => {
    expect(estado(240, { precisao: 500 }).emCasa).toBe(true);
    expect(estado(260, { precisao: 500 }).emCasa).toBe(false);
  });

  test('histerese: quem está em casa só sai acima de 300 m', () => {
    expect(estado(280, { estavaEmCasa: true }).emCasa).toBe(true);
    expect(estado(320, { estavaEmCasa: true })).toEqual({ emCasa: false, distanciaCasa: 300 });
  });

  test('fora de casa publica a distância arredondada', () => {
    expect(estado(1300)).toEqual({ emCasa: false, distanciaCasa: 1500 });
  });

  test('sem casa ou posição inválida → null', () => {
    expect(calcularEstadoCasa({ posicao: CASA, casa: null })).toBeNull();
    expect(calcularEstadoCasa({ posicao: { latitude: 999, longitude: 0 }, casa: CASA })).toBeNull();
  });
});

describe('presença dos familiares', () => {
  const agora = 1_000_000_000_000;

  test('online até 10 min, depois offline com "visto há"', () => {
    expect(statusPresenca(agora - 30 * 1000, agora)).toEqual({ online: true, visto: 'Atualizado agora' });
    expect(statusPresenca(agora - LIMITE_ONLINE, agora).online).toBe(true);
    expect(statusPresenca(agora - LIMITE_ONLINE - 1000, agora)).toEqual({ online: false, visto: 'Visto há 10 min' });
    expect(statusPresenca(agora - 3 * 3600 * 1000, agora).visto).toBe('Visto há 3 h');
    expect(statusPresenca(agora - 2 * 86400 * 1000, agora).visto).toBe('Visto há 2 d');
  });

  test('sem atualização', () => {
    expect(statusPresenca(null, agora)).toEqual({ online: false, visto: 'Sem atualização recente' });
  });

  test('distâncias', () => {
    expect(formatarDistancia(999.4)).toBe('999 m');
    expect(formatarDistancia(999.6)).toBe('1,0 km');
    expect(formatarDistancia(1500)).toBe('1,5 km');
    expect(formatarDistancia(NaN)).toBeNull();
  });

  test('texto da casa para a família', () => {
    expect(descreverCasa({ emCasa: true, distanciaCasa: 0 })).toBe('Em casa');
    expect(descreverCasa({ emCasa: false, distanciaCasa: 800 })).toBe('800 m de casa');
    expect(descreverCasa({})).toBeNull();
  });
});

describe('rua atual (cache da geocodificação)', () => {
  test('nome da rua com alternativas', () => {
    expect(nomeDaRua({ street: ' Rua das Flores ' })).toBe('Rua das Flores');
    expect(nomeDaRua({ district: 'Centro' })).toBe('Centro');
    expect(nomeDaRua({ city: 'Niterói' })).toBe('Niterói');
    expect(nomeDaRua(null)).toBeNull();
  });

  test('só consulta de novo depois de 1 min e 100 m; falha mantém a última rua', async () => {
    const buscar = jest.fn(async () => ({ street: 'Rua A' }));
    const ruaAtual = criarCacheRua(buscar);
    const t0 = 0;

    expect(await ruaAtual(CASA, t0)).toBe('Rua A');
    expect(await ruaAtual(aoNorte(CASA, 500), t0 + 30 * 1000)).toBe('Rua A'); // antes de 1 min
    expect(await ruaAtual(aoNorte(CASA, 50), t0 + 120 * 1000)).toBe('Rua A'); // menos de 100 m
    expect(buscar).toHaveBeenCalledTimes(1);

    buscar.mockResolvedValueOnce(null); // geocodificação falhou
    expect(await ruaAtual(aoNorte(CASA, 500), t0 + 120 * 1000)).toBe('Rua A');
    expect(buscar).toHaveBeenCalledTimes(2);
  });
});

describe('biometria do login', () => {
  test('classifica os resultados do sistema', () => {
    expect(classificarResultado({ success: true })).toBe('sucesso');
    expect(classificarResultado({ success: false, error: 'user_cancel' })).toBe('cancelado');
    expect(classificarResultado({ success: false, error: 'lockout' })).toBe('bloqueado');
    expect(classificarResultado({ success: false, error: 'not_enrolled' })).toBe('indisponivel');
    expect(classificarResultado({ success: false, error: 'missing_usage_description' })).toBe('nao_configurado');
    expect(classificarResultado({ success: false, error: 'authentication_failed' })).toBe('falha');
  });

  test(`${MAXIMO_FALHAS} falhas encerram a sessão; cancelar não conta`, () => {
    expect(proximoPasso('sucesso', 2)).toEqual({ acao: 'entrar', falhas: 0 });
    expect(proximoPasso('falha', 0)).toMatchObject({ acao: 'tentar', falhas: 1 });
    expect(proximoPasso('falha', MAXIMO_FALHAS - 1)).toMatchObject({ acao: 'encerrar', falhas: MAXIMO_FALHAS });
    expect(proximoPasso('cancelado', 2)).toMatchObject({ acao: 'tentar', falhas: 2 });
  });
});

describe('CPF', () => {
  test.each([
    ['529.982.247-25', true],
    ['52998224725', true],
    ['529.982.247-26', false],
    ['111.111.111-11', false],
    ['123', false],
    ['', false],
  ])('%s → %s', (cpf, valido) => {
    expect(cpfValido(cpf)).toBe(valido);
  });
});
