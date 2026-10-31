// Configuração do Firebase nos testes: sem chaves e sem rede.
// auth.currentUser é definido por cada teste.
module.exports = {
  db: { tipo: 'firestore' },
  auth: { currentUser: null },
};
