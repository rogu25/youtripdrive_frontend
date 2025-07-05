import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Image,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { API_BASE_URL } from "../utils/config";
import MapViewDirections from 'react-native-maps-directions';
import { Maps_API_KEY } from '../utils/config'; // Asegúrate de tener tu clave API de Google Maps aquí

// Función para calcular la orientación del vehículo (para la rotación del icono)
// Asegúrate de que esta función esté definida o importada si se usa en varios lugares
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


const PassengerRideInProgress = ({ route, navigation }) => {
  const { rideId } = route.params; // Se espera que se pase el ID del viaje
  const { user, isAuthenticated } = useAuth(); // Obtener user, isAuthenticated del AuthContext
  const { socket } = useSocket(); // Obtener la instancia del socket
  const mapRef = useRef(null); // Referencia al MapView para controlar la cámara

  const [rideDetails, setRideDetails] = useState(null); // Almacena todos los detalles del viaje
  const [loading, setLoading] = useState(true);
  const [driverLocation, setDriverLocation] = useState(null); // Solo la ubicación actual del conductor
  const [passengerOrigin, setPassengerOrigin] = useState(null); // Ubicación de origen del pasajero (punto de recogida)


  // Función para obtener los detalles completos del viaje
  const fetchRideDetails = useCallback(async () => {
    if (!isAuthenticated || !user?.token || !rideId) {
      Alert.alert('Error', 'No estás autenticado o no hay ID de viaje para seguimiento.');
      setLoading(false);
      navigation.replace('PassengerHomeScreen'); // Redirigir si faltan datos esenciales
      return;
    }
    try {
      const response = await axios.get(`${API_BASE_URL}/rides/${rideId}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const rideData = response.data;
      setRideDetails(rideData);

      // Asegurar que las coordenadas del origen del pasajero estén en el formato correcto
      if (rideData.origin?.latitude && rideData.origin?.longitude) {
        setPassengerOrigin({
          latitude: rideData.origin.latitude,
          longitude: rideData.origin.longitude,
        });
      }

      // Establecer ubicación inicial del conductor si ya está disponible en los detalles del viaje
      if (rideData.driverLocation?.coordinates?.latitude && rideData.driverLocation?.coordinates?.longitude) {
        setDriverLocation({
          latitude: rideData.driverLocation.coordinates.latitude,
          longitude: rideData.driverLocation.coordinates.longitude,
        });
      }

      // Opcional: Centrar el mapa en la ubicación del pasajero o conductor al cargar
      if (mapRef.current && (rideData.origin || rideData.driverLocation)) {
        const coordsToFit = [];
        if (rideData.origin?.latitude && rideData.origin?.longitude) {
            coordsToFit.push({ latitude: rideData.origin.latitude, longitude: rideData.origin.longitude });
        }
        if (rideData.driverLocation?.coordinates?.latitude && rideData.driverLocation?.coordinates?.longitude) {
            coordsToFit.push({ latitude: rideData.driverLocation.coordinates.latitude, longitude: rideData.driverLocation.coordinates.longitude });
        }

        if (coordsToFit.length > 0) {
            mapRef.current.fitToCoordinates(coordsToFit, {
                edgePadding: { top: 100, right: 50, bottom: 50, left: 50 },
                animated: true,
            });
        }
      }

    } catch (err) {
      console.error("Error al obtener detalles del viaje para seguimiento:", err.response?.data?.message || err.message);
      Alert.alert("Error", "No se pudieron cargar los detalles del viaje. Es posible que el viaje haya terminado.");
      navigation.replace('PassengerHomeScreen'); // Regresar al home si el viaje no es válido o hay un error
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user, rideId, navigation]); // Dependencias para useCallback


  useEffect(() => {
    fetchRideDetails(); // Llamada inicial para obtener los detalles del viaje

    // No se usa setInterval para fetchDriverLocation aquí, el socket lo manejará.
  }, [fetchRideDetails]); // Se ejecuta al montar y cuando fetchRideDetails cambia


  // Manejo de eventos de Socket.IO para ubicación del conductor y estado del viaje
  useEffect(() => {
    if (!socket || !isAuthenticated || !user?.id || !rideDetails?._id) {
        console.log('Socket no listo o datos de viaje/usuario no disponibles para eventos de seguimiento.');
        return;
    }

    // Escuchar actualizaciones de ubicación del conductor
    socket.on("driver_location_update", (data) => {
      // Asegurarse de que la actualización sea para el conductor de ESTE viaje
      if (rideDetails.driver?._id && data.driverId === rideDetails.driver._id) {
        // console.log("Ubicación de conductor actualizada via socket:", data.coordinates);
        setDriverLocation({
            latitude: data.coordinates.latitude,
            longitude: data.coordinates.longitude,
        });

        // Opcional: Animar la cámara para seguir al conductor durante el viaje
        if (mapRef.current) {
            mapRef.current.animateCamera({
                center: { latitude: data.coordinates.latitude, longitude: data.coordinates.longitude },
                zoom: 15, // Mantener un zoom constante
            }, { duration: 1000 });
        }
      }
    });

    // Escuchar cambios de estado del viaje (completado, cancelado, etc.)
    socket.on("ride_status_update", (data) => {
        if (data.rideId === rideDetails._id) {
            console.log(`Estado del viaje ${data.rideId} actualizado a: ${data.status}`);
            setRideDetails(prev => ({ ...prev, status: data.status })); // Actualiza el estado local

            if (data.status === 'completed') {
                Alert.alert('Viaje Completado', 'Tu viaje ha finalizado con éxito. ¡Gracias!');
                navigation.replace('PassengerHomeScreen'); // Volver a PassengerHomeScreen
            } else if (data.status === 'cancelled') {
                Alert.alert('Viaje Cancelado', 'Tu viaje ha sido cancelado por el conductor.');
                navigation.replace('PassengerHomeScreen'); // Volver a PassengerHomeScreen
            }
        }
    });

    return () => {
      // Limpiar listeners al desmontar o al cambiar las dependencias
      socket.off("driver_location_update");
      socket.off("ride_status_update");
    };
  }, [socket, isAuthenticated, user, rideDetails, navigation]); // Dependencias: rideDetails es clave


  // Si está cargando o no se han cargado los detalles del viaje
  if (loading || !rideDetails) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#00f0ff" />
        <Text style={styles.loadingText}>Cargando seguimiento del viaje...</Text>
      </View>
    );
  }

  // Redirigir si el viaje ya no es 'accepted' o 'in_progress'
  if (rideDetails.status !== 'accepted' && rideDetails.status !== 'in_progress') {
    Alert.alert("Información del Viaje", "Este viaje ya no está activo o en progreso.");
    navigation.replace("PassengerHomeScreen");
    return null; // No renderizar nada
  }

  // Define la región inicial del mapa de forma más robusta
  const initialMapRegion = {
    latitude: driverLocation?.latitude || passengerOrigin?.latitude || 0,
    longitude: driverLocation?.longitude || passengerOrigin?.longitude || 0,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  };

  return (
    <View style={styles.container}>
        <Text style={styles.headerText}>Viaje en Curso</Text>
        <Text style={styles.statusText}>Estado: {rideDetails.status?.toUpperCase()}</Text>
        {rideDetails.driver && (
            <>
                <Text style={styles.driverInfo}>Conductor: {rideDetails.driver.name}</Text>
                <Text style={styles.driverInfo}>Vehículo: {rideDetails.driver.vehicle?.brand} {rideDetails.driver.vehicle?.model} ({rideDetails.driver.vehicle?.color})</Text>
            </>
        )}
        {rideDetails.status === 'accepted' && (
            <Text style={styles.driverInfo}>El conductor se dirige a tu ubicación de recogida.</Text>
        )}
        {rideDetails.status === 'in_progress' && (
            <Text style={styles.driverInfo}>Viaje en curso hacia tu destino.</Text>
        )}

      {initialMapRegion.latitude !== 0 ? ( // Asegúrate de que las coordenadas no sean 0,0 por defecto
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={initialMapRegion}
          showsUserLocation={true} // Mostrar la ubicación actual del dispositivo del pasajero
        >
          {/* Marcador del pasajero (ubicación de recogida del viaje) */}
          {passengerOrigin && (
            <Marker
              coordinate={passengerOrigin}
              title="Tu Ubicación de Recogida"
              pinColor="green"
            />
          )}

          {/* Marcador del conductor */}
          {driverLocation && (
            <Marker
              coordinate={driverLocation}
              title="Tu Conductor"
            >
                <Image
                    source={require("../assets/car-icon.png")} // Asegúrate de tener este icono
                    style={{
                        width: 40,
                        height: 40,
                        // Calcular la rotación basándose en el movimiento del conductor
                        transform: [{
                            rotate: `${calculateBearing(
                                driverLocation.prevLatitude || driverLocation.latitude, // Usa la latitud anterior si está disponible
                                driverLocation.prevLongitude || driverLocation.longitude, // Usa la longitud anterior si está disponible
                                driverLocation.latitude,
                                driverLocation.longitude
                            )}deg`
                        }],
                    }}
                    resizeMode="contain"
                />
            </Marker>
          )}

          {/* Marcador del destino (si el viaje tiene uno) */}
          {rideDetails.destination?.latitude && rideDetails.destination?.longitude && (
              <Marker
                  coordinate={{
                      latitude: rideDetails.destination.latitude,
                      longitude: rideDetails.destination.longitude,
                  }}
                  title="Destino"
                  pinColor="red"
              />
          )}

          {/* Ruta del conductor a la ubicación de recogida del pasajero (cuando el viaje está 'accepted') */}
          {rideDetails.status === 'accepted' && driverLocation && passengerOrigin && Maps_API_KEY && (
              <MapViewDirections
                  origin={driverLocation}
                  destination={passengerOrigin}
                  apikey={Maps_API_KEY}
                  strokeWidth={4}
                  strokeColor="blue"
                  optimizeWaypoints={true}
                  onReady={result => {
                      // Opcional: Ajustar el mapa a la ruta completa del conductor al pasajero
                      if (mapRef.current) {
                          mapRef.current.fitToCoordinates(result.coordinates, {
                              edgePadding: { top: 100, right: 50, bottom: 50, left: 50 },
                              animated: true,
                          });
                      }
                  }}
                  onError={(error) => console.log('Error al trazar ruta del conductor:', error)}
              />
          )}

          {/* Ruta del origen al destino del viaje (cuando el viaje está 'in_progress') */}
          {rideDetails.status === 'in_progress' && rideDetails.origin?.latitude && rideDetails.destination?.latitude && Maps_API_KEY && (
              <MapViewDirections
                  origin={{ latitude: rideDetails.origin.latitude, longitude: rideDetails.origin.longitude }}
                  destination={{ latitude: rideDetails.destination.latitude, longitude: rideDetails.destination.longitude }}
                  apikey={Maps_API_KEY}
                  strokeWidth={4}
                  strokeColor="#0cf574" // Color diferente para la ruta del viaje
                  optimizeWaypoints={true}
                  onReady={result => {
                      // Puedes ajustar el mapa para que muestre toda la ruta una vez.
                  }}
                  onError={(error) => console.log('Error al trazar ruta del viaje:', error)}
              />
          )}

        </MapView>
      ) : (
        <View style={styles.centeredContainer}>
          <Text style={styles.loadingText}>Esperando datos de ubicación para el mapa...</Text>
        </View>
      )}

        <View style={styles.bottomContainer}>
            <TouchableOpacity
                style={styles.chatButton}
                onPress={() => navigation.navigate("RideChat", {
                    rideId: rideDetails._id,
                    userId: user._id,
                    userName: user.name,
                    // También puedes pasar el ID y nombre del conductor si quieres
                    driverId: rideDetails.driver?._id,
                    driverName: rideDetails.driver?.name,
                })}
            >
                <Text style={styles.chatButtonText}>Abrir Chat</Text>
            </TouchableOpacity>
            {/* Botón para cancelar el viaje, visible solo si el estado lo permite */}
            {rideDetails.status !== 'completed' && rideDetails.status !== 'cancelled' && (
                <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                        Alert.alert(
                            "Cancelar Viaje",
                            "¿Estás seguro de que quieres cancelar el viaje?",
                            [
                                { text: "No", style: "cancel" },
                                { text: "Sí", onPress: async () => {
                                    try {
                                        // Llamada a la API para cancelar el viaje
                                        await axios.post(`${API_BASE_URL}/api/rides/${rideId}/cancel`, {}, {
                                            headers: { Authorization: `Bearer ${user.token}` },
                                        });
                                        // Emitir evento de socket para notificar al conductor
                                        if (socket && rideDetails.driver?._id) {
                                          socket.emit('ride_cancelled_by_passenger', { rideId: rideDetails._id, driverId: rideDetails.driver._id });
                                        }
                                        Alert.alert('Viaje Cancelado', 'Tu viaje ha sido cancelado.');
                                        navigation.replace('PassengerHomeScreen'); // Volver a la pantalla principal
                                    } catch (err) {
                                        console.error('Error al cancelar viaje:', err.response?.data || err.message);
                                        Alert.alert('Error', 'No se pudo cancelar el viaje.');
                                    }
                                }},
                            ]
                        );
                    }}
                >
                    <Text style={styles.cancelButtonText}>Cancelar Viaje</Text>
                </TouchableOpacity>
            )}
        </View>
    </View>
  );
};

export default PassengerRideInProgress;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1c', // Fondo oscuro para coincidir con el tema
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
  headerText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    paddingVertical: 15,
    backgroundColor: '#1a1f2e', // Un color de fondo para la barra superior
  },
  statusText: {
    fontSize: 18,
    color: '#00f0ff', // Color de acento
    textAlign: 'center',
    paddingBottom: 5,
  },
  driverInfo: {
    fontSize: 16,
    color: '#bbb',
    textAlign: 'center',
    marginBottom: 2,
  },
  map: {
    flex: 1, // El mapa debe ocupar el espacio restante
  },
  bottomContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 15,
    backgroundColor: '#1a1f2e',
    borderTopWidth: 1,
    borderColor: '#00f0ff', // Borde superior para separar del mapa
  },
  chatButton: {
    backgroundColor: '#00f0ff', // Un color distintivo para el chat
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    flex: 1, // Para que ocupe espacio equitativamente
    marginRight: 10,
    alignItems: 'center',
  },
  chatButtonText: {
    color: '#0a0f1c',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#ff4d4d', // Rojo para cancelar
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    flex: 1,
    marginLeft: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});