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
import MapViewDirections from "react-native-maps-directions";
import { Maps_API_KEY } from "../utils/config";

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
  const { rideId, rideDetail, driverData, pickupEta } = route.params;
  const { user, isAuthenticated } = useAuth();
  const { socket } = useSocket();
  const mapRef = useRef(null);

  const [driverLocation, setDriverLocation] = useState(
    driverData?.currentLocation
  );
  const [driverBearing, setDriverBearing] = useState(0);
  const [rideDetails, setRideDetails] = useState(rideDetail);
  const [loading, setLoading] = useState(true);
  const [driverRotation, setDriverRotation] = useState(0); // Nuevo estado para la rotación del conductor
  const [passengerOrigin, setPassengerOrigin] = useState(null);

  const fetchRideDetails = useCallback(async () => {
    if (!isAuthenticated || !user?.token || !rideId) {
      console.log("No autenticado o sin ID de viaje, volviendo a Home.");
      Alert.alert(
        "Error",
        "No estás autenticado o no hay ID de viaje para seguimiento."
      );
      setLoading(false);
      navigation.replace("PassengerHomeScreen");
      return;
    }
    try {
      const response = await axios.get(`${API_BASE_URL}/rides/${rideId}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const rideData = response.data;
      setRideDetails(rideData);

      // Establecer la ubicación de recogida del pasajero
      if (rideData.origin?.latitude && rideData.origin?.longitude) {
        setPassengerOrigin({
          latitude: rideData.origin.latitude,
          longitude: rideData.origin.longitude,
        });
      }

      // Establecer la ubicación inicial del conductor si está disponible en los detalles del viaje
      if (
        rideData.driverLocation?.coordinates?.latitude &&
        rideData.driverLocation?.coordinates?.longitude
      ) {
        setDriverLocation({
          latitude: rideData.driverLocation.coordinates.latitude,
          longitude: rideData.driverLocation.coordinates.longitude,
        });
        // Inicializar rotación con 0, se actualizará con el primer movimiento
        setDriverRotation(0);
      }

      // Ajustar la vista del mapa para que incluya origen y/o ubicación del conductor
      if (mapRef.current) {
        const coordsToFit = [];
        if (rideData.origin?.latitude && rideData.origin?.longitude) {
          coordsToFit.push({
            latitude: rideData.origin.latitude,
            longitude: rideData.origin.longitude,
          });
        }
        if (
          rideData.driverLocation?.coordinates?.latitude &&
          rideData.driverLocation?.coordinates?.longitude
        ) {
          coordsToFit.push({
            latitude: rideData.driverLocation.coordinates.latitude,
            longitude: rideData.driverLocation.coordinates.longitude,
          });
        }
        if (rideData.destination?.latitude && rideData.destination?.longitude) {
          coordsToFit.push({
            latitude: rideData.destination.latitude,
            longitude: rideData.destination.longitude,
          });
        }

        if (coordsToFit.length > 0) {
          mapRef.current.fitToCoordinates(coordsToFit, {
            edgePadding: { top: 100, right: 50, bottom: 50, left: 50 },
            animated: true,
          });
        }
      }
    } catch (err) {
      console.error(
        "Error al obtener detalles del viaje para seguimiento:",
        err.response?.data?.message || err.message
      );
      Alert.alert(
        "Error",
        "No se pudieron cargar los detalles del viaje. Es posible que el viaje haya terminado."
      );
      navigation.replace("PassengerHomeScreen");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.token, rideId, navigation]);

  useEffect(() => {
    fetchRideDetails();
  }, [fetchRideDetails]);

  // --- useEffect para manejar la navegación basada en el estado del viaje ---
  useEffect(() => {
    if (!loading && rideDetails) {
      // Los estados válidos para que el pasajero permanezca en esta pantalla
      // 'aceptado': conductor en camino a recoger
      // 'recogido': conductor ha recogido al pasajero
      // 'en_ruta': viaje en progreso hacia el destino final
      const validStatuses = ["aceptado", "recogido", "en_ruta"];

      if (!validStatuses.includes(rideDetails.status)) {
        Alert.alert(
          "Información del Viaje",
          "Este viaje ya no está activo o en progreso."
        );
        navigation.replace("PassengerHomeScreen");
      }
    }
  }, [rideDetails, loading, navigation]);

  // Manejo de eventos de Socket.IO para ubicación del conductor y estado del viaje
  useEffect(() => {
    if (!socket || !isAuthenticated || !user?.id || !rideDetails?._id) {
      console.log(
        "Socket no listo o datos de viaje/usuario no disponibles para eventos de seguimiento."
      );
      return;
    }

    // Únete a la sala de seguimiento de este viaje específico
    // Asegúrate de que el backend emita a esta sala
    socket.emit("join_ride_room", rideDetails._id);
    console.log(
      `[Socket] Pasajero ${user.id} se unió a la sala del viaje ${rideDetails._id}`
    );

    const handleDriverLocationUpdate = (data) => {
      // Solo actualiza si el update es para el conductor de este viaje
      if (rideDetails.driver?._id && data.driverId === rideDetails.driver._id) {
        setDriverLocation((prevLocation) => {
          const newCurrentLocation = {
            latitude: data.coordinates.latitude,
            longitude: data.coordinates.longitude,
          };

          // Calcula la rotación
          let newRotation = 0;
          if (prevLocation) {
            newRotation = calculateBearing(
              prevLocation.latitude,
              prevLocation.longitude,
              newCurrentLocation.latitude,
              newCurrentLocation.longitude
            );
          }
          setDriverRotation(newRotation); // Actualiza la rotación

          // Anima la cámara para seguir al conductor si está en movimiento
          if (mapRef.current) {
            mapRef.current.animateCamera(
              {
                center: newCurrentLocation,
                zoom: 15, // Mantén un zoom constante para seguimiento
              },
              { duration: 1000 }
            );
          }
          return newCurrentLocation; // Solo retorna latitude y longitude
        });
      }
    };

    const handleRideStatusUpdate = (data) => {
      if (data.rideId === rideDetails._id) {
        console.log(
          `Estado del viaje ${data.rideId} actualizado a: ${data.status}`
        );
        setRideDetails((prev) => ({ ...prev, status: data.status }));

        // Manejo de redirección según el estado
        if (data.status === "finalizado") {
          Alert.alert(
            "Viaje Completado",
            "Tu viaje ha finalizado con éxito. ¡Gracias!"
          );
          navigation.replace("PassengerHomeScreen");
        } else if (data.status === "cancelado") {
          Alert.alert(
            "Viaje Cancelado",
            "Tu viaje ha sido cancelado por el conductor."
          );
          navigation.replace("PassengerHomeScreen");
        } else if (data.status === "recogido") {
          Alert.alert(
            "¡Pasajero Recogido!",
            "El conductor te ha recogido. Tu viaje está a punto de empezar."
          );
          // Ajusta el mapa para mostrar la ruta completa del origen al destino
          if (mapRef.current && rideDetails.origin && rideDetails.destination) {
            mapRef.current.fitToCoordinates(
              [rideDetails.origin, rideDetails.destination],
              {
                edgePadding: { top: 100, right: 50, bottom: 50, left: 50 },
                animated: true,
              }
            );
          }
        } else if (data.status === "en_ruta") {
          Alert.alert("Viaje en Curso", "El conductor se dirige a tu destino.");
          // Vuelve a ajustar el mapa si el estado cambia a en_ruta para asegurar la vista de la ruta completa
          if (mapRef.current && rideDetails.origin && rideDetails.destination) {
            mapRef.current.fitToCoordinates(
              [rideDetails.origin, rideDetails.destination],
              {
                edgePadding: { top: 100, right: 50, bottom: 50, left: 50 },
                animated: true,
              }
            );
          }
        }
      }
    };

    socket.on("driver_location_update", handleDriverLocationUpdate);
    socket.on("ride_status_update", handleRideStatusUpdate);

    return () => {
      socket.off("driver_location_update", handleDriverLocationUpdate);
      socket.off("ride_status_update", handleRideStatusUpdate);
      socket.emit("leave_ride_room", rideDetails._id);
      console.log(
        `[Socket] Pasajero ${user.id} dejó la sala del viaje ${rideDetails._id}`
      );
    };
  }, [socket, isAuthenticated, user, rideDetails, navigation]); // Dependencias: rideDetails es clave

  // Si está cargando o no se han cargado los detalles del viaje
  if (loading || !rideDetails) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#00f0ff" />
        <Text style={styles.loadingText}>
          Cargando seguimiento del viaje...
        </Text>
      </View>
    );
  }

  // Define la región inicial del mapa con un valor por defecto seguro
  // Esto solo es para la carga INICIAL si no hay ubicaciones disponibles aún.
  // El fitToCoordinates en fetchRideDetails y en handleDriverLocationUpdate manejará la vista real.
  const initialMapRegion = {
    latitude: driverLocation?.latitude || passengerOrigin?.latitude || -16.409, // Arequipa (centro)
    longitude:
      driverLocation?.longitude || passengerOrigin?.longitude || -71.535,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  };
  
  return (
    <View style={styles.container}>
      <Text style={styles.headerText}>Viaje en Curso</Text>
      <Text style={styles.statusText}>
        Estado: {rideDetails.status?.toUpperCase()}
      </Text>
      {rideDetails.driver && (
        <>
          <Text style={styles.driverInfo}>
            Conductor: {rideDetails.driver.name}
          </Text>
          <Text style={styles.driverInfo}>
            Vehículo: {rideDetails.driver.carDetails.model}{" "}
            {rideDetails.driver.carDetails.color}{" Placa: "} 
            {rideDetails.driver.carDetails.licensePlate}
          </Text>
        </>
      )}
      {/* Mensajes de estado actualizados */}
      {rideDetails.status === "aceptado" && (
        <Text style={styles.driverInfo}>
          El conductor se dirige a tu ubicación de recogida.
        </Text>
      )}
      {rideDetails.status === "recogido" && (
        <Text style={styles.driverInfo}>
          ¡El conductor te ha recogido! Viaje a punto de iniciar hacia tu
          destino.
        </Text>
      )}
      {rideDetails.status === "en_ruta" && (
        <Text style={styles.driverInfo}>Viaje en curso hacia tu destino.</Text>
      )}

      {/* Renderiza el mapa solo si tenemos una ubicación inicial razonable */}
      {initialMapRegion.latitude !== 0 ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={initialMapRegion} // Usará un valor por defecto seguro si es necesario.
          showsUserLocation={true}
        >
          {passengerOrigin && (
            <Marker
              coordinate={passengerOrigin}
              title="Tu Ubicación de Recogida"
              pinColor="green"
            />
          )}

          {rideDetails.destination?.latitude &&
            rideDetails.destination?.longitude && (
              <Marker
                coordinate={{
                  latitude: rideDetails.destination.latitude,
                  longitude: rideDetails.destination.longitude,
                }}
                title="Destino"
                pinColor="red"
              />
            )}

          {driverLocation && (
            <Marker coordinate={driverLocation} title="Tu Conductor">
              <Image
                source={require("../assets/car-icon.png")}
                style={{
                  width: 40,
                  height: 40,
                  transform: [{ rotate: `${driverRotation}deg` }], // Usa el nuevo estado de rotación
                }}
                resizeMode="contain"
              />
            </Marker>
          )}

          {/* Ruta del conductor al pasajero (cuando el viaje está 'aceptado') */}
          {rideDetails.status === "aceptado" &&
            driverLocation &&
            passengerOrigin &&
            Maps_API_KEY && (
              <MapViewDirections
                origin={driverLocation}
                destination={passengerOrigin}
                apikey={Maps_API_KEY}
                strokeWidth={4}
                strokeColor="blue"
                optimizeWaypoints={true}
                // No necesitamos ajustar el mapa aquí, ya que el socket update o fetchRideDetails lo harán.
                // onReady={(result) => { /* ... */ }}
                onError={(error) =>
                  console.log("Error al trazar ruta del conductor:", error)
                }
              />
            )}

          {/* Ruta del origen al destino del viaje (cuando el viaje está 'recogido' o 'en_ruta') */}
          {(rideDetails.status === "recogido" ||
            rideDetails.status === "en_ruta") &&
            rideDetails.origin?.latitude &&
            rideDetails.destination?.latitude &&
            Maps_API_KEY && (
              <MapViewDirections
                origin={{
                  latitude: rideDetails.origin.latitude,
                  longitude: rideDetails.origin.longitude,
                }}
                destination={{
                  latitude: rideDetails.destination.latitude,
                  longitude: rideDetails.destination.longitude,
                }}
                apikey={Maps_API_KEY}
                strokeWidth={4}
                strokeColor="#0cf574"
                optimizeWaypoints={true}
                onError={(error) =>
                  console.log("Error al trazar ruta del viaje:", error)
                }
              />
            )}
        </MapView>
      ) : (
        <View style={styles.centeredContainer}>
          <Text style={styles.loadingText}>
            Esperando datos de ubicación para el mapa...
          </Text>
        </View>
      )}

      <View style={styles.bottomContainer}>
        <TouchableOpacity
          style={styles.chatButton}
          onPress={() =>
            navigation.navigate("RideChat", {
              rideId: rideDetails._id,
              userId: user.id,
              userName: user.name,
              driverId: rideDetails.driver?._id,
              driverName: rideDetails.driver?.name,
            })
          }
        >
          <Text style={styles.chatButtonText}>Abrir Chat</Text>
        </TouchableOpacity>
        {rideDetails.status !== "finalizado" &&
          rideDetails.status !== "cancelado" && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                Alert.alert(
                  "Cancelar Viaje",
                  "¿Estás seguro de que quieres cancelar el viaje?",
                  [
                    { text: "No", style: "cancel" },
                    {
                      text: "Sí",
                      onPress: async () => {
                        try {
                          await axios.post(
                            `${API_BASE_URL}/rides/${rideId}/cancel`,
                            {},
                            {
                              headers: {
                                Authorization: `Bearer ${user.token}`,
                              },
                            }
                          );
                          if (socket && rideDetails.driver?._id) {
                            socket.emit("ride_cancelled_by_passenger", {
                              rideId: rideDetails._id,
                              driverId: rideDetails.driver._id,
                            });
                          }
                          Alert.alert(
                            "Viaje Cancelado",
                            "Tu viaje ha sido cancelado."
                          );
                          navigation.replace("PassengerHomeScreen");
                        } catch (err) {
                          console.error(
                            "Error al cancelar viaje:",
                            err.response?.data || err.message
                          );
                          Alert.alert("Error", "No se pudo cancelar el viaje.");
                        }
                      },
                    },
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
    backgroundColor: "#0a0f1c",
  },
  centeredContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0a0f1c",
  },
  loadingText: {
    marginTop: 10,
    color: "#fff",
    fontSize: 16,
  },
  headerText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    paddingVertical: 15,
    backgroundColor: "#1a1f2e",
  },
  statusText: {
    fontSize: 18,
    color: "#00f0ff",
    textAlign: "center",
    paddingBottom: 5,
  },
  driverInfo: {
    fontSize: 16,
    color: "#bbb",
    textAlign: "center",
    marginBottom: 2,
  },
  map: {
    flex: 1,
  },
  bottomContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    padding: 15,
    backgroundColor: "#1a1f2e",
    borderTopWidth: 1,
    borderColor: "#00f0ff",
  },
  chatButton: {
    backgroundColor: "#00f0ff",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    flex: 1,
    marginRight: 10,
    alignItems: "center",
  },
  chatButtonText: {
    color: "#0a0f1c",
    fontSize: 16,
    fontWeight: "bold",
  },
  cancelButton: {
    backgroundColor: "#ff4d4d",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    flex: 1,
    marginLeft: 10,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
