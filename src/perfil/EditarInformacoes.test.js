/*
 * Testes de Editar informações (EditarInformacoes.js), com o Firestore
 * falso. O formulário do endereço (EditarLugar) é simulado.
 */

import { BackHandler } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import EditarInformacoes from './EditarInformacoes';

jest.mock('../lugares/EditarLugar', () => {
  const { Text, TouchableOpacity, View } = require('react-native');

  return function EditarLugarFalso({ lugar, enderecoInicial, onSalvar, onFechar }) {
    return (
      <View>
        <Text>Formulário da casa {lugar ? '(editar)' : '(novo)'} {enderecoInicial?.rua || ''}</Text>
        <TouchableOpacity
          onPress={() =>
            onSalvar({
              enderecoDetalhado: {
                pais: 'Brasil',
                estado: 'SP',
                cidade: 'São Paulo',
                bairro: 'Centro',
                rua: 'Rua Nova',
                numero: '5',
                cep: '01001-000',
              },
              latitude: 1,
              longitude: 2,
            })
          }
        >
          <Text>Salvar endereço</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onFechar}>
          <Text>Fechar endereço</Text>
        </TouchableOpacity>
      </View>
    );
  };
});

const firestore = require('firebase/firestore');
const { apagarDadosLocais } = require('../dados/armazenamentoLocal');

const PERFIL = {
  uid: 'u1',
  nome: 'Ana',
  email: 'ana@exemplo.com',
  documento: '529.982.247-25',
  telefone: '(11) 98765-4321',
  endereco: 'Rua A, 10',
  enderecoDetalhado: { rua: 'Rua A' },
};

beforeEach(async () => {
  firestore.__limpar();
  await apagarDadosLocais();
  jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove: jest.fn() });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function abrir(props = {}) {
  const funcoes = {
    onSalvar: jest.fn(async (alteracoes) => alteracoes),
    onCasaSalva: jest.fn(),
    onVoltar: jest.fn(),
  };

  await render(<EditarInformacoes perfil={PERFIL} {...funcoes} {...props} />);
  await act(() => esperar());

  return { ...funcoes, ...props };
}

describe('EditarInformacoes', () => {
  it('e-mail e CPF bloqueados, com o CPF mascarado', async () => {
    await abrir();

    expect(screen.getByText('ana@exemplo.com')).toBeOnTheScreen();
    expect(screen.getByText('•••.•••.•••-25')).toBeOnTheScreen();
    expect(screen.getAllByText('Não editável')).toHaveLength(2);
  });

  it('salva nome e telefone', async () => {
    const { onSalvar } = await abrir();

    await fireEvent.changeText(screen.getByPlaceholderText('Seu nome completo'), 'Ana Lima');
    await fireEvent.press(screen.getByText('Salvar alterações'));

    expect(onSalvar).toHaveBeenCalledWith({ nome: 'Ana Lima', telefone: '(11) 98765-4321' });
    expect(screen.getByText('✓ Dados atualizados com sucesso.')).toBeOnTheScreen();
  });

  it('mostra o telefone como foi salvo (formatado)', async () => {
    await abrir({ onSalvar: jest.fn(async () => ({ nome: 'Ana', telefone: '(11) 3333-4444' })) });

    await fireEvent.changeText(screen.getByPlaceholderText('(21) 98765-4321'), '1133334444');
    await fireEvent.press(screen.getByText('Salvar alterações'));

    expect(screen.getByPlaceholderText('(21) 98765-4321')).toHaveDisplayValue('(11) 3333-4444');
  });

  it('valida antes de salvar', async () => {
    const { onSalvar } = await abrir();

    await fireEvent.changeText(screen.getByPlaceholderText('(21) 98765-4321'), '123');
    await fireEvent.press(screen.getByText('Salvar alterações'));

    expect(screen.getByText('Digite um telefone válido, com DDD.')).toBeOnTheScreen();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('erro ao salvar', async () => {
    await abrir({ onSalvar: jest.fn(() => Promise.reject(new Error('falhou'))) });

    await fireEvent.press(screen.getByText('Salvar alterações'));

    expect(screen.getByText(/Não foi possível atualizar seus dados/)).toBeOnTheScreen();
    expect(screen.getByText('Salvar alterações')).toBeOnTheScreen();
  });

  it('o endereço abre o formulário da casa e salva junto com o mapa', async () => {
    firestore.__semear('usuarios/u1/lugares/casa', { endereco: 'Rua A, 10', enderecoDetalhado: { rua: 'Rua A' } });
    const { onCasaSalva } = await abrir();

    await fireEvent.press(screen.getByText('Rua A, 10'));
    expect(screen.getByText(/Formulário da casa \(editar\) Rua A/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Salvar endereço'));

    expect(firestore.__ler('usuarios/u1/lugares/casa')).toMatchObject({ latitude: 1, longitude: 2 });
    expect(firestore.__ler('usuarios/u1').endereco).toBe('Rua Nova, 5 - Centro, São Paulo - SP, 01001-000, Brasil');
    expect(onCasaSalva).toHaveBeenCalled();
    expect(screen.getByText('✓ Endereço salvo. A casa no mapa também foi atualizada.')).toBeOnTheScreen();
    expect(screen.getByText('Rua Nova, 5 - Centro, São Paulo - SP, 01001-000, Brasil')).toBeOnTheScreen();
  });

  it('sem endereço: convida a preencher', async () => {
    await render(
      <EditarInformacoes perfil={{ ...PERFIL, endereco: '' }} onSalvar={jest.fn()} onVoltar={jest.fn()} />
    );
    await act(() => esperar());

    await fireEvent.press(screen.getByText('Toque para preencher (país, cidade, rua...)'));

    expect(screen.getByText(/Formulário da casa \(novo\)/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Fechar endereço'));
    expect(screen.queryByText(/Formulário da casa/)).toBeNull();
  });

  it('volta para Configurações', async () => {
    const { onVoltar } = await abrir();

    await fireEvent.press(screen.getByText('Configurações'));

    expect(onVoltar).toHaveBeenCalled();
  });
});
