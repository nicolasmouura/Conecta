/*
 * Testes das regras de negócio: cadastro, CPF, endereço, localização,
 * marcadores do mapa, histórico, convites e foto.
 */

import * as Location from 'expo-location';

import {
  cpfValido,
  formatarCPF,
  mascararDocumento,
  montarAlteracoes,
  validarCadastro,
  validarDadosEditaveis,
  chaveDiretorio,
} from '../src/dados/salvarUsuario';
import {
  enderecoDoResultado,
  formatarCEP,
  formatarEndereco,
  limparEndereco,
  localizarEndereco,
  validarEndereco,
} from '../src/dados/enderecos';
import {
  coordenadaValida,
  descreverAtualizacao,
  deveEnviarLocalizacao,
  distanciaEmMetros,
  montarMarcadores,
} from '../src/dados/buscarFamiliares';
import { calcularPeriodo, deveRegistrarHistorico, formatarHorario } from '../src/dados/historico';
import { mensagemDeErro } from '../src/dados/convites';
import { calcularRecorteQuadrado } from '../src/dados/fotoPerfil';

jest.mock('expo-location', () => ({
  geocodeAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
}));

jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: {} }));

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

const CADASTRO = {
  nome: 'Ana Souza',
  email: 'ana@teste.com',
  cpf: '529.982.247-25',
  telefone: '(21) 98765-4321',
  senha: 'senha123',
  confirmacao: 'senha123',
};

describe('cadastro', () => {
  test('cadastro completo é aceito', () => {
    expect(validarCadastro(CADASTRO)).toBeNull();
  });

  test.each([
    [{ nome: '  ' }, 'Digite seu nome completo.'],
    [{ email: '' }, 'Digite seu e-mail.'],
    [{ email: 'ana@' }, 'Digite um e-mail válido.'],
    [{ email: 'ana teste@x.com' }, 'Digite um e-mail válido.'],
    [{ cpf: '' }, 'Digite seu CPF.'],
    [{ cpf: '529.982.247-26' }, 'Digite um CPF válido.'],
    [{ telefone: '' }, 'Digite seu telefone.'],
    [{ telefone: '98765-4321' }, 'Digite um telefone válido, com DDD.'],
    [{ telefone: '(21) 98765-43210' }, 'Digite um telefone válido, com DDD.'],
    [{ senha: '', confirmacao: '' }, 'Digite uma senha.'],
    [{ senha: '12345', confirmacao: '12345' }, 'A senha precisa ter pelo menos 6 caracteres.'],
    [{ confirmacao: '' }, 'Confirme sua senha.'],
    [{ confirmacao: 'senha124' }, 'As senhas não conferem.'],
  ])('%o → %s', (alteracao, mensagem) => {
    expect(validarCadastro({ ...CADASTRO, ...alteracao })).toBe(mensagem);
  });

  test('telefone fixo (10 dígitos) também vale', () => {
    expect(validarDadosEditaveis({ nome: 'Ana', telefone: '(21) 3456-7890' })).toBeNull();
  });
});

describe('CPF', () => {
  test.each(['529.982.247-25', '52998224725', '111.444.777-35'])('válido: %s', (cpf) => {
    expect(cpfValido(cpf)).toBe(true);
  });

  test.each(['', null, '123', '111.111.111-11', '000.000.000-00', '529.982.247-2a', '529.982.247-250'])(
    'inválido: %s',
    (cpf) => {
      expect(cpfValido(cpf)).toBe(false);
    }
  );

  test('formata e mascara', () => {
    expect(formatarCPF('52998224725')).toBe('529.982.247-25');
    expect(mascararDocumento('529.982.247-25')).toBe('•••.•••.•••-25');
    expect(mascararDocumento('AB')).toBe('AB');
  });

  test('editar perfil só envia nome e telefone (nunca CPF ou e-mail)', () => {
    const formulario = { nome: 'Ana', telefone: '21987654321', cpf: '111.444.777-35', email: 'x@y.com' };

    expect(montarAlteracoes(formulario)).toEqual({ nome: 'Ana', telefone: '21987654321' });
  });
});

