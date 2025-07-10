import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Button,
  Dimensions,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { API_BASE_URL } from "../utils/config";
import { LinearGradient } from "expo-linear-gradient";

// Función para calcular la orientación del vehículo (para la rotación del icono)
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

const PassengerHomeScreen = ({ navigation }) => {
  const { user, logout, isAuthenticated } = useAuth();
  const { socket } = useSocket();

  const [region, setRegion] = useState(null); // Ubicación actual del pasajero
  const [destinationRegion, setDestinationRegion] = useState(null); // Ubicación del destino (nueva)
  const [drivers, setDrivers] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);

  // **** TEMPORAL: Hardcodea un destino y un precio para pruebas ****
  const [priceOffered, setPriceOffered] = useState(15.50); // Ejemplo de precio
  const DEFAULT_DESTINATION = {
    latitude: -16.401, // Latitud de un punto cercano al centro de Arequipa
    longitude: -71.535, // Longitud de un punto cercano al centro de Arequipa
    address: "Plaza de Armas de Arequipa", // Una dirección de ejemplo
  };
  // ******************************************************************

  // 1. Obtener ubicación del pasajero al cargar la pantalla
  useEffect(() => {
    const getPassengerLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permiso de ubicación denegado",
            "Por favor, otorga permisos de ubicación para usar la aplicación."
          );
          setLoading(false);
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
        // Opcional: Centrar el mapa en la ubicación del usuario si se obtiene
        mapRef.current?.animateToRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }, 1000);
      } catch (error) {
        console.error("Error al obtener ubicación:", error);
        Alert.alert(
          "Error de ubicación",
          "No pudimos obtener tu ubicación actual. Asegúrate de que los servicios de ubicación estén activados."
        );
      } finally {
        setLoading(false);
      }
    };

    getPassengerLocation();
  }, []);

  // 2. Verificar viaje activo al cargar la pantalla y cada vez que el usuario o la autenticación cambien
  useEffect(() => {
    const checkActiveRide = async () => {
      if (!isAuthenticated || !user?.token) {
        setActiveRide(null);
        return;
      }
      try {
        const res = await axios.get(`${API_BASE_URL}/rides/active`, {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        setActiveRide(res.data);
      } catch (err) {
        if (err.response?.status === 404) {
          setActiveRide(null); // No hay viaje activo, es un estado normal
        } else {
          console.error(
            "Error al verificar viaje activo:",
            err.response?.data?.message || err.message
          );
          Alert.alert("Error", "No se pudo cargar el estado del viaje activo.");
        }
      }
    };
    checkActiveRide();
  }, [isAuthenticated, user?.token]);

  // 3. Obtener conductores disponibles y escuchar actualizaciones via REST (polling)
  useEffect(() => {
    const fetchDrivers = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/location/available`);
        setDrivers((prevDrivers) =>
          res.data
            .filter(
              (driver) =>
                driver.coordinates &&
                typeof driver.coordinates.latitude === "number" &&
                typeof driver.coordinates.longitude === "number"
            )
            .map((newDriver) => {
              const prev = prevDrivers.find((d) => d._id === newDriver._id);
              let rotation = 0;
              if (prev && prev.coordinates && newDriver.coordinates) {
                rotation = calculateBearing(
                  prev.coordinates.latitude,
                  prev.coordinates.longitude,
                  newDriver.coordinates.latitude,
                  newDriver.coordinates.longitude
                );
              }
              return {
                ...newDriver,
                rotation,
              };
            })
        );
      } catch (err) {
        console.error(
          "Error cargando conductores (¡Verifica el backend!):",
          err.response?.data?.message || err.message
        );
      }
    };

    fetchDrivers();
    const interval = setInterval(fetchDrivers, 15000);
    return () => clearInterval(interval);
  }, []);

  // 4. Manejo de eventos de Socket.IO para viajes y ubicación de conductor
  useEffect(() => {
    // Usar user?.id consistentemente para los sockets
    if (!socket || !isAuthenticated || !user?.id) {
      console.log(
        "Socket no listo o usuario no autenticado para eventos de pasajero."
      );
      return;
    }

    socket.emit("join_room", user.id);

    socket.on("ride_accepted", (data) => {
      console.log("¡Viaje aceptado!", data);
      if (data.passenger === user.id) {
        setActiveRide(data);
        Alert.alert(
          "¡Viaje Aceptado!",
          `Tu viaje ha sido aceptado por ${data.driver.name}.`
        );
        navigation.navigate("PassengerRideInProgress", {
          rideId: data._id,
        });
      }
    });

    socket.on("driver_location_update", (data) => {
      setDrivers((prevDrivers) => {
        const updatedDrivers = prevDrivers.map((d) => {
          if (d._id === data.driverId) {
            const rotation = calculateBearing(
              d.coordinates.latitude,
              d.coordinates.longitude,
              data.coordinates.latitude,
              data.coordinates.longitude
            );
            return { ...d, coordinates: data.coordinates, rotation };
          }
          return d;
        });
        return updatedDrivers;
      });
    });

    socket.on("ride_status_updated", (data) => {
      if (activeRide && data.rideId === activeRide._id) {
        console.log(
          `Estado del viaje ${data.rideId} actualizado a: ${data.status}`
        );
        if (data.status === "finalizado" || data.status === "cancelado") {
          setActiveRide(null);
          Alert.alert(
            "Info",
            `Tu viaje ha sido ${
              data.status === "finalizado" ? "completado" : "cancelado"
            }.`
          );
          navigation.reset({
            index: 0,
            routes: [{ name: "PassengerHomeScreen" }],
          });
        } else {
          setActiveRide((prevRide) => ({ ...prevRide, status: data.status }));
        }
      }
    });

    return () => {
      socket.off("ride_accepted");
      socket.off("driver_location_update");
      socket.off("ride_status_updated");
      socket.emit("leave_room", user.id);
    };
  }, [socket, isAuthenticated, user?.id, activeRide, navigation]);

  // Función para solicitar un viaje
  const handleRequestRide = async () => {
    if (!isAuthenticated || !user?.id || !region) {
      Alert.alert(
        "Error",
        "Necesitas estar logueado y tener una ubicación para solicitar un viaje."
      );
      return;
    }
    if (activeRide) {
      Alert.alert(
        "Atención",
        `Ya tienes un viaje en estado: ${activeRide.status}.`
      );
      if (activeRide.status === "buscando" || activeRide.status === "aceptado") {
        navigation.navigate("WaitingForDriverScreen", {
          rideId: activeRide._id,
        });
      } else if (activeRide.status === "en_curso") {
        navigation.navigate("PassengerRideInProgress", {
          rideId: activeRide._id,
        });
      }
      return;
    }

    if (!destinationRegion) {
      setDestinationRegion(DEFAULT_DESTINATION);
    }

    setLoading(true);
    try {
      const rideRequest = {
        origin: {
          latitude: region.latitude,
          longitude: region.longitude,
          address: "Mi ubicación actual",
        },
        destination: {
          latitude: destinationRegion?.latitude || DEFAULT_DESTINATION.latitude,
          longitude:
            destinationRegion?.longitude || DEFAULT_DESTINATION.longitude,
          address: destinationRegion?.address || DEFAULT_DESTINATION.address,
        },
        price_offered: priceOffered,
      };

      console.log("Enviando solicitud de viaje:", rideRequest); // Log de depuración
      const response = await axios.post(
        `${API_BASE_URL}/rides`,
        rideRequest,
        {
          headers: { Authorization: `Bearer ${user.token}` },
        }
      );
    
      console.log("Respuesta del backend al solicitar viaje:", response.data); // Log de depuración

      // --- INICIO DE LA CORRECCIÓN CLAVE ---
      // Flexible para si el objeto del viaje está anidado bajo 'ride' o directamente en 'data'
      const newActiveRide = response.data.ride || response.data; 

      if (!newActiveRide || !newActiveRide._id) {
          throw new Error("Respuesta del servidor de viaje inválida o sin _id.");
      }

      setActiveRide(newActiveRide);
      Alert.alert("Viaje solicitado", "Buscando un conductor para tu viaje...");
      
      // Asegúrate de pasar el _id correcto a la siguiente pantalla
      console.log("Navegando a WaitingForDriverScreen con rideId:", newActiveRide._id); // Log de depuración
      navigation.navigate("WaitingForDriverScreen", {
          rideId: newActiveRide._id,
      });
      // --- FIN DE LA CORRECCIÓN CLAVE ---

    } catch (err) {
      console.error(
        "Error al solicitar viaje:",
        err.response?.data?.message || err.message,
        "Status:", err.response?.status,
        "Data:", err.response?.data
      );
      if (err.response?.status === 409) {
        Alert.alert(
          "Viaje Activo",
          err.response.data?.message || "Ya tienes un viaje activo."
        );
      } else {
        Alert.alert("Error", "No se pudo solicitar el viaje. Intenta de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      "Cerrar Sesión",
      "¿Estás seguro de que quieres cerrar tu sesión?",
      [{ text: "Cancelar", style: "cancel" }, { text: "Sí", onPress: () => logout() }]
    );
  };

  const handleMapPress = (e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setDestinationRegion({
      latitude,
      longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
      address: `Destino: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    });
    Alert.alert(
      "Destino Seleccionado",
      `Has seleccionado un destino en ${latitude.toFixed(4)}, ${longitude.toFixed(4)}.`
    );
  };

  if (loading || !region) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#00f0ff" />
        <Text style={styles.loadingText}>Cargando mapa y ubicación...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        showsUserLocation={true}
        followsUserLocation={true}
        onPress={handleMapPress}
      >
        {region && (
          <Marker
            coordinate={region}
            title="Tu Ubicación"
            description="Punto de inicio del viaje"
          >
            <Image
              source={require("../assets/passenger-icon.png")}
              style={{ width: 30, height: 30 }}
              resizeMode="contain"
            />
          </Marker>
        )}

        {destinationRegion && (
          <Marker
            coordinate={destinationRegion}
            title="Tu Destino"
            description={destinationRegion.address || "Punto de destino del viaje"}
            pinColor="blue"
          />
        )}

        {drivers.map((driver) => {
          if (
            driver.coordinates &&
            typeof driver.coordinates.latitude === "number" &&
            typeof driver.coordinates.longitude === "number"
          ) {
            return (
              <Marker
                key={driver._id}
                coordinate={{
                  latitude: driver.coordinates.latitude,
                  longitude: driver.coordinates.longitude,
                }}
                // CORREGIDO: Asegurarse de que 'title' y 'description' sean strings
                title={driver.name || "Conductor"}
                description={"Conductor disponible"}
              >
                <Image
                  source={require("../assets/car-icon.png")}
                  style={{
                    width: 40,
                    height: 40,
                    transform: [{ rotate: `${driver.rotation || 0}deg` }],
                  }}
                  resizeMode="contain"
                />
              </Marker>
            );
          }
          return null;
        })}
      </MapView>

      <View style={styles.overlayContainer}>
        {activeRide && (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>
              Estado del viaje: {activeRide.status?.toUpperCase()}
            </Text>
            {activeRide.status === "buscando" && (
              <Text style={styles.subStatusText}>Buscando un conductor...</Text>
            )}
            {activeRide.status === "aceptado" && (
              <Text style={styles.subStatusText}>Conductor en camino.</Text>
            )}
            {activeRide.status === "en_curso" && (
              <Text style={styles.subStatusText}>Viaje en curso.</Text>
            )}
            <Button
              title="Ver Detalles del Viaje"
              onPress={() => {
                if (
                  activeRide.status === "buscando" ||
                  activeRide.status === "aceptado"
                ) {
                  navigation.navigate("WaitingForDriverScreen", {
                    rideId: activeRide._id,
                  });
                } else if (activeRide.status === "en_curso") {
                  navigation.navigate("PassengerRideInProgress", {
                    rideId: activeRide._id,
                  });
                }
              }}
              color="#00f0ff"
            />
          </View>
        )}

        {!activeRide && (
          <TouchableOpacity
            onPress={handleRequestRide}
            disabled={loading}
            style={styles.requestButton}
          >
            <LinearGradient
              colors={["#00f0ff", "#0cf574"]}
              start={[0, 0]}
              end={[1, 1]}
              style={styles.gradientButton}
            >
              {loading ? (
                <ActivityIndicator color="#0a0f1c" />
              ) : (
                <Text style={styles.buttonText}>Solicitar Viaje</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}

        <View style={styles.bottomButtons}>
          {activeRide &&
            activeRide.status !== "finalizado" &&
            activeRide.status !== "cancelado" && (
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate("RideChat", {
                    rideId: activeRide._id,
                    userId: user.id,
                    userName: user.name,
                  })
                }
                style={styles.chatButton}
              >
                <Text style={styles.chatButtonText}>Chat del Viaje</Text>
              </TouchableOpacity>
            )}

          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutButtonText}>Cerrar Sesión</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0f1c" },
  centeredContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0a0f1c",
  },
  loadingText: {
    color: "#fff",
    marginTop: 10,
    fontSize: 16,
  },
  map: {
    flex: 1,
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height,
  },
  overlayContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  statusBox: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    padding: 15,
    borderRadius: 15,
    marginBottom: 20,
    alignItems: "center",
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  statusText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#0a0f1c",
    marginBottom: 5,
  },
  subStatusText: {
    fontSize: 14,
    color: "#555",
    marginBottom: 10,
  },
  requestButton: {
    width: "100%",
    marginBottom: 20,
  },
  gradientButton: {
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#0cf574",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  buttonText: {
    color: "#0a0f1c",
    fontWeight: "bold",
    fontSize: 18,
  },
  bottomButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  chatButton: {
    flex: 1,
    backgroundColor: "#00f0ff",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginRight: 10,
  },
  chatButtonText: {
    color: "#0a0f1c",
    fontWeight: "bold",
    fontSize: 16,
  },
  logoutButton: {
    flex: 1,
    backgroundColor: "#ff4d4d",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginLeft: 10,
  },
  logoutButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
});

export default PassengerHomeScreen;