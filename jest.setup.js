// AsyncStorage em memória (mock oficial do pacote).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Firebase sem chaves nem rede (src/config/__mocks__/firebase.js).
jest.mock('./src/config/firebase');

// Deixa terminar promessas, timers de 0 ms e leituras do SQLite pendentes.
global.esperar = async (voltas = 10) => {
  for (let i = 0; i < voltas; i++) {
    await new Promise((resolver) => setTimeout(resolver, 0));
  }
};

// Área segura com medidas fixas (mock oficial do pacote).
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

/*
 * Confere a tela no meio de uma operação: segura a função do Firestore
 * falso, roda conferir() enquanto ela espera e depois a libera.
 *   const durante = await duranteAEspera('setDoc', () => fireEvent.press(botao), () => ({ ... }));
 */
global.duranteAEspera = async (nomeFuncao, acao, conferir) => {
  const firestore = require('firebase/firestore');
  const liberar = firestore.__segurar(nomeFuncao);
  let resultado;

  setTimeout(() => {
    resultado = conferir();
    liberar();
  }, 50);

  await acao();

  // O fim da operação (depois de liberada) também chega à tela.
  const { act } = require('@testing-library/react-native');
  await act(() => global.esperar());

  return resultado;
};