describe('índice de convites (nome + e-mail)', () => {
  test('ignora maiúsculas, acentos e espaços sobrando', () => {
    expect(chaveDiretorio('  Ana   Souza ', ' ANA@Teste.com ')).toBe(
      chaveDiretorio('ana souza', 'ana@teste.com')
    );
  });

  test('sem nome, sem e-mail ou com "/" não monta chave', () => {
    expect(chaveDiretorio('', 'ana@teste.com')).toBeNull();
    expect(chaveDiretorio('Ana', '')).toBeNull();
    expect(chaveDiretorio('Ana/Souza', 'ana@teste.com')).toBeNull();
  });

  test('mensagens de erro do convite', () => {
    expect(mensagemDeErro(new Error('USUARIO_NAO_ENCONTRADO'), 'padrão')).toMatch(/não encontrado/);
    expect(mensagemDeErro(new Error('QUALQUER'), 'padrão')).toBe('padrão');
    expect(mensagemDeErro(undefined, 'padrão')).toBe('padrão');
  });
});

describe('endereço', () => {
  const COMPLETO = {
    pais: 'Brasil',
    estado: 'RJ',
    cidade: 'Rio de Janeiro',
    bairro: 'Copacabana',
    rua: 'Rua Barata Ribeiro',
    numero: '100',
    cep: '22040002',
  };

  test('completo é aceito, com o CEP formatado', () => {
    expect(validarEndereco(COMPLETO)).toBeNull();
    expect(limparEndereco(COMPLETO).cep).toBe('22040-002');
    expect(formatarEndereco(COMPLETO)).toBe(
      'Rua Barata Ribeiro, 100 - Copacabana, Rio de Janeiro - RJ, 22040-002, Brasil'
    );
  });

  test.each([
    ['rua', '', 'Preencha o campo Rua.'],
    ['numero', '  ', 'Preencha o campo Número.'],
    ['cep', '2204', 'Digite um CEP válido, com 8 números.'],
    ['bairro', 'x'.repeat(61), 'Bairro: use no máximo 60 caracteres.'],
  ])('%s = "%s" → %s', (campo, valor, mensagem) => {
    expect(validarEndereco({ ...COMPLETO, [campo]: valor })).toBe(mensagem);
  });

  test('fora do Brasil o código postal não precisa ter 8 números', () => {
    expect(validarEndereco({ ...COMPLETO, pais: 'Portugal', cep: '1000-001' })).toBeNull();
  });

  test('CEP enquanto digita', () => {
    expect(formatarCEP('2204')).toBe('2204');
    expect(formatarCEP('220400')).toBe('22040-0');
    expect(formatarCEP('22040-002123')).toBe('22040-002');
    expect(formatarCEP(undefined)).toBe('');
  });

  test('resultado do GPS vira campos do formulário', () => {
    expect(
      enderecoDoResultado({
        country: 'Brasil',
        region: 'RJ',
        subregion: 'Rio de Janeiro',
        district: 'Centro',
        street: 'Rua X',
        streetNumber: null,
        postalCode: '20040002',
      })
    ).toEqual({
      pais: 'Brasil',
      estado: 'RJ',
      cidade: 'Rio de Janeiro',
      bairro: 'Centro',
      rua: 'Rua X',
      numero: '',
      cep: '20040-002',
    });
    expect(enderecoDoResultado(null)).toBeNull();
  });

  test('localizar: tenta sem bairro e CEP antes de desistir', async () => {
    Location.geocodeAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ latitude: -22.9, longitude: -43.1 }]);

    await expect(localizarEndereco(COMPLETO)).resolves.toEqual({ latitude: -22.9, longitude: -43.1 });
    expect(Location.geocodeAsync).toHaveBeenLastCalledWith(
      'Rua Barata Ribeiro, 100, Rio de Janeiro - RJ, Brasil'
    );
  });

  test('localizar: erro do serviço de mapas não quebra (devolve null)', async () => {
    Location.geocodeAsync.mockRejectedValue(new Error('falhou'));

    await expect(localizarEndereco(COMPLETO)).resolves.toBeNull();
  });
});

