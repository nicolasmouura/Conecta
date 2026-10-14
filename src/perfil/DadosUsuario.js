/*
 * Cartão de Meu Perfil: foto e dados pessoais (e-mail, CPF mascarado,
 * telefone e endereço).
 */

import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import FotoPerfil from './FotoPerfil';
import { mascararDocumento } from '../dados/salvarUsuario';
import { cores, fontes, raio } from '../theme/theme';

function Informacao({ icone, label, valor }) {
  return (
    <View style={styles.linha}>
      <Feather name={icone} size={17} color={cores.primaria} />

      <View style={styles.linhaTextos}>
        <Text style={styles.linhaLabel}>{label}</Text>
        <Text style={styles.linhaValor}>{valor || 'Não informado'}</Text>
      </View>
    </View>
  );
}

// Foto + dados pessoais do usuário ("Meu Perfil"). A edição fica em
// Configurações → Editar informações.
export default function DadosUsuario({ perfil, salvandoFoto, onAlterarFoto }) {
  return (
    <View style={styles.container}>

      <View>
        <FotoPerfil foto={perfil.foto} tamanho={110} />

        {salvandoFoto && (
          <View style={styles.salvandoFoto}>
            <ActivityIndicator color={cores.textoSobrePrimaria} />
          </View>
        )}
      </View>

      <TouchableOpacity
        style={styles.alterarFotoBotao}
        onPress={onAlterarFoto}
        disabled={salvandoFoto}
      >
        <Feather name="camera" size={15} color={cores.primaria} />
        <Text style={styles.alterarFoto}>
          {salvandoFoto
            ? 'Salvando foto...'
            : perfil.foto
            ? 'Alterar foto'
            : 'Adicionar foto'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.nome}>
        {perfil.nome || 'Usuário'}
      </Text>

      <View style={styles.cartao}>
        <Informacao icone="mail" label="E-mail" valor={perfil.email} />
        <Informacao
          icone="credit-card"
          label="CPF"
          valor={perfil.documento ? mascararDocumento(perfil.documento) : ''}
        />
        <Informacao icone="phone" label="Telefone" valor={perfil.telefone} />
        <Informacao icone="home" label="Endereço" valor={perfil.endereco} />
      </View>

      <Text style={styles.dica}>
        Para alterar seus dados, vá em Configurações → Editar informações.
      </Text>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },

  salvandoFoto: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 55,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  alterarFotoBotao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },

  alterarFoto: {
    color: cores.primaria,
    fontSize: 16,
    fontFamily: fontes.destaque,
  },

  nome: {
    fontSize: 22,
    fontFamily: fontes.titulo,
    color: cores.texto,
    marginTop: 16,
    marginBottom: 16,
    textAlign: 'center',
  },

  cartao: {
    width: '100%',
    padding: 16,
    gap: 14,
    borderRadius: raio.card,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },

  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  linhaTextos: {
    flex: 1,
  },

  linhaLabel: {
    fontSize: 12,
    color: cores.textoSecundario,
  },

  linhaValor: {
    fontSize: 15,
    color: cores.texto,
  },

  dica: {
    fontSize: 12,
    color: cores.textoSecundario,
    textAlign: 'center',
    marginTop: 10,
  },
});
