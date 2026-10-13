/*
 * Completa o app.json com valores que não podem ir para o Git.
 * A chave do Google Maps vem do .env.local (veja .env.example).
 */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    ...(process.env.GOOGLE_MAPS_API_KEY && {
      config: {
        googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY },
      },
    }),
  },
});
