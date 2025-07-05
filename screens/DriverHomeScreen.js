import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Button, Alert, ActivityIndicator, Switch } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import axios from 'axios';
import { API_BASE_URL } from '../utils/config';

const DriverHomeScreen = () => {
  const { user, logout } = useAuth();
  const navigation = useNavigation();
  const [isAvailable, setIsAvailable] = useState(false);
  const [loadingAvailability, setLoadingAvailability] = useState(true);

  useEffect(() => {
    const fetchAvailability = async () => {
      if (!user?.id || !user?.token) {
        setLoadingAvailability(false);
        return;
      }
      try {
        const response = await axios.get(`${API_BASE_URL}/drivers/${user.id}/availability`, {
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
        });
        setIsAvailable(response.data.isAvailable);
      } catch (error) {
        console.error('Error al cargar la disponibilidad inicial:', error.response?.data || error.message);
        Alert.alert('Error', 'No se pudo cargar tu estado de disponibilidad.');
      } finally {
        setLoadingAvailability(false);
      }
    };

    fetchAvailability();
  }, [user]);

  const toggleAvailability = async () => {
    if (!user?.id || !user?.token) {
      Alert.alert('Error', 'Usuario no autenticado para cambiar disponibilidad.');
      return;
    }

    setLoadingAvailability(true);
    try {
      const newAvailability = !isAvailable;
      const response = await axios.put(`${API_BASE_URL}/drivers/${user.id}/availability`, {
        isAvailable: newAvailability,
      }, {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });

      setIsAvailable(newAvailability);
      Alert.alert('Éxito', `Tu estado es ahora: ${newAvailability ? 'Disponible' : 'No Disponible'}`);
    } catch (error) {
      console.error('Error al cambiar disponibilidad:', error.response?.data || error.message);
      let errorMessage = 'Ocurrió un error al cambiar tu disponibilidad.';
      if (error.response) {
        if (error.response.status === 404) {
          errorMessage = 'La ruta para cambiar disponibilidad no se encontró en el servidor. Verifica el backend.';
        } else if (error.response.data && typeof error.response.data === 'string') {
          errorMessage = 'Error del servidor. Por favor, intenta de nuevo más tarde.';
        } else if (error.response.data && typeof error.response.data === 'object' && error.response.data.message) {
          errorMessage = error.response.data.message;
        }
      } else if (error.request) {
        errorMessage = 'No se pudo conectar con el servidor. Verifica tu conexión a internet.';
      }
      Alert.alert('Error', errorMessage);
    } finally {
      setLoadingAvailability(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      "Cerrar Sesión",
      "¿Estás seguro de que quieres cerrar tu sesión?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí",
          onPress: async () => {
            await logout();
          }
        }
      ]
    );
  };

  if (!user) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00f0ff" />
        <Text style={styles.loadingText}>Cargando datos de usuario...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Panel del Conductor</Text>
      {/*
         CORRECCIÓN CLAVE AQUÍ: No usar Markdown ** para negritas directamente en el texto.
         En su lugar, usa un componente <Text> anidado con estilo.
      */}
      <Text style={styles.infoText}>
        Bienvenido, <Text style={{fontWeight: 'bold'}}>{user.name || 'Conductor'}</Text>!
      </Text>
      <Text style={styles.infoText}>
        Correo: <Text style={{fontWeight: 'bold'}}>{user.email}</Text>
      </Text>
      
      {user.address && (
        <Text style={styles.infoText}>
          Dirección: <Text style={{fontWeight: 'bold'}}>{user.address}</Text>
        </Text>
      )}
      {user.phone && (
        <Text style={styles.infoText}>
          Teléfono: <Text style={{fontWeight: 'bold'}}>{user.phone}</Text>
        </Text>
      )}

      <View style={styles.availabilityContainer}>
        <Text style={styles.availabilityText}>Estado: {isAvailable ? 'Disponible' : 'No Disponible'}</Text>
        {loadingAvailability ? (
          <ActivityIndicator size="small" color="#00f0ff" />
        ) : (
          <Switch
            onValueChange={toggleAvailability}
            value={isAvailable}
            trackColor={{ false: "#767577", true: "#0cf574" }}
            thumbColor={isAvailable ? "#f4f3f4" : "#f4f3f4"}
            ios_backgroundColor="#3e3e3e"
          />
        )}
      </View>

      <Button title="Ver Viajes Disponibles" onPress={() => navigation.navigate('AvailableRidesScreen')} />
      <Button title="Cerrar Sesión" onPress={handleLogout} color="#ff4d4d" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0f1c',
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0f1c',
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#00f0ff',
    marginBottom: 20,
  },
  infoText: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 5,
  },
  availabilityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    backgroundColor: '#1a1f2e',
    padding: 15,
    borderRadius: 10,
    width: '90%',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#00f0ff',
  },
  availabilityText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default DriverHomeScreen;