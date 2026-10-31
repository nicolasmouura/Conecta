/*
 * Firebase Auth nos testes: todas as funções são jest.fn que resolvem
 * sem fazer nada. Cada teste define o que precisa (mockResolvedValue...).
 */

const resolve = (valor) => jest.fn(() => Promise.resolve(valor));

module.exports = {
  initializeAuth: jest.fn(() => ({ currentUser: null })),
  getAuth: jest.fn(() => ({ currentUser: null })),
  getReactNativePersistence: jest.fn((armazenamento) => ({ armazenamento })),
  onAuthStateChanged: jest.fn(() => jest.fn()),
  signOut: resolve(),
  signInWithEmailAndPassword: resolve(),
  createUserWithEmailAndPassword: resolve(),
  sendEmailVerification: resolve(),
  sendPasswordResetEmail: resolve(),
  reload: resolve(),
  deleteUser: resolve(),
  reauthenticateWithCredential: resolve(),
  EmailAuthProvider: {
    credential: jest.fn((email, senha) => ({ email, senha })),
  },
};
