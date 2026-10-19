/*
 * Bateria do aparelho: lida junto com cada envio da localização e
 * mostrada nos cards da família ("45%", "Carregando · 80%").
 */

import * as Battery from 'expo-battery';

// Até aqui o card mostra a bateria em vermelho.
export const BATERIA_BAIXA = 20;

// Ligado na tomada (carregando, cheio ou carga pausada pelo sistema).
const NA_TOMADA = [
  Battery.BatteryState.CHARGING,
  Battery.BatteryState.FULL,
  Battery.BatteryState.NOT_CHARGING,
];

/*
 * { bateria: 0–100, carregando } ou null quando o aparelho não informa
 * (ex.: emulador). Nunca impede o envio da localização.
 */
export async function lerBateria() {
  try {
    const [nivel, estado] = await Promise.all([
      Battery.getBatteryLevelAsync(),
      Battery.getBatteryStateAsync(),
    ]);

    if (typeof nivel !== 'number' || nivel < 0 || nivel > 1) return null;

    return {
      bateria: Math.round(nivel * 100),
      carregando: NA_TOMADA.includes(estado),
    };
  } catch (erro) {
    console.log('Bateria indisponível:', erro.message);
    return null;
  }
}

// Linha do card: { texto, icone, baixa } ou null (sem informação).
export function descreverBateria({ bateria, carregando }) {
  if (typeof bateria !== 'number') return null;

  return {
    texto: carregando ? `Carregando · ${bateria}%` : `${bateria}%`,
    icone: carregando ? 'battery-charging' : 'battery',
    baixa: !carregando && bateria <= BATERIA_BAIXA,
  };
}
