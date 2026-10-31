/*
 * Testes dos endereços (enderecos.js): validação, formatação, ViaCEP,
 * geocodificação e cache da rua.
 */

jest.mock('expo-location', () => ({
  reverseGeocodeAsync: jest.fn(),
  geocodeAsync: jest.fn(),
}));

const Location = require('expo-location');
const enderecos = require('./enderecos');

const ENDERECO = {
  pais: 'Brasil',
  estado: 'SP',
  cidade: 'São Paulo',
  bairro: 'Centro',
  rua: 'Rua A',
  numero: '10',
  cep: '01001000',
};

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('nomeDaRua', () => {
  it('usa a rua, depois o bairro, depois a cidade', () => {
    expect(enderecos.nomeDaRua({ street: ' Rua A ', district: 'Centro' })).toBe('Rua A');
    expect(enderecos.nomeDaRua({ district: 'Centro', city: 'SP' })).toBe('Centro');
    expect(enderecos.nomeDaRua({ city: 'SP' })).toBe('SP');
  });

  it('corta em 120 caracteres e devolve null sem nada', () => {
    expect(enderecos.nomeDaRua({ street: 'x'.repeat(200) })).toHaveLength(120);
    expect(enderecos.nomeDaRua({})).toBeNull();
    expect(enderecos.nomeDaRua(null)).toBeNull();
  });
});

describe('ehBrasil', () => {
  it.each(['Brasil', ' brazil ', 'BR'])('reconhece %p', (pais) => {
    expect(enderecos.ehBrasil(pais)).toBe(true);
  });

  it.each(['Portugal', '', undefined])('não confunde %p', (pais) => {
    expect(enderecos.ehBrasil(pais)).toBe(false);
  });
});

describe('formatarCEP', () => {
  it('coloca o hífen e ignora o que não é número', () => {
    expect(enderecos.formatarCEP('01001000')).toBe('01001-000');
    expect(enderecos.formatarCEP('01.001-000')).toBe('01001-000');
    expect(enderecos.formatarCEP('010010009999')).toBe('01001-000');
  });

  it('formata enquanto digita', () => {
    expect(enderecos.formatarCEP('0100')).toBe('0100');
    expect(enderecos.formatarCEP('010010')).toBe('01001-0');
    expect(enderecos.formatarCEP(undefined)).toBe('');
  });
});

describe('limparEndereco', () => {
  it('mantém só os campos conhecidos, sem espaços', () => {
    expect(enderecos.limparEndereco({ ...ENDERECO, rua: '  Rua A  ', extra: 'x' })).toEqual({
      ...ENDERECO,
      cep: '01001-000',
    });
  });

  it('não formata CEP de outros países', () => {
    expect(enderecos.limparEndereco({ ...ENDERECO, pais: 'Portugal', cep: '1000-001' }).cep).toBe('1000-001');
  });

  it('preenche com vazio o que falta', () => {
    expect(enderecos.limparEndereco(null)).toEqual({
      pais: '',
      estado: '',
      cidade: '',
      bairro: '',
      rua: '',
      numero: '',
      cep: '',
    });
  });
});

describe('validarEndereco', () => {
  it('aceita um endereço completo', () => {
    expect(enderecos.validarEndereco(ENDERECO)).toBeNull();
  });

  it('pede cada campo vazio pelo nome', () => {
    expect(enderecos.validarEndereco({ ...ENDERECO, cidade: ' ' })).toBe('Preencha o campo Cidade.');
    expect(enderecos.validarEndereco({ ...ENDERECO, numero: '' })).toBe('Preencha o campo Número.');
  });

  it('recusa campos longos demais', () => {
    expect(enderecos.validarEndereco({ ...ENDERECO, numero: '1'.repeat(16) })).toBe(
      'Número: use no máximo 15 caracteres.'
    );
  });

  it('no Brasil, exige CEP com 8 números', () => {
    expect(enderecos.validarEndereco({ ...ENDERECO, cep: '0100' })).toBe('Digite um CEP válido, com 8 números.');
    expect(enderecos.validarEndereco({ ...ENDERECO, pais: 'Portugal', cep: '1000' })).toBeNull();
  });
});

describe('formatarEndereco', () => {
  it('monta o endereço em uma linha', () => {
    expect(enderecos.formatarEndereco(ENDERECO)).toBe('Rua A, 10 - Centro, São Paulo - SP, 01001-000, Brasil');
  });
});

