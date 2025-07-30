import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet, // Asegúrate de que tus estilos estén importados o definidos aquí
  Button,
  Dimensions,
  Alert,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
  Image,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { API_BASE_URL, Maps_API_KEY } from "../utils/config";
import axios from "axios";
import { useNavigation } from "@react-navigation/native";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";

// Constantes de dimensiones
const { width, height } = Dimensions.get("window");
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.0922;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;

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

// Función auxiliar para decodificar polilíneas
const decodePolyline = (encoded) => {
  if (!encoded) {
    console.warn("Intentando decodificar una polilínea nula o vacía.");
    return [];
  }

  let points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    let dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    let dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
};

const PassengerHomeScreen = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const { socket } = useSocket();
  const navigation = useNavigation();
  const mapRef = useRef(null);

  const [currentLocation, setCurrentLocation] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [locationErrorMsg, setLocationErrorMsg] = useState(null);

  const [destination, setDestination] = useState("");
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [isRequestingRidePanelVisible, setIsRequestingRidePanelVisible] =
    useState(false);
  const [rideEstimate, setRideEstimate] = useState(null); // Contendrá fare, duration, distance, polyline
  const [isSearchingDestination, setIsSearchingDestination] = useState(false);
  const [pickupLocation, setPickupLocation] = useState(null);
  const [routePolyline, setRoutePolyline] = useState([]);
  const [isRideRequested, setIsRideRequested] = useState(false);
  const [searchingDriver, setSearchingDriver] = useState(false);
  const [rideId, setRideId] = useState(null);
  const [activeRide, setActiveRide] = useState(null);

  useEffect(() => {
    if (!Maps_API_KEY) {
      console.warn(
        "Advertencia: La clave de Google Maps API no se cargó. Verifica tu app.json y la reconstrucción de la app."
      );
      Alert.alert(
        "Error de Configuración",
        "La clave de Google Maps API no se encontró. Algunas funcionalidades (búsqueda de destino, rutas) no funcionarán. Asegúrate de configurarla en app.json y reconstruir la aplicación."
      );
    }
  }, [Maps_API_KEY]);

  // --- Efecto para obtener la ubicación actual del usuario ---
  useEffect(() => {
    const getLocation = async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationErrorMsg("Permiso para acceder a la ubicación denegado.");
        Alert.alert(
          "Permiso de Ubicación",
          "Por favor, concede permiso de ubicación para usar la aplicación."
        );
        setLoadingLocation(false);
        return;
      }

      let location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setCurrentLocation(location.coords);
      setPickupLocation(location.coords);
      setLoadingLocation(false);
      mapRef.current?.animateToRegion(
        {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: LATITUDE_DELTA,
          longitudeDelta: LONGITUDE_DELTA,
        },
        1000
      );
    };

    getLocation();
  }, []);

  // --- Efecto para manejar eventos de Socket.IO ---
  useEffect(() => {
    if (!socket || !isAuthenticated || !user?.id) {
      console.log(
        "Socket no listo o usuario no autenticado para eventos de pasajero."
      );
      return;
    }

    // Ya no necesitas emitir 'join_room' aquí al inicio si ya lo haces en SocketContext con 'join'
    // socket.emit("join_room", user.id);
    // console.log(`[Socket] Pasajero ${user.id} se unió a su sala.`);

    // Estos listeners de 'connect', 'disconnect', 'connect_error'
    // ya se manejan en SocketContext.js, no es necesario duplicarlos aquí
    // a menos que quieras lógica específica adicional para este componente.
    // socket.on("connect", () => {
    //   console.log("✅ Socket.IO conectado para pasajero:", socket.id);
    //   socket.emit("join_room", user.id); // Este join_room podría causar un problema si el backend espera 'join'
    // });

    // socket.on("disconnect", () => {
    //   console.log("❌ Socket.IO desconectado para pasajero");
    // });

    // socket.on("connect_error", (err) => {
    //   console.error("❌ Error de conexión de Socket.IO:", err.message);
    // });

    socket.on("driverLocationUpdateForPassengers", (data) => {
      setDrivers((prevDrivers) => {
        const existingDriverIndex = prevDrivers.findIndex(
          (d) => d._id === data.driverId
        );
        let newRotation = 0;
        let updatedDriver;

        if (existingDriverIndex !== -1) {
          const existingDriver = prevDrivers[existingDriverIndex];
          if (existingDriver.coordinates && data.latitude && data.longitude) {
            newRotation = calculateBearing(
              existingDriver.coordinates.latitude,
              existingDriver.coordinates.longitude,
              data.latitude,
              data.longitude
            );
          }
          updatedDriver = {
            ...existingDriver,
            coordinates: { latitude: data.latitude, longitude: data.longitude },
            rotation: newRotation,
            name: data.driverName || existingDriver.name,
          };
          const newDrivers = [...prevDrivers];
          newDrivers[existingDriverIndex] = updatedDriver;
          return newDrivers;
        } else {
          updatedDriver = {
            _id: data.driverId,
            name: data.driverName || "Conductor",
            coordinates: { latitude: data.latitude, longitude: data.longitude },
            rotation: 0,
            isAvailable: true,
          };
          return [...prevDrivers, updatedDriver];
        }
      });
    });

    socket.on("driverUnavailable", (data) => {
      console.log(
        `Conductor ${data.driverId} no disponible. Removiendo del mapa.`
      );
      setDrivers((prevDrivers) =>
        prevDrivers.filter((d) => d._id !== data.driverId)
      );
    });

    // === INICIO DE MODIFICACIÓN DEL LISTENER 'ride_accepted' ===
    socket.on("ride_accepted", (data) => {
      console.log("¡Viaje aceptado!", data);
      setSearchingDriver(false);
      setIsRideRequested(false);

      const acceptedRide = data.ride; // Accede al objeto 'ride' completo que ahora viene en 'data.ride'
      const driverDataFromBackend = acceptedRide.driver; // Accede al objeto 'driver' populado dentro del 'ride'
      const pickupEta = data.pickupEta; // Accede al ETA que también viene en 'data'
      console.log("la ETA: ", pickupEta)
      // Actualiza el estado `activeRide` con el objeto de viaje completo
      setActiveRide(acceptedRide);

      Alert.alert(
        "¡Viaje Aceptado!",
        `El conductor ${
          driverDataFromBackend.name
        } ha aceptado tu viaje. Tiempo estimado de llegada: ${
          driverDataFromBackend.pickupEta !== null
            ? Math.round(driverDataFromBackend.pickupEta / 60) + " min"
            : "Calculando..."
        }.`,
        [
          {
            text: "OK",
            onPress: () =>
              navigation.navigate("PassengerRideInProgress", {
                rideId: acceptedRide._id,
                rideDetail: acceptedRide, // <-- ¡Pasa el objeto de viaje completo!
                driverData: driverDataFromBackend, // <-- ¡Pasa el objeto de conductor completo!
                pickupEta: pickupEta,
              }),
          },
        ]
      );
    });
    // === FIN DE MODIFICACIÓN DEL LISTENER 'ride_accepted' ===

    socket.on("noDriverFound", () => {
      console.log("No se encontraron conductores.");
      setSearchingDriver(false);
      setIsRideRequested(false);
      setActiveRide(null);
      Alert.alert(
        "Lo sentimos",
        "No se encontraron conductores disponibles cerca en este momento."
      );
      setIsRequestingRidePanelVisible(true);
      setRideEstimate(null);
      setDestination("");
      setDestinationCoords(null);
      setRoutePolyline([]);
      setRideId(null);
    });

    socket.on("rideRequestCancelledByDriver", (data) => {
      console.log("Viaje cancelado por el conductor:", data);
      setSearchingDriver(false);
      setIsRideRequested(false);
      setActiveRide(null);
      Alert.alert(
        "Viaje Cancelado",
        `El conductor ha cancelado el viaje. Motivo: ${
          data.reason || "Desconocido"
        }`
      );
      setIsRequestingRidePanelVisible(true);
      setRideEstimate(null);
      setRoutePolyline([]);
      setRideId(null);
    });

    socket.on("ride_status_updated", (data) => {
      console.log(
        `Estado del viaje ${data.rideId} actualizado a: ${data.status}`
      );
      if (activeRide && data.rideId === activeRide._id) {
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
      // socket.off("connect"); // Estos ya no son necesarios aquí si se manejan en SocketContext
      // socket.off("disconnect");
      // socket.off("connect_error");
      socket.off("driverLocationUpdateForPassengers");
      socket.off("driverUnavailable");
      socket.off("ride_accepted"); // Actualizado a 'ride_accepted'
      socket.off("noDriverFound");
      socket.off("rideRequestCancelledByDriver");
      socket.off("ride_status_updated");
      // socket.emit("leave_room", user.id); // Si ya se usa 'join' en SocketContext, esta debería ser 'leave'
      console.log(`[Socket] Pasajero ${user.id} dejó su sala.`); // Este console.log está bien
    };
  }, [socket, isAuthenticated, user?.id, activeRide, navigation]);

  // --- Lógica para obtener estimación de viaje y ruta (backend) ---
  const getRideEstimate = async (origin, dest) => {
    if (!origin || !dest) {
      console.log("Faltan coordenadas de origen o destino para estimación.");
      return;
    }

    try {
      console.log("ORIGEN: ", origin);
      console.log("DESTINATIN: ", dest);
      console.log("TOKEN: ", user.token);

      const response = await axios.post(
        `${API_BASE_URL}/rides/estimate`,
        {
          origin: { latitude: origin.latitude, longitude: origin.longitude },
          destination: { latitude: dest.latitude, longitude: dest.longitude },
        },
        {
          headers: { Authorization: `Bearer ${user.token}` },
        }
      );

      console.log("Estimación de Viaje recibida:", response.data);
      setRideEstimate(response.data);

      if (response.data.polyline) {
        const decoded = decodePolyline(response.data.polyline);
        setRoutePolyline(decoded);
        if (mapRef.current && decoded.length > 0) {
          mapRef.current.fitToCoordinates(decoded, {
            edgePadding: {
              top: 50,
              right: 50,
              bottom: height * 0.35,
              left: 50,
            },
            animated: true,
          });
        }
      } else {
        setRoutePolyline([]);
        if (mapRef.current && dest) {
          mapRef.current?.animateToRegion(
            {
              latitude: dest.latitude,
              longitude: dest.longitude,
              latitudeDelta: LATITUDE_DELTA,
              longitudeDelta: LONGITUDE_DELTA,
            },
            1000
          );
        }
      }
    } catch (error) {
      console.error(
        "Error al obtener estimación de viaje desde backend:",
        error.response?.data || error.message
      );
      Alert.alert(
        "Error de Estimación",
        "No se pudo obtener la estimación del viaje. Intenta de nuevo."
      );
      setRideEstimate(null);
      setRoutePolyline([]);
    }
  };

  // --- Lógica de Geocodificación (búsqueda de destino) ---
  const searchDestination = useCallback(async () => {
    console.log("Iniciando búsqueda de destino para:", destination.trim());

    if (!destination.trim()) {
      Alert.alert("Error", "Por favor, introduce un destino válido.");
      setDestinationCoords(null);
      setRideEstimate(null);
      setRoutePolyline([]);
      return;
    }
    if (!Maps_API_KEY) {
      console.error("Maps_API_KEY es nula o indefinida.");
      Alert.alert(
        "Error de Configuración",
        "La clave de Google Maps API no está disponible. No se puede buscar destino por nombre. Puedes intentar seleccionar un punto en el mapa directamente."
      );
      setIsSearchingDestination(false);
      return;
    }

    setIsSearchingDestination(true);
    Keyboard.dismiss();

    try {
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        destination
      )}&key=${Maps_API_KEY}`;
      console.log("URL de Geocodificación:", geocodeUrl);
      const response = await axios.get(geocodeUrl);
      console.log("Respuesta de Google Geocoding API:", response.data);

      if (response.data.results && response.data.results.length > 0) {
        const { lat, lng } = response.data.results[0].geometry.location;
        const formattedAddress = response.data.results[0].formatted_address;
        const newDestinationCoords = { latitude: lat, longitude: lng };

        setDestinationCoords(newDestinationCoords);
        setDestination(formattedAddress);
        console.log("Destino encontrado:", newDestinationCoords);

        if (pickupLocation) {
          await getRideEstimate(pickupLocation, newDestinationCoords);
        } else {
          Alert.alert(
            "Error",
            "No se pudo obtener tu ubicación actual para calcular la tarifa."
          );
          setRideEstimate(null);
          setRoutePolyline([]);
        }
      } else {
        Alert.alert(
          "Error",
          "No se encontró el destino. Intenta ser más específico."
        );
        setDestinationCoords(null);
        setRideEstimate(null);
        setRoutePolyline([]);
      }
    } catch (error) {
      console.error(
        "Error al buscar destino:",
        error.response?.data || error.message
      );
      Alert.alert(
        "Error de Búsqueda",
        "No se pudo buscar el destino. Verifica tu conexión o intenta de nuevo."
      );
      setDestinationCoords(null);
      setRideEstimate(null);
      setRoutePolyline([]);
    } finally {
      setIsSearchingDestination(false);
    }
  }, [destination, pickupLocation, Maps_API_KEY, user?.token]);

  // --- Lógica para enviar la solicitud de viaje (Socket.IO) ---
  const requestRide = async () => {
    if (!destinationCoords || !pickupLocation || !user?.id || !rideEstimate) {
      Alert.alert(
        "Error",
        "Por favor, selecciona un destino y asegúrate de tener una ubicación de recogida y una estimación de viaje."
      );
      return;
    }

    if (!socket.connected) {
      Alert.alert(
        "Error de Conexión",
        "No estás conectado al servidor. Intenta de nuevo más tarde."
      );
      return;
    }

    setSearchingDriver(true);
    setIsRequestingRidePanelVisible(false);
    console.log("Haber que sucede aqui...");
    try {
      console.log("Enviando solicitud de viaje...");
      socket.emit("requestRide", {
        passengerId: user.id,
        pickupLocation: {
          latitude: pickupLocation.latitude,
          longitude: pickupLocation.longitude,
          address: "Ubicación actual del pasajero", // O una dirección real si la geocodificas
        },
        destination: {
          latitude: destinationCoords.latitude,
          longitude: destinationCoords.longitude,
          address: destination,
        },
        estimatedFare: rideEstimate.fare,
        estimatedDuration: rideEstimate.duration,
        estimatedDistance: rideEstimate.distance,
        // No enviar polyline al backend, ya que la estamos simulando y no es relevante para la solicitud de viaje
      });
      setIsRideRequested(true);
    } catch (error) {
      console.error("Error al enviar solicitud de viaje:", error.message);
      Alert.alert(
        "Error",
        "No se pudo enviar la solicitud de viaje. Intenta de nuevo."
      );
      setSearchingDriver(false);
      setIsRideRequested(false);
      setIsRequestingRidePanelVisible(true);
    }
  };

  const cancelRideRequest = () => {
    if (isRideRequested && rideId && socket.connected) {
      console.log("Cancelando solicitud de viaje...");
      socket.emit("cancelRideRequest", { rideId, passengerId: user.id });
    }
    setIsRideRequested(false);
    setSearchingDriver(false);
    setIsRequestingRidePanelVisible(false);
    setDestination("");
    setDestinationCoords(null);
    setRideEstimate(null);
    setRoutePolyline([]);
    setRideId(null);
    setActiveRide(null);
    console.log("Solicitud de viaje cancelada localmente.");
  };

  const handleLogout = async () => {
    Alert.alert(
      "Cerrar Sesión",
      "¿Estás seguro de que quieres cerrar tu sesión?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Sí", onPress: () => logout() },
      ]
    );
  };

  const handleMapPress = (e) => {
    // Solo permitir seleccionar destino si el panel de solicitud de viaje está visible
    // y no hay un viaje activo en curso (buscando, aceptado, en_curso)
    if (isRequestingRidePanelVisible && !activeRide) {
      const { latitude, longitude } = e.nativeEvent.coordinate;
      const newDestinationCoords = { latitude, longitude };
      setDestinationCoords(newDestinationCoords);
      // Aquí podrías hacer una geocodificación inversa para obtener la dirección real
      setDestination(
        `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`
      );

      if (pickupLocation) {
        getRideEstimate(pickupLocation, newDestinationCoords);
      } else {
        Alert.alert(
          "Error",
          "No se pudo obtener tu ubicación actual para calcular la tarifa."
        );
      }
    }
  };

  // --- Renderizado Condicional del Mapa ---
  if (loadingLocation) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#00f0ff" />
        <Text style={styles.loadingText}>Cargando tu ubicación...</Text>
        {locationErrorMsg && (
          <Text style={styles.errorText}>{locationErrorMsg}</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {currentLocation && (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            latitudeDelta: LATITUDE_DELTA,
            longitudeDelta: LONGITUDE_DELTA,
          }}
          showsUserLocation={true}
          followsUserLocation={true}
          onPress={handleMapPress}
        >
          {pickupLocation && (
            <Marker
              coordinate={pickupLocation}
              title="Mi Ubicación"
              description="Aquí estoy yo"
            >
              <Image
                source={require("../assets/passenger-icon.png")}
                style={{ width: 30, height: 30 }}
                resizeMode="contain"
              />
            </Marker>
          )}

          {destinationCoords && (
            <Marker
              coordinate={destinationCoords}
              title="Destino"
              description={destination}
              pinColor="#ff0000"
            />
          )}

          {drivers.map((driver) => {
            if (
              driver.coordinates &&
              typeof driver.coordinates.latitude === "number" &&
              typeof driver.coordinates.longitude === "number"
            ) {
              // Si activeRide está definido y este conductor es el asignado al viaje activo
              const isAssignedDriver =
                activeRide &&
                activeRide.driver &&
                activeRide.driver._id === driver._id;
              return (
                <Marker
                  key={driver._id}
                  coordinate={{
                    latitude: driver.coordinates.latitude,
                    longitude: driver.coordinates.longitude,
                  }}
                  title={driver.name || "Conductor"}
                  description={
                    isAssignedDriver
                      ? "Tu Conductor Asignado"
                      : "Conductor disponible"
                  }
                >
                  <Image
                    source={require("../assets/car-icon.png")}
                    style={{
                      width: 40,
                      height: 40,
                      transform: [{ rotate: `${driver.rotation || 0}deg` }],
                      tintColor: isAssignedDriver ? "gold" : undefined, // Opcional: Cambia el color si es el conductor asignado
                    }}
                    resizeMode="contain"
                  />
                </Marker>
              );
            }
            return null;
          })}

          {/* Renderiza Polyline SÓLO si routePolyline tiene puntos */}
          {routePolyline.length > 0 && (
            <Polyline
              coordinates={routePolyline}
              strokeWidth={4}
              strokeColor="#6a0dad"
            />
          )}
        </MapView>
      )}

      <View style={styles.controlPanel}>
        <Text style={styles.title}>¡Pide tu Viaje!</Text>
        <Text style={styles.infoText}>Hola, {user?.name || "Pasajero"}!</Text>

        {activeRide &&
        (activeRide.status === "buscando" ||
          activeRide.status === "aceptado" ||
          activeRide.status === "en_curso") ? (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>
              Estado del viaje: {activeRide.status?.toUpperCase()}
            </Text>
            {activeRide.status === "buscando" && (
              <>
                <Text style={styles.subStatusText}>
                  Buscando un conductor...
                </Text>
                <ActivityIndicator
                  size="small"
                  color="#00f0ff"
                  style={{ marginTop: 10 }}
                />
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    { backgroundColor: "#ff4d4d", marginTop: 10 },
                  ]}
                  onPress={cancelRideRequest}
                >
                  <Text style={styles.logoutButtonText}>Cancelar Búsqueda</Text>
                </TouchableOpacity>
              </>
            )}
            {activeRide.status === "aceptado" && activeRide.driver ? (
              <>
                <Text style={styles.subStatusText}>
                  Conductor {activeRide.driver.name} en camino.
                </Text>
                <Text style={styles.subStatusText}>
                  Modelo: {activeRide.driver.carDetails?.model} - Placa:{" "}
                  {activeRide.driver.carDetails?.licensePlate}
                </Text>
              </>
            ) : (
              activeRide.status === "aceptado" && (
                <Text style={styles.subStatusText}>
                  Conductor en camino (detalles cargando).
                </Text>
              )
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
                  // Asegúrate de pasar driverData si activeRide.driver está populado
                  navigation.navigate("WaitingForDriverScreen", {
                    rideId: activeRide._id,
                    driverData: activeRide.driver, // Pasa el objeto driver completo si lo tienes
                  });
                } else if (activeRide.status === "en_curso") {
                  navigation.navigate("PassengerRideInProgress", {
                    rideId: activeRide._id,
                    driverData: activeRide.driver, // Pasa el objeto driver completo si lo tienes
                  });
                }
              }}
              color="#00f0ff"
            />
          </View>
        ) : (
          <>
            {!isRequestingRidePanelVisible &&
              !isRideRequested &&
              !searchingDriver && (
                <TouchableOpacity
                  onPress={() => setIsRequestingRidePanelVisible(true)}
                  style={styles.requestButton}
                >
                  <LinearGradient
                    colors={["#00f0ff", "#0cf574"]}
                    start={[0, 0]}
                    end={[1, 1]}
                    style={styles.gradientButton}
                  >
                    <Text style={styles.buttonText}>¿A dónde vamos?</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}

            {isRequestingRidePanelVisible && (
              <View style={styles.requestPanel}>
                <TextInput
                  style={styles.input}
                  placeholder="¿A dónde vas?"
                  placeholderTextColor="#999"
                  value={destination}
                  onChangeText={setDestination}
                  onSubmitEditing={searchDestination}
                  autoCapitalize="words"
                />
                {isSearchingDestination && (
                  <ActivityIndicator
                    size="small"
                    color="#00f0ff"
                    style={styles.searchIndicator}
                  />
                )}

                {rideEstimate && (
                  <View style={styles.estimateContainer}>
                    <Text style={styles.estimateText}>
                      Destino: {destination}
                    </Text>
                    <Text style={styles.estimateText}>
                      Tarifa Estimada: ${" "}
                      {rideEstimate.fare ? rideEstimate.fare.toFixed(2) : "N/A"}
                    </Text>
                    <Text style={styles.estimateText}>
                      Duración Estimada:{" "}
                      {rideEstimate.duration
                        ? Math.round(rideEstimate.duration / 60)
                        : "N/A"}{" "}
                      min
                    </Text>
                    <Text style={styles.estimateText}>
                      Distancia Estimada:{" "}
                      {rideEstimate.distance
                        ? rideEstimate.distance.toFixed(2)
                        : "N/A"}{" "}
                      km
                    </Text>
                  </View>
                )}

                {destinationCoords && rideEstimate && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={requestRide}
                    disabled={!destinationCoords || !rideEstimate}
                  >
                    <LinearGradient
                      colors={["#00f0ff", "#0cf574"]}
                      start={[0, 0]}
                      end={[1, 1]}
                      style={styles.gradientButton}
                    >
                      <Text style={styles.buttonText}>
                        Solicitar Viaje Ahora
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: "#ff4d4d" }]}
                  onPress={() => {
                    setIsRequestingRidePanelVisible(false);
                    setDestination("");
                    setDestinationCoords(null);
                    setRideEstimate(null);
                    setRoutePolyline([]);
                  }}
                >
                  <Text style={styles.logoutButtonText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            )}

            {isRideRequested && searchingDriver && (
              <View style={styles.searchingPanel}>
                <ActivityIndicator size="large" color="#00f0ff" />
                <Text style={styles.searchingText}>
                  Buscando conductor cerca...
                </Text>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: "#ff4d4d" }]}
                  onPress={cancelRideRequest}
                >
                  <Text style={styles.logoutButtonText}>
                    {" "}
                    Cancelar Solicitud{" "}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
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

// Aquí deben ir tus estilos
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#2c2c2c",
  },
  loadingText: {
    marginTop: 10,
    color: "#fff",
    fontSize: 16,
  },
  errorText: {
    marginTop: 10,
    color: "red",
    fontSize: 14,
    textAlign: "center",
    marginHorizontal: 20,
  },
  map: {
    width: "100%",
    height: "100%",
    position: "absolute",
    zIndex: -1,
  },
  controlPanel: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    backgroundColor: "#3a3a3a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 10,
  },
  infoText: {
    fontSize: 16,
    color: "#fff",
    marginBottom: 15,
  },
  requestButton: {
    width: "90%",
    borderRadius: 10,
    overflow: "hidden", // Para que el gradiente no se desborde
    marginBottom: 15,
  },
  gradientButton: {
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  requestPanel: {
    width: "100%",
    paddingHorizontal: 10,
    alignItems: "center",
  },
  input: {
    width: "95%",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    marginBottom: 10,
    color: "#333",
  },
  searchIndicator: {
    marginTop: 5,
    marginBottom: 10,
  },
  estimateContainer: {
    backgroundColor: "#4c4c4c",
    borderRadius: 10,
    padding: 15,
    width: "95%",
    marginBottom: 15,
    borderColor: "#00f0ff",
    borderWidth: 1,
  },
  estimateText: {
    color: "#fff",
    fontSize: 15,
    marginBottom: 5,
  },
  actionButton: {
    width: "95%",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 10,
  },
  logoutButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    paddingVertical: 15,
  },
  searchingPanel: {
    width: "100%",
    paddingHorizontal: 20,
    alignItems: "center",
    paddingVertical: 20,
  },
  searchingText: {
    color: "#fff",
    fontSize: 18,
    marginTop: 15,
    marginBottom: 20,
  },
  statusBox: {
    width: "95%",
    backgroundColor: "#4c4c4c",
    borderRadius: 10,
    padding: 20,
    alignItems: "center",
    marginTop: 10,
    marginBottom: 15,
    borderColor: "#00f0ff",
    borderWidth: 1,
  },
  statusText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#00f0ff",
    marginBottom: 10,
  },
  subStatusText: {
    fontSize: 16,
    color: "#fff",
    marginBottom: 5,
    textAlign: "center",
  },
  bottomButtons: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginTop: 20,
  },
  chatButton: {
    backgroundColor: "#0cf574",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
    marginRight: 10,
    alignItems: "center",
  },
  chatButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  logoutButton: {
    backgroundColor: "#ff4d4d",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
    marginLeft: 10,
    alignItems: "center",
  },
});

export default PassengerHomeScreen;
