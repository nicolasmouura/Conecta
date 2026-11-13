/*
 * Completa o app.json com valores que não podem ir para o Git.
 * A chave do Google Maps vem do .env.local (GOOGLE_MAPS_API_KEY).
 * O google-services.json (Firebase Console > Configurações do projeto >
 * app Android), na raiz do projeto, liga o push no Android: sem o
 * arquivo o app ainda funciona, só não recebe notificação.
 */
const fs = require('fs');
const path = require('path');

const GOOGLE_SERVICES = './google-services.json';

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    ...(process.env.GOOGLE_MAPS_API_KEY && {
      config: {
        googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY },
      },
    }),
    ...(fs.existsSync(path.join(__dirname, GOOGLE_SERVICES)) && {
      googleServicesFile: GOOGLE_SERVICES,
    }),
  },
});
