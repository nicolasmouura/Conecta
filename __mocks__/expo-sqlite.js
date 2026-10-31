/*
 * expo-sqlite nos testes: o mesmo SQL roda num SQLite de verdade, em
 * memória (node:sqlite). Cada carregamento do módulo (jest.resetModules)
 * começa com bancos vazios.
 */

const { DatabaseSync } = require('node:sqlite');

const bancos = new Map();

// O expo-sqlite aceita os parâmetros soltos ou num array.
function parametros(lista) {
  return lista.length === 1 && Array.isArray(lista[0]) ? lista[0] : lista;
}

function criarBanco() {
  const sqlite = new DatabaseSync(':memory:');

  const banco = {
    async execAsync(sql) {
      sqlite.exec(sql);
    },

    async runAsync(sql, ...valores) {
      const { changes, lastInsertRowid } = sqlite.prepare(sql).run(...parametros(valores));

      return { changes, lastInsertRowId: Number(lastInsertRowid) };
    },

    async getFirstAsync(sql, ...valores) {
      return sqlite.prepare(sql).get(...parametros(valores)) ?? null;
    },

    async getAllAsync(sql, ...valores) {
      return sqlite.prepare(sql).all(...parametros(valores));
    },

    async withTransactionAsync(tarefa) {
      sqlite.exec('BEGIN');

      try {
        await tarefa();
        sqlite.exec('COMMIT');
      } catch (erro) {
        sqlite.exec('ROLLBACK');
        throw erro;
      }
    },
  };

  return banco;
}

const openDatabaseAsync = jest.fn(async (nome) => {
  if (!bancos.has(nome)) {
    bancos.set(nome, criarBanco());
  }

  return bancos.get(nome);
});

module.exports = { openDatabaseAsync };