describe('buscarCEP', () => {
  const resposta = (status, dados) => ({ status, ok: status >= 200 && status < 300, json: async () => dados });

  it('recusa CEP sem 8 números sem consultar', async () => {
    const buscar = jest.fn();

    expect(await enderecos.buscarCEP('123', buscar)).toEqual({ erro: 'cep-invalido' });
    expect(buscar).not.toHaveBeenCalled();
  });

  it('devolve o endereço da ViaCEP', async () => {
    const buscar = jest.fn(async () =>
      resposta(200, { uf: 'SP', localidade: 'São Paulo', bairro: 'Sé', logradouro: 'Praça da Sé ' })
    );

    expect(await enderecos.buscarCEP('01001-000', buscar)).toEqual({
      endereco: { pais: 'Brasil', estado: 'SP', cidade: 'São Paulo', bairro: 'Sé', rua: 'Praça da Sé', cep: '01001-000' },
    });
    expect(buscar).toHaveBeenCalledWith('https://viacep.com.br/ws/01001000/json/', expect.anything());
  });

  it('CEP geral de cidade vem sem rua e bairro', async () => {
    const buscar = async () => resposta(200, { uf: 'MG', localidade: 'Cidade' });

    expect((await enderecos.buscarCEP('35000000', buscar)).endereco).toMatchObject({ rua: '', bairro: '' });
  });

  it('identifica CEP inexistente, inválido e serviço fora', async () => {
    expect(await enderecos.buscarCEP('99999999', async () => resposta(200, { erro: 'true' }))).toEqual({
      erro: 'nao-encontrado',
    });
    expect(await enderecos.buscarCEP('99999999', async () => resposta(400))).toEqual({ erro: 'cep-invalido' });
    expect(await enderecos.buscarCEP('99999999', async () => resposta(503))).toEqual({ erro: 'sem-conexao' });
  });

  it('sem internet', async () => {
    const buscar = jest.fn(() => Promise.reject(new TypeError('Network request failed')));

    expect(await enderecos.buscarCEP('01001000', buscar)).toEqual({ erro: 'sem-conexao' });
  });

  it('desiste depois de 8 s', async () => {
    jest.useFakeTimers();
    const buscar = jest.fn(
      (_url, { signal }) =>
        new Promise((_, rejeitar) => signal.addEventListener('abort', () => rejeitar(new Error('AbortError'))))
    );

    const resultado = enderecos.buscarCEP('01001000', buscar);
    jest.advanceTimersByTime(8000);

    expect(await resultado).toEqual({ erro: 'sem-conexao' });
  });
});

describe('enderecoDoResultado', () => {
  it('converte o resultado do GPS para o formulário', () => {
    expect(
      enderecos.enderecoDoResultado({
        country: 'Brasil',
        region: 'SP',
        subregion: 'São Paulo',
        district: 'Centro',
        street: 'Rua A',
        streetNumber: '10',
        postalCode: '01001000',
      })
    ).toEqual({ ...ENDERECO, cep: '01001-000' });
  });

  it('usa os valores padrão quando faltam campos', () => {
    expect(enderecos.enderecoDoResultado({})).toEqual({
      pais: 'Brasil',
      estado: '',
      cidade: '',
      bairro: '',
      rua: '',
      numero: '',
      cep: '',
    });
    expect(enderecos.enderecoDoResultado({ country: 'Portugal', postalCode: '1000-001' }).cep).toBe('1000-001');
    expect(enderecos.enderecoDoResultado(null)).toBeNull();
  });
});

describe('deveBuscarRua', () => {
  const ultima = { latitude: 0, longitude: 0, em: 0, rua: 'Rua A' };
  const perto = { latitude: 0.0005, longitude: 0 }; // ~55 m
  const longe = { latitude: 0.001, longitude: 0 }; // ~111 m

  it('busca na primeira vez', () => {
    expect(enderecos.deveBuscarRua(null, perto, 0)).toBe(true);
  });

  it('no máximo uma vez por minuto', () => {
    expect(enderecos.deveBuscarRua(ultima, longe, enderecos.INTERVALO_MINIMO_RUA - 1)).toBe(false);
  });

  it('só quando andou o suficiente', () => {
    expect(enderecos.deveBuscarRua(ultima, perto, enderecos.INTERVALO_MINIMO_RUA)).toBe(false);
    expect(enderecos.deveBuscarRua(ultima, longe, enderecos.INTERVALO_MINIMO_RUA)).toBe(true);
  });

  it('tenta de novo se a última busca falhou', () => {
    expect(enderecos.deveBuscarRua({ ...ultima, rua: null }, perto, enderecos.INTERVALO_MINIMO_RUA)).toBe(true);
  });
});

