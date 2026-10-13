/*
 * npm run test:banco
 *
 * Liga o Emulador do Firestore, roda os testes do banco e desliga o
 * emulador no fim (inclusive o Java que ele abre: no Windows o
 * "firebase emulators:exec" deixa esse processo rodando).
 *
 * Se já houver um emulador ligado na porta 8080 (ex.: aberto por você
 * com "npx firebase emulators:start"), os testes usam esse e ele não
 * é desligado.
 */
const { spawn, spawnSync } = require('child_process');
const net = require('net');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const HOST = '127.0.0.1';
const PORTA = 8080;
const ESPERA_MAXIMA = 90 * 1000;
const WINDOWS = process.platform === 'win32';

function portaAberta() {
  return new Promise((resolve) => {
    const conexao = net.connect(PORTA, HOST);

    conexao.once('connect', () => {
      conexao.destroy();
      resolve(true);
    });
    conexao.once('error', () => resolve(false));
  });
}

async function esperarPorta(emulador) {
  const limite = Date.now() + ESPERA_MAXIMA;

  while (Date.now() < limite) {
    if (emulador.exitCode !== null) {
      throw new Error('O emulador fechou antes de ligar (veja as mensagens acima).');
    }

    if (await portaAberta()) return;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`O emulador não ligou em ${ESPERA_MAXIMA / 1000} s.`);
}

// Desliga o emulador e tudo o que ele abriu (Java incluído).
function desligar(emulador) {
  if (!emulador || emulador.exitCode !== null) return;

  if (WINDOWS) {
    spawnSync('taskkill', ['/pid', String(emulador.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-emulador.pid, 'SIGTERM');
    } catch {
      // Já tinha fechado.
    }
  }
}

function rodarTestes() {
  const jest = require.resolve('jest/bin/jest');
  const argumentos = [jest, '-c', 'jest.banco.config.js', ...process.argv.slice(2)];

  return spawnSync(process.execPath, argumentos, { cwd: RAIZ, stdio: 'inherit' }).status ?? 1;
}

async function principal() {
  if (await portaAberta()) {
    console.log(`Usando o emulador que já está ligado em ${HOST}:${PORTA}.`);
    return rodarTestes();
  }

  console.log('Ligando o Emulador do Firestore...');

  const firebase = require.resolve('firebase-tools/lib/bin/firebase');
  const emulador = spawn(
    process.execPath,
    [firebase, 'emulators:start', '--only', 'firestore', '--project', 'demo-conecta'],
    { cwd: RAIZ, stdio: ['ignore', 'ignore', 'inherit'], detached: !WINDOWS }
  );

  // Ctrl+C também desliga o emulador.
  const interromper = () => {
    desligar(emulador);
    process.exit(130);
  };

  process.on('SIGINT', interromper);
  process.on('SIGTERM', interromper);

  try {
    await esperarPorta(emulador);
    return rodarTestes();
  } finally {
    desligar(emulador);
  }
}

principal().then(
  (codigo) => process.exit(codigo),
  (erro) => {
    console.error(erro.message);
    process.exit(1);
  }
);
