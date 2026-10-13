import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';

import {
  buscarCEP,
  buscarEndereco,
  ehBrasil,
  ENDERECO_VAZIO,
  enderecoDoResultado,
  formatarCEP,
  limparEndereco,
  localizarEndereco,
  validarEndereco,
} from '../dados/enderecos';
import { cores, fontes, raio } from '../theme/theme';

const ERROS_CEP = {
  'cep-invalido': 'CEP inválido. Confira os 8 números.',
  'nao-encontrado': 'CEP não encontrado. Confira o número ou preencha o endereço à mão.',
  'sem-conexao': 'Não foi possível buscar o CEP (sem internet?). Preencha o endereço à mão.',
};

const ZOOM_LUGAR = { latitudeDelta: 0.004, longitudeDelta: 0.004 };
const ZOOM_CIDADE = { latitudeDelta: 0.05, longitudeDelta: 0.05 };
const REGIAO_BRASIL = {
  latitude: -14.235,
  longitude: -51.9253,
  latitudeDelta: 30,
  longitudeDelta: 30,
};

/*
 * Os campos ainda são o endereço onde o alfinete foi posto? Completar
 * um campo que veio vazio (ex.: o número que o mapa não achou) não
 * conta como mudança.
 */
function mesmoEndereco(campos, localizadoPara) {
  if (!localizadoPara) return false;

  const atual = limparEndereco(campos);

  return Object.entries(localizadoPara).every(
    ([chave, valor]) => !valor || valor === atual[chave]
  );
}

