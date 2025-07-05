import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { API_BASE_URL } from '../utils/config';
import LottieView from 'lottie-react-native';

const WaitingForDriverScreen = ({ route, navigation }) => {
  const { rideId } = route.params;
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user, isAuthenticated } = useAuth();
  const { socket } = useSocket();

  console.log("lo que tiene rideID: ", rideId);
  console.log("lo que tiene Token: ", user.token);

  const fetchRideDetails = useCallback(async () => {
    if (!isAuthenticated || !user?.token || !rideId) {
      Alert.alert('Error', 'No estás autenticado o no hay ID de viaje para buscar.');
      setLoading(false);
      navigation.replace('Login');
      return;
    }
    try {
      // Endpoint ya corregido en el último ciclo, solo verifico que sigue sin el doble /api
      const response = await axios.get(`${API_BASE_URL}/rides/${rideId}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const fetchedRide = response.data;
      setRide(fetchedRide);
      setLoading(false);

      console.log("Estado del viaje fetchedRide:", fetchedRide.status);

      // Usar los nombres de estado del backend
      // 'buscando', 'aceptado', 'en_curso', 'finalizado', 'cancelado'
      if (fetchedRide.status === 'finalizado' || fetchedRide.status === 'cancelado') {
        Alert.alert('Info', `El viaje ya está ${fetchedRide.status === 'finalizado' ? 'completado' : 'cancelado'}.`);
        navigation.replace('PassengerHomeScreen');
        return;
      }

      if (fetchedRide.status === 'aceptado' || fetchedRide.status === 'en_curso') {
        Alert.alert('¡Viaje Encontrado!', 'Tu viaje ya ha sido aceptado o está en curso.');
        navigation.replace('PassengerRideInProgress', { rideId: fetchedRide._id });
        return;
      }

    } catch (error) {
      console.error('Error fetching ride details:', error.response?.data || error.message);
      Alert.alert('Error', 'No se pudo cargar los detalles del viaje. Es posible que el viaje ya no exista.');
      setLoading(false);
      navigation.replace('PassengerHomeScreen');
    }
  }, [isAuthenticated, user, rideId, navigation]);

  const handleCancelRide = async () => {
    Alert.alert(
      "Cancelar Viaje",
      "¿Estás seguro de que quieres cancelar este viaje? Se detendrá la búsqueda de un conductor.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Sí",
          onPress: async () => {
            try {
              if (!user?.token) {
                Alert.alert('Error', 'No estás autenticado para cancelar el viaje.');
                return;
              }
              // El endpoint para cancelar un viaje: POST /api/rides/:id/cancel
              // Asegúrate de que el backend está esperando ':id' en la URL
              await axios.post(`${API_BASE_URL}/rides/${rideId}/cancel`, {}, { // CAMBIO: /api quitado del path si API_BASE_URL ya lo tiene
                headers: { Authorization: `Bearer ${user.token}` },
              });
              Alert.alert('Viaje Cancelado', 'Tu viaje ha sido cancelado exitosamente.');
              
              if (ride?.driver?._id && socket) {
                socket.emit('ride_cancelled_by_passenger', { rideId: ride._id, driverId: ride.driver._id });
              }
              navigation.replace('PassengerHomeScreen');
            } catch (error) {
              console.error('Error cancelling ride:', error.response?.data || error.message);
              Alert.alert('Error', 'No se pudo cancelar el viaje. Intenta de nuevo.');
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    fetchRideDetails();
  }, [fetchRideDetails]);

  useEffect(() => {
    if (!socket || !isAuthenticated || !user?._id || !rideId) { // CAMBIO: user?.id a user?._id para consistencia
      return;
    }

    socket.on('ride_accepted', (data) => {
      // Asegurarse de que el evento es para el viaje y pasajero correctos
      // Asegúrate de que tu backend emite passengerId como user._id si lo está usando
      if (data.rideId === rideId && data.passengerId === user._id) { // CAMBIO: user.id a user._id
        Alert.alert('¡Viaje Aceptado!', `Tu viaje ha sido aceptado por ${data.driverName || 'un conductor'}.`);
        navigation.replace('PassengerRideInProgress', { rideId: data.rideId });
      }
    });

    // Usar el nombre de evento correcto 'ride_status_updated' como en PassengerHomeScreen
    socket.on('ride_status_updated', (data) => { // CAMBIO: 'ride_status_update' a 'ride_status_updated'
      if (data.rideId === rideId) {
        setRide(prevRide => ({ ...prevRide, status: data.status }));

        // Usar los nombres de estado del backend
        if (data.status === 'cancelado') { // CAMBIO: 'cancelled' a 'cancelado'
          Alert.alert('Viaje Cancelado', 'Tu solicitud de viaje ha sido cancelada.');
          navigation.replace('PassengerHomeScreen');
        } else if (data.status === 'finalizado') { // CAMBIO: 'completed' a 'finalizado'
          Alert.alert('Viaje Completado', 'Tu viaje ha finalizado.');
          navigation.replace('PassengerHomeScreen');
        } else if (data.status === 'aceptado' || data.status === 'en_curso') { // Manejar la navegación aquí también
            Alert.alert('¡Viaje Encontrado!', 'Tu viaje ya ha sido aceptado o está en curso.');
            navigation.replace('PassengerRideInProgress', { rideId: data.rideId });
        }
      }
    });

    socket.on('ride_rejected', (data) => {
      if (data.rideId === rideId && data.passengerId === user._id) { // CAMBIO: user.id a user._id
          Alert.alert('Viaje Rechazado', 'Un conductor ha rechazado tu solicitud. Buscando otro...');
      }
    });

    return () => {
      socket.off('ride_accepted');
      socket.off('ride_status_updated'); // CAMBIO: 'ride_status_update' a 'ride_status_updated'
      socket.off('ride_rejected');
    };
  }, [socket, rideId, user, isAuthenticated, navigation]);

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#00f0ff" />
        <Text style={styles.loadingText}>Cargando estado del viaje...</Text>
      </View>
    );
  }

  // Si no hay viaje o el estado ya no es 'buscando' o 'aceptado', redirigir
  // Los estados válidos para esta pantalla son 'buscando' y 'aceptado'
  if (!ride || (ride.status !== 'buscando' && ride.status !== 'aceptado')) { // CAMBIO: 'pending' a 'buscando'
    // Ya mostramos una alerta más específica en fetchRideDetails si el estado es finalizado/cancelado.
    // Esta alerta es más bien para un estado que no debería llegar aquí o un error.
    if (ride?.status === 'finalizado' || ride?.status === 'cancelado') {
        // No hacer nada, ya fue manejado en fetchRideDetails
    } else {
        // Para cualquier otro estado inesperado
        Alert.alert("Información del Viaje", "Este viaje ya no está en un estado de espera o ha sido completado.");
    }
    navigation.replace("PassengerHomeScreen");
    return null;
  }

  return (
    <View style={styles.container}>
      <LottieView
        source={require('../assets/animations/waiting.json')}
        autoPlay
        loop
        style={styles.animation}
      />
      <Text style={styles.title}>Esperando Conductor</Text>
      <Text style={styles.statusText}>Estado: {ride.status?.toUpperCase()}</Text>

      {ride.status === 'buscando' && ( // CAMBIO: 'pending' a 'buscando'
        <Text style={styles.messageText}>
          Estamos buscando el conductor más cercano para tu viaje.
          Esto puede tardar unos segundos. Por favor, mantén esta pantalla abierta.
        </Text>
      )}
      {ride.status === 'aceptado' && ride.driver && ( // CAMBIO: 'accepted' a 'aceptado'
        <View style={styles.driverAcceptedContainer}>
          <Text style={styles.messageText}>¡Tu viaje ha sido aceptado!</Text>
          <Text style={styles.driverInfoText}>Conductor: {ride.driver.name}</Text>
          <Text style={styles.driverInfoText}>Vehículo: {ride.driver.vehicle?.brand} {ride.driver.vehicle?.model} ({ride.driver.vehicle?.color})</Text>
          <TouchableOpacity
            onPress={() => navigation.replace('PassengerRideInProgress', { rideId: ride._id })}
            style={styles.viewRideButton}
          >
            <Text style={styles.viewRideButtonText}>Ver Viaje en Mapa</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity onPress={handleCancelRide} style={styles.cancelButton}>
        <Text style={styles.cancelButtonText}>Cancelar Viaje</Text>
      </TouchableOpacity>
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
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0f1c',
  },
  loadingText: {
    marginTop: 10,
    color: '#fff',
    fontSize: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
    textAlign: 'center',
  },
  statusText: {
    fontSize: 20,
    color: '#00f0ff',
    fontWeight: 'bold',
    marginBottom: 20,
    textTransform: 'capitalize',
  },
  messageText: {
    fontSize: 16,
    color: '#bbb',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  animation: {
    width: 200,
    height: 200,
    marginBottom: 20,
  },
  cancelButton: {
    marginTop: 30,
    backgroundColor: '#ff4d4d',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 10,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  driverAcceptedContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#1a1f2e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#00f0ff',
    alignItems: 'center',
    width: '100%',
  },
  driverInfoText: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 5,
  },
  viewRideButton: {
    marginTop: 15,
    backgroundColor: '#0cf574',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  viewRideButtonText: {
    color: '#0a0f1c',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default WaitingForDriverScreen;