describe('localização da família', () => {
  const AGORA = Date.UTC(2026, 9, 13, 15, 0);

  test('coordenadas válidas e inválidas', () => {
    expect(coordenadaValida(-22.9, -43.2)).toBe(true);
    expect(coordenadaValida(90, 180)).toBe(true);
    expect(coordenadaValida(91, 0)).toBe(false);
    expect(coordenadaValida(0, -181)).toBe(false);
    expect(coordenadaValida(NaN, 0)).toBe(false);
    expect(coordenadaValida('1', 0)).toBe(false);
    expect(coordenadaValida(null, undefined)).toBe(false);
  });

  test('distância entre dois pontos (~1,11 km por 0,01° de latitude)', () => {
    const metros = distanciaEmMetros({ latitude: 0, longitude: 0 }, { latitude: 0.01, longitude: 0 });

    expect(metros).toBeGreaterThan(1100);
    expect(metros).toBeLessThan(1120);
  });

  test('quando enviar a posição', () => {
    const aqui = { latitude: -22.9, longitude: -43.2 };
    const ultimo = { ...aqui, em: AGORA };

    expect(deveEnviarLocalizacao(null, aqui, AGORA)).toBe(true);
    // Menos de 15 s: nunca, mesmo andando.
    expect(deveEnviarLocalizacao(ultimo, { latitude: -22.8, longitude: -43.2 }, AGORA + 10000)).toBe(false);
    // Parado: só depois de 5 min.
    expect(deveEnviarLocalizacao(ultimo, aqui, AGORA + 4 * 60000)).toBe(false);
    expect(deveEnviarLocalizacao(ultimo, aqui, AGORA + 5 * 60000)).toBe(true);
    // Andou 50 m+: envia.
    expect(deveEnviarLocalizacao(ultimo, { latitude: -22.8995, longitude: -43.2 }, AGORA + 20000)).toBe(true);
  });

  test('texto de "atualizado há"', () => {
    expect(descreverAtualizacao(null, AGORA)).toBe('Localização disponível');
    expect(descreverAtualizacao(AGORA - 30000, AGORA)).toBe('Atualizado agora');
    expect(descreverAtualizacao(AGORA + 60000, AGORA)).toBe('Atualizado agora');
    expect(descreverAtualizacao(AGORA - 5 * 60000, AGORA)).toBe('Atualizado há 5 min');
    expect(descreverAtualizacao(AGORA - 3 * 3600000, AGORA)).toBe('Atualizado há 3 h');
    expect(descreverAtualizacao(AGORA - 3 * 86400000, AGORA)).toMatch(/^Atualizado em \d{2}\/\d{2}\/\d{4}$/);
  });

  test('marcadores: um por pessoa ativa; quem não tem posição vai para a lista separada', () => {
    const { marcadores, semLocalizacao } = montarMarcadores({
      membros: [
        { uid: 'ana', nome: 'Ana', status: 'ativo' },
        { uid: 'bruno', nome: 'Bruno', status: 'ativo' },
        { uid: 'carla', nome: '', status: 'ativo' },
        { uid: 'davi', nome: 'Davi', status: 'removido' },
        { uid: 'bruno', nome: 'Bruno (duplicado)', status: 'ativo' },
      ],
      localizacoes: [
        { id: 'bruno', uid: 'bruno', latitude: -22.9, longitude: -43.2, atualizadoEm: AGORA - 60000, rua: 'Rua B' },
        { id: 'carla', uid: 'carla', nome: 'Carla', latitude: 200, longitude: 0, atualizadoEm: AGORA },
        { id: 'davi', uid: 'davi', latitude: 1, longitude: 1, atualizadoEm: AGORA },
        // Documento com uid diferente do id: ignorado.
        { id: 'ana', uid: 'intruso', latitude: 1, longitude: 1, atualizadoEm: AGORA },
      ],
      meuUid: 'ana',
      meuNome: 'Ana',
      minhaPosicao: { latitude: -22.95, longitude: -43.18, atualizadoEm: AGORA },
      agora: AGORA,
    });

    expect(marcadores.map((marcador) => [marcador.uid, marcador.voce, marcador.recente])).toEqual([
      ['ana', true, true],
      ['bruno', false, true],
    ]);
    expect(marcadores[1]).toMatchObject({ nome: 'Bruno', rua: 'Rua B', detalhe: 'Atualizado há 1 min' });
    expect(semLocalizacao).toEqual([{ uid: 'carla', nome: 'Carla', voce: false, motivo: 'invalida' }]);
  });

  test('marcadores: posição antiga aparece como "Última localização"', () => {
    const { marcadores } = montarMarcadores({
      membros: [{ uid: 'bruno', nome: 'Bruno', status: 'ativo' }],
      localizacoes: [{ id: 'bruno', latitude: 1, longitude: 1, atualizadoEm: AGORA - 11 * 60000 }],
      meuUid: 'ana',
      meuNome: 'Ana',
      minhaPosicao: null,
      agora: AGORA,
    });

    expect(marcadores).toEqual([expect.objectContaining({ uid: 'bruno', situacao: 'Última localização' })]);
  });
});

