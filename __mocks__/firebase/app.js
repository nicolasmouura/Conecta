// Firebase App nos testes: um app falso, sem rede.
const apps = [];

module.exports = {
  initializeApp: jest.fn((config) => {
    const app = { config };
    apps.push(app);
    return app;
  }),
  getApps: jest.fn(() => apps),
  getApp: jest.fn(() => apps[0]),
};
