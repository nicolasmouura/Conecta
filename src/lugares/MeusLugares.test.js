/*
 * Testes de Meus lugares (MeusLugares.js), com o Firestore falso. O
 * formulário (EditarLugar) é simulado: tem testes próprios.
 */

import { Alert, BackHandler } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import MeusLugares from './MeusLugares';

jest.mock('./EditarLugar', () => {
  const { Text, TouchableOpacity, View } = require('react-native');

  return function EditarLugarFalso({ tipo, lugar, onSalvar, onFechar }) {
    return (
      <View>
        <Text>Formulário {tipo.nome} {lugar ? '(editar)' : '(novo)'}</Text>
        <TouchableOpacity
          onPress={() =>
            onSalvar({
              enderecoDetalhado: {
                pais: 'Brasil',
                estado: 'SP',
                cidade: 'São Paulo',
                bairro: 'Centro',
                rua: 'Rua A',
                numero: '10',
                cep: '01001-000',
              },
              latitude: 1,
              longitude: 2,
            }).catch(() => {})
          }
        >
          <Text>Salvar no formulário</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onFechar}>
          <Text>Fechar formulário</Text>
        </TouchableOpacity>
      </View>
    );
  };
});

const firestore = require('firebase/firestore');

const USUARIO = { uid: 'u1' };

beforeEach(() => {
  firestore.__limpar();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove: jest.fn() });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function abrir(props = {}) {
  await render(<MeusLugares usuario={USUARIO} onVoltar={jest.fn()} {...props} />);
  await act(() => esperar());
}

describe('MeusLugares', () => {
  it('casa não cadastrada e os outros lugares em breve', async () => {
    await abrir();

    expect(screen.getByText('Não cadastrada · obrigatória')).toBeOnTheScreen();
    expect(screen.getAllByText('Em breve')).toHaveLength(3);
    expect(screen.getAllByText('Cadastrar')).toHaveLength(1);
  });

  it('mostra o endereço da casa cadastrada', async () => {
    firestore.__semear('usuarios/u1/lugares/casa', { endereco: 'Rua A, 10', enderecoDetalhado: { rua: 'Rua A' } });

    await abrir();

    expect(screen.getByText('Rua A, 10')).toBeOnTheScreen();
    expect(screen.getByText('Editar')).toBeOnTheScreen();
  });

  it('casa salva antes dos campos separados: pede para editar', async () => {
    firestore.__semear('usuarios/u1/lugares/casa', { endereco: 'Rua velha' });

    await abrir();

    expect(screen.getByText('Endereço incompleto · toque em Editar para atualizar')).toBeOnTheScreen();
  });

  it('salvar a casa grava, avisa o perfil e fecha o formulário', async () => {
    const onCasaSalva = jest.fn();
    await abrir({ onCasaSalva });

    await fireEvent.press(screen.getByText('Cadastrar'));
    expect(screen.getByText('Formulário Casa (novo)')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Salvar no formulário'));

    expect(firestore.__ler('usuarios/u1/lugares/casa')).toMatchObject({ latitude: 1, longitude: 2 });
    expect(onCasaSalva).toHaveBeenCalledWith(expect.objectContaining({ id: 'casa', latitude: 1 }));
    expect(Alert.alert).toHaveBeenCalledWith('Lugar salvo', 'Casa atualizada com sucesso.');
    expect(screen.queryByText(/Formulário/)).toBeNull();
    expect(screen.getByText('Rua A, 10 - Centro, São Paulo - SP, 01001-000, Brasil')).toBeOnTheScreen();
  });

  it('fechar o formulário não salva', async () => {
    await abrir();

    await fireEvent.press(screen.getByText('Cadastrar'));
    await fireEvent.press(screen.getByText('Fechar formulário'));

    expect(screen.queryByText(/Formulário/)).toBeNull();
    expect(firestore.__ler('usuarios/u1/lugares/casa')).toBeUndefined();
  });

  it('erro ao carregar', async () => {
    firestore.__falhar('getDocs', { code: 'unavailable' });

    await abrir();

    expect(screen.getByText('Não foi possível carregar seus lugares.')).toBeOnTheScreen();
  });

  it('volta para Configurações', async () => {
    const onVoltar = jest.fn();
    await abrir({ onVoltar });

    await fireEvent.press(screen.getByText('Configurações'));

    expect(onVoltar).toHaveBeenCalled();
  });
});
