import { Alert } from 'react-native';
import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  auth,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
} from '../src/armazenamento/contasLocais';
import { acionarSOS, observarMeuSOS, observarSOSAtivos } from '../src/dados/sos';
import EncerrarSOS from '../src/sos/EncerrarSOS';

// O primeiro render (frio, com as suítes em paralelo) pode passar de 1 s.
configure({ asyncUtilTimeout: 5000 });

// Biometria simulada em jest.setup.js.
const controle = jest.requireMock('expo-local-authentication').__controle;
const GRUPO = 'grupo-teste';

let eu;
let uidB;

const codigoDoErro = (promessa) => promessa.then(() => null, (e) => e.code);

// Lista atual de SOS ativos do grupo (primeira emissão do listener).
const sosAtivos = () =>
  new Promise((resolve) => {
    const cancelar = observarSOSAtivos(GRUPO, (lista) => {
      cancelar();
      resolve(lista);
    });
  });

async function abrirTela(props = {}) {
  await render(<EncerrarSOS usuario={{ uid: eu.uid }} grupoId={GRUPO} {...props} />);
}

beforeAll(async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});

  await createUserWithEmailAndPassword(auth, 'b@x.com', 'senhaB1');
  uidB = auth.currentUser.uid;
  await createUserWithEmailAndPassword(auth, 'a@x.com', 'senhaA1');
  eu = auth.currentUser;

  await acionarSOS({ uid: uidB, grupoId: GRUPO, nome: 'B' });
});

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  controle.hardware = true;
  controle.cadastrada = true;
  controle.resultado = { success: true };
});

afterEach(() => {
  Alert.alert.mockRestore();
});

describe('conferir a senha (reauthenticateWithCredential)', () => {
  test('senha certa confere, com e-mail normalizado, sem trocar a sessão', async () => {
    await reauthenticateWithCredential(eu, EmailAuthProvider.credential(' A@X.com', 'senhaA1'));

    expect(auth.currentUser.uid).toBe(eu.uid);
  });

  test('recusa senha errada, vazia, de outra conta e sem usuário', async () => {
    expect(await codigoDoErro(reauthenticateWithCredential(eu, EmailAuthProvider.credential('a@x.com', 'x'))))
      .toBe('auth/invalid-credential');
    expect(await codigoDoErro(reauthenticateWithCredential(eu, EmailAuthProvider.credential('a@x.com', ''))))
      .toBe('auth/missing-password');
    expect(await codigoDoErro(reauthenticateWithCredential(eu, EmailAuthProvider.credential('b@x.com', 'senhaB1'))))
      .toBe('auth/user-mismatch');
    expect(await codigoDoErro(reauthenticateWithCredential(null, EmailAuthProvider.credential('a@x.com', 'senhaA1'))))
      .toBe('auth/user-mismatch');
  });

  test('a senha nunca vai para o AsyncStorage', async () => {
    const chaves = await AsyncStorage.getAllKeys();
    const valores = await AsyncStorage.multiGet(chaves);

    expect(valores.some(([, valor]) => valor?.includes('senhaA1'))).toBe(false);
  });
});

describe('observarMeuSOS', () => {
  test('só o SOS do próprio usuário; sem família devolve null', async () => {
    const recebido = await new Promise((resolve) => {
      const cancelar = observarMeuSOS(GRUPO, eu.uid, (valor) => {
        cancelar();
        resolve(valor);
      });
    });

    expect(recebido).toBeNull();

    const semFamilia = jest.fn();
    observarMeuSOS(null, eu.uid, semFamilia);
    expect(semFamilia).toHaveBeenCalledWith(null);
  });
});

