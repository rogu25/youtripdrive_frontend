import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity, // Para botones con estilo
  StyleSheet,
  Alert,
  ActivityIndicator, // Para indicar carga
  Platform, // Para manejar permisos específicos de plataforma
} from "react-native";
import axios from "axios";
import * as Location from "expo-location";
import { useAuth } from "../context/AuthContext"; // Importa el hook de autenticación
import { useSocket } from "../context/SocketContext"; // Importa el hook del socket
import { API_BASE_URL } from "../utils/config"; // Importa la URL base de la API
import { Ionicons } from '@expo/vector-icons'; // Para iconos

export default function DriverHomeScreen({ navigation }) {
  const [rides, setRides] = useState([]);
  const [loadingRides, setLoadingRides] = useState(true); // Nuevo estado para la carga de viajes
  const [isOnline, setIsOnline] = useState(false); // Estado para controlar si el conductor está en línea
  const locationSubscription = useRef(null); // Referencia para la suscripción de la ubicación
  const { user, isAuthenticated, signOut } = useAuth(); // Obtener user, isAuthenticated, signOut del AuthContext
  const { socket } = useSocket(); // Obtener la instancia del socket

  // Función para obtener viajes disponibles (con useCallback para memoización)
  const fetchRides = useCallback(async () => {
    if (!isAuthenticated || !user?.token) {
      Alert.alert("Error", "No estás autenticado para obtener viajes.");
      setLoadingRides(false);
      return;
    }
    setLoadingRides(true);
    try {
      const token = user.token; // Usar el token del contexto
      console.log("token del conductor: ", user.token)
      const res = await axios.get(
        `${API_BASE_URL}/rides/available`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Filtramos los que tengan origin válido (lat y lng)
      const validRides = res.data.filter(
        (ride) => ride.origin?.latitude && ride.origin?.longitude
      );
      setRides(validRides);
    } catch (err) {
      console.error("Error al obtener viajes disponibles:", err.response?.data?.message || err.message);
      if (err.response?.status === 401) {
        Alert.alert("Sesión Caducada", "Por favor, inicia sesión de nuevo.");
        signOut(); // Forzar cierre de sesión
      } else {
        Alert.alert("Error", "No se pudieron cargar los viajes disponibles.");
      }
    } finally {
      setLoadingRides(false);
    }
  }, [isAuthenticated, user, signOut]); // Dependencias para useCallback

  // Función para aceptar un viaje
  const acceptRide = async (rideItem) => {
    Alert.alert(
      "Aceptar Viaje",
      `¿Deseas aceptar el viaje desde ${rideItem.origin.address || 'ubicación desconocida'} por $${rideItem.price_offered || '0'}?`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Sí",
          onPress: async () => {
            try {
              if (!user?.token) {
                Alert.alert('Error', 'No estás autenticado para aceptar el viaje.');
                return;
              }
              const token = user.token;

              // 1. Aceptar el viaje en el backend
              await axios.put(
                `${API_BASE_URL}/rides/accept/${rideItem._id}`,
                { price_accepted: rideItem.price_offered || 0 }, // Enviar el precio ofrecido o un default
                {
                  headers: { Authorization: `Bearer ${token}` },
                }
              );

              Alert.alert("Viaje aceptado", "Redirigiendo al mapa...");
              
              // Emitir evento de socket para notificar al pasajero y al sistema
              if (socket) {
                socket.emit('ride_accepted', {
                    rideId: rideItem._id,
                    passengerId: rideItem.passenger._id, // Asume que rideItem tiene passenger._id
                    driverId: user._id,
                    driverName: user.name, // O user.fullName si lo tienes
                    driverVehicle: user.vehicle, // Asume que el usuario tiene info de vehículo
                });
                // También puedes emitir una actualización de estado general para el ride
                socket.emit('ride_status_update', {
                    rideId: rideItem._id,
                    status: 'accepted',
                });
              }

              // Opcional: Eliminar el viaje de la lista local
              setRides(prevRides => prevRides.filter(r => r._id !== rideItem._id));

              // Navegar a la pantalla de progreso del viaje para el conductor
              // Pasar el rideItem completo para evitar otra llamada GET si es posible
              navigation.navigate("RideInProgressDriverScreen", { rideId: rideItem._id });

            } catch (err) {
              console.error("Error al aceptar viaje:", err.response?.data?.message || err.message);
              if (err.response?.status === 409) { // 409 Conflict si el viaje ya fue aceptado
                  Alert.alert("Viaje No Disponible", "Este viaje ya ha sido aceptado por otro conductor o cancelado.");
                  fetchRides(); // Refrescar la lista de viajes
              } else {
                  Alert.alert("Error", "No se pudo aceptar el viaje. Intenta de nuevo.");
              }
            }
          },
        },
      ]
    );
  };

  // Función para gestionar el estado en línea del conductor y el seguimiento de ubicación
  const toggleOnlineStatus = async () => {
    if (!isAuthenticated || !user?.token) {
      Alert.alert("Error", "No estás autenticado.");
      return;
    }

    if (!isOnline) {
      // Ponerse en línea: Solicitar permisos y empezar a rastrear
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permiso de Ubicación", "Necesitamos tu permiso para acceder a la ubicación en primer plano para poder rastrearte y asignarte viajes.");
        return;
      }
      // Opcional: Solicitar permiso de ubicación en segundo plano para iOS
      if (Platform.OS === 'ios') {
        const backgroundStatus = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus.status !== 'granted') {
          Alert.alert("Permiso de Ubicación en Segundo Plano", "Para una mejor experiencia y seguimiento continuo del viaje, por favor habilita los permisos de ubicación 'Siempre'.");
        }
      }

      // Iniciar el seguimiento de ubicación
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000, // Actualizar cada 5 segundos
          distanceInterval: 10, // o cada 10 metros
        },
        async (location) => {
          const { latitude, longitude } = location.coords;
          // Emitir ubicación al backend a través de socket si está conectado
          if (socket) {
            socket.emit('driver_location_update', {
              driverId: user._id, // ID del conductor
              coordinates: { latitude, longitude },
            });
            // Opcional: Si el backend requiere una actualización REST para persistencia
            // try {
            //   await axios.post(`${API_BASE_URL}/api/location/update`, { lat: latitude, lng: longitude }, {
            //     headers: { Authorization: `Bearer ${user.token}` },
            //   });
            // } catch (err) {
            //   console.error("Error actualizando ubicación via REST:", err.message);
            // }
          }
        }
      );
      setIsOnline(true);
      Alert.alert("Conectado", "Estás en línea y listo para recibir viajes.");
      // Emitir evento al backend de que el conductor está online
      if (socket) {
        socket.emit('driver_online', { driverId: user._id });
      }
      fetchRides(); // Refrescar la lista de viajes al conectarse
    } else {
      // Ponerse fuera de línea: Detener el seguimiento
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
      setIsOnline(false);
      Alert.alert("Desconectado", "Estás fuera de línea y no recibirás viajes.");
      // Emitir evento al backend de que el conductor está offline
      if (socket) {
        socket.emit('driver_offline', { driverId: user._id });
      }
      setRides([]); // Limpiar la lista de viajes disponibles
    }
  };

  // useEffect para la configuración inicial y limpieza
  useEffect(() => {
    // Configurar socket listeners al montar
    if (socket && isAuthenticated && user?._id) {
        // Escuchar nuevas solicitudes de viaje
        socket.on('new_ride_request', (rideRequest) => {
            // Verificar si el viaje ya está en la lista para evitar duplicados
            if (!rides.some(ride => ride._id === rideRequest._id)) {
                Alert.alert("¡Nueva Solicitud!", `Viaje de $${rideRequest.price_offered} desde ${rideRequest.origin?.address || 'ubicación desconocida'}.`);
                setRides(prevRides => [rideRequest, ...prevRides]); // Añadir al inicio
            }
        });

        // Escuchar cancelaciones de viajes (si un pasajero cancela un viaje pendiente)
        socket.on('ride_cancelled_by_passenger', (data) => {
            if (rides.some(r => r._id === data.rideId)) {
                Alert.alert("Viaje Cancelado", `El viaje a ${data.rideId} ha sido cancelado por el pasajero.`);
                setRides(prevRides => prevRides.filter(r => r._id !== data.rideId));
            }
        });

        // Opcional: Escuchar cuando un viaje que estaba pendiente para ti es aceptado por otro
        socket.on('ride_accepted_by_other_driver', (data) => {
          if (data.rideId && data.driverId !== user._id) {
            setRides(prevRides => prevRides.filter(r => r._id !== data.rideId));
            // Alert.alert('Info', `El viaje ${data.rideId} fue tomado por otro conductor.`);
          }
        });
    }

    // Limpieza al desmontar: detener seguimiento de ubicación y limpiar listeners del socket
    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
      if (socket) {
        socket.off('new_ride_request');
        socket.off('ride_cancelled_by_passenger');
        socket.off('ride_accepted_by_other_driver');
        // Asegurarse de emitir offline si se cierra la app
        if (isAuthenticated && user?._id) {
          socket.emit('driver_offline', { driverId: user._id });
        }
      }
    };
  }, [socket, isAuthenticated, user, rides]); // 'rides' en las dependencias para que 'new_ride_request' pueda acceder al estado actualizado

  // Renderiza cada tarjeta de viaje
  const renderRide = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Solicitud de Viaje</Text>
      <Text style={styles.cardText}>
        <Ionicons name="location-outline" size={16} color="#bbb" /> Origen:{" "}
        {item.origin?.address || `Lat: ${item.origin?.latitude?.toFixed(4)}, Lng: ${item.origin?.longitude?.toFixed(4)}`}
      </Text>
      {item.destination && (
        <Text style={styles.cardText}>
          <Ionicons name="flag-outline" size={16} color="#bbb" /> Destino:{" "}
          {item.destination?.address || `Lat: ${item.destination?.latitude?.toFixed(4)}, Lng: ${item.destination?.longitude?.toFixed(4)}`}
        </Text>
      )}
      <Text style={styles.cardPrice}>
        Ofrecido: <Text style={{ color: '#0cf574', fontWeight: 'bold' }}>${item.price_offered?.toLocaleString() || "0"}</Text>
      </Text>
      <TouchableOpacity
        style={styles.acceptButton}
        onPress={() => acceptRide(item)}
      >
        <Text style={styles.acceptButtonText}>Aceptar Viaje</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Bienvenido, {user?.name || "Conductor"}</Text>
        <TouchableOpacity
          style={[styles.onlineToggle, isOnline ? styles.online : styles.offline]}
          onPress={toggleOnlineStatus}
        >
          <Text style={styles.onlineToggleText}>{isOnline ? "En Línea" : "Desconectado"}</Text>
          <Ionicons name={isOnline ? "power" : "power-outline"} size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Solicitudes de Viaje Disponibles</Text>
      {loadingRides ? (
        <ActivityIndicator size="large" color="#00f0ff" style={styles.loadingIndicator} />
      ) : rides.length === 0 ? (
        <View style={styles.emptyListContainer}>
            <Ionicons name="car-outline" size={80} color="#bbb" />
            <Text style={styles.emptyListText}>No hay solicitudes de viaje disponibles por ahora.</Text>
            {isOnline && (
              <TouchableOpacity onPress={fetchRides} style={styles.refreshButton}>
                <Ionicons name="refresh-outline" size={20} color="#0a0f1c" />
                <Text style={styles.refreshButtonText}>Actualizar</Text>
              </TouchableOpacity>
            )}
            {!isOnline && (
                <Text style={styles.emptyListTextSmall}>Ponte en línea para recibir solicitudes.</Text>
            )}
        </View>
      ) : (
        <FlatList
          data={rides}
          keyExtractor={(item) => item._id}
          renderItem={renderRide}
          contentContainerStyle={styles.flatListContent}
        />
      )}
      
      <TouchableOpacity onPress={signOut} style={styles.logoutButton}>
        <Ionicons name="log-out-outline" size={24} color="#fff" />
        <Text style={styles.logoutButtonText}>Cerrar Sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1c', // Fondo oscuro
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: Platform.OS === 'ios' ? 40 : 10, // Espacio superior para iOS
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  onlineToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  online: {
    backgroundColor: '#0cf574', // Verde para online
  },
  offline: {
    backgroundColor: '#ff4d4d', // Rojo para offline
  },
  onlineToggleText: {
    color: '#fff',
    fontWeight: 'bold',
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00f0ff',
    marginBottom: 15,
  },
  loadingIndicator: {
    marginTop: 50,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginTop: 50,
  },
  emptyListText: {
    color: '#bbb',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 15,
  },
  emptyListTextSmall: {
    color: '#bbb',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00f0ff',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 20,
  },
  refreshButtonText: {
    color: '#0a0f1c',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 5,
  },
  flatListContent: {
    paddingBottom: 80, // Espacio para el botón de cerrar sesión
  },
  card: {
    backgroundColor: '#1a1f2e', // Fondo de tarjeta más oscuro
    padding: 15,
    marginVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#00f0ff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  cardText: {
    fontSize: 14,
    color: '#bbb',
    marginBottom: 3,
  },
  cardPrice: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 10,
  },
  acceptButton: {
    backgroundColor: '#00f0ff',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  acceptButtonText: {
    color: '#0a0f1c',
    fontSize: 16,
    fontWeight: 'bold',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff4d4d', // Rojo para cerrar sesión
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 20,
    position: 'absolute', // Fija el botón en la parte inferior
    bottom: 20,
    left: 20,
    right: 20,
    zIndex: 10, // Asegura que esté por encima de la lista
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
});