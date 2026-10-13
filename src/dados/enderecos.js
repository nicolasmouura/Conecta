import * as Location from 'expo-location';

import { distanciaEmMetros } from './buscarFamiliares';

/*
 * Rua atual (geocodificação reversa do próprio aparelho, via
 * expo-location). Quem consulta é o dono da posição, uma vez por
 * deslocamento relevante; a família recebe só o nome da rua em
 * familiares/{uid}.rua.
 */
export const DISTANCIA_NOVA_RUA = 100; // metros
export const INTERVALO_MINIMO_RUA = 60 * 1000; // no máximo 1 consulta por minuto

// Só o nome da rua (sem número). Sem rua: bairro ou cidade.
export function nomeDaRua(endereco) {
  const nome = endereco?.street || endereco?.district || endereco?.city || null;

  return nome ? nome.trim().slice(0, 120) : null;
}

/*
 * Endereço de um lugar (Meus lugares) em partes. Todos os campos são
 * obrigatórios; no Brasil o CEP precisa ter 8 números.
 */
export const CAMPOS_ENDERECO = [
  { chave: 'pais', label: 'País', limite: 40 },
  { chave: 'estado', label: 'Estado', limite: 40 },
  { chave: 'cidade', label: 'Cidade', limite: 60 },
  { chave: 'bairro', label: 'Bairro', limite: 60 },
  { chave: 'rua', label: 'Rua', limite: 100 },
  { chave: 'numero', label: 'Número', limite: 15 },
  { chave: 'cep', label: 'CEP', limite: 10 },
];

export const ENDERECO_VAZIO = {
  pais: 'Brasil',
  estado: '',
  cidade: '',
  bairro: '',
  rua: '',
  numero: '',
  cep: '',
};

export function ehBrasil(pais) {
  return ['brasil', 'brazil', 'br'].includes((pais || '').trim().toLowerCase());
}

// 01234567 → 01234-567 (enquanto digita, também).
export function formatarCEP(texto) {
  const digitos = (texto || '').replace(/\D/g, '').slice(0, 8);

  return digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
}

// Só os campos conhecidos, sem espaços sobrando e com o CEP formatado.
export function limparEndereco(endereco) {
  const limpo = Object.fromEntries(
    CAMPOS_ENDERECO.map(({ chave }) => [chave, (endereco?.[chave] || '').trim()])
  );

  if (ehBrasil(limpo.pais)) {
    limpo.cep = formatarCEP(limpo.cep);
  }

  return limpo;
}

// Retorna a mensagem de erro, ou null se o endereço estiver completo.
export function validarEndereco(endereco) {
  const limpo = limparEndereco(endereco);

  for (const { chave, label, limite } of CAMPOS_ENDERECO) {
    if (!limpo[chave]) return `Preencha o campo ${label}.`;
    if (limpo[chave].length > limite) return `${label}: use no máximo ${limite} caracteres.`;
  }

  if (ehBrasil(limpo.pais) && limpo.cep.replace(/\D/g, '').length !== 8) {
    return 'Digite um CEP válido, com 8 números.';
  }

  return null;
}

// "Rua X, 123 - Bairro, Cidade - UF, 01234-567, Brasil"
export function formatarEndereco(endereco) {
  const e = limparEndereco(endereco);

  return `${e.rua}, ${e.numero} - ${e.bairro}, ${e.cidade} - ${e.estado}, ${e.cep}, ${e.pais}`;
}

/*
 * CEP → endereço pela ViaCEP (viacep.com.br: gratuita, sem chave).
 * Retorna { endereco } com os campos que o CEP define (o número fica
 * de fora) ou { erro }:
 *   'cep-invalido'     → não tem 8 números
 *   'nao-encontrado'   → a ViaCEP não conhece esse CEP
 *   'sem-conexao'      → sem internet, demorou demais ou serviço fora do ar
 * CEP geral de cidade pequena vem sem rua e bairro: esses ficam vazios.
 */
const TEMPO_MAXIMO_CEP = 8000;

