/*
 * Testes do encerramento do emulador antigo (encerrarEmulador.js).
 */

jest.mock('child_process', () => ({ execFileSync: jest.fn() }));

const plataformaOriginal = process.platform;

function rodarEm(plataforma) {
  Object.defineProperty(process, 'platform', { value: plataforma });
  jest.isolateModules(() => require('./encerrarEmulador'));
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: plataformaOriginal });
  jest.restoreAllMocks();
});

describe('encerrarEmulador', () => {
  it('no Windows, encerra só o Java do emulador do Firestore', () => {
    const { execFileSync } = require('child_process');
    execFileSync.mockReturnValue('8688\r\n');

    rodarEm('win32');

    const [programa, argumentos] = execFileSync.mock.calls[0];
    expect(programa).toBe('powershell');
    expect(argumentos.at(-1)).toContain("-like '*cloud-firestore-emulator*'");
    expect(console.log).toHaveBeenCalledWith('Emulador antigo do Firestore encerrado:', '8688');
  });

  it('sem emulador sobrando, não avisa nada', () => {
    const { execFileSync } = require('child_process');
    execFileSync.mockReturnValue('');

    rodarEm('win32');

    expect(console.log).not.toHaveBeenCalled();
  });

  it('em outros sistemas, não faz nada', () => {
    const { execFileSync } = require('child_process');

    rodarEm('darwin');

    expect(execFileSync).not.toHaveBeenCalled();
  });
});
