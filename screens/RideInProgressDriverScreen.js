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
import MapView, { Marker } from "react-native-maps"; // Polyline no es necesario si usas MapViewDirections
import MapViewDirections from "react-native-maps-directions";
import * as Location from "expo-location";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { API_BASE_URL, Maps_API_KEY } from "../utils/config";
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
  const { rideId } = route.params;
  const { user, isAuthenticated, signOut } = useAuth();
  const { socket } = useSocket();
  const mapRef = useRef(null);
  const locationSubscription = useRef(null);
  const [rideDetails, setRideDetails] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- Funciones de Gestión de Viaje ---

  // Función para obtener los detalles completos del viaje
  const fetchRideDetails = useCallback(async () => {
    if (!isAuthenticated || !user?.token || !rideId) {
      Alert.alert("Error", "No estás autenticado o ID de viaje no válido.");
      setLoading(false);
      navigation.replace("DriverHome");
      return;
    }
    try {
      const token = user.token;
      const response = await axios.get(`${API_BASE_URL}/rides/${rideId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const rideData = response.data;

      if (rideData.driver?._id !== user.id) {
        Alert.alert("Acceso Denegado", "Este viaje no te ha sido asignado.");
        navigation.replace("DriverHome");
        return;
      }

      setRideDetails(rideData);

      if (rideData.status === 'finalizado' || rideData.status === 'cancelado') {
        Alert.alert("Viaje Finalizado", `Este viaje ya ha sido ${rideData.status}.`);
        navigation.replace("DriverHome");
        return;
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
  }, [isAuthenticated, user, rideId, navigation, signOut]); // Eliminado driverLocation de aquí, ya que fetchRideDetails no lo necesita para cargar los detalles.

  // Función para iniciar el seguimiento de ubicación
  // rideDetails._id se necesita aquí, así que 'rideDetails' debe ser una dependencia.
  // Pero necesitamos asegurarnos de que rideDetails no sea null.
  const startLocationTracking = useCallback(async () => {
    if (!socket || !user?.id || !rideDetails?._id) { // Añadimos chequeo explícito de rideDetails._id
      console.warn("No se puede iniciar el tracking: socket, user.id o rideDetails._id es nulo/indefinido.");
      return;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permiso de ubicación denegado", "No podemos rastrear tu ubicación. Esto es necesario para el viaje.");
      return;
    }

    // Si ya existe una suscripción, la eliminamos para evitar duplicados
    if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
    }

    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 10,
      },
      (location) => {
        const { latitude, longitude } = location.coords;
        setDriverLocation(prevLocation => {
          const newDriverLocation = {
            latitude,
            longitude,
            prevLatitude: prevLocation ? prevLocation.latitude : latitude, // Guardar la ubicación previa para el cálculo del bearing
            prevLongitude: prevLocation ? prevLocation.longitude : longitude,
          };
          // Emitir ubicación al backend a través de socket
          socket.emit('driver_location_update', {
            driverId: user.id,
            coordinates: { latitude, longitude },
            rideId: rideDetails._id, // rideDetails._id ya está garantizado por la guarda inicial
          });
          return newDriverLocation;
        });
      }
    );
  }, [socket, user, rideDetails]); // `rideDetails` es una dependencia porque se usa `rideDetails._id` en el `socket.emit`


  // Manejadores de estado del viaje
  const updateRideStatus = useCallback(async (newStatus, alertMessage) => {
    // console.log("rideDetails en updateRideStatus:", rideDetails); // Ahora este log debería mostrar el objeto
    if (!rideDetails || !user?.token) {
        // console.log("Guardia activada en updateRideStatus: rideDetails o token faltante.");
        return;
    }
    try {
      const token = user.token;
      await axios.put(
        `${API_BASE_URL}/rides/status/${rideDetails._id}`,
        { status: newStatus },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setRideDetails(prev => ({ ...prev, status: newStatus })); // Actualizar estado local

      if (socket) {
        socket.emit('ride_status_update', {
          rideId: rideDetails._id,
          status: newStatus,
          passengerId: rideDetails.passenger?._id,
        });
        if (newStatus === 'en_curso') {
            socket.emit('ride_started', { rideId: rideDetails._id, passengerId: rideDetails.passenger?._id });
        } else if (newStatus === 'finalizado') {
            socket.emit('ride_completed', { rideId: rideDetails._id, passengerId: rideDetails.passenger?._id });
        } else if (newStatus === 'cancelado') {
            socket.emit('ride_cancelled_by_driver', { rideId: rideDetails._id, passengerId: rideDetails.passenger?._id });
        }
      }

      Alert.alert("Éxito", alertMessage);
      if (newStatus === 'finalizado' || newStatus === 'cancelado') {
          navigation.replace("DriverHome");
      }
    } catch (err) {
      console.error(`Error actualizando estado a ${newStatus}:`, err.response?.data?.message || err.message);
      Alert.alert("Error", `No se pudo ${alertMessage.toLowerCase()}.`);
    }
  }, [rideDetails, user, socket, navigation]);


  const handlePickedUpPassenger = useCallback(() => {
    Alert.alert(
      "Confirmar Recogida",
      "¿Has recogido al pasajero y estás listo para iniciar el viaje?",
      [
        { text: "No", style: "cancel" },
        { text: "Sí", onPress: () => updateRideStatus("en_curso", "Viaje iniciado.") },
      ]
    );
  }, [updateRideStatus]); // updateRideStatus es una dependencia ya que se usa aquí

  const handleFinishRide = useCallback(() => {
    Alert.alert(
      "Finalizar Viaje",
      "¿Estás seguro de que quieres finalizar el viaje?",
      [
        { text: "No", style: "cancel" },
        { text: "Sí", onPress: () => updateRideStatus("finalizado", "Viaje finalizado.") },
      ]
    );
  }, [updateRideStatus]);

  const handleCancelRide = useCallback(() => {
    Alert.alert(
      "Cancelar Viaje",
      "¿Estás seguro de que quieres cancelar este viaje? Esto notificará al pasajero.",
      [
        { text: "No", style: "cancel" },
        { text: "Sí", onPress: () => updateRideStatus("cancelado", "Viaje cancelado.") },
      ]
    );
  }, [updateRideStatus]);

  // --- useEffects ---

  // 1. Cargar detalles del viaje al montar o cuando cambian rideId/user
  useEffect(() => {
    fetchRideDetails();
  }, [fetchRideDetails]); // fetchRideDetails es una dependencia porque es un useCallback

  // 2. Iniciar/Detener seguimiento de ubicación y ajuste del mapa
  // Este useEffect debe reaccionar a rideDetails, ya que 'status' y 'origin/destination' son cruciales.
  // También debe reaccionar a driverLocation para ajustar el mapa cuando la ubicación del conductor se actualice.
  useEffect(() => {
      // Ajustar la cámara del mapa
      if (mapRef.current && rideDetails) {
          const coordsToFit = [];
          if (driverLocation) {
              coordsToFit.push(driverLocation);
          } else if (rideDetails.driverLocation?.coordinates?.latitude && rideDetails.driverLocation?.coordinates?.longitude) {
              // Usar la última ubicación conocida del conductor del backend si está disponible
              setDriverLocation({
                  latitude: rideDetails.driverLocation.coordinates.latitude,
                  longitude: rideDetails.driverLocation.coordinates.longitude,
              });
              coordsToFit.push({ latitude: rideDetails.driverLocation.coordinates.latitude, longitude: rideDetails.driverLocation.coordinates.longitude });
          }

          if (rideDetails.origin?.latitude && rideDetails.origin?.longitude) {
              coordsToFit.push({ latitude: rideDetails.origin.latitude, longitude: rideDetails.origin.longitude });
          }
          if (rideDetails.destination?.latitude && rideDetails.destination?.longitude && rideDetails.status === 'en_curso') {
              coordsToFit.push({ latitude: rideDetails.destination.latitude, longitude: rideDetails.destination.longitude });
          }

          if (coordsToFit.length > 0) {
              mapRef.current.fitToCoordinates(coordsToFit, {
                  edgePadding: { top: 100, right: 50, bottom: 50, left: 50 },
                  animated: true,
              });
          }
      }

      // Iniciar o detener el seguimiento de ubicación
      if (rideDetails && (rideDetails.status === 'aceptado' || rideDetails.status === 'en_curso')) {
          startLocationTracking();
      } else {
          // Si el viaje no está 'aceptado' o 'en_curso', detener el tracking
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
  }, [rideDetails, startLocationTracking, driverLocation]); // driverLocation se incluye para reajustar el mapa al cambiar la ubicación del conductor.

  // 3. Escuchar eventos de socket
  useEffect(() => {
    if (!socket || !rideDetails || !user?.id) return;

    socket.on('ride_cancelled_by_passenger', (data) => {
        if (data.rideId === rideDetails._id) {
          Alert.alert("Viaje Cancelado", "El pasajero ha cancelado el viaje.");
          setRideDetails(prev => ({ ...prev, status: 'cancelado' }));
          navigation.replace("DriverHome");
        }
    });

    socket.on('ride_status_update', (data) => {
        if (data.rideId === rideDetails._id && data.status !== rideDetails.status) {
          console.log(`Estado del viaje ${data.rideId} actualizado a: ${data.status}`);
          setRideDetails(prev => ({ ...prev, status: data.status }));
          if (data.status === 'finalizado' || data.status === 'cancelado') {
              Alert.alert("Viaje Finalizado", `El viaje ha sido ${data.status}.`);
              navigation.replace("DriverHome");
          }
        }
    });

    return () => {
      socket.off('ride_cancelled_by_passenger');
      socket.off('ride_status_update');
    };
  }, [socket, rideDetails, user, navigation]); // rideDetails es una dependencia para que los listeners se re-establezcan si el rideDetails._id cambia (aunque no debería en esta pantalla)

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
  if (rideDetails.status === 'finalizado' || rideDetails.status === 'cancelado') {
    return null; // No renderizar nada si ya se está redirigiendo
  }

  const originCoords = rideDetails.origin
    ? { latitude: rideDetails.origin.latitude, longitude: rideDetails.origin.longitude }
    : null;
  const destinationCoords = rideDetails.destination
    ? { latitude: rideDetails.destination.latitude, longitude: rideDetails.destination.longitude }
    : null;

  const initialMapRegion = driverLocation || originCoords || { latitude: -16.40904, longitude: -71.53745 }; // Default a un lugar conocido si no hay ubicación

  return (
    <View style={styles.container}>
      <Text style={styles.headerText}>
        Viaje con {rideDetails.passenger?.name || "Pasajero"}
      </Text>
      <Text style={styles.statusText}>
        Estado: {rideDetails.status?.toUpperCase().replace('_', ' ')}
      </Text>

      {/* Condición para renderizar el mapa solo si hay coordenadas iniciales válidas */}
      {initialMapRegion.latitude !== -16.40904 || initialMapRegion.longitude !== -71.53745 || (driverLocation || originCoords) ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: initialMapRegion.latitude,
            longitude: initialMapRegion.longitude,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          }}
          showsUserLocation={true}
          followsUserLocation={true}
          loadingEnabled
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
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <Image
                source={require("../assets/car-icon.png")}
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

          {/* Ruta del conductor al origen del pasajero (cuando el viaje está 'aceptado') */}
          {driverLocation && originCoords && rideDetails.status === 'aceptado' && Maps_API_KEY && (
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

          {/* Ruta del origen al destino (cuando el viaje está 'en_curso') */}
          {originCoords && destinationCoords && rideDetails.status === 'en_curso' && Maps_API_KEY && (
              <MapViewDirections
                  origin={driverLocation || originCoords}
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
        {rideDetails.status === 'aceptado' && (
            <Text style={styles.statusMessage}>Dirígete a recoger al pasajero.</Text>
        )}
        {rideDetails.status === 'en_curso' && (
            <Text style={styles.statusMessage}>Viaje en curso hacia el destino.</Text>
        )}

        <View style={styles.buttonContainer}>
          {rideDetails.status === "aceptado" && (
            <TouchableOpacity
              style={[styles.actionButton, styles.pickupButton]}
              onPress={handlePickedUpPassenger}
            >
              <Ionicons name="car-sport-outline" size={20} color="#0a0f1c" />
              <Text style={styles.actionButtonText}>Pasajero Recogido</Text>
            </TouchableOpacity>
          )}

          {rideDetails.status === "en_curso" && (
            <TouchableOpacity
              style={[styles.actionButton, styles.finishButton]}
              onPress={handleFinishRide}
            >
              <Ionicons name="flag-outline" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Finalizar Viaje</Text>
            </TouchableOpacity>
          )}

          {(rideDetails.status === "aceptado" || rideDetails.status === "en_curso") && (
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
            userId: user.id,
            userName: user.name,
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
    bottom: 0,
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
    alignItems: 'center',
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
    flex: 1,
    marginHorizontal: 5,
  },
  pickupButton: {
    backgroundColor: '#00f0ff',
  },
  finishButton: {
    backgroundColor: '#0cf574',
  },
  cancelButton: {
    backgroundColor: '#ff4d4d',
  },
  actionButtonText: {
    color: '#0a0f1c',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5c518',
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