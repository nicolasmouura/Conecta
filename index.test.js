/*
 * Testes do ponto de entrada (index.js).
 */

jest.mock('expo', () => ({ registerRootComponent: jest.fn() }));
jest.mock('./App', () => function AppFalso() {
  return null;
});

describe('index', () => {
  it('registra o App como componente principal', () => {
    const { registerRootComponent } = require('expo');
    const App = require('./App');

    require('./index');

    expect(registerRootComponent).toHaveBeenCalledWith(App);
  });
});
