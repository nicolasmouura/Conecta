/*
 * Testes do tema (theme.js): valores válidos para o React Native.
 */

import { cores, fontes, raio, sombra } from './theme';

describe('theme', () => {
  it('todas as cores são hex de 6 dígitos', () => {
    for (const [nome, cor] of Object.entries(cores)) {
      expect([nome, cor]).toEqual([nome, expect.stringMatching(/^#[0-9A-F]{6}$/i)]);
    }
  });

  it('as fontes são as Poppins carregadas no App', () => {
    expect(fontes).toEqual({ titulo: 'Poppins_700Bold', destaque: 'Poppins_600SemiBold' });
  });

  it('raios são números positivos', () => {
    for (const valor of Object.values(raio)) {
      expect(valor).toBeGreaterThan(0);
    }
  });

  it('a sombra tem as chaves de iOS e Android', () => {
    expect(sombra).toEqual({
      shadowColor: expect.any(String),
      shadowOffset: { width: expect.any(Number), height: expect.any(Number) },
      shadowOpacity: expect.any(Number),
      shadowRadius: expect.any(Number),
      elevation: expect.any(Number),
    });
  });

  it('erro e offline usam a mesma cor', () => {
    expect(cores.erro).toBe(cores.offline);
  });
});
