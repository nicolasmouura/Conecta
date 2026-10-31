/*
 * Ícones nos testes: cada família vira um Text com o nome do ícone
 * (testID "icone-<nome>"), sem carregar fontes.
 */

const React = require('react');
const { Text } = require('react-native');

function criarFamilia(familia) {
  const Icone = ({ name, ...props }) =>
    React.createElement(Text, { ...props, testID: `icone-${name}` }, name);
  Icone.displayName = familia;
  return Icone;
}

module.exports = new Proxy(
  {},
  {
    get: (cache, familia) => {
      if (familia === '__esModule') return true;
      if (typeof familia !== 'string') return undefined;
      if (!cache[familia]) cache[familia] = criarFamilia(familia);
      return cache[familia];
    },
  }
);
