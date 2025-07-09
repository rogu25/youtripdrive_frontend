import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Dimensions,
  Platform
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import * as Location from "expo-location";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { API_BASE_URL, Maps_API_KEY } from "../utils/config";
import { Ionicons } from "@expo/vector-icons";

const { width, height } = Dimensions.get('window');
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.0922;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);
  const [locationStatusMessage, setLocationStatusMessage] = useState("Inicializando ubicación...");

  // --- Funciones de Gestión de Viaje ---

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

      if (!rideData) {
        console.warn("[fetchRideDetails] No se encontraron detalles para este viaje. Redirigiendo.");
        Alert.alert("Error", "No se encontraron detalles para este viaje.");
        navigation.replace("DriverHome");
        return;
      }

      // Asegúrate que las coordenadas de origen y destino estén en el formato correcto (latitude, longitude)
      const processedRideData = {
        ...rideData,
        origin: rideData.origin ? {
          latitude: typeof rideData.origin.latitude === 'number' ? rideData.origin.latitude : rideData.origin.lat,
          longitude: typeof rideData.origin.longitude === 'number' ? rideData.origin.longitude : rideData.origin.lng,
          address: rideData.origin.address,
        } : null,
        destination: rideData.destination ? {
          latitude: typeof rideData.destination.latitude === 'number' ? rideData.destination.latitude : rideData.destination.lat,
          longitude: typeof rideData.destination.longitude === 'number' ? rideData.destination.longitude : rideData.destination.lng,
          address: rideData.destination.address,
        } : null,
      };

      console.log("[fetchRideDetails] Detalles del viaje cargados y procesados:", processedRideData);
      setRideDetails(processedRideData); // <--- Aquí se establece rideDetails

      if (processedRideData.status === 'finalizado' || processedRideData.status === 'cancelado') {
        Alert.alert("Viaje Finalizado", `Este viaje ya ha sido ${processedRideData.status}.`);
        navigation.replace("DriverHome");
        return;
      }

    } catch (err) {
      console.error("[fetchRideDetails] Error obteniendo detalles del viaje:", err.response?.data?.message || err.message);
      if (err.response?.status === 401) {
        Alert.alert("Sesión Caducada", "Por favor, inicia sesión de nuevo.");
        signOut();
      } else {
        Alert.alert("Error", "No se pudieron cargar los detalles del viaje. Es posible que el viaje ya no exista o haya un problema de red.");
        navigation.replace("DriverHome");
      }
    } finally {
      setLoading(false);
      console.log("[fetchRideDetails] Carga de detalles finalizada.");
    }
  }, [isAuthenticated, user, rideId, navigation, signOut]);

  // Función para solicitar permisos de ubicación y obtener la ubicación actual
  const requestLocationPermissionsAndGetInitial = useCallback(async () => {
    console.log("[Location] Solicitando permisos de ubicación...");
    setLocationStatusMessage("Solicitando permisos de ubicación...");
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      console.warn("[Location] Permiso de ubicación denegado.");
      Alert.alert(
        "Permiso de ubicación denegado",
        "No podemos rastrear tu ubicación. Esto es necesario para el viaje. Por favor, habilita los permisos de ubicación en la configuración de tu dispositivo.",
        [{ text: "OK", onPress: () => setLocationPermissionGranted(false) }]
      );
      setLocationStatusMessage("Permiso de ubicación denegado. Habilítalo en la configuración.");
      setLocationPermissionGranted(false);
      return;
    }
    console.log("[Location] Permiso de ubicación concedido.");
    setLocationPermissionGranted(true);
    setLocationStatusMessage("Obteniendo tu ubicación actual...");

    try {
      const currentLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setDriverLocation({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        prevLatitude: currentLocation.coords.latitude,
        prevLongitude: currentLocation.coords.longitude,
      });
      console.log("[Location] Ubicación inicial del conductor obtenida:", currentLocation.coords);
      setLocationStatusMessage("Ubicación obtenida.");

      startLocationTracking();
    } catch (error) {
      console.error("[Location] Error obteniendo ubicación inicial:", error);
      setLocationStatusMessage("Error obteniendo ubicación inicial. ¿GPS activado?");
    }
  }, [startLocationTracking]); // Añadir startLocationTracking como dependencia

  // Función para iniciar el seguimiento de ubicación
  const startLocationTracking = useCallback(async () => {
    if (!socket || !user?.id || !rideDetails?._id || !locationPermissionGranted) {
      console.warn("[startLocationTracking] No se puede iniciar el tracking: Faltan datos o permisos.");
      return;
    }
    // console.log("[startLocationTracking] Iniciando seguimiento de ubicación...");

    if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
        console.log("[startLocationTracking] Limpiando suscripción anterior.");
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
            prevLatitude: prevLocation ? prevLocation.latitude : latitude,
            prevLongitude: prevLocation ? prevLocation.longitude : longitude,
          };
          socket.emit('driver_location_update', {
            driverId: user.id,
            coordinates: { latitude, longitude },
            rideId: rideDetails._id,
          });
          return newDriverLocation;
        });
      }
    );
  }, [socket, user, rideDetails, locationPermissionGranted]);

  // Manejadores de estado del viaje (sin cambios significativos)
  const updateRideStatus = useCallback(async (newStatus, alertMessage) => {
    if (!rideDetails || !user?.token || isSubmitting) {
        console.warn("[updateRideStatus] No se puede actualizar el estado: rideDetails, token o isSubmitting.");
        return;
    }
    setIsSubmitting(true);
    try {
      const token = user.token;
      await axios.put(
        `${API_BASE_URL}/rides/status/${rideDetails._id}`,
        { status: newStatus },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setRideDetails(prev => ({ ...prev, status: newStatus }));

      if (socket) {
        socket.emit('ride_status_update', {
          rideId: rideDetails._id,
          status: newStatus,
          passengerId: rideDetails.passenger?._id,
        });
        if (newStatus === 'recogido') {
            socket.emit('pasajero_recogido', { rideId: rideDetails._id, passengerId: rideDetails.passenger?._id });
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
      Alert.alert("Error", err.response?.data?.message || `No se pudo ${alertMessage.toLowerCase()}.`);
    } finally {
        setIsSubmitting(false);
    }
  }, [rideDetails, user, socket, navigation, isSubmitting]);

  const handlePickedUpPassenger = useCallback(() => {
    Alert.alert(
      "Confirmar Recogida",
      "¿Has recogido al pasajero y estás listo para iniciar el viaje?",
      [
        { text: "No", style: "cancel" },
        { text: "Sí", onPress: () => updateRideStatus("recogido", "Pasajero recogido. Viaje en curso.") },
      ]
    );
  }, [updateRideStatus]);

  const handleFinishRide = useCallback(() => {
    if (!rideDetails || !user?.token || isSubmitting) return;

    Alert.alert(
      "Finalizar Viaje",
      "¿Estás seguro de que quieres finalizar el viaje?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Sí",
          onPress: async () => {
            setIsSubmitting(true);
            try {
              const token = user.token;
              const response = await axios.put(
                `${API_BASE_URL}/rides/${rideDetails._id}/finalizar`,
                {},
                {
                  headers: { Authorization: `Bearer ${token}` },
                }
              );

              setRideDetails(response.data.ride);
              if (socket) {
                socket.emit('ride_completed', {
                  rideId: rideDetails._id,
                  passengerId: rideDetails.passenger?._id,
                  costoFinal: response.data.ride.costoFinal,
                });
              }

              Alert.alert('¡Viaje Finalizado!', `Costo Final: $${response.data.ride.costoFinal?.toFixed(2) || 'N/A'}`);
              navigation.replace("DriverHome");

            } catch (err) {
              console.error('Error al finalizar viaje:', err.response?.data?.message || err.message);
              Alert.alert('Error', err.response?.data?.message || 'No se pudo finalizar el viaje.');
            } finally {
              setIsSubmitting(false);
            }
          }
        }
      ]
    );
  }, [rideDetails, user, socket, navigation, isSubmitting]);

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

  // 1. Cargar detalles del viaje y solicitar permisos/ubicación inicial
  useEffect(() => {
    fetchRideDetails();
    requestLocationPermissionsAndGetInitial();
  }, [fetchRideDetails, requestLocationPermissionsAndGetInitial]);

  // 2. Ajuste del mapa y control del seguimiento de ubicación continuo
  useEffect(() => {
      // Ajustar la cámara del mapa
      if (mapRef.current && (driverLocation || (rideDetails && (rideDetails.origin || rideDetails.destination)))) {
          const coordsToFit = [];

          if (driverLocation) {
              coordsToFit.push(driverLocation);
          }

          if (rideDetails?.origin?.latitude && rideDetails?.origin?.longitude) {
              coordsToFit.push({ latitude: rideDetails.origin.latitude, longitude: rideDetails.origin.longitude });
          }

          if (rideDetails?.destination?.latitude && rideDetails?.destination?.longitude && rideDetails?.status === 'recogido') {
              coordsToFit.push({ latitude: rideDetails.destination.latitude, longitude: rideDetails.destination.longitude });
          }

          if (coordsToFit.length > 0) {
              const validCoords = coordsToFit.filter(c => typeof c.latitude === 'number' && typeof c.longitude === 'number');
              if (validCoords.length > 0) {
                  mapRef.current.fitToCoordinates(validCoords, {
                      edgePadding: { top: 100, right: 50, bottom: 250, left: 50 },
                      animated: true,
                  });
              }
          }
      }

      // Controlar el seguimiento de ubicación continuo
      if (locationPermissionGranted && rideDetails && (rideDetails.status === 'aceptado' || rideDetails.status === 'recogido')) {
          startLocationTracking();
      } else {
          if (locationSubscription.current) {
              locationSubscription.current.remove();
              locationSubscription.current = null;
              // console.log("[useEffect] Deteniendo seguimiento de ubicación (estado no apto o sin permisos).");
          }
      }

      return () => {
        if (locationSubscription.current) {
          locationSubscription.current.remove();
          locationSubscription.current = null;
          // console.log("[useEffect Cleanup] Limpiando suscripción de ubicación al desmontar.");
        }
      };
  }, [rideDetails, startLocationTracking, driverLocation, locationPermissionGranted]);

  // 3. Escuchar eventos de socket (sin cambios significativos)
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
        console.log(`[Socket] Estado del viaje ${data.rideId} actualizado a: ${data.status}`);
        setRideDetails(prev => ({ ...prev, status: data.status }));
        if (data.status === 'finalizado' || data.status === 'cancelado') {
            Alert.alert("Viaje Finalizado", `El viaje ha sido ${data.status}.`);
            navigation.replace("DriverHome");
        }
      }
    };

    const handlePasajeroRecogido = (data) => {
        if (data.rideId === rideDetails._id && rideDetails.status !== 'recogido') {
            Alert.alert("¡Pasajero Recogido!", "El viaje ha comenzado.");
            setRideDetails(prev => ({ ...prev, status: 'recogido' }));
        }
    };

    const handleViajeFinalizado = (data) => {
        if (data.rideId === rideDetails._id && rideDetails.status !== 'finalizado') {
            Alert.alert("¡Viaje Finalizado!", `Tu viaje ha terminado. Costo: $${data.costoFinal?.toFixed(2) || 'N/A'}`);
            setRideDetails(prev => ({ ...prev, status: 'finalizado', costoFinal: data.costoFinal }));
            navigation.replace("DriverHome");
        }
    };

    socket.on('ride_cancelled_by_passenger', handleRideCancelledByPassenger);
    socket.on('ride_status_update', handleRideStatusUpdate);
    socket.on('pasajero_recogido', handlePasajeroRecogido);
    socket.on('viaje_finalizado', handleViajeFinalizado);

    return () => {
      socket.off('ride_cancelled_by_passenger', handleRideCancelledByPassenger);
      socket.off('ride_status_update', handleRideStatusUpdate);
      socket.off('pasajero_recogido', handlePasajeroRecogido);
      socket.off('viaje_finalizado', handleViajeFinalizado);
    };
  }, [socket, rideDetails, user, navigation]);


  // --- Renderizado Condicional ---
  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#00f0ff" />
        <Text style={styles.loadingText}>Cargando detalles del viaje...</Text>
      </View>
    );
  }

  // Si rideDetails está presente pero el estado es finalizado/cancelado, ya deberíamos haber navegado.
  if (rideDetails && (rideDetails.status === 'finalizado' || rideDetails.status === 'cancelado')) {
    return null;
  }

  const originCoords = rideDetails?.origin?.latitude && rideDetails?.origin?.longitude
    ? { latitude: rideDetails.origin.latitude, longitude: rideDetails.origin.longitude }
    : null;
  const destinationCoords = rideDetails?.destination?.latitude && rideDetails?.destination?.longitude
    ? { latitude: rideDetails.destination.latitude, longitude: rideDetails.destination.longitude }
    : null;

  // Condición para mostrar el mensaje de "Esperando datos de ubicación"
  // Solo se mostrará si no tenemos driverLocation Y no tenemos coordenadas de origen/destino
  // Y si rideDetails ya cargó (es decir, no estamos en el `if (loading)` de arriba).
  if (!driverLocation && !originCoords && !destinationCoords) {
    return (
      <View style={styles.centeredMapContainer}>
        <ActivityIndicator size="large" color="#00f0ff" />
        <Text style={styles.loadingText}>{locationStatusMessage}</Text>
        {!locationPermissionGranted && (
            <Text style={styles.errorText}>
                Para que el mapa funcione, por favor, activa los permisos de ubicación para esta aplicación en la configuración de tu dispositivo.
                {Platform.OS === 'ios' ? ' Ve a Ajustes > Privacidad y seguridad > Localización > [Nombre de tu App].' : ' Ve a Ajustes > Aplicaciones > [Nombre de tu App] > Permisos.'}
            </Text>
        )}
        {locationPermissionGranted && !driverLocation && (
             <Text style={styles.errorText}>
                Asegúrate de que tu GPS esté activado y tengas buena señal.
            </Text>
        )}
      </View>
    );
  }

  // Definir la región inicial del mapa. Intentará usar driverLocation, luego originCoords, sino una por defecto.
  const initialMapRegion = driverLocation || originCoords || {
    latitude: -16.40904, // Coordenadas por defecto (Arequipa)
    longitude: -71.53745,
    latitudeDelta: LATITUDE_DELTA,
    longitudeDelta: LONGITUDE_DELTA,
  };


  return (
    <View style={styles.container}>
      {/* Estos textos ahora solo se renderizarán si rideDetails no es null */}
      <Text style={styles.headerText}>
        Viaje con {rideDetails?.passenger?.name || "Pasajero Desconocido"}
      </Text>
      <Text style={styles.statusText}>
        Estado: {rideDetails?.status?.toUpperCase().replace('_', ' ') || "Cargando..."}
      </Text>

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: initialMapRegion.latitude,
          longitude: initialMapRegion.longitude,
          latitudeDelta: initialMapRegion.latitudeDelta || LATITUDE_DELTA,
          longitudeDelta: initialMapRegion.longitudeDelta || LONGITUDE_DELTA,
        }}
        showsUserLocation={true}
        followsUserLocation={true}
        loadingEnabled
        onMapReady={() => console.log("[MapView] Mapa cargado y listo.")}
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

        {/* Rutas */}
        {driverLocation && originCoords && rideDetails?.status === 'aceptado' && Maps_API_KEY && (
            <MapViewDirections
                origin={driverLocation}
                destination={originCoords}
                apikey={Maps_API_KEY}
                strokeWidth={4}
                strokeColor="blue"
                optimizeWaypoints={true}
                onReady={result => {
                    console.log("[MapViewDirections] Ruta a pasajero lista. Coords:", result.coordinates.length);
                    if (mapRef.current && result.coordinates.length > 0) {
                        mapRef.current.fitToCoordinates(result.coordinates, {
                            edgePadding: { top: 100, right: 50, bottom: 250, left: 50 },
                            animated: true,
                        });
                    }
                }}
                onError={(error) => console.log('Error al trazar ruta al pasajero:', error)}
            />
        )}

        {driverLocation && destinationCoords && rideDetails?.status === 'recogido' && Maps_API_KEY && (
            <MapViewDirections
                origin={driverLocation}
                destination={destinationCoords}
                apikey={Maps_API_KEY}
                strokeWidth={4}
                strokeColor="#0cf574"
                optimizeWaypoints={true}
                onReady={result => {
                    console.log("[MapViewDirections] Ruta a destino lista. Coords:", result.coordinates.length);
                    if (mapRef.current && result.coordinates.length > 0) {
                        mapRef.current.fitToCoordinates(result.coordinates, {
                            edgePadding: { top: 100, right: 50, bottom: 250, left: 50 },
                            animated: true,
                        });
                    }
                }}
                onError={(error) => console.log('Error al trazar ruta al destino:', error)}
            />
        )}

      </MapView>

      {/* El panel inferior y los botones también dependen de rideDetails */}
      {rideDetails && (
        <View style={styles.bottomPanel}>
          <Text style={styles.infoText}>Pasajero: {rideDetails.passenger?.name || "Desconocido"}</Text>
          {rideDetails.status === 'aceptado' && (
              <Text style={styles.statusMessage}>Dirígete a recoger al pasajero.</Text>
          )}
          {rideDetails.status === 'recogido' && (
              <Text style={styles.statusMessage}>Viaje en curso hacia el destino.</Text>
          )}

          <View style={styles.buttonContainer}>
            {rideDetails.status === "aceptado" && (
              <TouchableOpacity
                style={[styles.actionButton, styles.pickupButton]}
                onPress={handlePickedUpPassenger}
                disabled={isSubmitting}
              >
                <Ionicons name="car-sport-outline" size={20} color="#0a0f1c" />
                <Text style={styles.actionButtonText}>Pasajero Recogido</Text>
              </TouchableOpacity>
            )}

            {rideDetails.status === "recogido" && (
              <TouchableOpacity
                style={[styles.actionButton, styles.finishButton]}
                onPress={handleFinishRide}
                disabled={isSubmitting}
              >
                <Ionicons name="flag-outline" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>
                  {isSubmitting ? "Finalizando..." : "Finalizar Viaje"}
                </Text>
              </TouchableOpacity>
            )}

            {(rideDetails.status === "aceptado" || rideDetails.status === "recogido") && (
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={handleCancelRide}
                disabled={isSubmitting}
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
            disabled={isSubmitting}
          >
            <Ionicons name="chatbubbles-outline" size={20} color="#0a0f1c" />
            <Text style={styles.chatButtonText}>Abrir Chat</Text>
          </TouchableOpacity>
        </View>
      )}
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
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 15,
    color: '#ff4d4d',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 10,
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