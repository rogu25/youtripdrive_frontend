import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from "react-native";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { API_BASE_URL } from "../utils/config";
import LottieView from "lottie-react-native"; // Asegúrate de que esta ruta sea correcta

const WaitingForDriverScreen = ({ route, navigation }) => {
  const { rideId } = route.params;
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user, isAuthenticated } = useAuth();
  const { socket } = useSocket();

  console.log("WaitingForDriverScreen - rideId:", rideId);
  console.log(
    "WaitingForDriverScreen - Token:",
    user?.token ? "Presente" : "Ausente"
  );
  // console.log("WaitingForDriverScreen - User ID:", user?.id); // Mejor usar user.id del AuthContext si es lo que usas globalmente

  const fetchRideDetails = useCallback(async () => {
    if (!isAuthenticated || !user?.token || !rideId) {
      console.log(
        "fetchRideDetails: Faltan credenciales o rideId. Redirigiendo a Login."
      );
      Alert.alert(
        "Error",
        "No estás autenticado o no hay ID de viaje para buscar."
      );
      setLoading(false);
      navigation.replace("Login");
      return;
    }
    try {
      const response = await axios.get(`${API_BASE_URL}/rides/${rideId}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const fetchedRide = response.data;
      setRide(fetchedRide);
      setLoading(false);

      console.log("fetchRideDetails: Estado del viaje:", fetchedRide.status);

      // Usar los nombres de estado del backend: 'buscando', 'aceptado', 'en_curso', 'finalizado', 'cancelado'
      if (
        fetchedRide.status === "finalizado" ||
        fetchedRide.status === "cancelado"
      ) {
        Alert.alert(
          "Información del Viaje",
          `El viaje ya está ${
            fetchedRide.status === "finalizado" ? "completado" : "cancelado"
          }.`
        );
        navigation.replace("PassengerHomeScreen");
        return;
      }

      // Si el viaje ya fue aceptado o iniciado por un conductor antes de que este cliente cargara la pantalla
      if (
        fetchedRide.status === "aceptado" ||
        fetchedRide.status === "en_curso"
      ) {
        console.log(
          "fetchRideDetails: Viaje ya aceptado o en curso. Navegando a PassengerRideInProgress."
        );
        Alert.alert(
          "¡Viaje Encontrado!",
          "Tu viaje ya ha sido aceptado o está en curso."
        );
        navigation.replace("PassengerRideInProgress", {
          rideId: fetchedRide._id,
        });
        return;
      }
    } catch (error) {
      console.error(
        "Error fetching ride details:",
        error.response?.data?.message || error.message
      );
      Alert.alert(
        "Error",
        "No se pudo cargar los detalles del viaje. Es posible que el viaje ya no exista."
      );
      setLoading(false);
      navigation.replace("PassengerHomeScreen");
    }
  }, [isAuthenticated, user, rideId, navigation]);

  const handleCancelRide = async () => {
    Alert.alert(
      "Cancelar Viaje",
      "¿Estás seguro de que quieres cancelar este viaje? Se detendrá la búsqueda de un conductor.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Sí",
          onPress: async () => {
            try {
              if (!user?.token || !rideId) {
                Alert.alert(
                  "Error",
                  "No estás autenticado o no hay ID de viaje para cancelar."
                );
                return;
              }
              // El endpoint para cancelar un viaje: PUT /rides/status/:rideId con body { status: 'cancelado' }
              // Asegúrate de que tu backend espera el estado 'cancelado' y maneje la autorización
              await axios.put(
                `${API_BASE_URL}/rides/status/${rideId}`,
                { status: "cancelado" },
                {
                  headers: { Authorization: `Bearer ${user.token}` },
                }
              );
              Alert.alert(
                "Viaje Cancelado",
                "Tu viaje ha sido cancelado exitosamente."
              );

              // Emitir el evento de cancelación al conductor si hay uno asignado
              if (ride?.driver?._id && socket) {
                socket.emit("ride_cancelled_by_passenger", {
                  rideId: ride._id.toString(),
                  driverId: ride.driver._id.toString(),
                });
              }
              navigation.replace("PassengerHomeScreen");
            } catch (error) {
              console.error(
                "Error cancelling ride:",
                error.response?.data?.message || error.message
              );
              Alert.alert(
                "Error",
                error.response?.data?.message ||
                  "No se pudo cancelar el viaje. Intenta de nuevo."
              );
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    fetchRideDetails();
  }, [fetchRideDetails]);

  // --- Manejo de Sockets ---
  useEffect(() => {
    // Solo si el socket está conectado y tenemos el ID del usuario y del viaje
    if (!socket || !isAuthenticated || !user?.id || !rideId) {
      // Usamos user.id si es lo que tienes en AuthContext
      console.log(
        "Socket useEffect: Faltan requisitos. No configurando listeners."
      );
      return;
    }

    console.log(
      `Socket useEffect: Configurando listeners para rideId: ${rideId}, userId: ${user.id}`
    );

    // ✅ EVENTO: El conductor ha aceptado el viaje
    const handleRideAccepted = (data) => {
      // console.log("Socket: ride_accepted recibido", data);
      // Asegurarse de que el evento es para el viaje y el pasajero correctos
      // Comparamos el ID del viaje recibido con el rideId actual
      // Y el passengerId recibido con el ID del usuario autenticado (si el backend lo envía)
      // O simplemente navegamos si el rideId coincide, asumiendo que solo se emitirá al pasajero correcto
      if (data.rideId === rideId && data.passengerId === user.id) {
        // Usar user.id si es lo que envía el JWT
        Alert.alert(
          "¡Viaje Aceptado!",
          `Tu viaje ha sido aceptado por ${data.driverName || "un conductor"}.`
        );
        navigation.replace("PassengerRideInProgress", { rideId: data.rideId });
      }
    };

    // ✅ EVENTO: Actualización general del estado del viaje
    const handleRideStatusUpdated = (data) => {
      // console.log("Socket: ride_status_updated recibido", data);
      if (data.rideId === rideId) {
        setRide((prevRide) => ({ ...prevRide, status: data.status })); // Actualiza el estado local

        // Manejar las transiciones de estado
        if (data.status === "cancelado") {
          Alert.alert(
            "Viaje Cancelado",
            "Tu solicitud de viaje ha sido cancelada."
          );
          navigation.replace("PassengerHomeScreen");
        } else if (data.status === "finalizado") {
          Alert.alert("Viaje Completado", "Tu viaje ha finalizado.");
          navigation.replace("PassengerHomeScreen");
        } else if (data.status === "aceptado" || data.status === "en_curso") {
          // Si el estado cambia a aceptado o en_curso, navegar a la pantalla de progreso
          Alert.alert(
            "¡Viaje Encontrado!",
            "Tu viaje ya ha sido aceptado o está en curso."
          );
          navigation.replace("PassengerRideInProgress", {
            rideId: data.rideId,
          });
        }
      }
    };

    // ✅ EVENTO: Un conductor ha rechazado la solicitud (si manejas esto específicamente)
    const handleRideRejected = (data) => {
      // console.log("Socket: ride_rejected recibido", data);
      if (data.rideId === rideId && data.passengerId === user.id) {
        Alert.alert(
          "Viaje Rechazado",
          "Un conductor ha rechazado tu solicitud. Buscando otro..."
        );
        // Aquí podrías querer mantener al pasajero en esta pantalla o intentar re-enviar la solicitud.
        // Por ahora, solo alertamos.
      }
    };

    // --- Configurar Listeners ---
    socket.on("ride_accepted", handleRideAccepted);
    socket.on("ride_status_updated", handleRideStatusUpdated); // Asegúrate de que el backend emite con este nombre
    socket.on("ride_rejected", handleRideRejected); // Si tu backend emite esto

    // --- Función de limpieza ---
    return () => {
      // console.log("Socket useEffect: Limpiando listeners.");
      socket.off("ride_accepted", handleRideAccepted);
      socket.off("ride_status_updated", handleRideStatusUpdated);
      socket.off("ride_rejected", handleRideRejected);
    };
  }, [socket, rideId, user, isAuthenticated, navigation]); // Dependencias: Si alguna cambia, el efecto se re-ejecuta

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#00f0ff" />
        <Text style={styles.loadingText}>Cargando estado del viaje...</Text>
      </View>
    );
  }

  // Si no hay viaje o el estado ya no es 'buscando' o 'aceptado' después de la carga inicial
  // Esto previene mostrar la pantalla de espera si el viaje ya progresó o fue cancelado
  if (!ride || (ride.status !== "buscando" && ride.status !== "aceptado")) {
    console.log(
      "WaitingForDriverScreen: Estado del viaje no apto para esta pantalla. Redirigiendo."
    );
    // Las alertas específicas ya se manejan en fetchRideDetails.
    // Aquí simplemente redirigimos de forma segura.
    navigation.replace("PassengerHomeScreen");
    return null; // No renderizar nada
  }

  return (
    <View style={styles.container}>
      <LottieView
        source={require("../assets/animations/waiting.json")} // Verifica esta ruta
        autoPlay
        loop
        style={styles.animation}
      />
      <Text style={styles.title}>Esperando Conductor</Text>
      <Text style={styles.statusText}>
        Estado: {ride.status?.toUpperCase().replace("_", " ")}
      </Text>
      {ride.status === "buscando" && (
        <Text style={styles.messageText}>
          Estamos buscando el conductor más cercano para tu viaje. Esto puede
          tardar unos segundos. Por favor, mantén esta pantalla abierta.
        </Text>
      )}
      {ride.status === "aceptado" && ride.driver && (
        <View style={styles.driverAcceptedContainer}>
          <Text style={styles.messageText}>¡Tu viaje ha sido aceptado!</Text>
          <Text style={styles.driverInfoText}>
            Conductor: {ride.driver.name}
          </Text>
          <Text style={styles.driverInfoText}>
            Vehículo: {ride.driver.vehicle?.brand} {ride.driver.vehicle?.model}{" "}
            ({ride.driver.vehicle?.color})
          </Text>
          <TouchableOpacity
            onPress={() =>
              navigation.replace("PassengerRideInProgress", {
                rideId: ride._id,
              })
            }
            style={styles.viewRideButton}
          >
            <Text style={styles.viewRideButtonText}>Ver Viaje en Mapa</Text>
          </TouchableOpacity>
        </View>
      )}
      <TouchableOpacity onPress={handleCancelRide} style={styles.cancelButton}>
        <Text style={styles.cancelButtonText}>Cancelar Viaje</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0a0f1c",
    padding: 20,
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
  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 10,
    textAlign: "center",
  },
  statusText: {
    fontSize: 20,
    color: "#00f0ff",
    fontWeight: "bold",
    marginBottom: 20,
    textTransform: "capitalize",
  },
  messageText: {
    fontSize: 16,
    color: "#bbb",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 22,
  },
  animation: {
    width: 200,
    height: 200,
    marginBottom: 20,
  },
  cancelButton: {
    marginTop: 30,
    backgroundColor: "#ff4d4d",
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 10,
  },
  cancelButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  driverAcceptedContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: "#1a1f2e",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#00f0ff",
    alignItems: "center",
    width: "100%",
  },
  driverInfoText: {
    fontSize: 16,
    color: "#fff",
    textAlign: "center",
    marginBottom: 5,
  },
  viewRideButton: {
    marginTop: 15,
    backgroundColor: "#0cf574",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  viewRideButtonText: {
    color: "#0a0f1c",
    fontSize: 16,
    fontWeight: "bold",
  },
});

export default WaitingForDriverScreen;