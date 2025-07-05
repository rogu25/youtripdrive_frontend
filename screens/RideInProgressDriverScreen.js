import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import * as Location from "expo-location";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { API_BASE_URL, Maps_API_KEY } from "../utils/config"; // Asegúrate de tener tu clave API de Google Maps aquí
import { Ionicons } from "@expo/vector-icons";

// Función para calcular la orientación del vehículo (copia de PassengerRideInProgress)
const calculateBearing = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => deg * (Math.PI / 180);
  const toDeg = (rad) => rad * (180 / Math.PI);
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const bearing = Math.atan2(y, x);
  return (toDeg(bearing) + 360) % 360;
};

const RideInProgressDriverScreen = ({ route, navigation }) => {
  const { rideId } = route.params; // Esperamos el ID del viaje, no el objeto completo
  const { user, isAuthenticated, signOut } = useAuth();
  const { socket } = useSocket();
  const mapRef = useRef(null); // Para controlar la cámara del mapa
  const locationSubscription = useRef(null); // Para la suscripción de ubicación
  const [rideDetails, setRideDetails] = useState(null); // Almacena todos los detalles del viaje
  const [driverLocation, setDriverLocation] = useState(null); // Ubicación actual del conductor
  const [loading, setLoading] = useState(true);

  // --- Funciones de Gestión de Viaje ---

  // Función para obtener los detalles completos del viaje
  const fetchRideDetails = useCallback(async () => {
    if (!isAuthenticated || !user?.token || !rideId) {
      Alert.alert("Error", "No estás autenticado o ID de viaje no válido.");
      setLoading(false);
      navigation.replace("DriverHome"); // Redirigir al DriverHome
      return;
    }
    try {
      const token = user.token;
      const response = await axios.get(`${API_BASE_URL}/rides/${rideId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const rideData = response.data;

      // Validar si el conductor actual es el asignado a este viaje
      if (rideData.driver?._id !== user.id) {
          Alert.alert("Acceso Denegado", "Este viaje no te ha sido asignado.");
          navigation.replace("DriverHome");
          return;
      }

      setRideDetails(rideData);

      // Si el viaje ya está completado o cancelado, navegar fuera
      if (rideData.status === 'completed' || rideData.status === 'cancelled') {
        Alert.alert("Viaje Finalizado", `Este viaje ya ha sido ${rideData.status}.`);
        navigation.replace("DriverHome");
        return;
      }

      // Centrar el mapa en la ubicación inicial (conductor o pasajero)
      if (mapRef.current && (rideData.origin || driverLocation)) {
          const coordsToFit = [];
          if (driverLocation) {
              coordsToFit.push(driverLocation);
          } else if (rideData.driverLocation?.coordinates?.latitude && rideData.driverLocation?.coordinates?.longitude) {
            // Usar la última ubicación conocida del conductor del backend si está disponible
            setDriverLocation({
              latitude: rideData.driverLocation.coordinates.latitude,
              longitude: rideData.driverLocation.coordinates.longitude,
            });
            coordsToFit.push({ latitude: rideData.driverLocation.coordinates.latitude, longitude: rideData.driverLocation.coordinates.longitude });
          }

          if (rideData.origin?.latitude && rideData.origin?.longitude) {
              coordsToFit.push({ latitude: rideData.origin.latitude, longitude: rideData.origin.longitude });
          }
          if (rideData.destination?.latitude && rideData.destination?.longitude && rideData.status === 'in_progress') {
              coordsToFit.push({ latitude: rideData.destination.latitude, longitude: rideData.destination.longitude });
          }

          if (coordsToFit.length > 0) {
              mapRef.current.fitToCoordinates(coordsToFit, {
                  edgePadding: { top: 100, right: 50, bottom: 50, left: 50 },
                  animated: true,
              });
          }
      }

    } catch (err) {
      console.error("Error obteniendo detalles del viaje para conductor:", err.response?.data?.message || err.message);
      if (err.response?.status === 401) {
        Alert.alert("Sesión Caducada", "Por favor, inicia sesión de nuevo.");
        signOut();
      } else {
        Alert.alert("Error", "No se pudieron cargar los detalles del viaje. Es posible que el viaje ya no exista.");
        navigation.replace("DriverHome");
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user, rideId, navigation, signOut, driverLocation]);

  // Función para iniciar el seguimiento de ubicación
  const startLocationTracking = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permiso de ubicación denegado", "No podemos rastrear tu ubicación. Esto es necesario para el viaje.");
      // Considerar navegar fuera si no se da permiso
      return;
    }

    if (!socket) {
        console.warn("Socket no conectado para tracking de ubicación.");
        return;
    }

    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000, // Cada 5 segundos
        distanceInterval: 10, // O cada 10 metros
      },
      (location) => {
        const { latitude, longitude } = location.coords;
        setDriverLocation({ latitude, longitude }); // Actualizar estado local

        // Emitir ubicación al backend a través de socket
        socket.emit('driver_location_update', {
          driverId: user._id,
          coordinates: { latitude, longitude },
          rideId: rideDetails?._id, // Enviar el rideId para asociar la ubicación al viaje
        });
      }
    );
  }, [socket, user, rideDetails]);

  // Manejadores de estado del viaje
  const updateRideStatus = useCallback(async (newStatus, alertMessage) => {
    if (!rideDetails || !user?.token) return;
    try {
      const token = user.token;
      await axios.patch(
        `${API_BASE_URL}/rides/status/${rideDetails._id}`,
        { status: newStatus },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setRideDetails(prev => ({ ...prev, status: newStatus })); // Actualizar estado local

      // Emitir evento de socket para notificar al pasajero y al sistema
      if (socket) {
        socket.emit('ride_status_update', {
          rideId: rideDetails._id,
          status: newStatus,
          passengerId: rideDetails.passenger?._id, // Enviar ID del pasajero
        });
        if (newStatus === 'in_progress') {
            socket.emit('ride_started', { rideId: rideDetails._id, passengerId: rideDetails.passenger?._id });
        } else if (newStatus === 'completed') {
            socket.emit('ride_completed', { rideId: rideDetails._id, passengerId: rideDetails.passenger?._id });
        } else if (newStatus === 'cancelled') {
            socket.emit('ride_cancelled_by_driver', { rideId: rideDetails._id, passengerId: rideDetails.passenger?._id });
        }
      }

      Alert.alert("Éxito", alertMessage);
      if (newStatus === 'completed' || newStatus === 'cancelled') {
          navigation.replace("DriverHome");
      }
    } catch (err) {
      console.error(`Error actualizando estado a ${newStatus}:`, err.response?.data?.message || err.message);
      Alert.alert("Error", `No se pudo ${alertMessage.toLowerCase()}.`);
    }
  }, [rideDetails, user, socket, navigation]);


  const handlePickedUpPassenger = () => {
    Alert.alert(
      "Confirmar Recogida",
      "¿Has recogido al pasajero y estás listo para iniciar el viaje?",
      [
        { text: "No", style: "cancel" },
        { text: "Sí", onPress: () => updateRideStatus("in_progress", "Viaje iniciado.") },
      ]
    );
  };

  const handleFinishRide = () => {
    Alert.alert(
      "Finalizar Viaje",
      "¿Estás seguro de que quieres finalizar el viaje?",
      [
        { text: "No", style: "cancel" },
        { text: "Sí", onPress: () => updateRideStatus("completed", "Viaje finalizado.") },
      ]
    );
  };

  const handleCancelRide = () => {
    Alert.alert(
      "Cancelar Viaje",
      "¿Estás seguro de que quieres cancelar este viaje? Esto notificará al pasajero.",
      [
        { text: "No", style: "cancel" },
        { text: "Sí", onPress: () => updateRideStatus("cancelled", "Viaje cancelado.") },
      ]
    );
  };

  // --- useEffects ---
  useEffect(() => {
    fetchRideDetails(); // Cargar detalles del viaje al montar
  }, [fetchRideDetails]);

  useEffect(() => {
    // Iniciar o detener el seguimiento de ubicación según el estado del viaje
    if (rideDetails && (rideDetails.status === 'accepted' || rideDetails.status === 'in_progress')) {
      startLocationTracking();
    } else {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
    }

    return () => {
      // Limpiar suscripción de ubicación al desmontar o al cambiar las dependencias
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
    };
  }, [rideDetails, startLocationTracking]); // Se ejecuta cuando rideDetails o startLocationTracking cambian

  useEffect(() => {
    // Escuchar eventos de socket relevantes para el conductor en este viaje
    if (!socket || !rideDetails || !user?.id) return;

    // Si el pasajero cancela el viaje
    socket.on('ride_cancelled_by_passenger', (data) => {
        if (data.rideId === rideDetails._id) {
            Alert.alert("Viaje Cancelado", "El pasajero ha cancelado el viaje.");
            setRideDetails(prev => ({ ...prev, status: 'cancelled' })); // Actualiza el estado local
            navigation.replace("DriverHome");
        }
    });

    // En caso de que el backend cambie el estado por alguna razón (ej. timeout, error)
    socket.on('ride_status_update', (data) => {
        if (data.rideId === rideDetails._id && data.status !== rideDetails.status) {
            console.log(`Estado del viaje ${data.rideId} actualizado a: ${data.status}`);
            setRideDetails(prev => ({ ...prev, status: data.status }));
            if (data.status === 'completed' || data.status === 'cancelled') {
                Alert.alert("Viaje Finalizado", `El viaje ha sido ${data.status}.`);
                navigation.replace("DriverHome");
            }
        }
    });

    return () => {
      // Limpiar listeners del socket
      socket.off('ride_cancelled_by_passenger');
      socket.off('ride_status_update');
    };
  }, [socket, rideDetails, user, navigation]);


  // --- Renderizado ---
  if (loading || !rideDetails) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#00f0ff" />
        <Text style={styles.loadingText}>Cargando detalles del viaje...</Text>
      </View>
    );
  }

  // Si rideDetails está presente pero el estado es finalizado/cancelado, ya deberíamos haber navegado.
  // Esto es una salvaguarda.
  if (rideDetails.status === 'completed' || rideDetails.status === 'cancelled') {
    return null;
  }

  const originCoords = rideDetails.origin
    ? { latitude: rideDetails.origin.latitude, longitude: rideDetails.origin.longitude }
    : null;
  const destinationCoords = rideDetails.destination
    ? { latitude: rideDetails.destination.latitude, longitude: rideDetails.destination.longitude }
    : null;

  const initialMapRegion = driverLocation || originCoords || { latitude: 0, longitude: 0 };

  return (
    <View style={styles.container}>
      <Text style={styles.headerText}>
        Viaje con {rideDetails.passenger?.name || "Pasajero"}
      </Text>
      <Text style={styles.statusText}>
        Estado: {rideDetails.status?.toUpperCase().replace('_', ' ')}
      </Text>

      {initialMapRegion.latitude !== 0 ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: initialMapRegion.latitude,
            longitude: initialMapRegion.longitude,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          }}
          showsUserLocation={true} // Mostrar la ubicación del conductor
          followsUserLocation={true} // El mapa sigue al conductor
          loadingEnabled // Muestra un indicador de carga del mapa
        >
          {/* Marcador del Pasajero (Origen) */}
          {originCoords && (
            <Marker
              coordinate={originCoords}
              title="Recoger Pasajero Aquí"
              pinColor="green"
            />
          )}

          {/* Marcador del Destino */}
          {destinationCoords && (
            <Marker
              coordinate={destinationCoords}
              title="Destino del Viaje"
              pinColor="red"
            />
          )}

          {/* Marcador del Conductor (Tú) */}
          {driverLocation && (
            <Marker
              coordinate={driverLocation}
              title="Tu Ubicación"
              anchor={{ x: 0.5, y: 0.5 }} // Centrar el icono
            >
              <Image
                source={require("../assets/car-icon.png")} // Un icono de coche específico para el conductor
                style={{
                  width: 40,
                  height: 40,
                  transform: [{
                      rotate: `${calculateBearing(
                          driverLocation.prevLatitude || driverLocation.latitude,
                          driverLocation.prevLongitude || driverLocation.longitude,
                          driverLocation.latitude,
                          driverLocation.longitude
                      )}deg`
                  }],
                }}
                resizeMode="contain"
              />
            </Marker>
          )}

          {/* Ruta del conductor al origen del pasajero (cuando el viaje está 'accepted') */}
          {driverLocation && originCoords && rideDetails.status === 'accepted' && Maps_API_KEY && (
              <MapViewDirections
                  origin={driverLocation}
                  destination={originCoords}
                  apikey={Maps_API_KEY}
                  strokeWidth={4}
                  strokeColor="blue"
                  optimizeWaypoints={true}
                  onReady={result => {
                      if (mapRef.current) {
                          mapRef.current.fitToCoordinates(result.coordinates, {
                              edgePadding: { top: 100, right: 50, bottom: 50, left: 50 },
                              animated: true,
                          });
                      }
                  }}
                  onError={(error) => console.log('Error al trazar ruta al pasajero:', error)}
              />
          )}

          {/* Ruta del origen al destino (cuando el viaje está 'in_progress') */}
          {originCoords && destinationCoords && rideDetails.status === 'in_progress' && Maps_API_KEY && (
              <MapViewDirections
                  origin={driverLocation || originCoords} // Inicia desde la ubicación actual del conductor o el origen si no hay driverLocation
                  destination={destinationCoords}
                  apikey={Maps_API_KEY}
                  strokeWidth={4}
                  strokeColor="#0cf574"
                  optimizeWaypoints={true}
                  onReady={result => {
                      if (mapRef.current) {
                          mapRef.current.fitToCoordinates(result.coordinates, {
                              edgePadding: { top: 100, right: 50, bottom: 50, left: 50 },
                              animated: true,
                          });
                      }
                  }}
                  onError={(error) => console.log('Error al trazar ruta al destino:', error)}
              />
          )}

        </MapView>
      ) : (
        <View style={styles.centeredMapContainer}>
          <Text style={styles.loadingText}>Esperando datos de ubicación para el mapa...</Text>
        </View>
      )}

      <View style={styles.bottomPanel}>
        <Text style={styles.infoText}>Pasajero: {rideDetails.passenger?.name}</Text>
        {rideDetails.status === 'accepted' && (
            <Text style={styles.statusMessage}>Dirígete a recoger al pasajero.</Text>
        )}
        {rideDetails.status === 'in_progress' && (
            <Text style={styles.statusMessage}>Viaje en curso hacia el destino.</Text>
        )}
        
        <View style={styles.buttonContainer}>
          {rideDetails.status === "accepted" && (
            <TouchableOpacity
              style={[styles.actionButton, styles.pickupButton]}
              onPress={handlePickedUpPassenger}
            >
              <Ionicons name="car-sport-outline" size={20} color="#0a0f1c" />
              <Text style={styles.actionButtonText}>Pasajero Recogido</Text>
            </TouchableOpacity>
          )}

          {rideDetails.status === "in_progress" && (
            <TouchableOpacity
              style={[styles.actionButton, styles.finishButton]}
              onPress={handleFinishRide}
            >
              <Ionicons name="flag-outline" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Finalizar Viaje</Text>
            </TouchableOpacity>
          )}

          {(rideDetails.status === "accepted" || rideDetails.status === "in_progress") && (
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={handleCancelRide}
            >
              <Ionicons name="close-circle-outline" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Cancelar Viaje</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.chatButton}
          onPress={() => navigation.navigate("RideChat", {
            rideId: rideDetails._id,
            userId: user.id, // ID del conductor
            userName: user.name, // Nombre del conductor
            passengerId: rideDetails.passenger?._id,
            passengerName: rideDetails.passenger?.name,
          })}
        >
          <Ionicons name="chatbubbles-outline" size={20} color="#0a0f1c" />
          <Text style={styles.chatButtonText}>Abrir Chat</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1c',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0f1c',
  },
  centeredMapContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1f2e',
  },
  loadingText: {
    marginTop: 10,
    color: '#fff',
    fontSize: 16,
  },
  headerText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    paddingVertical: 15,
    backgroundColor: '#1a1f2e',
  },
  statusText: {
    fontSize: 18,
    color: '#00f0ff',
    textAlign: 'center',
    paddingBottom: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  map: {
    flex: 1,
    width: '100%',
  },
  bottomPanel: {
    position: "absolute",
    bottom: 0, // Ajustar para ocupar todo el ancho
    left: 0,
    right: 0,
    backgroundColor: '#1a1f2e',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 10,
    alignItems: 'center', // Centrar los elementos horizontalmente
  },
  infoText: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 5,
    textAlign: 'center',
  },
  statusMessage: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0cf574',
    marginBottom: 15,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 10,
    marginBottom: 15,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 10,
    flex: 1, // Para que ocupen el espacio disponible
    marginHorizontal: 5,
  },
  pickupButton: {
    backgroundColor: '#00f0ff', // Azul cian
  },
  finishButton: {
    backgroundColor: '#0cf574', // Verde
  },
  cancelButton: {
    backgroundColor: '#ff4d4d', // Rojo
  },
  actionButtonText: {
    color: '#0a0f1c', // Color para los botones de acción
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5c518', // Amarillo para chat
    paddingVertical: 12,
    borderRadius: 10,
    width: '100%',
    marginTop: 10,
  },
  chatButtonText: {
    color: '#0a0f1c',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});

export default RideInProgressDriverScreen;