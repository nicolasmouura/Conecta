/*
 * Testes da ligação de emergência (ligacao.js).
 */

import { Linking } from 'react-native';

import { NUMEROS_EMERGENCIA, ligarParaEmergencia } from './ligacao';

beforeEach(() => {
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ligacao', () => {
  it('os números de emergência do Brasil, com o 112 (qualquer rede) em primeiro', () => {
    expect(NUMEROS_EMERGENCIA.map(({ numero }) => numero)).toEqual(['112', '190', '192', '193']);
  });

  it('abre o discador com o número', async () => {
    expect(await ligarParaEmergencia('192')).toBe(true);
    expect(Linking.openURL).toHaveBeenCalledWith('tel:192');
  });

  it('false se o discador não abre', async () => {
    Linking.openURL.mockRejectedValue(new Error('sem discador'));

    expect(await ligarParaEmergencia('192')).toBe(false);
  });
});