describe('histórico', () => {
  test('períodos: hoje, ontem e últimos 7 dias', () => {
    const agora = new Date(2026, 9, 13, 15, 30);

    expect(calcularPeriodo('hoje', agora)).toEqual({
      inicio: new Date(2026, 9, 13),
      fim: new Date(2026, 9, 14),
    });
    expect(calcularPeriodo('ontem', agora)).toEqual({
      inicio: new Date(2026, 9, 12),
      fim: new Date(2026, 9, 13),
    });
    expect(calcularPeriodo('7dias', agora)).toEqual({
      inicio: new Date(2026, 9, 7),
      fim: new Date(2026, 9, 14),
    });
  });

  test('virada de mês e de ano', () => {
    expect(calcularPeriodo('ontem', new Date(2027, 0, 1, 8))).toEqual({
      inicio: new Date(2026, 11, 31),
      fim: new Date(2027, 0, 1),
    });
  });

  test('quando registrar um ponto', () => {
    const agora = Date.now();
    const ultimo = { latitude: 0, longitude: 0, em: agora };

    expect(deveRegistrarHistorico(null, ultimo, agora)).toBe(true);
    expect(deveRegistrarHistorico(ultimo, { latitude: 0, longitude: 0 }, agora + 60000)).toBe(false);
    expect(deveRegistrarHistorico(ultimo, { latitude: 0.001, longitude: 0 }, agora + 60000)).toBe(true);
    expect(deveRegistrarHistorico(ultimo, { latitude: 0, longitude: 0 }, agora + 30 * 60000)).toBe(true);
  });

  test('horário com e sem data', () => {
    const momento = new Date(2026, 8, 7, 9, 5).getTime();

    expect(formatarHorario(momento, false)).toBe('09:05');
    expect(formatarHorario(momento, true)).toBe('07/09 09:05');
  });
});

describe('foto de perfil', () => {
  test('recorte quadrado central', () => {
    expect(calcularRecorteQuadrado(400, 300)).toEqual({ originX: 50, originY: 0, width: 300, height: 300 });
    expect(calcularRecorteQuadrado(301, 500)).toEqual({ originX: 0, originY: 99, width: 301, height: 301 });
  });
});

describe('"Estou bem"', () => {
  const { descreverEstouBem, VALIDADE_ESTOU_BEM } = require('../src/dados/estouBem');
  const AGORA = Date.UTC(2026, 9, 13, 15, 0);

  test('texto do card: agora, minutos e horas', () => {
    expect(descreverEstouBem(AGORA - 20 * 1000, AGORA)).toBe('Está bem · agora');
    expect(descreverEstouBem(AGORA - 5 * 60000, AGORA)).toBe('Está bem · há 5 min');
    expect(descreverEstouBem(AGORA - 3 * 3600000, AGORA)).toBe('Está bem · há 3 h');
    // Relógio do aparelho um pouco adiantado não vira "há -1 min".
    expect(descreverEstouBem(AGORA + 30000, AGORA)).toBe('Está bem · agora');
  });

  test('aceita o Timestamp do Firestore', () => {
    expect(descreverEstouBem({ toMillis: () => AGORA - 2 * 60000 }, AGORA)).toBe('Está bem · há 2 min');
  });

  test('sem aviso ou com mais de 24 h: nada aparece', () => {
    expect(descreverEstouBem(undefined, AGORA)).toBeNull();
    expect(descreverEstouBem(null, AGORA)).toBeNull();
    expect(descreverEstouBem(AGORA - VALIDADE_ESTOU_BEM - 1, AGORA)).toBeNull();
  });
});
