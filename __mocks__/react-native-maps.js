/*
 * react-native-maps nos testes: o mapa nativo vira Views simples que
 * guardam as props (para conferir marcadores, região e linhas).
 */

const React = require('react');
const { View } = require('react-native');

// Métodos do mapa (ref), os mesmos em todas as renderizações.
const metodos = {
  animateToRegion: jest.fn(),
  animateCamera: jest.fn(),
  fitToCoordinates: jest.fn(),
};

const MapView = React.forwardRef(function MapView(props, ref) {
  React.useImperativeHandle(ref, () => metodos);

  return React.createElement(View, { testID: 'mapa', ...props });
});

const Marker = (props) => React.createElement(View, { testID: 'marcador', ...props });
const Polyline = (props) => React.createElement(View, { testID: 'linha', ...props });
const Circle = (props) => React.createElement(View, { testID: 'circulo', ...props });

module.exports = {
  __esModule: true,
  default: MapView,
  Marker,
  Polyline,
  Circle,
  PROVIDER_GOOGLE: 'google',
  PROVIDER_DEFAULT: null,
  __metodos: metodos,
};