describe('EncerrarSOS (Perfil → Configurações → Segurança)', () => {
  test('sem SOS ativo mostra o aviso', async () => {
    await abrirTela();

    expect(await screen.findByText('Você não tem nenhum SOS ativo.')).toBeTruthy();
  });

  test('biometria aprovada encerra só o meu SOS', async () => {
    await acionarSOS({ uid: eu.uid, grupoId: GRUPO, nome: 'A' });
    await abrirTela();

    await fireEvent.press(await screen.findByText('Encerrar meu SOS'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('SOS encerrado', expect.any(String)));
    expect(LocalAuthentication.authenticateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ promptMessage: 'Encerrar SOS', disableDeviceFallback: true })
    );
    expect(await screen.findByText('Você não tem nenhum SOS ativo.')).toBeTruthy();

    const ativos = await sosAtivos();
    expect(ativos.some((alerta) => alerta.uid === eu.uid)).toBe(false);
    expect(ativos.some((alerta) => alerta.uid === uidB)).toBe(true);
  });

  test('biometria falhou: pede senha; errada não encerra; certa encerra', async () => {
    await acionarSOS({ uid: eu.uid, grupoId: GRUPO, nome: 'A' });
    controle.resultado = { success: false, error: 'authentication_failed' };
    await abrirTela();

    await fireEvent.press(await screen.findByText('Encerrar meu SOS'));

    const campo = await screen.findByPlaceholderText('Senha da conta');
    expect(campo.props.secureTextEntry).toBe(true);
    expect(screen.getByText(/Não foi possível confirmar pela biometria/)).toBeTruthy();

    await fireEvent.changeText(campo, 'errada');
    await fireEvent.press(screen.getByText('Confirmar senha e encerrar'));
    expect(await screen.findByText('Senha incorreta (tentativa 1 de 3).')).toBeTruthy();
    expect(screen.getByPlaceholderText('Senha da conta').props.value).toBe('');
    expect(screen.getByText('Seu SOS está ativo')).toBeTruthy();

    await fireEvent.changeText(screen.getByPlaceholderText('Senha da conta'), 'senhaA1');
    await fireEvent.press(screen.getByText('Confirmar senha e encerrar'));

    expect(await screen.findByText('Você não tem nenhum SOS ativo.')).toBeTruthy();
    expect(Alert.alert).toHaveBeenCalledWith('SOS encerrado', expect.any(String));
    // Acertar zera o contador de tentativas.
    expect(await SecureStore.getItemAsync(`conecta.sos.senha.falhas.${eu.uid}`)).toBeNull();
  });

  test('sem biometria no aparelho vai direto para a senha', async () => {
    await acionarSOS({ uid: eu.uid, grupoId: GRUPO, nome: 'A' });
    controle.cadastrada = false;
    LocalAuthentication.authenticateAsync.mockClear();
    await abrirTela();

    await fireEvent.press(await screen.findByText('Encerrar meu SOS'));

    expect(await screen.findByText(/Biometria indisponível/)).toBeTruthy();
    expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
  });

  test('3 senhas erradas encerram a sessão e o SOS continua ativo', async () => {
    controle.resultado = { success: false, error: 'user_cancel' };
    const onSair = jest.fn();
    await abrirTela({ onSair });

    await fireEvent.press(await screen.findByText('Encerrar meu SOS'));
    await screen.findByPlaceholderText('Senha da conta');

    for (const tentativa of [1, 2]) {
      await fireEvent.changeText(screen.getByPlaceholderText('Senha da conta'), 'errada');
      await fireEvent.press(screen.getByText('Confirmar senha e encerrar'));
      expect(await screen.findByText(`Senha incorreta (tentativa ${tentativa} de 3).`)).toBeTruthy();
    }

    await fireEvent.changeText(screen.getByPlaceholderText('Senha da conta'), 'errada');
    await fireEvent.press(screen.getByText('Confirmar senha e encerrar'));

    await waitFor(() => expect(onSair).toHaveBeenCalledTimes(1));
    expect(Alert.alert).toHaveBeenCalledWith('Muitas tentativas', expect.stringContaining('continua ativo'));
    expect((await sosAtivos()).some((alerta) => alerta.uid === eu.uid)).toBe(true);
    // Contador zerado para a próxima entrada.
    expect(await SecureStore.getItemAsync(`conecta.sos.senha.falhas.${eu.uid}`)).toBeNull();
  });

  test('o contador de tentativas não zera ao sair e voltar para a tela', async () => {
    controle.resultado = { success: false, error: 'user_cancel' };
    const onSair = jest.fn();

    for (let vez = 0; vez < 3; vez++) {
      const tela = await render(
        <EncerrarSOS usuario={{ uid: eu.uid }} grupoId={GRUPO} onSair={onSair} />
      );

      await fireEvent.press(await screen.findByText('Encerrar meu SOS'));
      await fireEvent.changeText(await screen.findByPlaceholderText('Senha da conta'), 'errada');
      await fireEvent.press(screen.getByText('Confirmar senha e encerrar'));

      if (vez < 2) {
        expect(await screen.findByText(`Senha incorreta (tentativa ${vez + 1} de 3).`)).toBeTruthy();
        await tela.unmount();
      }
    }

    await waitFor(() => expect(onSair).toHaveBeenCalledTimes(1));
  });
});

test('o login continua funcionando depois dos testes do SOS', async () => {
  const { user } = await signInWithEmailAndPassword(auth, 'a@x.com', 'senhaA1');

  expect(user.uid).toBe(eu.uid);
});
