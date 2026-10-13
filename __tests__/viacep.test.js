import { buscarCEP } from '../src/dados/enderecos';

function resposta(status, corpo) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(corpo),
  });
}

describe('CEP pela ViaCEP', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
  });

  it('preenche estado, cidade, bairro e rua', async () => {
    const buscar = jest.fn(() =>
      resposta(200, {
        cep: '01001-000',
        logradouro: 'Praça da Sé',
        bairro: 'Sé',
        localidade: 'São Paulo',
        uf: 'SP',
      })
    );

    await expect(buscarCEP('01001-000', buscar)).resolves.toEqual({
      endereco: {
        pais: 'Brasil',
        estado: 'SP',
        cidade: 'São Paulo',
        bairro: 'Sé',
        rua: 'Praça da Sé',
        cep: '01001-000',
      },
    });
    expect(buscar.mock.calls[0][0]).toBe('https://viacep.com.br/ws/01001000/json/');
  });

  it('CEP geral de cidade: rua e bairro vazios', async () => {
    const buscar = () =>
      resposta(200, { logradouro: '', bairro: '', localidade: 'Arraial do Cabo', uf: 'RJ' });

    const { endereco } = await buscarCEP('28930000', buscar);

    expect(endereco).toMatchObject({ cidade: 'Arraial do Cabo', rua: '', bairro: '' });
  });

  it('não consulta CEP sem 8 números', async () => {
    const buscar = jest.fn();

    await expect(buscarCEP('1234', buscar)).resolves.toEqual({ erro: 'cep-invalido' });
    await expect(buscarCEP('', buscar)).resolves.toEqual({ erro: 'cep-invalido' });
    expect(buscar).not.toHaveBeenCalled();
  });

  it('CEP inexistente', async () => {
    await expect(buscarCEP('99999999', () => resposta(200, { erro: true }))).resolves.toEqual({
      erro: 'nao-encontrado',
    });
    await expect(buscarCEP('99999999', () => resposta(200, { erro: 'true' }))).resolves.toEqual({
      erro: 'nao-encontrado',
    });
  });

  it('sem internet ou serviço fora do ar', async () => {
    const semRede = () => Promise.reject(new TypeError('Network request failed'));

    await expect(buscarCEP('01001000', semRede)).resolves.toEqual({ erro: 'sem-conexao' });
    await expect(buscarCEP('01001000', () => resposta(503, null))).resolves.toEqual({
      erro: 'sem-conexao',
    });
  });

  it('desiste quando a ViaCEP demora demais', async () => {
    jest.useFakeTimers();

    try {
      const pendurado = (url, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('Aborted')));
        });

      const resultado = buscarCEP('01001000', pendurado);

      jest.advanceTimersByTime(8000);

      await expect(resultado).resolves.toEqual({ erro: 'sem-conexao' });
    } finally {
      jest.useRealTimers();
    }
  });
});
