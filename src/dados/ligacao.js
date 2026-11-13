/*
 * Ligação de emergência: abre o discador com o número já digitado.
 * O 112 funciona em qualquer operadora, até sem chip (regra do celular).
 */

import { Linking } from 'react-native';

// O 112 vem primeiro: é o único que completa sem sinal da própria operadora.
export const NUMEROS_EMERGENCIA = [
  { numero: '112', nome: 'Emergência' },
  { numero: '190', nome: 'Polícia' },
  { numero: '192', nome: 'SAMU' },
  { numero: '193', nome: 'Bombeiros' },
];

// true se o discador abriu.
export async function ligarParaEmergencia(numero) {
  try {
    await Linking.openURL(`tel:${numero}`);
    return true;
  } catch (erro) {
    console.log('Discador não aberto:', erro.message);
    return false;
  }
}
