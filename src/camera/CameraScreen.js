/*
 * Câmera da foto de perfil: pede a permissão, mostra a imagem, tira a
 * foto e abre a pré-visualização.
 */

import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import CameraControls from './CameraControls';
import PreviewModal from './PreviewModal';
import { useVoltarAndroid } from '../navegacao/voltar';
import { cores, fontes, raio } from '../theme/theme';

export default function CameraScreen({ onPhotoTaken, onCancel }) {
  const cameraRef = useRef(null);

  const [facing, setFacing] = useState('back');
  const [capturedImage, setCapturedImage] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isTakingPicture, setIsTakingPicture] = useState(false);

  // Voltar do Android: igual ao "x" (a prévia é um Modal e trata o
  // próprio voltar). Não fecha durante a captura.
  useVoltarAndroid(Boolean(onCancel), () => {
    if (!isTakingPicture) closeCamera();
  });

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  async function requestPermissions() {
    try {
      const result = await requestCameraPermission();

      if (!result.granted) {
        Alert.alert(
          'Permissão necessária',
          'É necessário permitir o uso da câmera.'
        );
      }
    } catch (error) {
      console.error('Erro ao solicitar permissão:', error);

      Alert.alert(
        'Erro',
        'Não foi possível solicitar a permissão da câmera.'
      );
    }
  }

  function toggleCameraFacing() {
    setFacing((current) => (
      current === 'back' ? 'front' : 'back'
    ));
  }

  async function takePicture() {
    if (!cameraRef.current || isTakingPicture) {
      return;
    }

    try {
      setIsTakingPicture(true);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: true,
      });

      if (!photo?.uri) {
        throw new Error('A câmera não retornou uma foto válida.');
      }

      setCapturedImage(photo.uri);
      setModalVisible(true);

    } catch (error) {
      console.error('Erro ao tirar foto:', error);

      Alert.alert(
        'Erro',
        'Não foi possível tirar a foto.'
      );
    } finally {
      setIsTakingPicture(false);
    }
  }

  function retakePicture() {
    setCapturedImage(null);
    setModalVisible(false);
  }

  function confirmPicture() {
    if (!capturedImage) {
      return;
    }

    setModalVisible(false);

    if (onPhotoTaken) {
      onPhotoTaken(capturedImage);
    }
  }

  function closeCamera() {
    setCapturedImage(null);
    setModalVisible(false);

    if (onCancel) {
      onCancel();
    }
  }

  if (!cameraPermission) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>
          Verificando permissão da câmera...
        </Text>
      </View>
    );
  }

  if (!cameraPermission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>
          Permissão da câmera
        </Text>

        <Text style={styles.permissionMessage}>
          Para tirar fotos, precisamos acessar a câmera do celular.
        </Text>

        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermissions}
        >
          <Text style={styles.permissionButtonText}>
            Permitir câmera
          </Text>
        </TouchableOpacity>

        {onCancel && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={closeCamera}
          >
            <Text style={styles.cancelButtonText}>
              Cancelar
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'bottom']}
    >
      <View style={styles.cameraContainer}>

        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode="picture"
        />

        {onCancel && (
          <TouchableOpacity
            style={styles.closeCameraButton}
            onPress={closeCamera}
            disabled={isTakingPicture}
          >
            <Feather name="x" size={22} color="#fff" />
          </TouchableOpacity>
        )}

        <CameraControls
          onFlip={toggleCameraFacing}
          onCapture={takePicture}
          isSaving={isTakingPicture}
        />

      </View>

      <PreviewModal
        visible={modalVisible}
        imageUri={capturedImage}
        onClose={retakePicture}
        onConfirm={confirmPicture}
        onRetake={retakePicture}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  cameraContainer: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#000',
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },

  loadingText: {
    color: '#fff',
    fontSize: 16,
  },

  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    backgroundColor: cores.fundo,
  },

  permissionTitle: {
    marginBottom: 12,
    color: cores.texto,
    fontSize: 22,
    fontFamily: fontes.titulo,
    textAlign: 'center',
  },

  permissionMessage: {
    marginBottom: 25,
    color: cores.textoSecundario,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },

  permissionButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: raio.pilula,
    backgroundColor: cores.primaria,
  },

  permissionButtonText: {
    color: cores.textoSobrePrimaria,
    fontSize: 16,
    fontFamily: fontes.destaque,
  },

  cancelButton: {
    marginTop: 15,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },

  cancelButtonText: {
    color: cores.textoSecundario,
    fontSize: 16,
    fontFamily: fontes.destaque,
  },

  closeCameraButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    width: 45,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 23,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 10,
  },
});