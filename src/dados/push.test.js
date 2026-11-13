/*
 * Testes da notificação urgente do SOS (push.js): registrar o aparelho,
 * avisar a família pela API da Expo e abrir o SOS ao tocar.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import {
  CANAL_SOS,
  aoTocarNaNotificacao,
  configurarNotificacoes,
  montarMensagemPush,
  notificarFamiliaSOS,
  registrarPush,
  removerPush,
} from './push';

const firestore = require('firebase/firestore');

function semearFamilia() {
  firestore.__semear('grupos/g1', { membros: ['a', 'b', 'c'] });
  firestore.__semear('tokensPush/a', { uid: 'a', grupoId: 'g1', token: 'ExponentPushToken[aaa]' });
  firestore.__semear('tokensPush/b', { uid: 'b', grupoId: 'g1', token: 'ExponentPushToken[bbb]' });
  firestore.__semear('tokensPush/c', { uid: 'c', grupoId: 'g1', token: 'ExponentPushToken[ccc]' });
  // Saiu da família e deixou o token: não deve ser avisada.
  firestore.__semear('tokensPush/x', { uid: 'x', grupoId: 'g1', token: 'ExponentPushToken[xxx]' });
  // Outra família.
  firestore.__semear('tokensPush/z', { uid: 'z', grupoId: 'g2', token: 'ExponentPushToken[zzz]' });
}

beforeEach(() => {
  firestore.__limpar();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
  Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
  Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
  Notifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[teste]' });

  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  Platform.OS = 'ios';
});

describe('configurarNotificacoes', () => {
  it('mostra e toca a notificação com o app aberto', async () => {
    configurarNotificacoes();

    const { handleNotification } = Notifications.setNotificationHandler.mock.calls[0][0];

    expect(await handleNotification()).toMatchObject({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
    });
  });
});

describe('registrarPush', () => {
  it('guarda o token do aparelho', async () => {
    firestore.__semear('usuarios/a', { nome: 'Ana', grupoId: 'g1' });

    expect(await registrarPush({ uid: 'a', grupoId: 'g1' })).toEqual({ registrado: true });

    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'tokensPush/a' }),
      expect.objectContaining({ uid: 'a', grupoId: 'g1', token: 'ExponentPushToken[teste]', plataforma: 'ios' })
    );
  });

  it('Android: cria o canal de importância máxima', async () => {
    Platform.OS = 'android';

    await registrarPush({ uid: 'a', grupoId: 'g1' });

    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      CANAL_SOS,
      expect.objectContaining({ importance: Notifications.AndroidImportance.MAX, bypassDnd: true })
    );
  });

  it('iOS não cria canal', async () => {
    await registrarPush({ uid: 'a', grupoId: 'g1' });

    expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it('pede a permissão se ainda não foi dada', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });

    expect(await registrarPush({ uid: 'a', grupoId: 'g1' })).toEqual({ registrado: true });
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('permissão negada: nada é guardado', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' });
    Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });

    expect(await registrarPush({ uid: 'a', grupoId: 'g1' })).toEqual({ registrado: false, motivo: 'permissao' });
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('sem token (ex.: sem internet ou sem google-services.json): erro, sem lançar', async () => {
    Notifications.getExpoPushTokenAsync.mockRejectedValue(new Error('sem rede'));

    expect(await registrarPush({ uid: 'a', grupoId: 'g1' })).toEqual({ registrado: false, motivo: 'erro' });
  });
});

describe('removerPush', () => {
  it('apaga o token do aparelho', async () => {
    firestore.__semear('tokensPush/a', { uid: 'a' });

    await removerPush('a');

    expect(firestore.deleteDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'tokensPush/a' }));
  });

  it('falha ao apagar não lança', async () => {
    firestore.__falhar('deleteDoc', { code: 'permission-denied' });

    await expect(removerPush('a')).resolves.toBeUndefined();
  });
});

describe('montarMensagemPush', () => {
  it('urgente, com nome e dados para abrir o SOS', () => {
    expect(montarMensagemPush({ to: 'T', nome: 'Ana', alertaId: 's1' })).toEqual({
      to: 'T',
      title: 'SOS! Ana precisa de ajuda',
      body: 'Toque para ver a localização.',
      sound: 'default',
      priority: 'high',
      channelId: 'sos',
      interruptionLevel: 'time-sensitive',
      ttl: 3600,
      data: { tipo: 'sos', alertaId: 's1' },
    });
  });

  it('sem nome: "Um familiar"', () => {
    expect(montarMensagemPush({ to: 'T' }).title).toBe('SOS! Um familiar precisa de ajuda');
  });
});

describe('notificarFamiliaSOS', () => {
  it('avisa só os outros membros atuais da própria família', async () => {
    semearFamilia();

    expect(await notificarFamiliaSOS({ uid: 'a', grupoId: 'g1', nome: 'Ana', alertaId: 's1' })).toEqual({
      enviados: 2,
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, pedido] = global.fetch.mock.calls[0];
    const mensagens = JSON.parse(pedido.body);

    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    expect(pedido.method).toBe('POST');
    expect(mensagens.map((mensagem) => mensagem.to).sort()).toEqual([
      'ExponentPushToken[bbb]',
      'ExponentPushToken[ccc]',
    ]);
    expect(mensagens[0]).toMatchObject({ channelId: 'sos', priority: 'high', data: { alertaId: 's1' } });
  });

  it('manda em pedidos de até 100 mensagens', async () => {
    const membros = ['a'];

    for (let i = 0; i < 150; i++) {
      membros.push(`m${i}`);
      firestore.__semear(`tokensPush/m${i}`, { uid: `m${i}`, grupoId: 'g1', token: `ExponentPushToken[m${i}]` });
    }

    firestore.__semear('grupos/g1', { membros });

    expect((await notificarFamiliaSOS({ uid: 'a', grupoId: 'g1', nome: 'Ana' })).enviados).toBe(150);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toHaveLength(100);
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toHaveLength(50);
  });

  it('ninguém com token: nada é enviado', async () => {
    firestore.__semear('grupos/g1', { membros: ['a', 'b'] });

    expect(await notificarFamiliaSOS({ uid: 'a', grupoId: 'g1', nome: 'Ana' })).toEqual({ enviados: 0 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('família que não existe mais: nada é enviado', async () => {
    firestore.__semear('tokensPush/b', { uid: 'b', grupoId: 'g1', token: 'ExponentPushToken[bbb]' });

    expect(await notificarFamiliaSOS({ uid: 'a', grupoId: 'g1', nome: 'Ana' })).toEqual({ enviados: 0 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sem internet (a consulta falha): não lança e não envia', async () => {
    semearFamilia();
    firestore.__falhar('getDocs', { code: 'unavailable' });

    expect(await notificarFamiliaSOS({ uid: 'a', grupoId: 'g1', nome: 'Ana' })).toEqual({ enviados: 0 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('a API da Expo recusa ou cai: não lança', async () => {
    semearFamilia();
    global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });

    expect(await notificarFamiliaSOS({ uid: 'a', grupoId: 'g1', nome: 'Ana' })).toEqual({ enviados: 0 });

    global.fetch.mockRejectedValueOnce(new Error('Network request failed'));

    expect(await notificarFamiliaSOS({ uid: 'a', grupoId: 'g1', nome: 'Ana' })).toEqual({ enviados: 0 });
  });
});

describe('aoTocarNaNotificacao', () => {
  function tocar(data) {
    const [ouvinte] = Notifications.addNotificationResponseReceivedListener.mock.calls.at(-1);

    ouvinte({ notification: { request: { content: { data } } } });
  }

  it('SOS abre a tela de SOS', () => {
    const abrir = jest.fn();

    aoTocarNaNotificacao(abrir);
    tocar({ tipo: 'sos', alertaId: 's1' });

    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it('outras notificações são ignoradas', () => {
    const abrir = jest.fn();

    aoTocarNaNotificacao(abrir);
    tocar({ tipo: 'outra' });
    tocar(undefined);

    expect(abrir).not.toHaveBeenCalled();
  });

  it('devolve o cancelamento da assinatura', () => {
    const remover = jest.fn();
    Notifications.addNotificationResponseReceivedListener.mockReturnValueOnce({ remove: remover });

    aoTocarNaNotificacao(jest.fn())();

    expect(remover).toHaveBeenCalled();
  });
});
