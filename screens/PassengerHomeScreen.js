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
import { API_BASE_URL } from "../utils/config"; // No se usa SOCKET_URL aquí directamente
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
  const { user, signOut, isAuthenticated } = useAuth();
  const { socket } = useSocket();

  const [region, setRegion] = useState(null); // Ubicación actual del pasajero
  const [destinationRegion, setDestinationRegion] = useState(null); // Ubicación del destino (nueva)
  const [drivers, setDrivers] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);

  // **** TEMPORAL: Hardcodea un destino y un precio para pruebas ****
  // En una aplicación real, esto se obtendría de la UI (input de usuario, selección en el mapa)
  const [priceOffered, setPriceOffered] = useState(15.50); // Ejemplo de precio
  const DEFAULT_DESTINATION = {
    latitude: -16.401, // Latitud de un punto cercano al centro de Arequipa
    longitude: -71.535, // Longitud de un punto cercano al centro de Arequipa
    address: "Plaza de Armas de Arequipa" // Una dirección de ejemplo
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
        // console.log("Mi token:", user.token); // Debug
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
  // Considera usar Socket.IO para esto para un tiempo real más eficiente
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
              const prev = prevDrivers.find(
                (d) => d._id === newDriver._id
              ); // Usar _id para comparar
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
                // Si tu backend devuelve el nombre del conductor directamente en 'name'
                // no necesitas 'user: { name: ... }'. Revisa la estructura de 'res.data'
                // Si viene como driver.name, entonces driver.name ya es suficiente.
                // Si viene como driver.user.name, entonces es driver.user.name.
                // Basado en tu JSON de available drivers, 'name' está directamente.
                // Por lo tanto, driver.name en el Marker title es correcto.
              };
            })
        );
      } catch (err) {
        console.error(
          "Error cargando conductores (¡Verifica el backend!):",
          err.response?.data?.message || err.message
        );
        // Opcional: Mostrar un mensaje al usuario si no se pueden cargar los conductores
        // Alert.alert("Error", "No se pudieron cargar los conductores disponibles.");
      }
    };

    fetchDrivers();
    // Polling cada 15 segundos para obtener conductores (considera cambiar a Socket.IO)
    const interval = setInterval(fetchDrivers, 15000);
    return () => clearInterval(interval);
  }, []);

  // 4. Manejo de eventos de Socket.IO para viajes y ubicación de conductor
  useEffect(() => {
    if (!socket || !isAuthenticated || !user?.id) { // Usar user?._id para la autenticación en socket
      console.log(
        "Socket no listo o usuario no autenticado para eventos de pasajero."
      );
      return;
    }

    // Unirse a una sala específica del usuario si es necesario para notificaciones directas
    socket.emit("join_room", user.id); // Por ejemplo, para recibir ride_accepted para este usuario

    socket.on("ride_accepted", (data) => {
      console.log("¡Viaje aceptado!", data);
      // Asegúrate de que 'data.passenger' sea el ID del pasajero
      if (data.passenger === user.id) { // Compara con user._id
        setActiveRide(data); // `data` ya es el objeto `ride` completo o similar
        Alert.alert(
          "¡Viaje Aceptado!",
          `Tu viaje ha sido aceptado por ${data.driver.name}.` // Asumiendo que `data.driver` está populado
        );
        navigation.navigate("PassengerRideInProgress", {
          rideId: data._id, // Usar data._id del objeto ride completo
        });
      }
    });

    socket.on("driver_location_update", (data) => {
      // Esta lógica de actualización se manejará mejor en PassengerRideInProgress
      // para centrar el mapa y mostrar la ruta del conductor.
      // Aquí, solo actualizamos los drivers visibles en el mapa principal si es necesario.
      setDrivers((prevDrivers) => {
          const updatedDrivers = prevDrivers.map(d => {
            console.log("esto es dentro del hook state: ", d._id)
              if (d._id === data.driverId) { // Compara con _id
                  const rotation = calculateBearing(
                      d.coordinates.latitude, d.coordinates.longitude,
                      data.coordinates.latitude, data.coordinates.longitude
                  );
                  return { ...d, coordinates: data.coordinates, rotation };
              }
              return d;
          });
          return updatedDrivers;
      });
    });

    socket.on("ride_status_updated", (data) => { // Renombrado de 'ride_status_update' a 'ride_status_updated' para coincidir con tu backend
      if (activeRide && data.rideId === activeRide._id) {
        console.log(
          `Estado del viaje ${data.rideId} actualizado a: ${data.status}`
        );
        if (data.status === "finalizado" || data.status === "cancelado") { // Estados en español
          setActiveRide(null);
          Alert.alert(
            "Info",
            `Tu viaje ha sido ${
              data.status === "finalizado" ? "completado" : "cancelado"
            }.`
          );
          // Reiniciar la navegación o volver a la pantalla principal
          navigation.reset({
            index: 0,
            routes: [{ name: 'PassengerHomeScreen' }], // Asegúrate de que 'PassengerHomeScreen' es el nombre de esta pantalla en tu navegador
          });
        } else {
          setActiveRide((prevRide) => ({ ...prevRide, status: data.status }));
        }
      }
    });

    return () => {
      socket.off("ride_accepted");
      socket.off("driver_location_update");
      socket.off("ride_status_updated"); // Usar el nombre corregido
      socket.emit("leave_room", user.id); // Salir de la sala al desmontar
    };
  }, [socket, isAuthenticated, user?.id, activeRide, navigation]); // Dependencias correctas

  // Función para solicitar un viaje
  const handleRequestRide = async () => {
    // Validaciones
    if (!isAuthenticated || !user?.id || !region) { // Usar user?._id
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
      // Lógica para navegar a la pantalla de viaje activo si ya existe
      if (activeRide.status === "buscando" || activeRide.status === "aceptado") { // Estados en español
        navigation.navigate("WaitingForDriverScreen", {
          rideId: activeRide._id,
        });
      } else if (activeRide.status === "en_curso") { // Estado en español
        navigation.navigate("PassengerRideInProgress", {
          rideId: activeRide._id,
        });
      }
      return;
    }

    // **** TEMPORAL: Asegúrate de que el destino esté definido para la solicitud ****
    // Para una experiencia de usuario real, aquí iría la lógica para que el usuario seleccione el destino.
    // Por ahora, usamos el destino por defecto.
    if (!destinationRegion) {
        setDestinationRegion(DEFAULT_DESTINATION);
        // Podrías poner un Alert aquí para indicar que se usará un destino por defecto.
        // Alert.alert("Destino de Prueba", "Se utilizará un destino predefinido para la solicitud.");
    }
    // ********************************************************************************

    setLoading(true);
    try {
      const rideRequest = {
        origin: {
          latitude: region.latitude,
          longitude: region.longitude,
          address: "Mi ubicación actual" // Aquí podrías usar una geocodificación inversa real
        },
        destination: { // ¡ESTO ES LO NUEVO REQUERIDO!
          latitude: destinationRegion?.latitude || DEFAULT_DESTINATION.latitude, // Usa el estado si está definido, si no, el default
          longitude: destinationRegion?.longitude || DEFAULT_DESTINATION.longitude, // Usa el estado si está definido, si no, el default
          address: destinationRegion?.address || DEFAULT_DESTINATION.address // Usa el estado si está definido, si no, el default
        },
        price_offered: priceOffered, // ¡ESTO ES LO NUEVO REQUERIDO!
      };

      console.log("Solicitando viaje con payload:", rideRequest);
      const response = await axios.post(
        `${API_BASE_URL}/rides`, // Endpoint correcto: POST /api/rides/
        rideRequest,
        {
          headers: { Authorization: `Bearer ${user.token}` },
        }
      );

      setActiveRide(response.data.ride); // Asegúrate de acceder a 'ride' dentro de la respuesta
      Alert.alert("Viaje solicitado", "Buscando un conductor para tu viaje...");
      navigation.navigate("WaitingForDriverScreen", {
        rideId: response.data.ride._id, // Pasa el _id del viaje creado
      });
    } catch (err) {
      console.error(
        "Error al solicitar viaje:",
        err.response?.data?.message || err.message,
        err.response?.status,
        err.response?.data // Imprime los datos completos del error si están disponibles
      );
      if (err.response?.status === 409) {
        Alert.alert(
          "Viaje Activo",
          err.response.data?.message || "Ya tienes un viaje activo."
        );
      } else {
        Alert.alert(
          "Error",
          "No se pudo solicitar el viaje. Intenta de nuevo."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      "Cerrar Sesión",
      "¿Estás seguro de que quieres cerrar tu sesión?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Sí", onPress: () => signOut() },
      ]
    );
  };

  // Mueve el handleMapPress aquí para interactividad de selección de destino
  const handleMapPress = (e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setDestinationRegion({
      latitude,
      longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
      address: `Destino: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}` // Puedes usar una API de geocodificación inversa para una dirección real
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
        onPress={handleMapPress} // Permite seleccionar destino al tocar el mapa
      >
        {/* Marcador de la ubicación actual del pasajero (ya lo hace showsUserLocation, pero puedes añadir uno personalizado) */}
        {region && (
          <Marker
            coordinate={region}
            title="Tu Ubicación"
            description="Punto de inicio del viaje"
          >
            <Image
              source={require("../assets/passenger-icon.png")} // Un ícono diferente para el pasajero
              style={{ width: 30, height: 30 }}
              resizeMode="contain"
            />
          </Marker>
        )}

        {/* Marcador de Destino Seleccionado */}
        {destinationRegion && (
          <Marker
            coordinate={destinationRegion}
            title="Tu Destino"
            description={destinationRegion.address || "Punto de destino del viaje"}
            pinColor="blue" // Un color diferente para el destino
          />
        )}

        {/* Marcadores de Conductores disponibles */}
        {drivers.map((driver) => {
          if (
            driver.coordinates &&
            typeof driver.coordinates.latitude === "number" &&
            typeof driver.coordinates.longitude === "number"
          ) {
            return (
              <Marker
                key={driver._id} // Usar driver._id como key
                coordinate={{
                  latitude: driver.coordinates.latitude,
                  longitude: driver.coordinates.longitude,
                }}
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
            {activeRide.status === "buscando" && ( // Estado en español
              <Text style={styles.subStatusText}>Buscando un conductor...</Text>
            )}
            {activeRide.status === "aceptado" && ( // Estado en español
              <Text style={styles.subStatusText}>Conductor en camino.</Text>
            )}
            {activeRide.status === "en_curso" && ( // Estado en español
              <Text style={styles.subStatusText}>Viaje en curso.</Text>
            )}
            <Button
              title="Ver Detalles del Viaje"
              onPress={() => {
                if (
                  activeRide.status === "buscando" || // Estado en español
                  activeRide.status === "aceptado"    // Estado en español
                ) {
                  navigation.navigate("WaitingForDriverScreen", {
                    rideId: activeRide._id,
                  });
                } else if (activeRide.status === "en_curso") { // Estado en español
                  navigation.navigate("PassengerRideInProgress", {
                    rideId: activeRide._id,
                  });
                }
              }}
              color="#00f0ff"
            />
          </View>
        )}

        {/* Muestra el botón de solicitar viaje solo si no hay un viaje activo */}
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
            activeRide.status !== "finalizado" && // Estado en español
            activeRide.status !== "cancelado" && ( // Estado en español
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate("RideChat", {
                    rideId: activeRide._id,
                    userId: user.id, // Usar user._id
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