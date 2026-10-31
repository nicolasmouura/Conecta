/*
 * Antes do "npm run test:regras": no Windows, o firebase emulators:exec
 * às vezes deixa o Java do emulador do Firestore rodando e a porta 8080
 * fica presa. Encerra só esse processo (pela linha de comando do
 * emulador); em outros sistemas não faz nada.
 */

const { execFileSync } = require('child_process');

if (process.platform === 'win32') {
  const comando =
    "Get-CimInstance Win32_Process -Filter \"Name = 'java.exe'\" | " +
    "Where-Object { $_.CommandLine -like '*cloud-firestore-emulator*' } | " +
    'ForEach-Object { Stop-Process -Id $_.ProcessId -Force; $_.ProcessId }';

  const encerrados = execFileSync('powershell', ['-NoProfile', '-Command', comando], { encoding: 'utf8' }).trim();

  if (encerrados) console.log('Emulador antigo do Firestore encerrado:', encerrados.split(/\s+/).join(', '));
}