describe('buscarEndereco', () => {
  // O limite de espera deixa um timer rodando mesmo depois da resposta.
  beforeEach(() => {
    jest.useFakeTimers();
  });

  it('devolve o primeiro resultado', async () => {
    Location.reverseGeocodeAsync.mockResolvedValue([{ street: 'Rua A' }, { street: 'Rua B' }]);

    expect(await enderecos.buscarEndereco({ latitude: 1, longitude: 2 })).toEqual({ street: 'Rua A' });
    expect(Location.reverseGeocodeAsync).toHaveBeenCalledWith({ latitude: 1, longitude: 2 });
  });

  it('null quando falha ou não acha', async () => {
    Location.reverseGeocodeAsync.mockRejectedValueOnce(new Error('sem serviço'));
    expect(await enderecos.buscarEndereco({ latitude: 1, longitude: 2 })).toBeNull();

    Location.reverseGeocodeAsync.mockResolvedValueOnce([]);
    expect(await enderecos.buscarEndereco({ latitude: 1, longitude: 2 })).toBeNull();
  });

  it('não espera mais de 5 s', async () => {
    jest.useFakeTimers();
    Location.reverseGeocodeAsync.mockReturnValue(new Promise(() => {}));

    const resultado = enderecos.buscarEndereco({ latitude: 1, longitude: 2 });
    jest.advanceTimersByTime(5000);

    expect(await resultado).toBeNull();
  });
});

describe('buscarCoordenadas', () => {
  // O limite de espera deixa um timer rodando mesmo depois da resposta.
  beforeEach(() => {
    jest.useFakeTimers();
  });

  it('devolve latitude e longitude do primeiro resultado', async () => {
    Location.geocodeAsync.mockResolvedValue([{ latitude: 1, longitude: 2, accuracy: 5 }]);

    expect(await enderecos.buscarCoordenadas('  Rua A  ')).toEqual({ latitude: 1, longitude: 2 });
    expect(Location.geocodeAsync).toHaveBeenCalledWith('Rua A');
  });

  it('null para texto vazio, sem resultado ou erro', async () => {
    expect(await enderecos.buscarCoordenadas('  ')).toBeNull();

    Location.geocodeAsync.mockResolvedValueOnce([]);
    expect(await enderecos.buscarCoordenadas('x')).toBeNull();

    Location.geocodeAsync.mockRejectedValueOnce(new Error('falhou'));
    expect(await enderecos.buscarCoordenadas('x')).toBeNull();
  });

  it('não espera mais de 10 s', async () => {
    jest.useFakeTimers();
    Location.geocodeAsync.mockReturnValue(new Promise(() => {}));

    const resultado = enderecos.buscarCoordenadas('x');
    jest.advanceTimersByTime(10000);

    expect(await resultado).toBeNull();
  });
});

describe('localizarEndereco', () => {
  // O limite de espera deixa um timer rodando mesmo depois da resposta.
  beforeEach(() => {
    jest.useFakeTimers();
  });

  it('tenta o endereço completo primeiro', async () => {
    Location.geocodeAsync.mockResolvedValue([{ latitude: 1, longitude: 2 }]);

    expect(await enderecos.localizarEndereco(ENDERECO)).toEqual({ latitude: 1, longitude: 2 });
    expect(Location.geocodeAsync).toHaveBeenCalledTimes(1);
    expect(Location.geocodeAsync).toHaveBeenCalledWith('Rua A, 10 - Centro, São Paulo - SP, 01001-000, Brasil');
  });

  it('tenta sem bairro e CEP quando o completo não acha', async () => {
    Location.geocodeAsync.mockResolvedValueOnce([]).mockResolvedValueOnce([{ latitude: 3, longitude: 4 }]);

    expect(await enderecos.localizarEndereco(ENDERECO)).toEqual({ latitude: 3, longitude: 4 });
    expect(Location.geocodeAsync).toHaveBeenLastCalledWith('Rua A, 10, São Paulo - SP, Brasil');
  });

  it('null quando nenhuma tentativa acha', async () => {
    Location.geocodeAsync.mockResolvedValue([]);

    expect(await enderecos.localizarEndereco(ENDERECO)).toBeNull();
  });
});

describe('criarCacheRua', () => {
  const origem = { latitude: 0, longitude: 0 };
  const longe = { latitude: 0.01, longitude: 0 };

  it('reaproveita a rua enquanto não anda nem passa o tempo', async () => {
    const buscar = jest.fn(async () => ({ street: 'Rua A' }));
    const ruaAtual = enderecos.criarCacheRua(buscar);

    expect(await ruaAtual(origem, 0)).toBe('Rua A');
    expect(await ruaAtual(longe, 1000)).toBe('Rua A');
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it('busca de novo depois de andar e do intervalo', async () => {
    const buscar = jest.fn().mockResolvedValueOnce({ street: 'Rua A' }).mockResolvedValueOnce({ street: 'Rua B' });
    const ruaAtual = enderecos.criarCacheRua(buscar);

    await ruaAtual(origem, 0);

    expect(await ruaAtual(longe, enderecos.INTERVALO_MINIMO_RUA)).toBe('Rua B');
  });

  it('mantém a última rua conhecida quando a busca falha', async () => {
    const buscar = jest.fn().mockResolvedValueOnce({ street: 'Rua A' }).mockResolvedValueOnce(null);
    const ruaAtual = enderecos.criarCacheRua(buscar);

    await ruaAtual(origem, 0);

    expect(await ruaAtual(longe, enderecos.INTERVALO_MINIMO_RUA)).toBe('Rua A');
  });
});
