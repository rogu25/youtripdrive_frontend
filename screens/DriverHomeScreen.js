// DriverHomeScreen.js (¡Versión Corregida para el bucle!)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Button, Alert, ActivityIndicator, Switch, Dimensions, AppState } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useNavigation } from '@react-navigation/native';
import axios from 'axios';
import { API_BASE_URL } from '../utils/config';

import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';

const { width, height } = Dimensions.get('window');

const DriverHomeScreen = () => {
  const { user, logout } = useAuth();
  const { socket } = useSocket();
  const navigation = useNavigation();
  const [isAvailable, setIsAvailable] = useState(false);
  const [loadingAvailability, setLoadingAvailability] = useState(true);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationErrorMsg, setLocationErrorMsg] = useState(null);
  const locationSubscription = useRef(null);
  const appState = useRef(AppState.currentState);

  // --- Socket Listeners (para logs de depuración) ---
  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      console.log('✅ Cliente Socket.IO conectado con ID:', socket.id);
      // Si el conductor estaba disponible, reanudar el envío de ubicación al reconectar
      // No re-emitimos aquí inmediatamente si ya hay un watchPosition, para evitar duplicados.
      // El watchPosition se encargará de las emisiones.
    };

    const handleDisconnect = (reason) => {
      console.log('❌ Cliente Socket.IO desconectado:', reason);
    };

    const handleConnectError = (err) => {
      console.error('❌ Error de conexión de Socket.IO:', err.message);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
    };
  }, [socket]); // Solo depende de 'socket'

  // --- Función de envío de ubicación (altamente estable con useCallback) ---
  const sendLocationUpdate = useCallback(async (locationData) => {
    // Solo enviar si el socket está conectado, el usuario existe, la ubicación existe y el conductor está disponible
    if (socket && socket.connected && locationData && user?.id && isAvailable) {
      console.log('Enviando ubicación del conductor:', { latitude: locationData.latitude, longitude: locationData.longitude, isAvailable });
      socket.emit('driverLocationUpdate', {
        driverId: user.id,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        timestamp: new Date(),
        isAvailable: isAvailable, // ¡Siempre envía el estado de disponibilidad actual!
      });
    } else {
      console.log('No enviando ubicación: socket no listo/conectado, conductor no disponible o datos incompletos.');
    }
  }, [socket, user?.id, isAvailable]); // Depende de socket, user.id, y isAvailable


  // --- Lógica de Tracking de Ubicación y Control del Bucle ---
  useEffect(() => {
    let watchId = null; // Para almacenar la suscripción de watchPosition

    const setupLocationTracking = async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationErrorMsg('Permiso para acceder a la ubicación denegado.');
        Alert.alert('Permiso de Ubicación', 'Por favor, concede permiso de ubicación para usar la aplicación.');
        return;
      }

      // Obtener ubicación inicial y enviarla
      try {
        let initialLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setCurrentLocation(initialLocation.coords);
        sendLocationUpdate(initialLocation.coords); // Enviar ubicación inicial
      } catch (error) {
        console.error("Error al obtener ubicación inicial:", error);
        setLocationErrorMsg("No se pudo obtener la ubicación inicial.");
        return; // No continuar si no se puede obtener la ubicación inicial
      }

      // Iniciar el seguimiento continuo de ubicación si no hay uno activo
      if (!locationSubscription.current) {
        watchId = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000, // Actualizar cada 5 segundos
            distanceInterval: 10, // O cada 10 metros
          },
          (newLocation) => {
            setCurrentLocation(newLocation.coords);
            sendLocationUpdate(newLocation.coords); // Enviar cada vez que la ubicación cambia
          }
        );
        locationSubscription.current = watchId; // Guarda la suscripción
        console.log('📍 Seguimiento de ubicación iniciado.');
      } else {
        console.log('📍 Seguimiento de ubicación ya activo.');
      }
    };

    const cleanupLocationTracking = () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
        console.log('📍 Seguimiento de ubicación detenido.');
      }
    };

    // Este efecto se activa solo cuando isAvailable o user.id cambian
    if (isAvailable && user?.id) {
      setupLocationTracking();
    } else {
      cleanupLocationTracking(); // Detener si no está disponible o no hay user
      // Si se pone NO disponible, emitir un evento específico al backend
      if (socket && user?.id && socket.connected) {
        console.log(`🔌 Conductor ${user.id} ahora NO DISPONIBLE. Emitiendo 'driverSetUnavailable' a backend.`);
        socket.emit('driverSetUnavailable', { driverId: user.id });
      }
    }

    // Cleanup function para el useEffect: se ejecuta al desmontar o antes de una nueva ejecución
    return () => {
      cleanupLocationTracking();
    };
  }, [isAvailable, user?.id, socket, sendLocationUpdate]); // Dependencias estables


  // --- Manejo del estado de la aplicación (foreground/background) ---
  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('App ha vuelto al foreground.');
        // Si el conductor estaba disponible, reanudar el envío de ubicación
        if (isAvailable && user?.id && socket?.connected) {
          console.log('Reactivando envío de ubicación tras volver al foreground.');
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
            .then(location => {
              setCurrentLocation(location.coords);
              sendLocationUpdate(location.coords); // Envía la ubicación actual
            })
            .catch(error => console.error("Error al obtener ubicación al volver a foreground:", error));
        }
      } else if (nextAppState.match(/inactive|background/)) {
        console.log('App pasó a background o inactiva.');
        // Puedes considerar detener el seguimiento o emitir una indisponibilidad si no hay background tasks
        // Para Expo, el `watchPositionAsync` a menudo se detiene en background sin permisos especiales.
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [isAvailable, user, socket, sendLocationUpdate]);


  // --- Lógica de Disponibilidad (la que ya tenías) ---
  // Este useEffect carga la disponibilidad inicial del conductor.
  // No debería ser la causa del bucle ya que solo se ejecuta una vez al inicio
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
  }, [user]); // Depende solo del objeto 'user'

  const toggleAvailability = async () => {
    if (!user?.id || !user?.token) {
      Alert.alert('Error', 'Usuario no autenticado para cambiar disponibilidad.');
      return;
    }

    const newAvailability = !isAvailable;
    setIsAvailable(newAvailability); // Actualiza el estado local inmediatamente

    setLoadingAvailability(true);
    try {
      const response = await axios.put(`${API_BASE_URL}/drivers/${user.id}/availability`, {
        isAvailable: newAvailability,
      }, {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });

      Alert.alert('Éxito', `Tu estado es ahora: ${newAvailability ? 'Disponible' : 'No Disponible'}`);

    } catch (error) {
      console.error('Error al cambiar disponibilidad:', error.response?.data || error.message);
      setIsAvailable(!newAvailability); // Revertir el estado local si la API falla

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
            if (isAvailable && user?.id && socket?.connected) {
                console.log(`🔌 Conductor ${user.id} cerrando sesión. Emitiendo 'driverSetUnavailable'.`);
                socket.emit('driverSetUnavailable', { driverId: user.id });
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            await logout();
          }
        }
      ]
    );
  };

  if (!user || loadingAvailability) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00f0ff" />
        <Text style={styles.loadingText}>Cargando datos de usuario y disponibilidad...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* MAPA */}
      {currentLocation ? (
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          }}
          showsUserLocation={true}
          followsUserLocation={true}
        >
          <Marker
            coordinate={{
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
            }}
            title="Mi Ubicación"
            description="Aquí estás tú"
            pinColor={"#00f0ff"}
          />
        </MapView>
      ) : (
        <View style={styles.mapLoadingContainer}>
          <ActivityIndicator size="large" color="#00f0ff" />
          <Text style={styles.loadingText}>Cargando mapa y ubicación...</Text>
          {locationErrorMsg && <Text style={styles.errorText}>{locationErrorMsg}</Text>}
        </View>
      )}

      {/* Panel de control flotante */}
      <View style={styles.controlPanel}>
        <Text style={styles.title}>Panel del Conductor</Text>
        <Text style={styles.infoText}>
          Bienvenido, <Text style={{ fontWeight: 'bold' }}>{user.name || 'Conductor'}</Text>!
        </Text>

        <View style={styles.availabilityContainer}>
          <Text style={styles.availabilityText}>Estado: {isAvailable ? 'Disponible' : 'No Disponible'}</Text>
          {loadingAvailability ? (
            <ActivityIndicator size="small" color="#00f0ff" />
          ) : (
            <Switch
              onValueChange={toggleAvailability}
              value={isAvailable}
              trackColor={{ false: "#767577", true: "#0cf574" }}
              thumbColor={isAvailable ? "#f4f3f4" : "#f4f4f4"}
              ios_backgroundColor="#3e3e3e"
            />
          )}
        </View>
        <Button title="Cerrar Sesión" onPress={handleLogout} color="#ff4d4d" />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1c',
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
    fontSize: 16,
  },
  map: {
    width: width,
    height: height * 0.7,
  },
  mapLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0f1c',
  },
  errorText: {
    color: '#ff4d4d',
    marginTop: 10,
    textAlign: 'center',
  },
  controlPanel: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: '#0a0f1c',
    padding: 20,
    paddingBottom: 30,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
    elevation: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#00f0ff',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 5,
  },
  availabilityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 15,
    backgroundColor: '#1a1f2e',
    padding: 15,
    borderRadius: 10,
    width: '90%',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#00f0ff',
  },
  availabilityText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default DriverHomeScreen;