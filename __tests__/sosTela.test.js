import { Alert } from 'react-native';
import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { enviarSOSPorSMS } from '../src/dados/smsSOS';
import SOSScreen from '../src/sos/SOSScreen';

jest.mock('../src/dados/smsSOS', () => ({
  enviarSOSPorSMS: jest.fn(async () => ({ resultado: 'aberto', telefones: 1 })),
}));

configure({ asyncUtilTimeout: 5000 });

const USUARIO = { uid: 'eu', nome: 'Eu' };
const POSICAO = { latitude: -22.9, longitude: -43.1 };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => Alert.alert.mockRestore());

test('com família: o botão "Avisar por SMS" fica abaixo do SOS e envia a posição', async () => {
  await render(<SOSScreen usuario={USUARIO} grupoId="g1" posicaoAtual={POSICAO} posicaoEm={123} />);

  await fireEvent.press(await screen.findByText('Avisar por SMS'));

  await waitFor(() =>
    expect(enviarSOSPorSMS).toHaveBeenCalledWith({
      uid: 'eu', grupoId: 'g1', nome: 'Eu', posicao: POSICAO, posicaoEm: 123,
    })
  );
  expect(screen.getByText('ACIONAR SOS')).toBeTruthy();
});

test('sem família: o SMS continua disponível', async () => {
  await render(<SOSScreen usuario={USUARIO} grupoId={null} />);

  expect(screen.getByText('Entre em uma família para usar o SOS.')).toBeTruthy();

  await fireEvent.press(screen.getByText('Avisar por SMS'));

  await waitFor(() => expect(enviarSOSPorSMS).toHaveBeenCalledWith(expect.objectContaining({ grupoId: null })));
});

test('aparelho sem SMS: avisa a pessoa', async () => {
  enviarSOSPorSMS.mockResolvedValueOnce({ resultado: 'indisponivel', telefones: 0 });
  await render(<SOSScreen usuario={USUARIO} grupoId={null} />);

  await fireEvent.press(screen.getByText('Avisar por SMS'));

  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('SMS indisponível', expect.any(String)));
});

test('depois de acionar o SOS, o aviso oferece "Avisar por SMS"', async () => {
  await render(<SOSScreen usuario={USUARIO} grupoId="g2" posicaoAtual={POSICAO} />);

  await fireEvent.press(await screen.findByText('ACIONAR SOS'));

  // Confirmação → "Acionar SOS"
  const [, , botoesConfirmacao] = Alert.alert.mock.calls.at(-1);
  await act(() => botoesConfirmacao.find((botao) => botao.text === 'Acionar SOS').onPress());

  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('SOS acionado', expect.any(String), expect.any(Array)));
  const [, , botoes] = Alert.alert.mock.calls.at(-1);
  await act(() => botoes.find((botao) => botao.text === 'Avisar por SMS').onPress());

  expect(enviarSOSPorSMS).toHaveBeenCalledWith(expect.objectContaining({ grupoId: 'g2', posicao: POSICAO }));
});