function Campo({ label, style, ...props }) {
  return (
    <View style={[styles.campo, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor={cores.textoSecundario}
        {...props}
      />
    </View>
  );
}

/*
 * Cadastrar/editar um lugar (Casa). A posição vem do endereço
 * DIGITADO (País, Estado, Cidade, Bairro, Rua, Número e CEP):
 * "Localizar no mapa" busca as coordenadas e põe o alfinete lá, e só
 * então dá para salvar. O alfinete pode ser arrastado para ajustar, e
 * os campos passam a ser o endereço do novo ponto. Mudou o endereço →
 * precisa localizar de novo (completar um campo vazio não conta).
 *
 * enderecoInicial (opcional): abre com esses campos em vez dos do lugar
 * salvo (ex.: endereço do perfil). Se forem diferentes, pede para
 * localizar de novo antes de salvar.
 */
export default function EditarLugar({
  tipo,
  lugar,
  enderecoInicial,
  posicaoAtual,
  onFechar,
  onSalvar,
}) {
  const mapaRef = useRef(null);

  // Lugar salvo antes dos campos separados: posição não confiável.
  const salvoCompleto = Boolean(lugar?.enderecoDetalhado);
  const camposSalvos = salvoCompleto
    ? { ...ENDERECO_VAZIO, ...lugar.enderecoDetalhado }
    : ENDERECO_VAZIO;

  const [campos, setCampos] = useState(
    enderecoInicial ? { ...ENDERECO_VAZIO, ...enderecoInicial } : camposSalvos
  );
  const [pino, setPino] = useState(
    salvoCompleto ? { latitude: lugar.latitude, longitude: lugar.longitude } : null
  );
  const [localizadoPara, setLocalizadoPara] = useState(
    salvoCompleto ? limparEndereco(camposSalvos) : null
  );
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [buscandoCEP, setBuscandoCEP] = useState(false);

  // Último CEP pedido: resposta de um CEP antigo (digitação rápida) é ignorada.
  const cepPedido = useRef(null);

  const localizado = pino !== null && mesmoEndereco(campos, localizadoPara);
  const brasil = ehBrasil(campos.pais);

  const [regiaoInicial] = useState(() => {
    if (pino) return { ...pino, ...ZOOM_LUGAR };
    if (posicaoAtual) {
      return { latitude: posicaoAtual.latitude, longitude: posicaoAtual.longitude, ...ZOOM_CIDADE };
    }
    return REGIAO_BRASIL;
  });

  function alterar(chave, valor) {
    setCampos((atual) => ({
      ...atual,
      [chave]: chave === 'cep' && ehBrasil(atual.pais) ? formatarCEP(valor) : valor,
    }));
    setErro('');

    if (chave === 'cep' && brasil) {
      const cep = formatarCEP(valor);

      if (cep.length === 9 && cep !== formatarCEP(campos.cep)) {
        preencherPeloCEP(cep);
      } else if (cep.length < 9) {
        cepPedido.current = null;
        setBuscandoCEP(false);
      }
    }
  }

  // CEP completo → Estado, Cidade, Bairro e Rua pela ViaCEP. O número
  // continua com a pessoa; o que o CEP não traz não apaga o que já foi digitado.
  async function preencherPeloCEP(cep) {
    cepPedido.current = cep;
    setBuscandoCEP(true);

    const { endereco, erro: problema } = await buscarCEP(cep);

    if (cepPedido.current !== cep) return;

    cepPedido.current = null;
    setBuscandoCEP(false);

    if (problema) {
      setErro(ERROS_CEP[problema]);
      return;
    }

    // Mudou o país ou o CEP enquanto buscava: a resposta não vale mais.
    setCampos((atual) => {
      if (!ehBrasil(atual.pais) || formatarCEP(atual.cep) !== cep) return atual;

      const novos = { ...atual };

      for (const [chave, valor] of Object.entries(endereco)) {
        if (valor) novos[chave] = valor;
      }

      return novos;
    });

    if (!endereco.rua) {
      setErro('Esse CEP é da cidade toda: preencha bairro e rua.');
    }
  }

  function centralizar(coordenadas) {
    mapaRef.current?.animateToRegion({ ...coordenadas, ...ZOOM_LUGAR }, 600);
  }

  // Ajuste fino: só depois que o endereço já foi localizado. Os campos
  // viram o endereço do novo ponto; o que o mapa não achar (ex.: o
  // número) fica em branco para completar.
  async function moverPino(coordenadas) {
    if (!pino || ocupado) return;

    setPino(coordenadas);
    setOcupado(true);
    setErro('');

    const encontrado = enderecoDoResultado(await buscarEndereco(coordenadas));

    setOcupado(false);

    if (!encontrado) {
      setErro('Não foi possível buscar o endereço desse ponto. Confira os campos.');
      return;
    }

    setCampos(encontrado);
    setLocalizadoPara(limparEndereco(encontrado));

    if (validarEndereco(encontrado)) {
      setErro('Confira o endereço e complete os campos que faltam.');
    }
  }

  async function localizar() {
    const problema = validarEndereco(campos);

    if (problema) {
      setErro(problema);
      return;
    }

    const alvo = campos;

    setOcupado(true);
    setErro('');

    const encontrado = await localizarEndereco(alvo);

    setOcupado(false);

    if (!encontrado) {
      setErro('Não encontramos esse endereço. Confira rua, número, cidade e CEP.');
      return;
    }

    setPino(encontrado);
    setLocalizadoPara(limparEndereco(alvo));
    centralizar(encontrado);
  }

  // "Estou em casa agora": preenche os campos pelo GPS.
  async function usarMinhaLocalizacao() {
    if (!posicaoAtual) {
      setErro('Sua localização atual não está disponível.');
      return;
    }

    const coordenadas = {
      latitude: posicaoAtual.latitude,
      longitude: posicaoAtual.longitude,
    };

    setOcupado(true);
    setErro('');

    const preenchido = enderecoDoResultado(await buscarEndereco(coordenadas));

    setOcupado(false);

    // Mantém o que o GPS não souber (ex.: número da casa).
    const novos = { ...campos };

    for (const [chave, valor] of Object.entries(preenchido || {})) {
      if (valor) novos[chave] = valor;
    }

    setCampos(novos);
    setPino(coordenadas);
    setLocalizadoPara(limparEndereco(novos));
    centralizar(coordenadas);

    if (validarEndereco(novos)) {
      setErro('Confira o endereço e complete os campos que faltam.');
    }
  }

  async function salvar() {
    const problema = validarEndereco(campos);

    if (problema) {
      setErro(problema);
      return;
    }

    try {
      setOcupado(true);
      setErro('');
      await onSalvar({
        enderecoDetalhado: limparEndereco(campos),
        latitude: pino.latitude,
        longitude: pino.longitude,
      });
    } catch (e) {
      console.log('Lugar não salvo:', e.code || e.message);
      setErro('Não foi possível salvar. Tente novamente.');
      setOcupado(false);
    }
  }

  let dica = 'Preencha o endereço e toque em "Localizar no mapa".';
  if (localizado) {
    dica = `Confira se o alfinete está na ${tipo.nome.toLowerCase()}. Se precisar, arraste-o para ajustar.`;
  } else if (pino) {
    dica = 'Você mudou o endereço. Toque em "Localizar no mapa" de novo.';
  }

  const nome = tipo.nome.toLowerCase();

  // Voltar do Android: não fecha enquanto salva/busca (como o "x").
  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={() => !ocupado && onFechar()}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topo}>
          <TouchableOpacity onPress={onFechar} disabled={ocupado} style={styles.fechar}>
            <Feather name="x" size={22} color={cores.texto} />
          </TouchableOpacity>

          <Text style={styles.titulo}>{lugar ? `Editar ${tipo.nome}` : `Cadastrar ${tipo.nome}`}</Text>
        </View>

        <View style={styles.mapaArea}>
          <MapView
            ref={mapaRef}
            style={styles.mapa}
            initialRegion={regiaoInicial}
            onPress={(evento) => moverPino(evento.nativeEvent.coordinate)}
          >
            {pino && (
              <Marker
                coordinate={pino}
                draggable={!ocupado}
                onDragEnd={(evento) => moverPino(evento.nativeEvent.coordinate)}
                pinColor={localizado ? cores.primaria : cores.textoSecundario}
              />
            )}
          </MapView>
        </View>

        <Text style={[styles.dica, localizado && styles.dicaOk]}>{dica}</Text>

        <ScrollView
          contentContainerStyle={styles.formulario}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {lugar && !salvoCompleto ? (
            <Text style={styles.aviso}>
              Endereço salvo antes: {lugar.endereco}. Preencha os campos abaixo
              para atualizar a posição.
            </Text>
          ) : null}

          <TouchableOpacity
            style={styles.minhaPosicao}
            onPress={usarMinhaLocalizacao}
            disabled={ocupado}
          >
            <Feather name="crosshair" size={16} color={cores.primaria} />
            <Text style={styles.minhaPosicaoTexto}>
              {tipo.id === 'casa' ? 'Estou em casa agora' : 'Estou lá agora'}: usar minha localização
            </Text>
          </TouchableOpacity>

          <Campo
            label="País"
            value={campos.pais}
            onChangeText={(valor) => alterar('pais', valor)}
            placeholder="Brasil"
            autoCapitalize="words"
            maxLength={40}
          />

          <Campo
            label="CEP"
            value={campos.cep}
            onChangeText={(valor) => alterar('cep', valor)}
            placeholder={brasil ? '00000-000' : 'Código postal'}
            keyboardType={brasil ? 'number-pad' : 'default'}
            autoCapitalize="characters"
            maxLength={brasil ? 9 : 10}
          />

          {brasil ? (
            <Text style={styles.dicaCEP}>
              {buscandoCEP
                ? 'Buscando o endereço do CEP...'
                : 'Digite o CEP para preencher estado, cidade, bairro e rua.'}
            </Text>
          ) : null}

          <View style={styles.linha}>
            <Campo
              label="Estado"
              style={styles.metade}
              value={campos.estado}
              onChangeText={(valor) => alterar('estado', valor)}
              placeholder="RJ"
              autoCapitalize="words"
              maxLength={40}
            />

            <Campo
              label="Cidade"
              style={styles.dobro}
              value={campos.cidade}
              onChangeText={(valor) => alterar('cidade', valor)}
              placeholder="Rio de Janeiro"
              autoCapitalize="words"
              maxLength={60}
            />
          </View>

          <Campo
            label="Bairro"
            value={campos.bairro}
            onChangeText={(valor) => alterar('bairro', valor)}
            placeholder="Copacabana"
            autoCapitalize="words"
            maxLength={60}
          />

          <View style={styles.linha}>
            <Campo
              label="Rua"
              style={styles.triplo}
              value={campos.rua}
              onChangeText={(valor) => alterar('rua', valor)}
              placeholder="Rua Barata Ribeiro"
              autoCapitalize="words"
              maxLength={100}
            />

            <Campo
              label="Número"
              style={styles.metade}
              value={campos.numero}
              onChangeText={(valor) => alterar('numero', valor)}
              placeholder="123"
              maxLength={15}
            />
          </View>

          <Text style={styles.privacidade}>
            {tipo.id === 'casa'
              ? 'Este também é o endereço do seu perfil, que a família vê. A posição no mapa é privada: a família vê apenas "Em casa" ou a distância aproximada até a casa.'
              : 'O endereço e a posição são privados.'}
          </Text>

          {erro ? <Text style={styles.erro}>{erro}</Text> : null}

          <TouchableOpacity
            style={[styles.botao, (ocupado || buscandoCEP) && styles.botaoDesabilitado]}
            onPress={localizado ? salvar : localizar}
            disabled={ocupado || buscandoCEP}
          >
            {ocupado ? (
              <ActivityIndicator color={cores.textoSobrePrimaria} />
            ) : (
              <>
                <Feather
                  name={localizado ? 'check' : 'map-pin'}
                  size={18}
                  color={cores.textoSobrePrimaria}
                />
                <Text style={styles.botaoTexto}>
                  {localizado ? `Salvar ${nome}` : 'Localizar no mapa'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: cores.fundo,
  },

  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },

  fechar: {
    padding: 4,
  },

  titulo: {
    fontSize: 20,
    fontFamily: fontes.titulo,
    color: cores.texto,
  },

  mapaArea: {
    height: 200,
  },

  mapa: {
    flex: 1,
  },

  dica: {
    fontSize: 12,
    color: cores.textoSecundario,
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  dicaOk: {
    color: cores.online,
  },

  formulario: {
    padding: 16,
    paddingTop: 10,
    gap: 10,
  },

  aviso: {
    fontSize: 13,
    lineHeight: 18,
    color: cores.pendente,
  },

  minhaPosicao: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 4,
  },

  minhaPosicaoTexto: {
    fontSize: 13,
    fontFamily: fontes.destaque,
    color: cores.primaria,
  },

  linha: {
    flexDirection: 'row',
    gap: 10,
  },

  campo: {
    gap: 4,
  },

  metade: {
    flex: 1,
  },

  dobro: {
    flex: 2,
  },

  triplo: {
    flex: 3,
  },

  label: {
    fontSize: 14,
    fontFamily: fontes.destaque,
    color: cores.texto,
  },

  input: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.botaoSecundario + 4,
    padding: 12,
    fontSize: 15,
    backgroundColor: cores.superficie,
    color: cores.texto,
  },

  dicaCEP: {
    fontSize: 12,
    color: cores.textoSecundario,
    marginTop: -4,
  },

  privacidade: {
    fontSize: 12,
    color: cores.textoSecundario,
  },

  erro: {
    color: cores.erro,
    textAlign: 'center',
  },

  botao: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    padding: 15,
    borderRadius: raio.pilula,
    backgroundColor: cores.primaria,
    alignItems: 'center',
  },

  botaoDesabilitado: {
    opacity: 0.7,
  },

  botaoTexto: {
    color: cores.textoSobrePrimaria,
    fontSize: 16,
    fontFamily: fontes.destaque,
  },
});
