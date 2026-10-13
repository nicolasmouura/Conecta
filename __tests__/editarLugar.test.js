import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import EditarLugar from '../src/lugares/EditarLugar';

/*
 * Formulário de endereço (Meus lugares / endereço do perfil) com a
 * ViaCEP: o CEP completo preenche Estado, Cidade, Bairro e Rua.
 */

configure({ asyncUtilTimeout: 5000 });

jest.mock('expo-location', () => ({
  reverseGeocodeAsync: jest.fn(async () => []),
  geocodeAsync: jest.fn(async () => []),
}));

const CASA = { id: 'casa', nome: 'Casa' };

function respostaViaCEP(corpo) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corpo) });
}

const SE = {
  cep: '01001-000',
  logradouro: 'Praça da Sé',
  bairro: 'Sé',
  localidade: 'São Paulo',
  uf: 'SP',
};

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

beforeEach(() => {
  global.fetch = jest.fn(() => respostaViaCEP(SE));
});

afterEach(() => {
  delete global.fetch;
});

async function abrir() {
  await render(<EditarLugar tipo={CASA} onFechar={jest.fn()} onSalvar={jest.fn()} />);
}

const valor = (placeholder) => screen.getByPlaceholderText(placeholder).props.value;

test('CEP completo preenche estado, cidade, bairro e rua; o número fica', async () => {
  await abrir();

  await fireEvent.changeText(screen.getByPlaceholderText('123'), '45');
  await fireEvent.changeText(screen.getByPlaceholderText('00000-000'), '01001000');

  await waitFor(() => expect(valor('Rua Barata Ribeiro')).toBe('Praça da Sé'));
  expect(valor('00000-000')).toBe('01001-000');
  expect(valor('RJ')).toBe('SP');
  expect(valor('Rio de Janeiro')).toBe('São Paulo');
  expect(valor('Copacabana')).toBe('Sé');
  expect(valor('123')).toBe('45');
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('CEP incompleto não consulta', async () => {
  await abrir();

  await fireEvent.changeText(screen.getByPlaceholderText('00000-000'), '0100100');

  expect(global.fetch).not.toHaveBeenCalled();
  expect(valor('00000-000')).toBe('01001-00');
});

test('CEP inexistente mostra aviso e não apaga o que foi digitado', async () => {
  global.fetch = jest.fn(() => respostaViaCEP({ erro: 'true' }));
  await abrir();

  await fireEvent.changeText(screen.getByPlaceholderText('Rua Barata Ribeiro'), 'Minha rua');
  await fireEvent.changeText(screen.getByPlaceholderText('00000-000'), '99999999');

  expect(await screen.findByText(/CEP não encontrado/)).toBeTruthy();
  expect(valor('Rua Barata Ribeiro')).toBe('Minha rua');
});

test('sem internet: avisa para preencher à mão', async () => {
  global.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed')));
  await abrir();

  await fireEvent.changeText(screen.getByPlaceholderText('00000-000'), '01001000');

  expect(await screen.findByText(/sem internet\?/)).toBeTruthy();
});

test('CEP geral da cidade: preenche cidade e pede bairro e rua', async () => {
  global.fetch = jest.fn(() =>
    respostaViaCEP({ logradouro: '', bairro: '', localidade: 'Arraial do Cabo', uf: 'RJ' })
  );
  await abrir();

  await fireEvent.changeText(screen.getByPlaceholderText('00000-000'), '28930000');

  expect(await screen.findByText(/cidade toda/)).toBeTruthy();
  expect(valor('Rio de Janeiro')).toBe('Arraial do Cabo');
  expect(valor('Rua Barata Ribeiro')).toBe('');
});

test('resposta de um CEP antigo (digitação rápida) é ignorada', async () => {
  let responderPrimeiro;

  global.fetch = jest
    .fn()
    .mockImplementationOnce(
      () => new Promise((resolve) => {
        responderPrimeiro = () => resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ...SE, logradouro: 'Rua Velha' }),
        });
      })
    )
    .mockImplementationOnce(() =>
      respostaViaCEP({ logradouro: 'Rua Nova', bairro: 'B', localidade: 'C', uf: 'RJ' })
    );

  await abrir();

  await fireEvent.changeText(screen.getByPlaceholderText('00000-000'), '01001000');
  await fireEvent.changeText(screen.getByPlaceholderText('00000-000'), '20040002');

  await waitFor(() => expect(valor('Rua Barata Ribeiro')).toBe('Rua Nova'));

  responderPrimeiro();
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(valor('Rua Barata Ribeiro')).toBe('Rua Nova');
});

test('trocar o país durante a busca descarta a resposta', async () => {
  let responder;

  global.fetch = jest.fn(
    () => new Promise((resolve) => {
      responder = () => resolve({ ok: true, status: 200, json: () => Promise.resolve(SE) });
    })
  );

  await abrir();

  await fireEvent.changeText(screen.getByPlaceholderText('00000-000'), '01001000');
  await fireEvent.changeText(screen.getByPlaceholderText('Brasil'), 'Portugal');

  responder();
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(valor('Brasil')).toBe('Portugal');
  expect(valor('Rua Barata Ribeiro')).toBe('');
});

test('fora do Brasil não consulta a ViaCEP', async () => {
  await abrir();

  await fireEvent.changeText(screen.getByPlaceholderText('Brasil'), 'Portugal');
  await fireEvent.changeText(screen.getByPlaceholderText('Código postal'), '12345678');

  expect(global.fetch).not.toHaveBeenCalled();
});
