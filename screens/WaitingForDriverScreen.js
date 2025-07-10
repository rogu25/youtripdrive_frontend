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
import LottieView from "lottie-react-native";

const WaitingForDriverScreen = ({ route, navigation }) => {
  const { rideId: initialRideId } = route.params; // Renombrar para evitar conflicto con estado local
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user, isAuthenticated } = useAuth();
  const { socket } = useSocket();

  // --- Logs de depuración al inicio del componente ---
  console.log("------------------------------------------");
  console.log("WaitingForDriverScreen - Inicio");
  console.log("WaitingForDriverScreen - rideId recibido (initial):", initialRideId);
  console.log("WaitingForDriverScreen - Usuario autenticado:", isAuthenticated);
  console.log("WaitingForDriverScreen - user.id:", user?.id);
  console.log("WaitingForDriverScreen - user.token:", user?.token ? "Presente" : "Ausente");
  console.log("------------------------------------------");

  // Usar un ref para el rideId actual para evitar problemas de cierre en los listeners de socket
  // O, más simple, asegurar que las dependencias del useEffect son correctas.
  // En este caso, al usar `setRide`, el estado `ride` siempre está actualizado en el siguiente render.
  // Pero para los listeners, `ride` del closure puede estar desactualizado.
  // La mejor práctica es usar `setRide(prevRide => ...)` o pasar el ID a los listeners.
  // Optaremos por pasar el ID a los listeners y asegurarnos que las dependencias del useEffect son correctas.

  const fetchRideDetails = useCallback(async () => {
    // Verificar si los datos esenciales están presentes antes de hacer la llamada
    if (!isAuthenticated || !user?.token || !initialRideId) {
      console.log(
        "fetchRideDetails: Faltan credenciales o initialRideId. Redirigiendo a PassengerHomeScreen."
      );
      Alert.alert(
        "Error de acceso",
        "No estás autenticado o no hay ID de viaje válido para buscar. Por favor, intenta de nuevo."
      );
      setLoading(false);
      navigation.replace("PassengerHomeScreen");
      return;
    }

    try {
      console.log(`fetchRideDetails: Intentando obtener detalles del viaje ${initialRideId} para el usuario ${user.id}...`);
      const response = await axios.get(`${API_BASE_URL}/rides/${initialRideId}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const fetchedRide = response.data;
      setRide(fetchedRide); // Actualiza el estado `ride`
      setLoading(false);

      console.log("fetchRideDetails: Detalles del viaje obtenidos exitosamente:", fetchedRide);
      console.log("fetchRideDetails: Estado del viaje:", fetchedRide.status);

      // Usar los nombres de estado del backend: 'buscando', 'aceptado', 'recogido', 'finalizado', 'cancelado'
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
        fetchedRide.status === "recogido" ||
        fetchedRide.status === "en_ruta" // Usar 'en_ruta' para consistencia con backend
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
        "ERROR fetchRideDetails:",
        error.response?.data?.message || error.message,
        "Status:", error.response?.status,
        "Data:", error.response?.data
      );
      Alert.alert(
        "Error al cargar viaje",
        error.response?.data?.message || "No se pudo cargar los detalles del viaje. Es posible que el viaje ya no exista o no estés autorizado."
      );
      setLoading(false);
      navigation.replace("PassengerHomeScreen"); // Siempre redirigir a un estado seguro en caso de error
    }
  }, [isAuthenticated, user, initialRideId, navigation]); // Dependencias de useCallback

  const handleCancelRide = useCallback(async () => {
    Alert.alert(
      "Cancelar Viaje",
      "¿Estás seguro de que quieres cancelar este viaje? Se detendrá la búsqueda de un conductor.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Sí",
          onPress: async () => {
            try {
              if (!user?.token || !initialRideId) { // Usar initialRideId aquí
                Alert.alert(
                  "Error",
                  "No estás autenticado o no hay ID de viaje para cancelar."
                );
                return;
              }
              console.log(`Intentando cancelar viaje ${initialRideId}...`);
              const response = await axios.put(
                `${API_BASE_URL}/rides/${initialRideId}/status`, // Corregido el endpoint
                { newStatus: "cancelado" }, // Cambiado `status` a `newStatus` para coincidir con backend
                {
                  headers: { Authorization: `Bearer ${user.token}` },
                }
              );
              console.log("Respuesta de cancelación:", response.data);
              Alert.alert(
                "Viaje Cancelado",
                "Tu viaje ha sido cancelado exitosamente."
              );

              // Emitir el evento de cancelación al conductor si hay uno asignado
              if (ride?.driver?._id && socket) { // Usar el estado `ride` actual
                console.log(`Emitiendo ride_cancelled_by_passenger a driverId: ${ride.driver._id}`);
                socket.emit("ride_cancelled_by_passenger", {
                  rideId: ride._id.toString(),
                  driverId: ride.driver._id.toString(),
                  passengerId: user.id, // Añadir passengerId para verificación en el backend si es necesario
                });
              }
              navigation.replace("PassengerHomeScreen");
            } catch (error) {
              console.error(
                "ERROR cancelling ride:",
                error.response?.data?.message || error.message,
                "Status:", error.response?.status,
                "Data:", error.response?.data
              );
              Alert.alert(
                "Error al cancelar",
                error.response?.data?.message ||
                  "No se pudo cancelar el viaje. Intenta de nuevo."
              );
            }
          },
        },
      ]
    );
  }, [user, initialRideId, navigation, ride, socket]); // Dependencias de useCallback

  useEffect(() => {
    fetchRideDetails();
  }, [fetchRideDetails]);

  // --- Manejo de Sockets ---
  useEffect(() => {
    // Captura los IDs actuales del usuario y del viaje de las dependencias del useEffect
    const currentUserId = user?.id;
    const currentRideId = initialRideId;

    if (!socket || !isAuthenticated || !currentUserId || !currentRideId) {
      console.log(
        "Socket useEffect: Faltan requisitos (socket, auth, user.id, rideId). No configurando listeners."
      );
      return;
    }

    console.log(
      `Socket useEffect: Configurando listeners para rideId: ${currentRideId}, userId: ${currentUserId}`
    );

    // ✅ EVENTO: El conductor ha aceptado el viaje
    const handleRideAccepted = (data) => {
      console.log("Socket: ride_accepted recibido", data);
      // Asegurarse de que el evento es para el viaje y el pasajero correctos
      // El backend emite `passengerId` ahora, no `passenger`
      if (data.rideId === currentRideId && data.passengerId === currentUserId) {
        console.log("Socket: ride_accepted PROCESADO para el viaje y pasajero correctos.");
        Alert.alert(
          "¡Viaje Aceptado!",
          `Tu viaje ha sido aceptado por ${data.driverName || "un conductor"}.`
        );
        // Actualizar el estado local `ride` con los datos del conductor y el estado 'aceptado'
        setRide(prevRide => ({ 
            ...prevRide, 
            status: data.status, // Debería ser 'aceptado'
            driver: { // Asegúrate de que esta estructura coincida con tu modelo de usuario populado
                _id: data.driverId,
                name: data.driverName,
                // Agrega más campos si los necesitas y si el backend los envía (vehicle, etc.)
            }
        }));
        // Navegar a la pantalla de progreso después de un breve delay para que el usuario lea el Alert
        setTimeout(() => {
            navigation.replace("PassengerRideInProgress", { rideId: data.rideId });
        }, 1000); // Pequeño delay de 1 segundo
      } else {
        console.log("Socket: ride_accepted ignorado (no coincide rideId o passengerId)");
        console.log("  - Evento: ", data);
        console.log("  - Esperado: rideId=", currentRideId, " passengerId=", currentUserId);
      }
    };

    // ✅ EVENTO: Actualización general del estado del viaje
    const handleRideStatusUpdated = (data) => {
      console.log("Socket: ride_status_updated recibido", data);
      // Backend está emitiendo `newStatus`, no `status` para el nuevo estado
      if (data.rideId === currentRideId && data.passengerId === currentUserId) { // Añadir passengerId si el backend lo envía
        console.log("Socket: ride_status_updated PROCESADO para el viaje y pasajero correctos.");
        setRide((prevRide) => ({ ...prevRide, status: data.newStatus })); // Usa data.newStatus
        console.log(`Estado del viaje actualizado a: ${data.newStatus}`);

        // Manejar las transiciones de estado
        if (data.newStatus === "cancelado") {
          Alert.alert(
            "Viaje Cancelado",
            "Tu solicitud de viaje ha sido cancelada."
          );
          navigation.replace("PassengerHomeScreen");
        } else if (data.newStatus === "finalizado") {
          Alert.alert("Viaje Completado", "Tu viaje ha finalizado.");
          navigation.replace("PassengerHomeScreen");
        } else if (data.newStatus === "aceptado" || data.newStatus === "recogido" || data.newStatus === "en_ruta") { // Usar 'en_ruta'
          // Si el estado cambia a aceptado o recogido, navegar a la pantalla de progreso
          // Esto ya lo maneja `handleRideAccepted` para 'aceptado', pero es una buena redundancia.
          // Si llega a 'recogido' o 'en_ruta' directamente, navega.
          if (navigation.getCurrentRoute().name !== 'PassengerRideInProgress') { // Evitar navegación redundante
            Alert.alert(
              "¡Actualización del Viaje!",
              `El estado de tu viaje es ahora: ${data.newStatus.replace("_", " ").toUpperCase()}.`
            );
            navigation.replace("PassengerRideInProgress", {
              rideId: data.rideId,
            });
          }
        }
      } else {
        console.log("Socket: ride_status_updated ignorado (no coincide rideId o passengerId)");
        console.log("  - Evento: ", data);
        console.log("  - Esperado: rideId=", currentRideId, " passengerId=", currentUserId);
      }
    };

    // ✅ EVENTO: Un conductor ha rechazado la solicitud (si manejas esto específicamente)
    const handleRideRejected = (data) => {
      console.log("Socket: ride_rejected recibido", data);
      if (data.rideId === currentRideId && data.passengerId === currentUserId) { // Asegúrate que tu backend emite 'passengerId'
        Alert.alert(
          "Viaje Rechazado",
          "Un conductor ha rechazado tu solicitud. Buscando otro..."
        );
        // Aquí podrías querer mantener al pasajero en esta pantalla o intentar re-enviar la solicitud.
      } else {
        console.log("Socket: ride_rejected ignorado (no coincide rideId o passengerId)");
        console.log("  - Evento: ", data);
        console.log("  - Esperado: rideId=", currentRideId, " passengerId=", currentUserId);
      }
    };

    // --- Configurar Listeners ---
    socket.on("ride_accepted", handleRideAccepted);
    socket.on("ride_status_updated", handleRideStatusUpdated);
    socket.on("ride_rejected", handleRideRejected);

    // --- Función de limpieza ---
    return () => {
      console.log("Socket useEffect: Limpiando listeners para WaitingForDriverScreen.");
      socket.off("ride_accepted", handleRideAccepted);
      socket.off("ride_status_updated", handleRideStatusUpdated);
      socket.off("ride_rejected", handleRideRejected);
    };
  }, [socket, initialRideId, user, isAuthenticated, navigation]); // Dependencias: Si alguna cambia, el efecto se re-ejecuta

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#00f0ff" />
        <Text style={styles.loadingText}>Cargando estado del viaje...</Text>
      </View>
    );
  }

  // Si no hay viaje o el estado ya no es 'buscando' después de la carga inicial
  // Esto previene mostrar la pantalla de espera si el viaje ya progresó o fue cancelado
  // Nota: Si el estado es 'aceptado', queremos mostrar la información del conductor aquí.
  if (!ride || (ride.status !== "buscando" && ride.status !== "aceptado")) {
    console.log(
      "WaitingForDriverScreen: Estado del viaje no apto para esta pantalla o viaje no encontrado. Redirigiendo a PassengerHomeScreen."
    );
    // Las alertas específicas ya se manejan en fetchRideDetails.
    // Aquí simplemente redirigimos de forma segura si el estado no es el esperado para esta pantalla.
    navigation.replace("PassengerHomeScreen");
    return null; // No renderizar nada
  }

  return (
    <View style={styles.container}>
      <LottieView
        source={require("../assets/animations/waiting.json")}
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
          {/* Asegúrate de que `ride.driver.vehicle` esté poblado si esperas mostrar esto */}
          {ride.driver.vehicle && (
            <Text style={styles.driverInfoText}>
              Vehículo: {ride.driver.vehicle.brand} {ride.driver.vehicle.model}{" "}
              ({ride.driver.vehicle.color})
            </Text>
          )}
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