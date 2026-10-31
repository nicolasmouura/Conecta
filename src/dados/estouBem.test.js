/*
 * Testes do "Estou bem" (estouBem.js): envio pela fila e texto do card.
 */

jest.mock('./filaEnvio', () => ({ enfileirar: jest.fn(() => Promise.resolve({ id: 'x' })) }));

const { enfileirar } = require('./filaEnvio');
const { VALIDADE_ESTOU_BEM, avisarQueEstouBem, descreverEstouBem } = require('./estouBem');

const AGORA = 1_000_000_000;
const MINUTO = 60 * 1000;

describe('avisarQueEstouBem', () => {
  it('coloca o aviso na fila de envio com o grupo', async () => {
    await avisarQueEstouBem('g1', 'uid1');

    expect(enfileirar).toHaveBeenCalledWith('uid1', 'estouBem', { grupoId: 'g1' });
  });
});

describe('descreverEstouBem', () => {
  it('mostra "agora" no primeiro minuto', () => {
    expect(descreverEstouBem(AGORA - 30 * 1000, AGORA)).toBe('Está bem · agora');
  });

  it('mostra minutos até 1 hora', () => {
    expect(descreverEstouBem(AGORA - 5 * MINUTO, AGORA)).toBe('Está bem · há 5 min');
    expect(descreverEstouBem(AGORA - 59 * MINUTO, AGORA)).toBe('Está bem · há 59 min');
  });

  it('mostra horas a partir de 1 hora', () => {
    expect(descreverEstouBem(AGORA - 60 * MINUTO, AGORA)).toBe('Está bem · há 1 h');
    expect(descreverEstouBem(AGORA - 185 * MINUTO, AGORA)).toBe('Está bem · há 3 h');
  });

  it('aceita Timestamp do Firestore', () => {
    expect(descreverEstouBem({ toMillis: () => AGORA - 2 * MINUTO }, AGORA)).toBe('Está bem · há 2 min');
  });

  it('trata hora no futuro (relógio adiantado) como agora', () => {
    expect(descreverEstouBem(AGORA + 5 * MINUTO, AGORA)).toBe('Está bem · agora');
  });

  it('some depois da validade', () => {
    expect(descreverEstouBem(AGORA - VALIDADE_ESTOU_BEM, AGORA)).toBe('Está bem · há 24 h');
    expect(descreverEstouBem(AGORA - VALIDADE_ESTOU_BEM - 1, AGORA)).toBeNull();
  });

  it('devolve null sem aviso', () => {
    expect(descreverEstouBem(undefined, AGORA)).toBeNull();
    expect(descreverEstouBem(null, AGORA)).toBeNull();
    expect(descreverEstouBem('ontem', AGORA)).toBeNull();
  });
});
