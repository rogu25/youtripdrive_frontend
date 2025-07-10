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
import MapView, { Marker } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import * as Location from "expo-location";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { API_BASE_URL, Maps_API_KEY } from "../utils/config";
import { Ionicons } from "@expo/vector-icons";

// Función para calcular la orientación del vehículo
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
      // <<< AJUSTE: Mensaje más específico si falta información crítica >>>
      Alert.alert("Error", "Información de sesión o viaje no válida. Por favor, reinicia la app.");
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

      // <<< MODIFICACIÓN: Chequeo de asignación del conductor >>>
      if (rideData.driver?._id !== user.id) {
        Alert.alert("Acceso Denegado", "Este viaje no te ha sido asignado o ya no está activo para ti.");
        navigation.replace("DriverHome");
        return;
      }

      setRideDetails(rideData);

      // <<< MODIFICACIÓN: Redirección inmediata si el viaje ya está finalizado/cancelado >>>
      if (rideData.status === 'finalizado' || rideData.status === 'cancelado') {
        Alert.alert("Viaje No Válido", `Este viaje ya ha sido ${rideData.status}.`);
        navigation.replace("DriverHome");
        return;
      }

    } catch (err) {
      console.error("❌ Error obteniendo detalles del viaje para conductor:", err.response?.data?.message || err.message, err.status);
      if (err.response?.status === 401) {
        Alert.alert("Sesión Caducada", "Por favor, inicia sesión de nuevo.");
        signOut(); // Forzar cierre de sesión
      } else if (err.response?.status === 403 || err.response?.status === 404) {
          // Ya manejado por el chequeo de "Acceso Denegado" o "Viaje No Válido"
          // O si el viaje no existe.
          Alert.alert("Error", err.response?.data?.message || "No se pudo cargar el viaje. Puede que no exista o no te pertenezca.");
          navigation.replace("DriverHome");
      }
      else {
        Alert.alert("Error", "No se pudieron cargar los detalles del viaje.");
        navigation.replace("DriverHome");
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user, rideId, navigation, signOut]);

  // Función para iniciar el seguimiento de ubicación
  const startLocationTracking = useCallback(async () => {
    // <<< AJUSTE: `user.id` en lugar de `user?.id` si ya se validó que `user` existe.
    // También `rideDetails._id` en lugar de `rideDetails?._id`. >>>
    if (!socket || !user?.id || !rideDetails?._id) {
      console.warn("No se puede iniciar el tracking: socket, user.id o rideDetails._id es nulo/indefinido. Esto es normal si se llama antes de cargar `rideDetails`.");
      return;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permiso de ubicación denegado", "No podemos rastrear tu ubicación. Esto es necesario para el viaje.");
      // Opcional: Navegar a DriverHome si no se otorgan permisos críticos
      return;
    }

    // Si ya existe una suscripción, la eliminamos para evitar duplicados
    if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
    }

    console.log("🟢 Iniciando seguimiento de ubicación para el viaje.");
    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000, // Cada 5 segundos
        distanceInterval: 10, // O cada 10 metros
      },
      (location) => {
        const { latitude, longitude } = location.coords;
        setDriverLocation(prevLocation => {
          const newDriverLocation = {
            latitude,
            longitude,
            prevLatitude: prevLocation ? prevLocation.latitude : latitude,
            prevLongitude: prevLocation ? prevLocation.longitude : longitude,
          };
          // Emitir ubicación al backend a través de socket
          socket.emit('driver_location_update', {
            driverId: user.id, // ID del conductor
            coordinates: { latitude, longitude },
            rideId: rideDetails._id, // ID del viaje actual
          });
          return newDriverLocation;
        });
      }
    );
  }, [socket, user, rideDetails]); // `rideDetails` es una dependencia para acceder a `_id`

  // Manejadores de estado del viaje
  const updateRideStatus = useCallback(async (newStatus, alertMessage) => {
    if (!rideDetails || !user?.token) {
        Alert.alert("Error", "No se pudo actualizar el estado. Datos del viaje o token de usuario faltantes.");
        return;
    }
    try {
      const token = user.token;
      console.log(`📡 Intentando actualizar estado del viaje ${rideDetails._id} a: ${newStatus}`);
      const response = await axios.put(
        // <<< AJUSTE: La ruta debe ser la misma que definimos en el backend (`/rides/:rideId/status`) >>>
        `${API_BASE_URL}/rides/${rideDetails._id}/status`,
        { status: newStatus },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Si el backend responde con el viaje actualizado, lo usamos.
      setRideDetails(response.data.ride); // Usar los datos del viaje devueltos por el backend

      // <<< AJUSTE: Emitir evento genérico `ride_status_update` para que el pasajero lo reciba
      // y luego el frontend del pasajero decida qué hacer con el nuevo estado.
      // Los eventos específicos como 'ride_started' o 'ride_completed' pueden ser redundantes
      // si `ride_status_update` maneja todos los casos.
      // Sin embargo, si tu lógica de backend los emite, está bien que tu frontend los escuche.
      // Aquí, solo emitimos `ride_status_update` y el ID del pasajero. >>>
      if (socket) {
        socket.emit('ride_status_update', {
          rideId: rideDetails._id,
          status: newStatus,
          passengerId: rideDetails.passenger?._id, // Asegurarse de que passenger existe
          // También puedes enviar datos adicionales relevantes para el pasajero, como la ubicación del conductor
          driverLocation: driverLocation,
        });
        console.log(`📡 Emitted ride_status_update for ride ${rideDetails._id} to passenger ${rideDetails.passenger?._id} with status: ${newStatus}`);
      }

      Alert.alert("Éxito", alertMessage);
      // Redirigir solo si el viaje ha finalizado o cancelado
      if (newStatus === 'finalizado' || newStatus === 'cancelado') {
          navigation.replace("DriverHome");
      }
    } catch (err) {
      console.error(`❌ Error actualizando estado a ${newStatus}:`, err.response?.data || err.message);
      Alert.alert("Error", err.response?.data?.message || `No se pudo ${alertMessage.toLowerCase()}.`);
      // Opcional: Si el error indica que el viaje ya no existe o fue cancelado por el pasajero
      if (err.response?.status === 400 || err.response?.status === 404) {
          fetchRideDetails(); // Intentar recargar para obtener el estado actual
      }
    }
  }, [rideDetails, user, socket, navigation, driverLocation]); // Añadir driverLocation si se envía en el socket event

  // Manejadores de botones para el flujo de estado (recogido -> en_ruta -> finalizado)
  const handleMarkPickedUp = useCallback(() => {
    Alert.alert(
      "Confirmar Recogida",
      "¿Has recogido al pasajero en el punto de origen?",
      [
        { text: "No", style: "cancel" },
        // <<< MODIFICACIÓN: Cambiar estado a 'recogido' >>>
        { text: "Sí", onPress: () => updateRideStatus("recogido", "Pasajero recogido.") },
      ]
    );
  }, [updateRideStatus]);

  const handleStartRide = useCallback(() => {
    Alert.alert(
      "Iniciar Viaje",
      "¿Estás listo para iniciar el viaje hacia el destino?",
      [
        { text: "No", style: "cancel" },
        // <<< MODIFICACIÓN: Cambiar estado a 'en_ruta' >>>
        { text: "Sí", onPress: () => updateRideStatus("en_ruta", "Viaje iniciado hacia el destino.") },
      ]
    );
  }, [updateRideStatus]);

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
  }, [fetchRideDetails]);

  // 2. Iniciar/Detener seguimiento de ubicación y ajuste del mapa
  // Este useEffect debe reaccionar a rideDetails, ya que 'status' y 'origin/destination' son cruciales.
  useEffect(() => {
    // Iniciar o detener el seguimiento de ubicación
    // <<< MODIFICACIÓN: El tracking solo se activa si el estado es 'aceptado', 'recogido' o 'en_ruta' >>>
    if (rideDetails && ['aceptado', 'recogido', 'en_ruta'].includes(rideDetails.status)) {
        startLocationTracking();
    } else {
        // Si el viaje no está en un estado activo, detener el tracking
        if (locationSubscription.current) {
            console.log("🛑 Deteniendo seguimiento de ubicación.");
            locationSubscription.current.remove();
            locationSubscription.current = null;
        }
    }

    // Limpiar suscripción de ubicación al desmontar o al cambiar las dependencias
    return () => {
        if (locationSubscription.current) {
            locationSubscription.current.remove();
            locationSubscription.current = null;
        }
    };
  }, [rideDetails, startLocationTracking]); // Solo `rideDetails` y `startLocationTracking`

  // 3. Ajustar la cámara del mapa cuando las ubicaciones o el estado cambian
  useEffect(() => {
    if (!mapRef.current || !rideDetails) return;

    const coordsToFit = [];

    // Priorizar la ubicación en tiempo real del conductor
    if (driverLocation) {
        coordsToFit.push(driverLocation);
    } else if (rideDetails.driverLocation?.latitude && rideDetails.driverLocation?.longitude) {
        // Usar la última ubicación conocida del conductor del backend si está disponible (al inicio)
        // Y establecerla en driverLocation para que sea el punto de partida del tracking
        setDriverLocation({
            latitude: rideDetails.driverLocation.latitude,
            longitude: rideDetails.driverLocation.longitude,
            prevLatitude: rideDetails.driverLocation.latitude, // Inicializar prev con la misma ubicación
            prevLongitude: rideDetails.driverLocation.longitude,
        });
        coordsToFit.push({ latitude: rideDetails.driverLocation.latitude, longitude: rideDetails.driverLocation.longitude });
    }

    if (rideDetails.origin?.latitude && rideDetails.origin?.longitude) {
        coordsToFit.push({ latitude: rideDetails.origin.latitude, longitude: rideDetails.origin.longitude });
    }

    // Solo añadir el destino si el viaje está 'en_ruta'
    if (rideDetails.destination?.latitude && rideDetails.destination?.longitude && rideDetails.status === 'en_ruta') {
        coordsToFit.push({ latitude: rideDetails.destination.latitude, longitude: rideDetails.destination.longitude });
    }

    if (coordsToFit.length > 0) {
        mapRef.current.fitToCoordinates(coordsToFit, {
            edgePadding: { top: 100, right: 50, bottom: 50, left: 50 },
            animated: true,
        });
    }
  }, [rideDetails, driverLocation]); // Reajustar cuando cambian los detalles del viaje o la ubicación del conductor

  // 4. Escuchar eventos de socket del pasajero
  useEffect(() => {
    if (!socket || !rideDetails || !user?.id) return;

    const handleRideCancelledByPassenger = (data) => {
        if (data.rideId === rideDetails._id) {
            Alert.alert("Viaje Cancelado", "El pasajero ha cancelado el viaje.");
            setRideDetails(prev => ({ ...prev, status: 'cancelado' }));
            navigation.replace("DriverHome");
        }
    };

    const handleRideStatusUpdate = (data) => {
        if (data.rideId === rideDetails._id && data.status !== rideDetails.status) {
            console.log(`Estado del viaje ${data.rideId} actualizado por socket a: ${data.status}`);
            setRideDetails(prev => ({ ...prev, status: data.status }));
            if (data.status === 'finalizado' || data.status === 'cancelado') {
                Alert.alert("Info del Viaje", `El viaje ha sido ${data.status}.`);
                navigation.replace("DriverHome");
            }
        }
    };

    socket.on('ride_cancelled_by_passenger', handleRideCancelledByPassenger);
    socket.on('ride_status_update', handleRideStatusUpdate); // Escuchar actualizaciones desde el propio backend si se emiten

    return () => {
      socket.off('ride_cancelled_by_passenger', handleRideCancelledByPassenger);
      socket.off('ride_status_update', handleRideStatusUpdate);
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

  // Ya manejamos la redirección si el estado es finalizado/cancelado en fetchRideDetails y en los listeners.
  // Esto es una salvaguarda, pero idealmente no debería ser alcanzado.
  if (rideDetails.status === 'finalizado' || rideDetails.status === 'cancelado') {
    return null;
  }

  const originCoords = rideDetails.origin
    ? { latitude: rideDetails.origin.latitude, longitude: rideDetails.origin.longitude }
    : null;
  const destinationCoords = rideDetails.destination
    ? { latitude: rideDetails.destination.latitude, longitude: rideDetails.destination.longitude }
    : null;

  // Si no hay driverLocation (e.g., primera carga), usar la del origen para centrar el mapa inicialmente
  const initialMapRegion = driverLocation || originCoords || { latitude: -16.40904, longitude: -71.53745 };

  return (
    <View style={styles.container}>
      <Text style={styles.headerText}>
        Viaje con {rideDetails.passenger?.name || "Pasajero Desconocido"}
      </Text>
      <Text style={styles.statusText}>
        Estado: {rideDetails.status?.toUpperCase().replace('_', ' ')}
      </Text>

      {/* Solo renderizar el mapa si tenemos coordenadas iniciales para evitar un error */}
      {initialMapRegion.latitude !== -16.40904 || initialMapRegion.longitude !== -71.53745 ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: initialMapRegion.latitude,
            longitude: initialMapRegion.longitude,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          }}
          showsUserLocation={true} // Esto mostrará el punto azul de la ubicación del dispositivo
          followsUserLocation={true} // Hará que el mapa siga al usuario (opcional, MapViewDirections ya lo hace)
          loadingEnabled
        >
          {/* Marcador del Pasajero (Origen) */}
          {originCoords && (
            <Marker
              coordinate={originCoords}
              title="Origen del Pasajero"
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

          {/* Marcador del Conductor (Tú) con icono de coche y orientación */}
          {driverLocation && (
            <Marker
              coordinate={driverLocation}
              title="Tu Ubicación"
              anchor={{ x: 0.5, y: 0.5 }} // Centra el icono
              flat={true} // Hace que el icono rote con el mapa
            >
              <Image
                source={require("../assets/car-icon.png")} // Asegúrate de tener esta imagen
                style={{
                  width: 40,
                  height: 40,
                  // Rotar la imagen según el bearing
                  transform: [{
                      rotate: `${calculateBearing(
                          driverLocation.prevLatitude || driverLocation.latitude, // Usar prev para calcular el cambio
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
                          mapRef.current.fitToToCoordinates(result.coordinates, { // <<< CORRECCIÓN: fitToCoordinates en lugar de fitToToCoordinates >>>
                              edgePadding: { top: 100, right: 50, bottom: 50, left: 50 },
                              animated: true,
                          });
                      }
                  }}
                  onError={(error) => console.log('Error al trazar ruta al pasajero:', error)}
              />
          )}

          {/* Ruta del origen al destino (cuando el viaje está 'recogido' o 'en_ruta') */}
          {originCoords && destinationCoords && (rideDetails.status === 'recogido' || rideDetails.status === 'en_ruta') && Maps_API_KEY && (
              <MapViewDirections
                  // <<< MODIFICACIÓN: La ruta debe iniciar desde la ubicación ACTUAL del conductor
                  // o desde el origen si la ubicación del conductor no está disponible por alguna razón.
                  // Pero idealmente siempre es desde driverLocation. >>>
                  origin={driverLocation || originCoords}
                  destination={destinationCoords}
                  apikey={Maps_API_KEY}
                  strokeWidth={4}
                  strokeColor="#0cf574"
                  optimizeWaypoints={true}
                  onReady={result => {
                      if (mapRef.current) {
                          mapRef.current.fitToToCoordinates(result.coordinates, { // <<< CORRECCIÓN: fitToCoordinates >>>
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
          <Text style={styles.loadingText}>Cargando mapa...</Text>
        </View>
      )}

      <View style={styles.bottomPanel}>
        <Text style={styles.infoText}>Pasajero: {rideDetails.passenger?.name || "Cargando..."}</Text>
        <Text style={styles.infoText}>Precio Acordado: ${rideDetails.price_accepted?.toFixed(2) || rideDetails.price_offered?.toFixed(2) || 'N/A'}</Text>

        {/* Mensajes de estado al conductor */}
        {rideDetails.status === 'aceptado' && (
            <Text style={styles.statusMessage}>Dirígete a recoger al pasajero.</Text>
        )}
        {rideDetails.status === 'recogido' && (
            <Text style={styles.statusMessage}>Pasajero recogido. Inicia el viaje.</Text>
        )}
        {rideDetails.status === 'en_ruta' && (
            <Text style={styles.statusMessage}>Viaje en curso hacia el destino.</Text>
        )}

        <View style={styles.buttonContainer}>
          {/* Botón "Pasajero Recogido" (solo si el estado es 'aceptado') */}
          {rideDetails.status === "aceptado" && (
            <TouchableOpacity
              style={[styles.actionButton, styles.pickupButton]}
              onPress={handleMarkPickedUp} // <<< MODIFICACIÓN: Nuevo manejador para 'recogido' >>>
            >
              <Ionicons name="car-sport-outline" size={20} color="#0a0f1c" />
              <Text style={styles.actionButtonText}>Pasajero Recogido</Text>
            </TouchableOpacity>
          )}

          {/* Botón "Iniciar Viaje" (solo si el estado es 'recogido') */}
          {rideDetails.status === "recogido" && (
            <TouchableOpacity
              style={[styles.actionButton, styles.inRouteButton]} // Nuevo estilo
              onPress={handleStartRide} // <<< MODIFICACIÓN: Nuevo manejador para 'en_ruta' >>>
            >
              <Ionicons name="play-circle-outline" size={20} color="#0a0f1c" />
              <Text style={styles.actionButtonText}>Iniciar Viaje</Text>
            </TouchableOpacity>
          )}

          {/* Botón "Finalizar Viaje" (solo si el estado es 'en_ruta') */}
          {rideDetails.status === "en_ruta" && (
            <TouchableOpacity
              style={[styles.actionButton, styles.finishButton]}
              onPress={handleFinishRide}
            >
              <Ionicons name="flag-outline" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Finalizar Viaje</Text>
            </TouchableOpacity>
          )}

          {/* Botón "Cancelar Viaje" (disponible en 'aceptado', 'recogido', 'en_ruta') */}
          {(rideDetails.status === "aceptado" || rideDetails.status === "recogido" || rideDetails.status === "en_ruta") && (
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
    backgroundColor: '#00f0ff', // Azul cian para recoger
  },
  inRouteButton: { // Nuevo estilo para "Iniciar Viaje"
    backgroundColor: '#f5c518', // Naranja/Amarillo
  },
  finishButton: {
    backgroundColor: '#0cf574', // Verde para finalizar
  },
  cancelButton: {
    backgroundColor: '#ff4d4d', // Rojo para cancelar
  },
  actionButtonText: {
    color: '#0a0f1c',
    fontSize: 14, // Ligeramente más pequeño para que quepa en un solo botón si hay muchos
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