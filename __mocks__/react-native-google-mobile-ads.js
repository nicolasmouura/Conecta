/*
 * AdMob nos testes: o banner vira uma View com as props, e o intersticial
 * é um objeto falso cujos eventos o teste dispara (__intersticiais).
 */

const React = require('react');
const { View } = require('react-native');

const AdEventType = { LOADED: 'loaded', ERROR: 'error', OPENED: 'opened', CLOSED: 'closed' };

// Intersticiais criados, do mais antigo para o mais novo.
const intersticiais = [];

function criarIntersticial(unitId, opcoes) {
  const ouvintes = new Map();

  const anuncio = {
    unitId,
    opcoes,
    load: jest.fn(),
    show: jest.fn(() => Promise.resolve()),
    destroy: jest.fn(),
    addAdEventListener: jest.fn((tipo, ouvinte) => {
      ouvintes.set(tipo, ouvinte);
      return jest.fn(() => ouvintes.delete(tipo));
    }),
    // Para o teste: dispara um evento do AdMob.
    __emitir: (tipo, dados) => ouvintes.get(tipo)?.(dados),
    __ouvindo: (tipo) => ouvintes.has(tipo),
  };

  intersticiais.push(anuncio);
  return anuncio;
}

const instancia = {
  setRequestConfiguration: jest.fn(() => Promise.resolve()),
  initialize: jest.fn(() => Promise.resolve([])),
};

module.exports = {
  __esModule: true,
  default: jest.fn(() => instancia),
  AdEventType,
  MaxAdContentRating: { G: 'G', PG: 'PG', T: 'T', MA: 'MA' },
  BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER', BANNER: 'BANNER' },
  BannerAd: (props) => React.createElement(View, { testID: 'banner-admob', ...props }),
  InterstitialAd: { createForAdRequest: jest.fn(criarIntersticial) },
  __instancia: instancia,
  __intersticiais: intersticiais,
};
