import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Platform, // Importar Platform para ajustes específicos de la plataforma
} from "react-native";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { API_BASE_URL } from "../utils/config";
import LottieView from "lottie-react-native";

const WaitingForDriverScreen = ({ route, navigation }) => {
  // Renombrar para evitar conflicto con estado local y mantener la referencia del ID original
  const { rideId: initialRideId } = route.params;
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user, isAuthenticated } = useAuth();
  const { socket } = useSocket();
  // Estado para el tiempo estimado de llegada del conductor (ETA)
  const [driverEta, setDriverEta] = useState(null);

  // --- Logs de depuración al inicio del componente ---
  console.log("------------------------------------------");
  console.log("WaitingForDriverScreen - Inicio");
  console.log(
    "WaitingForDriverScreen - rideId recibido (initial):",
    initialRideId
  );
  console.log("WaitingForDriverScreen - Usuario autenticado:", isAuthenticated);
  console.log("WaitingForDriverScreen - user.id:", user?.id);
  console.log(
    "WaitingForDriverScreen - user.token:",
    user?.token ? "Presente" : "Ausente"
  );
  console.log("------------------------------------------");

  // Ref para almacenar el rideId actual. Útil para callbacks asíncronos o eventos de socket
  // que podrían ejecutarse después de que el componente se re-renderiza y las variables del closure cambian.
  const currentRideIdRef = useRef(initialRideId);
  useEffect(() => {
    currentRideIdRef.current = initialRideId;
  }, [initialRideId]);

  const fetchRideDetails = useCallback(async () => {
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
      console.log(
        `fetchRideDetails: Intentando obtener detalles del viaje ${initialRideId} para el usuario ${user.id}...`
      );
      const response = await axios.get(
        `${API_BASE_URL}/rides/${initialRideId}`,
        {
          headers: { Authorization: `Bearer ${user.token}` },
        }
      );
      const fetchedRide = response.data;
      setRide(fetchedRide); // Actualiza el estado `ride`
      setLoading(false);

      console.log(
        "fetchRideDetails: Detalles del viaje obtenidos exitosamente:",
        fetchedRide
      );
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
        // Si ya está aceptado, recogido o en ruta, se navega a PassengerRideInProgress.
        // Esto evita que el pasajero se quede en la pantalla de espera innecesariamente.
        Alert.alert(
          "¡Viaje Encontrado!",
          "Tu viaje ya ha sido aceptado o está en curso. Redirigiendo al seguimiento."
        );
        // Usamos `replace` para que el usuario no pueda volver fácilmente a esta pantalla
        navigation.replace("PassengerRideInProgress", {
          rideId: fetchedRide._id,
        });
        return;
      }
    } catch (error) {
      console.error(
        "ERROR fetchRideDetails:",
        error.response?.data?.message || error.message,
        "Status:",
        error.response?.status,
        "Data:",
        error.response?.data
      );
      Alert.alert(
        "Error al cargar viaje",
        error.response?.data?.message ||
          "No se pudo cargar los detalles del viaje. Es posible que el viaje ya no exista o no estés autorizado."
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
              // Usar initialRideId o ride._id. Si ride._id es null, initialRideId debería estar presente
              const rideToCancelId = ride?._id || initialRideId;
              if (!user?.token || !rideToCancelId) {
                Alert.alert(
                  "Error",
                  "No estás autenticado o no hay ID de viaje para cancelar."
                );
                return;
              }
              console.log(`Intentando cancelar viaje ${rideToCancelId}...`);
              const response = await axios.put(
                `${API_BASE_URL}/rides/${rideToCancelId}/status`,
                { newStatus: "cancelado" },
                {
                  headers: { Authorization: `Bearer ${user.token}` },
                }
              );
              console.log("Respuesta de cancelación:", response.data);
              Alert.alert(
                "Viaje Cancelado",
                "Tu viaje ha sido cancelado exitosamente."
              );

              // Emitir el evento de cancelación al conductor si hay uno asignado y el socket está conectado
              // Usamos currentRideIdRef.current para asegurar que el ID es el más reciente en el cierre
              if (socket && socket.connected && ride?.driver?._id) {
                console.log(
                  `Emitiendo ride_cancelled_by_passenger a driverId: ${ride.driver._id} para rideId: ${rideToCancelId}`
                );
                socket.emit("ride_cancelled_by_passenger", {
                  rideId: rideToCancelId.toString(), // Asegúrate de que sea string
                  driverId: ride.driver._id.toString(),
                  passengerId: user.id,
                });
              }
              navigation.replace("PassengerHomeScreen");
            } catch (error) {
              console.error(
                "ERROR cancelling ride:",
                error.response?.data?.message || error.message,
                "Status:",
                error.response?.status,
                "Data:",
                error.response?.data
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
  }, [user, initialRideId, navigation, ride, socket]);

  // --- Efecto para cargar los detalles iniciales del viaje ---
  useEffect(() => {
    fetchRideDetails();
  }, [fetchRideDetails]);

  // --- Manejo de Sockets ---
  // Este useEffect se encarga de escuchar los eventos del socket y actualizar la UI
  useEffect(() => {
    const currentUserId = user?.id;
    // Usamos el ref para asegurar que tenemos la ID de viaje más reciente en el closure del listener
    const currentRideId = currentRideIdRef.current;

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
      if (data.rideId === currentRideId && data.passengerId === currentUserId) {
        console.log(
          "Socket: ride_accepted PROCESADO para el viaje y pasajero correctos."
        );
        Alert.alert(
          "¡Viaje Aceptado!",
          `Tu viaje ha sido aceptado por ${data.driverName || "un conductor"}.`
        );
        // Actualizar el estado local `ride` con los datos del conductor y el estado 'aceptado'
        setRide((prevRide) => ({
          ...prevRide,
          status: data.status,
          driver: {
            _id: data.driverId,
            name: data.driverName,
            vehicle: data.vehicle, // Asegúrate que el backend envía 'vehicle' aquí
            // Puedes añadir más campos del conductor si el backend los envía (e.g., phone, rating)
          },
          pickupEta: data.pickupEta, // Asumiendo que el backend envía el ETA aquí
        }));
        setDriverEta(data.pickupEta); // Actualizar el estado del ETA
        // Navegar a la pantalla de progreso después de un breve delay para que el usuario lea el Alert
        // Asegúrate de que los datos del conductor se pasen si son necesarios en la siguiente pantalla
        setTimeout(() => {
          navigation.replace("PassengerRideInProgress", {
            rideId: data.rideId,
            driverData: data.driver, // Pasar datos del conductor si son necesarios
          });
        }, 1000);
      } else {
        console.log(
          "Socket: ride_accepted ignorado (no coincide rideId o passengerId)"
        );
        console.log("  - Evento: ", data);
        console.log(
          "  - Esperado: rideId=",
          currentRideId,
          " passengerId=",
          currentUserId
        );
      }
    };

    // ✅ EVENTO: Actualización general del estado del viaje
    const handleRideStatusUpdated = (data) => {
      console.log("Socket: ride_status_updated recibido", data);
      if (data.rideId === currentRideId && data.passengerId === currentUserId) {
        console.log(
          "Socket: ride_status_updated PROCESADO para el viaje y pasajero correctos."
        );
        setRide((prevRide) => ({ ...prevRide, status: data.newStatus }));
        console.log(`Estado del viaje actualizado a: ${data.newStatus}`);

        // Manejar las transiciones de estado
        if (data.newStatus === "cancelado") {
          Alert.alert(
            "Viaje Cancelado",
            "Tu solicitud de viaje ha sido cancelada por el sistema o por el conductor."
          );
          navigation.replace("PassengerHomeScreen");
        } else if (data.newStatus === "finalizado") {
          Alert.alert("Viaje Completado", "Tu viaje ha finalizado.");
          navigation.replace("PassengerHomeScreen");
        } else if (
          data.newStatus === "recogido" ||
          data.newStatus === "en_ruta"
        ) {
          // Si el estado cambia a recogido o en_ruta, navegar a la pantalla de progreso.
          // La navegación a "aceptado" ya la maneja `handleRideAccepted` para el primer aviso.
          // Si por alguna razón el pasajero no recibió `ride_accepted` y salta directamente a estos estados,
          // esta lógica también lo captura.
          Alert.alert(
            "¡Actualización del Viaje!",
            `El estado de tu viaje es ahora: ${data.newStatus
              .replace("_", " ")
              .toUpperCase()}. Redirigiendo...`
          );
          navigation.replace("PassengerRideInProgress", {
            rideId: data.rideId,
          });
        }
      } else {
        console.log(
          "Socket: ride_status_updated ignorado (no coincide rideId o passengerId)"
        );
        console.log("  - Evento: ", data);
        console.log(
          "  - Esperado: rideId=",
          currentRideId,
          " passengerId=",
          currentUserId
        );
      }
    };

    // ✅ EVENTO: Un conductor ha rechazado la solicitud (si manejas esto específicamente)
    const handleRideRejected = (data) => {
      console.log("Socket: ride_rejected recibido", data);
      if (data.rideId === currentRideId && data.passengerId === currentUserId) {
        Alert.alert(
          "Viaje Rechazado",
          "Un conductor ha rechazado tu solicitud. Se buscará otro conductor automáticamente."
        );
        // Aquí podrías querer mantener al pasajero en esta pantalla o reintentar la búsqueda.
        // Si el backend reasigna automáticamente, simplemente el pasajero espera.
        // Si el backend envía `noDriverFound` o `rideRequestCancelledBySystem` después de varios rechazos,
        // esos eventos manejarían la salida de esta pantalla.
      } else {
        console.log(
          "Socket: ride_rejected ignorado (no coincide rideId o passengerId)"
        );
        console.log("  - Evento: ", data);
        console.log(
          "  - Esperado: rideId=",
          currentRideId,
          " passengerId=",
          currentUserId
        );
      }
    };

    // ✅ NUEVO EVENTO: Actualización de la ubicación o ETA del conductor asignado
    const handleDriverLocationUpdateForAssignedRide = (data) => {
      // SOLO procesamos actualizaciones de ubicación si hay un viaje ACEPTADO
      // y si el driverId de la actualización coincide con el driverId del viaje actual
      if (
        ride?.status === "aceptado" &&
        ride?.driver?._id === data.driverId &&
        data.rideId === currentRideId
      ) {
        console.log(
          `Socket: driverLocationUpdateForAssignedRide recibido para driver ${data.driverId} con ETA: ${data.eta}`
        );
        setDriverEta(data.eta); // Asumiendo que `eta` viene en segundos
        // Si quisieras actualizar también la posición del conductor en esta pantalla, podrías hacerlo aquí
        // Pero para esta pantalla de "espera", el ETA es lo más relevante.
      }
    };

    // --- Configurar Listeners ---
    socket.on("ride_accepted", handleRideAccepted);
    socket.on("ride_status_updated", handleRideStatusUpdated);
    socket.on("ride_rejected", handleRideRejected);
    // Nuevo listener para actualizaciones del conductor asignado
    socket.on(
      "driverLocationUpdateForAssignedRide",
      handleDriverLocationUpdateForAssignedRide
    );

    // --- Función de limpieza ---
    return () => {
      console.log(
        "Socket useEffect: Limpiando listeners para WaitingForDriverScreen."
      );
      socket.off("ride_accepted", handleRideAccepted);
      socket.off("ride_status_updated", handleRideStatusUpdated);
      socket.off("ride_rejected", handleRideRejected);
      socket.off(
        "driverLocationUpdateForAssignedRide",
        handleDriverLocationUpdateForAssignedRide
      );
    };
  }, [socket, user, isAuthenticated, navigation, ride, currentRideIdRef]); // Añadido `ride` a las dependencias para que el listener pueda acceder al `ride.driver` más reciente

  // Este `useEffect` es para asegurar que si el `ride` cambia a un estado final o intermedio,
  // la pantalla navegue automáticamente. Es una redundancia útil con la lógica dentro de los listeners
  // y `fetchRideDetails`, para capturar cualquier cambio de estado que no haya sido un evento de socket directo.
  useEffect(() => {
    if (!loading && ride) {
      if (ride.status === "finalizado" || ride.status === "cancelado") {
        Alert.alert(
          "Información del Viaje",
          `El viaje ya está ${
            ride.status === "finalizado" ? "completado" : "cancelado"
          }.`
        );
        navigation.replace("PassengerHomeScreen");
      } else if (ride.status === "recogido" || ride.status === "en_ruta") {
        // Navegar si el conductor ya recogió al pasajero o está en ruta hacia el destino
        Alert.alert(
          "¡Actualización!",
          `Tu viaje está ahora en estado: ${ride.status
            .replace("_", " ")
            .toUpperCase()}.`
        );
        navigation.replace("PassengerRideInProgress", { rideId: ride._id });
      }
    }
  }, [ride, loading, navigation]);

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#00f0ff" />
        <Text style={styles.loadingText}>Cargando estado del viaje...</Text>
      </View>
    );
  }

  // Si no hay viaje o el estado ya no es 'buscando' o 'aceptado'
  // Nota: La lógica de `useEffect` de arriba ya maneja la navegación si el estado cambia.
  // Esto es un fallback en caso de que el `ride` se vuelva nulo inesperadamente o tenga un estado incorrecto.
  if (!ride || (ride.status !== "buscando" && ride.status !== "aceptado")) {
    console.log(
      "WaitingForDriverScreen: Estado del viaje no apto para esta pantalla o viaje no encontrado. Redirigiendo a PassengerHomeScreen."
    );
    navigation.replace("PassengerHomeScreen");
    return null;
  }

  return (
    <View style={styles.container}>
      <LottieView
        source={require("../assets/animations/waiting.json")}
        autoPlay
        loop
        style={styles.animation}
      />
      <Text style={styles.title}>
        {ride.status === "buscando"
          ? "Buscando Conductor"
          : "Conductor Asignado"}
      </Text>
      <Text style={styles.statusText}>
        Estado: {ride.status?.toUpperCase().replace("_", " ")}
      </Text>
      {ride.status === "buscando" && (
        <Text style={styles.messageText}>
          Estamos buscando el conductor más cercano para tu viaje. Esto puede
          tardar unos segundos. Por favor, mantén esta pantalla abierta.
        </Text>
      )}
      {ride.status === "aceptado" && ride.driver ? ( // Asegúrate de que `ride.driver` existe
        <View style={styles.driverAcceptedContainer}>
          <Text style={styles.messageText}>¡Tu viaje ha sido aceptado!</Text>
          <Text style={styles.driverInfoText}>
            Conductor:
            { ride.driver.name }
          </Text>
          {ride.driver.vehicle && (
            <Text style={styles.driverInfoText}>
              Vehículo:
              <Text style={{ fontWeight: "bold" }}>
                { ride.driver.vehicle.model }
              </Text>
              (
              <Text style={{ fontWeight: "bold" }}>
                {ride.driver.vehicle.color}
              </Text>
              )
            </Text>
          )}
          {driverEta !== null && driverEta !== undefined && (
            <Text style={styles.etaText}>
              Llega en: {Math.ceil(driverEta / 60)} min
            </Text>
          )}
         
          <TouchableOpacity
            onPress={() =>
              navigation.replace("PassengerRideInProgress", {
                rideId: ride._id,
                driverData: ride.driver, // Pasar los datos del conductor a la siguiente pantalla
              })
            }
            style={styles.viewRideButton}
          >
            <Text style={styles.viewRideButtonText}>Ver Viaje en Mapa</Text>
          </TouchableOpacity>
        </View>
      ) : (
        // En caso de que el viaje esté "aceptado" pero por alguna razón `ride.driver` no se ha cargado aún
        ride.status === "aceptado" && (
          <View style={styles.driverAcceptedContainer}>
            <Text style={styles.messageText}>¡Tu viaje ha sido aceptado!</Text>
            <ActivityIndicator
              size="small"
              color="#00f0ff"
              style={{ marginTop: 10 }}
            />
            <Text style={styles.driverInfoText}> Cargando detalles del conductor... </Text>
          </View>
        )
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
  etaText: {
    fontSize: 18,
    color: "#fff",
    textAlign: "center",
    marginBottom: 10,
    marginTop: 5,
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
