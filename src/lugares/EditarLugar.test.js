/*
 * Testes do cadastro/edição da Casa (EditarLugar.js). CEP, GPS e busca
 * de endereço são simulados; validação e formatação são as reais.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { __metodos as mapa } from 'react-native-maps';

import EditarLugar from './EditarLugar';
import { buscarCEP, buscarEndereco, localizarEndereco } from '../dados/enderecos';

jest.mock('../dados/enderecos', () => ({
  ...jest.requireActual('../dados/enderecos'),
  buscarCEP: jest.fn(),
  buscarEndereco: jest.fn(),
  localizarEndereco: jest.fn(),
}));

const CASA = { id: 'casa', nome: 'Casa' };
const ENDERECO = {
  pais: 'Brasil',
  estado: 'SP',
  cidade: 'São Paulo',
  bairro: 'Centro',
  rua: 'Rua A',
  numero: '10',
  cep: '01001-000',
};
const SALVA = { ...ENDERECO, latitude: -23.5, longitude: -46.6 };

beforeEach(() => {
  buscarCEP.mockResolvedValue({
    endereco: { pais: 'Brasil', estado: 'SP', cidade: 'São Paulo', bairro: 'Sé', rua: 'Praça da Sé', cep: '01001-000' },
  });
  buscarEndereco.mockResolvedValue(null);
  localizarEndereco.mockResolvedValue({ latitude: -23.55, longitude: -46.63 });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function abrir(props = {}) {
  const funcoes = { onFechar: jest.fn(), onSalvar: jest.fn(() => Promise.resolve()) };

  return render(<EditarLugar tipo={CASA} lugar={null} {...funcoes} {...props} />).then(() => funcoes);
}

const campo = (placeholder) => screen.getByPlaceholderText(placeholder);

async function preencherTudo() {
  await fireEvent.changeText(campo('RJ'), 'SP');
  await fireEvent.changeText(campo('Rio de Janeiro'), 'São Paulo');
  await fireEvent.changeText(campo('Copacabana'), 'Centro');
  await fireEvent.changeText(campo('Rua Barata Ribeiro'), 'Rua A');
  await fireEvent.changeText(campo('123'), '10');
  // CEP por último, com o CEP sem resposta para não sobrescrever os campos.
  buscarCEP.mockResolvedValueOnce({ endereco: { pais: 'Brasil', cep: '01001-000' } });
  await fireEvent.changeText(campo('00000-000'), '01001000');
  await act(() => esperar());
}

describe('EditarLugar', () => {
  it('cadastrar: começa vazio, no Brasil, com o mapa do país', async () => {
    await abrir();

    expect(screen.getByText('Cadastrar Casa')).toBeOnTheScreen();
    expect(campo('Brasil')).toHaveDisplayValue('Brasil');
    expect(screen.getByText('Preencha o endereço e toque em "Localizar no mapa".')).toBeOnTheScreen();
    expect(screen.getByTestId('mapa').props.initialRegion).toMatchObject({ latitudeDelta: 30 });
    expect(screen.queryByTestId('marcador')).toBeNull();
  });

  it('com a posição atual, o mapa abre na cidade', async () => {
    await abrir({ posicaoAtual: { latitude: 1, longitude: 2 } });

    expect(screen.getByTestId('mapa').props.initialRegion).toEqual({
      latitude: 1,
      longitude: 2,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    });
  });

  it('editar: abre com o endereço e o alfinete salvos, pronto para salvar', async () => {
    const { onSalvar } = await abrir({ lugar: { ...SALVA, enderecoDetalhado: ENDERECO } });

    expect(screen.getByText('Editar Casa')).toBeOnTheScreen();
    expect(campo('Rua Barata Ribeiro')).toHaveDisplayValue('Rua A');
    expect(screen.getByTestId('marcador')).toHaveProp('coordinate', { latitude: -23.5, longitude: -46.6 });

    await fireEvent.press(screen.getByText('Salvar casa'));

    expect(onSalvar).toHaveBeenCalledWith({ enderecoDetalhado: ENDERECO, latitude: -23.5, longitude: -46.6 });
  });

  it('lugar antigo, sem os campos separados: avisa e pede para localizar', async () => {
    await abrir({ lugar: { endereco: 'Rua velha, 1', latitude: 1, longitude: 1 } });

    expect(screen.getByText(/Endereço salvo antes: Rua velha, 1/)).toBeOnTheScreen();
    expect(screen.queryByTestId('marcador')).toBeNull();
    expect(screen.getByText('Localizar no mapa')).toBeOnTheScreen();
  });

  it('o CEP preenche estado, cidade, bairro e rua', async () => {
    await abrir();

    await fireEvent.changeText(campo('00000-000'), '01001000');
    await act(() => esperar());

    expect(buscarCEP).toHaveBeenCalledWith('01001-000');
    expect(campo('00000-000')).toHaveDisplayValue('01001-000');
    expect(campo('Rua Barata Ribeiro')).toHaveDisplayValue('Praça da Sé');
    expect(campo('Copacabana')).toHaveDisplayValue('Sé');
  });

  it('CEP da cidade toda pede bairro e rua', async () => {
    buscarCEP.mockResolvedValue({ endereco: { pais: 'Brasil', estado: 'MG', cidade: 'Cidade', bairro: '', rua: '', cep: '35000-000' } });
    await abrir();

    await fireEvent.changeText(campo('00000-000'), '35000000');
    await act(() => esperar());

    expect(screen.getByText('Esse CEP é da cidade toda: preencha bairro e rua.')).toBeOnTheScreen();
  });

  it.each([
    ['nao-encontrado', /CEP não encontrado/],
    ['sem-conexao', /sem internet/],
    ['cep-invalido', /CEP inválido/],
  ])('erro do CEP: %s', async (erro, mensagem) => {
    buscarCEP.mockResolvedValue({ erro });
    await abrir();

    await fireEvent.changeText(campo('00000-000'), '99999999');
    await act(() => esperar());

    expect(screen.getByText(mensagem)).toBeOnTheScreen();
  });

  it('fora do Brasil, o CEP não é buscado', async () => {
    await abrir();

    await fireEvent.changeText(campo('Brasil'), 'Portugal');
    await fireEvent.changeText(screen.getByPlaceholderText('Código postal'), '1000-001');

    expect(buscarCEP).not.toHaveBeenCalled();
    expect(screen.queryByText(/Digite o CEP/)).toBeNull();
  });

  it('localizar sem preencher: diz o que falta', async () => {
    await abrir();

    await fireEvent.press(screen.getByText('Localizar no mapa'));

    expect(screen.getByText('Preencha o campo Estado.')).toBeOnTheScreen();
    expect(localizarEndereco).not.toHaveBeenCalled();
  });

  it('localiza, põe o alfinete e só então deixa salvar', async () => {
    const { onSalvar } = await abrir();
    await preencherTudo();

    await fireEvent.press(screen.getByText('Localizar no mapa'));

    expect(localizarEndereco).toHaveBeenCalledWith(expect.objectContaining({ rua: 'Rua A', numero: '10' }));
    expect(mapa.animateToRegion).toHaveBeenCalledWith(
      { latitude: -23.55, longitude: -46.63, latitudeDelta: 0.004, longitudeDelta: 0.004 },
      600
    );
    expect(screen.getByText(/Confira se o alfinete está na casa/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Salvar casa'));
    expect(onSalvar).toHaveBeenCalledWith({ enderecoDetalhado: ENDERECO, latitude: -23.55, longitude: -46.63 });
  });

  it('endereço não encontrado', async () => {
    localizarEndereco.mockResolvedValue(null);
    await abrir();
    await preencherTudo();

    await fireEvent.press(screen.getByText('Localizar no mapa'));

    expect(screen.getByText(/Não encontramos esse endereço/)).toBeOnTheScreen();
    expect(screen.queryByTestId('marcador')).toBeNull();
  });

  it('mudar o endereço depois de localizar pede para localizar de novo', async () => {
    await abrir({ lugar: { ...SALVA, enderecoDetalhado: ENDERECO } });

    await fireEvent.changeText(campo('123'), '20');

    expect(screen.getByText('Você mudou o endereço. Toque em "Localizar no mapa" de novo.')).toBeOnTheScreen();
    expect(screen.getByText('Localizar no mapa')).toBeOnTheScreen();
  });

  it('arrastar o alfinete troca os campos pelo endereço do ponto', async () => {
    buscarEndereco.mockResolvedValue({
      country: 'Brasil',
      region: 'SP',
      city: 'São Paulo',
      district: 'Bela Vista',
      street: 'Rua B',
      streetNumber: '50',
      postalCode: '01310100',
    });
    await abrir({ lugar: { ...SALVA, enderecoDetalhado: ENDERECO } });

    await fireEvent(screen.getByTestId('marcador'), 'dragEnd', { nativeEvent: { coordinate: { latitude: 1, longitude: 2 } } });

    expect(buscarEndereco).toHaveBeenCalledWith({ latitude: 1, longitude: 2 });
    expect(campo('Rua Barata Ribeiro')).toHaveDisplayValue('Rua B');
    expect(campo('00000-000')).toHaveDisplayValue('01310-100');
    expect(screen.getByText('Salvar casa')).toBeOnTheScreen();
  });

  it('arrastar para um ponto sem endereço avisa', async () => {
    await abrir({ lugar: { ...SALVA, enderecoDetalhado: ENDERECO } });

    await fireEvent(screen.getByTestId('mapa'), 'press', { nativeEvent: { coordinate: { latitude: 1, longitude: 2 } } });

    expect(screen.getByText(/Não foi possível buscar o endereço desse ponto/)).toBeOnTheScreen();
  });

  it('tocar no mapa antes de localizar não faz nada', async () => {
    await abrir();

    await fireEvent(screen.getByTestId('mapa'), 'press', { nativeEvent: { coordinate: { latitude: 1, longitude: 2 } } });

    expect(buscarEndereco).not.toHaveBeenCalled();
  });

  it('"Estou em casa agora" usa o GPS e mantém o número digitado', async () => {
    buscarEndereco.mockResolvedValue({
      country: 'Brasil',
      region: 'SP',
      city: 'São Paulo',
      district: 'Centro',
      street: 'Rua A',
      postalCode: '01001000',
    });
    await abrir({ posicaoAtual: { latitude: 5, longitude: 6 } });
    await fireEvent.changeText(campo('123'), '10');

    await fireEvent.press(screen.getByText(/Estou em casa agora/));

    expect(screen.getByTestId('marcador')).toHaveProp('coordinate', { latitude: 5, longitude: 6 });
    expect(campo('123')).toHaveDisplayValue('10');
    expect(screen.getByText('Salvar casa')).toBeOnTheScreen();
  });

  it('"Estou em casa agora" sem GPS', async () => {
    await abrir();

    await fireEvent.press(screen.getByText(/Estou em casa agora/));

    expect(screen.getByText('Sua localização atual não está disponível.')).toBeOnTheScreen();
  });

  it('GPS sem o endereço completo pede para completar', async () => {
    buscarEndereco.mockResolvedValue({ country: 'Brasil', city: 'São Paulo' });
    await abrir({ posicaoAtual: { latitude: 5, longitude: 6 } });

    await fireEvent.press(screen.getByText(/Estou em casa agora/));

    expect(screen.getByText('Confira o endereço e complete os campos que faltam.')).toBeOnTheScreen();
  });

  it('erro ao salvar', async () => {
    const onSalvar = jest.fn(() => Promise.reject(new Error('falhou')));
    await abrir({ lugar: { ...SALVA, enderecoDetalhado: ENDERECO }, onSalvar });

    await fireEvent.press(screen.getByText('Salvar casa'));

    expect(screen.getByText('Não foi possível salvar. Tente novamente.')).toBeOnTheScreen();
  });

  it('abre com o endereço do perfil e pede para localizar se for outro', async () => {
    await abrir({
      lugar: { ...SALVA, enderecoDetalhado: ENDERECO },
      enderecoInicial: { ...ENDERECO, numero: '99' },
    });

    expect(campo('123')).toHaveDisplayValue('99');
    expect(screen.getByText('Localizar no mapa')).toBeOnTheScreen();
  });

  it('o "x" e o voltar do Android fecham', async () => {
    const { onFechar } = await abrir();

    await fireEvent.press(screen.getByTestId('icone-x'));
    await fireEvent(screen.container.queryAll((no) => no.props.onRequestClose)[0], 'requestClose');

    expect(onFechar).toHaveBeenCalledTimes(2);
  });

  it('outros lugares usam "Estou lá agora"', async () => {
    await abrir({ tipo: { id: 'trabalho', nome: 'Trabalho' } });

    expect(screen.getByText(/Estou lá agora/)).toBeOnTheScreen();
    expect(screen.getByText('O endereço e a posição são privados.')).toBeOnTheScreen();
  });
});
