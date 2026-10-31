/*
 * Testes da configuração do Expo (app.config.js): a chave do Google
 * Maps vem do .env.local e não vai para o Git.
 */

const criarConfig = require('./app.config');
const { expo } = require('./app.json');

const chaveOriginal = process.env.GOOGLE_MAPS_API_KEY;

afterEach(() => {
  if (chaveOriginal === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
  else process.env.GOOGLE_MAPS_API_KEY = chaveOriginal;
});

describe('app.config', () => {
  it('com a chave, coloca o Google Maps no Android', () => {
    process.env.GOOGLE_MAPS_API_KEY = 'chave-maps';

    const config = criarConfig({ config: expo });

    expect(config.android.config).toEqual({ googleMaps: { apiKey: 'chave-maps' } });
    expect(config.android.package).toBe('br.com.conecta.app');
  });

  it('sem a chave, deixa o Android como está', () => {
    delete process.env.GOOGLE_MAPS_API_KEY;

    const config = criarConfig({ config: expo });

    expect(config.android).toEqual(expo.android);
  });

  it('mantém o resto do app.json', () => {
    const config = criarConfig({ config: expo });

    expect(config.name).toBe('Conecta');
    expect(config.plugins).toEqual(expo.plugins);
  });

  it('o app.json não guarda a chave do Maps', () => {
    expect(JSON.stringify(expo)).not.toMatch(/googleMaps|AIza/);
  });

  it('o banco local (expo-sqlite) está entre os plugins', () => {
    expect(expo.plugins).toContain('expo-sqlite');
  });

  it('identificador das lojas e só celular', () => {
    expect(expo.ios.bundleIdentifier).toBe('br.com.conecta.app');
    expect(expo.android.package).toBe('br.com.conecta.app');
    expect(expo.ios.supportsTablet).toBe(false);
  });

  it('sem permissões que o app não usa (microfone, localização em segundo plano, movimento)', () => {
    const opcoes = (nome) => expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === nome)[1];

    expect(opcoes('expo-camera')).toMatchObject({ microphonePermission: false, recordAudioAndroid: false });
    expect(opcoes('expo-image-picker')).toMatchObject({ microphonePermission: false });
    expect(opcoes('expo-location')).toMatchObject({
      locationAlwaysAndWhenInUsePermission: false,
      locationAlwaysPermission: false,
      motionUsagePermission: false,
      isIosBackgroundLocationEnabled: false,
      isAndroidBackgroundLocationEnabled: false,
    });
    expect(expo.android.blockedPermissions).toContain('android.permission.RECORD_AUDIO');
  });

  it('os textos de permissão dizem para que servem, em português', () => {
    const textos = expo.plugins
      .filter(Array.isArray)
      .flatMap(([, opcoes]) => Object.values(opcoes))
      .filter((valor) => typeof valor === 'string' && valor.startsWith('O Conecta'));

    expect(textos.length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(expo)).not.toMatch(/Allow \$\(PRODUCT_NAME\)/);
  });

  it('ícone sem transparência em 1024x1024 (App Store)', () => {
    const png = require('fs').readFileSync(require('path').join(__dirname, expo.icon));

    expect(png.readUInt32BE(16)).toBe(1024);
    expect(png.readUInt32BE(20)).toBe(1024);
    // Tipo de cor 2 = RGB, sem canal de transparência.
    expect(png[25]).toBe(2);
  });
});
