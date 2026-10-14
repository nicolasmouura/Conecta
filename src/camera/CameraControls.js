/*
 * Botões da câmera da foto de perfil: virar a câmera e tirar a foto.
 */

import { Image, StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import { fontes } from '../theme/theme';

export default function CameraControls({
  onFlip,
  onCapture,
  isSaving,
}) {
  return (
    <View style={styles.buttonContainer}>
      <TouchableOpacity
        style={styles.flipButton}
        onPress={onFlip}
        disabled={isSaving}
      >
        <Image style={styles.icon} source={require('../../assets/flip.png')} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.captureButton, isSaving && styles.disabledButton]}
        onPress={onCapture}
        disabled={isSaving}
      >
        <Image
          style={styles.captureIcon}
          source={require('../../assets/camera.png')}
        />
      </TouchableOpacity>

      {isSaving && (
        <View style={styles.savingContainer}>
          <Text style={styles.savingText}>Salvando foto...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  buttonContainer: {
    position: 'absolute',
    right: 0,
    bottom: 30,
    left: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 35,
  },
  flipButton: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  captureButton: {
    width: 76,
    height: 76,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 38,
    backgroundColor: '#fff',
  },
  disabledButton: {
    opacity: 0.5,
  },
  icon: {
    width: '65%',
    height: '65%',
    resizeMode: 'contain',
  },
  captureIcon: {
    width: '65%',
    height: '65%',
    resizeMode: 'contain',
  },
  savingContainer: {
    position: 'absolute',
    top: -60,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  savingText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: fontes.destaque,
  },
});