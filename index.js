/*
 * Ponto de entrada do Expo: registra o App como componente principal.
 */

import { registerRootComponent } from 'expo';

import App from './App';

// Equivale a AppRegistry.registerComponent('main', () => App), e prepara
// o ambiente igual no Expo Go e num build próprio.
registerRootComponent(App);
