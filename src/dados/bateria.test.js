/*
 * Testes da bateria (bateria.js): leitura do aparelho e texto do card.
 */

jest.mock('expo-battery', () => ({
  BatteryState: { UNKNOWN: 0, UNPLUGGED: 1, CHARGING: 2, FULL: 3, NOT_CHARGING: 4 },
  getBatteryLevelAsync: jest.fn(),
  getBatteryStateAsync: jest.fn(),
}));

const Battery = require('expo-battery');
const { BATERIA_BAIXA, descreverBateria, lerBateria } = require('./bateria');

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('lerBateria', () => {
  it('devolve a porcentagem arredondada e se está descarregando', async () => {
    Battery.getBatteryLevelAsync.mockResolvedValue(0.456);
    Battery.getBatteryStateAsync.mockResolvedValue(Battery.BatteryState.UNPLUGGED);

    expect(await lerBateria()).toEqual({ bateria: 46, carregando: false });
  });

  it.each(['CHARGING', 'FULL', 'NOT_CHARGING'])('considera %s como na tomada', async (estado) => {
    Battery.getBatteryLevelAsync.mockResolvedValue(1);
    Battery.getBatteryStateAsync.mockResolvedValue(Battery.BatteryState[estado]);

    expect(await lerBateria()).toEqual({ bateria: 100, carregando: true });
  });

  it.each([-1, 1.5, undefined, null])('devolve null quando o nível é %p (emulador)', async (nivel) => {
    Battery.getBatteryLevelAsync.mockResolvedValue(nivel);
    Battery.getBatteryStateAsync.mockResolvedValue(Battery.BatteryState.UNKNOWN);

    expect(await lerBateria()).toBeNull();
  });

  it('devolve null quando o aparelho não informa', async () => {
    Battery.getBatteryLevelAsync.mockRejectedValue(new Error('indisponível'));
    Battery.getBatteryStateAsync.mockResolvedValue(Battery.BatteryState.UNKNOWN);

    expect(await lerBateria()).toBeNull();
  });
});

describe('descreverBateria', () => {
  it('mostra só a porcentagem quando não está carregando', () => {
    expect(descreverBateria({ bateria: 45, carregando: false })).toEqual({
      texto: '45%',
      icone: 'battery',
      baixa: false,
    });
  });

  it('mostra "Carregando" quando está na tomada', () => {
    expect(descreverBateria({ bateria: 80, carregando: true })).toEqual({
      texto: 'Carregando · 80%',
      icone: 'battery-charging',
      baixa: false,
    });
  });

  it('marca como baixa até o limite, só fora da tomada', () => {
    expect(descreverBateria({ bateria: BATERIA_BAIXA, carregando: false }).baixa).toBe(true);
    expect(descreverBateria({ bateria: BATERIA_BAIXA + 1, carregando: false }).baixa).toBe(false);
    expect(descreverBateria({ bateria: 5, carregando: true }).baixa).toBe(false);
  });

  it('devolve null sem informação de bateria', () => {
    expect(descreverBateria({})).toBeNull();
    expect(descreverBateria({ bateria: null })).toBeNull();
  });
});