export async function buscarCEP(cep, buscar = fetch) {
  const digitos = (cep || '').replace(/\D/g, '');

  if (digitos.length !== 8) return { erro: 'cep-invalido' };

  const controle = new AbortController();
  const tempo = setTimeout(() => controle.abort(), TEMPO_MAXIMO_CEP);

  try {
    const resposta = await buscar(`https://viacep.com.br/ws/${digitos}/json/`, {
      signal: controle.signal,
    });

    // A ViaCEP responde 400 para CEP mal formatado.
    if (resposta.status === 400) return { erro: 'cep-invalido' };
    if (!resposta.ok) return { erro: 'sem-conexao' };

    const dados = await resposta.json();

    // CEP com formato certo, mas inexistente: { "erro": true } (ou "true").
    if (!dados || dados.erro) return { erro: 'nao-encontrado' };

    return {
      endereco: {
        pais: 'Brasil',
        estado: (dados.uf || '').trim(),
        cidade: (dados.localidade || '').trim(),
        bairro: (dados.bairro || '').trim(),
        rua: (dados.logradouro || '').trim(),
        cep: formatarCEP(digitos),
      },
    };
  } catch (erro) {
    console.log('CEP não consultado:', erro.name || erro.message);
    return { erro: 'sem-conexao' };
  } finally {
    clearTimeout(tempo);
  }
}

// Resultado do GPS (reverseGeocodeAsync) → campos do formulário.
export function enderecoDoResultado(resultado) {
  if (!resultado) return null;

  const pais = resultado.country || ENDERECO_VAZIO.pais;

  return {
    pais,
    estado: resultado.region || '',
    cidade: resultado.city || resultado.subregion || '',
    bairro: resultado.district || '',
    rua: resultado.street || '',
    numero: resultado.streetNumber || '',
    cep: ehBrasil(pais) ? formatarCEP(resultado.postalCode) : resultado.postalCode || '',
  };
}

export function deveBuscarRua(ultima, posicao, agora) {
  if (!ultima) return true;
  if (agora - ultima.em < INTERVALO_MINIMO_RUA) return false;
  if (!ultima.rua) return true; // última tentativa falhou: tenta de novo

  return distanciaEmMetros(ultima, posicao) >= DISTANCIA_NOVA_RUA;
}

// Uma consulta lenta nunca pode segurar o envio da localização.
const TEMPO_MAXIMO_CONSULTA = 5000;

export async function buscarEndereco(posicao) {
  try {
    const resultados = await Promise.race([
      Location.reverseGeocodeAsync({
        latitude: posicao.latitude,
        longitude: posicao.longitude,
      }),
      new Promise((resolve) => setTimeout(() => resolve(null), TEMPO_MAXIMO_CONSULTA)),
    ]);

    return resultados?.[0] || null;
  } catch (erro) {
    console.log('Endereço indisponível:', erro.code || erro.message);
    return null;
  }
}

// Endereço digitado → coordenadas (cadastro de lugares). null se não achar.
const TEMPO_MAXIMO_BUSCA = 10000;

export async function buscarCoordenadas(texto) {
  if (!texto || !texto.trim()) return null;

  try {
    const resultados = await Promise.race([
      Location.geocodeAsync(texto.trim()),
      new Promise((resolve) => setTimeout(() => resolve(null), TEMPO_MAXIMO_BUSCA)),
    ]);
    const primeiro = resultados?.[0];

    return primeiro ? { latitude: primeiro.latitude, longitude: primeiro.longitude } : null;
  } catch (erro) {
    console.log('Endereço não localizado:', erro.code || erro.message);
    return null;
  }
}

/*
 * Posição exata do endereço digitado. Tenta o endereço completo e,
 * se o serviço de mapas do aparelho não achar, sem bairro e CEP (que
 * às vezes atrapalham a busca). Nunca cai para só o CEP ou a cidade,
 * que dariam uma posição aproximada.
 */
export async function localizarEndereco(endereco) {
  const e = limparEndereco(endereco);

  const tentativas = [
    formatarEndereco(e),
    `${e.rua}, ${e.numero}, ${e.cidade} - ${e.estado}, ${e.pais}`,
  ];

  for (const texto of tentativas) {
    const encontrado = await buscarCoordenadas(texto);

    if (encontrado) return encontrado;
  }

  return null;
}

/*
 * Cache da rua para o watcher: reaproveita o último resultado
 * enquanto a posição não muda de forma relevante. Se a consulta
 * falhar, mantém a última rua conhecida.
 */
export function criarCacheRua(buscar = buscarEndereco) {
  let ultima = null; // { latitude, longitude, em, rua }

  return async function ruaAtual(posicao, agora) {
    if (!deveBuscarRua(ultima, posicao, agora)) {
      return ultima.rua;
    }

    const rua = nomeDaRua(await buscar(posicao));

    ultima = {
      latitude: posicao.latitude,
      longitude: posicao.longitude,
      em: agora,
      rua: rua ?? ultima?.rua ?? null,
    };

    return ultima.rua;
  };
}
