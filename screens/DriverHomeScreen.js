import React, { useState, useEffect, useRef, useCallback } from "react";
import {
    View,
    Text,
    StyleSheet,
    Button,
    Alert,
    ActivityIndicator,
    Switch,
    Dimensions,
    AppState,
    TouchableOpacity,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import axios from "axios";
import { API_BASE_URL } from "../utils/config";

import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";

const { width, height } = Dimensions.get("window");

const DriverHomeScreen = () => {
    const { user, logout } = useAuth();
    const { socket } = useSocket();
    const [isAvailable, setIsAvailable] = useState(false);
    const [loadingAvailability, setLoadingAvailability] = useState(true);
    const [currentLocation, setCurrentLocation] = useState(null);
    const [locationErrorMsg, setLocationErrorMsg] = useState(null);
    const locationSubscription = useRef(null);
    const appState = useRef(AppState.currentState);

    const [currentTripRequest, setCurrentTripRequest] = useState(null);

    // --- Socket Listeners ---
    useEffect(() => {
        console.log("cargando el DriverHomeScreen");
        if (!socket) return;

        const handleConnect = () => {
            console.log("✅ Cliente Socket.IO conectado con ID:", socket.id);
        };

        const handleDisconnect = (reason) => {
            console.log("❌ Cliente Socket.IO desconectado:", reason);
        };

        const handleConnectError = (err) => {
            console.error("❌ Error de conexión de Socket.IO:", err.message);
        };

        // Listener para nuevas solicitudes de viaje
        const handleTripRequest = (data) => {
            console.log("🚗💨 Solicitud de viaje recibida:", data);
            // Simplemente almacenamos la solicitud en el estado
            // para que el componente `tripRequestCard` la muestre.
            setCurrentTripRequest(data); 
        };

        // Listener para cuando el pasajero cancela la solicitud
        const handleTripRequestCancelled = (data) => {
            console.log("❌ Solicitud de viaje cancelada por el pasajero:", data);
            if (currentTripRequest && currentTripRequest.rideId === data.rideId) { 
                setCurrentTripRequest(null);
                Alert.alert(
                    "Viaje Cancelado",
                    "El pasajero ha cancelado la solicitud de viaje."
                );
            }
        };

        socket.on("connect", handleConnect);
        socket.on("disconnect", handleDisconnect);
        socket.on("connect_error", handleConnectError);
        socket.on("tripRequest", handleTripRequest);
        socket.on("tripRequestCancelled", handleTripRequestCancelled);

        return () => {
            socket.off("connect", handleConnect);
            socket.off("disconnect", handleDisconnect);
            socket.off("connect_error", handleConnectError);
            socket.off("tripRequest", handleTripRequest);
            socket.off("tripRequestCancelled", handleTripRequestCancelled);
        };
    }, [socket, currentTripRequest]); 

    // --- Función de envío de ubicación (altamente estable con useCallback) ---
    const sendLocationUpdate = useCallback(
        async (locationData) => {
            if (
                socket &&
                socket.connected &&
                locationData &&
                user?.id &&
                isAvailable
            ) {
                console.log("Enviando ubicación del conductor:", {
                    latitude: locationData.latitude,
                    longitude: locationData.longitude,
                    isAvailable,
                });
                socket.emit("driverLocationUpdate", {
                    driverId: user.id,
                    latitude: locationData.latitude,
                    longitude: locationData.longitude,
                    timestamp: new Date(),
                    isAvailable: isAvailable,
                });
            } else {
                console.log(
                    "No enviando ubicación: socket no listo/conectado, conductor no disponible o datos incompletos."
                );
            }
        },
        [socket, user?.id, isAvailable]
    );

    // --- Lógica de Tracking de Ubicación y Control del Bucle ---
    useEffect(() => {
        let watchId = null;

        const setupLocationTracking = async () => {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") {
                setLocationErrorMsg("Permiso para acceder a la ubicación denegado.");
                Alert.alert(
                    "Permiso de Ubicación",
                    "Por favor, concede permiso de ubicación para usar la aplicación."
                );
                return;
            }

            try {
                let initialLocation = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.High,
                });
                setCurrentLocation(initialLocation.coords);
                sendLocationUpdate(initialLocation.coords);
            } catch (error) {
                console.error("Error al obtener ubicación inicial:", error);
                setLocationErrorMsg("No se pudo obtener la ubicación inicial.");
                return;
            }

            if (!locationSubscription.current) {
                watchId = await Location.watchPositionAsync(
                    {
                        accuracy: Location.Accuracy.High,
                        timeInterval: 5000,
                        distanceInterval: 10,
                    },
                    (newLocation) => {
                        setCurrentLocation(newLocation.coords);
                        sendLocationUpdate(newLocation.coords);
                    }
                );
                locationSubscription.current = watchId;
                console.log("📍 Seguimiento de ubicación iniciado.");
            } else {
                console.log("📍 Seguimiento de ubicación ya activo.");
            }
        };

        const cleanupLocationTracking = () => {
            if (locationSubscription.current) {
                locationSubscription.current.remove();
                locationSubscription.current = null;
                console.log("📍 Seguimiento de ubicación detenido.");
            }
        };

        if (isAvailable && user?.id) {
            setupLocationTracking();
        } else {
            cleanupLocationTracking();
            if (socket && user?.id && socket.connected) {
                console.log(
                    `🔌 Conductor ${user.id} ahora NO DISPONIBLE. Emitiendo 'driverSetUnavailable' a backend.`
                );
                socket.emit("driverSetUnavailable", { driverId: user.id });
            }
        }

        return () => {
            cleanupLocationTracking();
        };
    }, [isAvailable, user?.id, socket, sendLocationUpdate]);

    // --- Manejo del estado de la aplicación (foreground/background) ---
    useEffect(() => {
        const handleAppStateChange = (nextAppState) => {
            if (
                appState.current.match(/inactive|background/) &&
                nextAppState === "active"
            ) {
                console.log("App ha vuelto al foreground.");
                if (isAvailable && user?.id && socket?.connected) {
                    console.log(
                        "Reactivando envío de ubicación tras volver al foreground."
                    );
                    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
                        .then((location) => {
                            setCurrentLocation(location.coords);
                            sendLocationUpdate(location.coords);
                        })
                        .catch((error) =>
                            console.error(
                                "Error al obtener ubicación al volver a foreground:",
                                error
                            )
                        );
                }
            } else if (nextAppState.match(/inactive|background/)) {
                console.log("App pasó a background o inactiva.");
            }
            appState.current = nextAppState;
        };

        const subscription = AppState.addEventListener(
            "change",
            handleAppStateChange
        );

        return () => {
            subscription.remove();
        };
    }, [isAvailable, user, socket, sendLocationUpdate]);

    // --- Lógica de Disponibilidad ---
    useEffect(() => {
        const fetchAvailability = async () => {
            if (!user?.id || !user?.token) {
                setLoadingAvailability(false);
                return;
            }
            try {
                const response = await axios.get(
                    `${API_BASE_URL}/drivers/${user.id}/availability`,
                    {
                        headers: {
                            Authorization: `Bearer ${user.token}`,
                        },
                    }
                );
                setIsAvailable(response.data.isAvailable);
            } catch (error) {
                console.error(
                    "Error al cargar la disponibilidad inicial:",
                    error.response?.data || error.message
                );
                Alert.alert("Error", "No se pudo cargar tu estado de disponibilidad.");
            } finally {
                setLoadingAvailability(false);
            }
        };

        fetchAvailability();
    }, [user]);

    const toggleAvailability = async () => {
        if (!user?.id || !user?.token) {
            Alert.alert(
                "Error",
                "Usuario no autenticado para cambiar disponibilidad."
            );
            return;
        }

        const newAvailability = !isAvailable;
        setIsAvailable(newAvailability);

        setLoadingAvailability(true);
        try {
            const response = await axios.put(
                `${API_BASE_URL}/drivers/${user.id}/availability`,
                {
                    isAvailable: newAvailability,
                },
                {
                    headers: {
                        Authorization: `Bearer ${user.token}`,
                    },
                }
            );

            Alert.alert(
                "Éxito",
                `Tu estado es ahora: ${
                    newAvailability ? "Disponible" : "No Disponible"
                }`
            );
        } catch (error) {
            console.error(
                "Error al cambiar disponibilidad:",
                error.response?.data || error.message
            );
            setIsAvailable(!newAvailability);

            let errorMessage = "Ocurrió un error al cambiar tu disponibilidad.";
            if (error.response) {
                if (error.response.status === 404) {
                    errorMessage =
                        "La ruta para cambiar disponibilidad no se encontró en el servidor. Verifica el backend.";
                } else if (
                    error.response.data &&
                    typeof error.response.data === "string"
                ) {
                    errorMessage =
                        "Error del servidor. Por favor, intenta de nuevo más tarde.";
                } else if (
                    error.response.data &&
                    typeof error.response.data === "object" &&
                    error.response.data.message
                ) {
                    errorMessage = error.response.data.message;
                }
            } else if (error.request) {
                errorMessage =
                    "No se pudo conectar con el servidor. Verifica tu conexión a internet.";
            }
            Alert.alert("Error", errorMessage);
        } finally {
            setLoadingAvailability(false);
        }
    };

    // --- Función para responder a la solicitud de viaje ---
    const handleRespondToTripRequest = (rideId, status) => {
        if (!socket || !socket.connected || !user?.id) {
            console.warn(
                "Socket no conectado o usuario no disponible para responder a la solicitud."
            );
            return;
        }

        console.log(`Respondiendo a la solicitud ${rideId} con estado: ${status}`);
        
        // Emitimos el evento de aceptación solo si el estado es 'accepted'
        if (status === "accepted") {
            socket.emit("driver_accepts_ride", { 
                rideId: rideId, 
                driverId: user.id, 
            });
            Alert.alert(
                "Viaje Aceptado",
                "Has aceptado el viaje. ¡Dirígete al punto de recogida!"
            );
            // Aquí podrías navegar a una pantalla de "Viaje en Curso"
            // navigation.navigate('DriverTripDetails', { rideId: rideId });
        } else { // Si es "rejected"
            // Por ahora, solo limpiamos la UI y mostramos un mensaje.
            // Si el backend necesita saber que un conductor rechazó un viaje,
            // tendrías que emitir un nuevo evento de socket aquí, por ejemplo:
            // socket.emit("driver_rejects_ride", { rideId: rideId, driverId: user.id });
            Alert.alert("Viaje Rechazado", "Has rechazado el viaje.");
        }

        // Limpia la solicitud de la UI después de responder (aceptar o rechazar)
        setCurrentTripRequest(null);
    };

    const handleLogout = async () => {
        Alert.alert(
            "Cerrar Sesión",
            "¿Estás seguro de que quieres cerrar tu sesión?",
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Sí",
                    onPress: async () => {
                        if (isAvailable && user?.id && socket?.connected) {
                            console.log(
                                `🔌 Conductor ${user.id} cerrando sesión. Emitiendo 'driverSetUnavailable'.`
                            );
                            socket.emit("driverSetUnavailable", { driverId: user.id });
                        }
                        await new Promise((resolve) => setTimeout(resolve, 100));
                        await logout();
                    },
                },
            ]
        );
    };

    if (!user || loadingAvailability) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#00f0ff" />
                <Text style={styles.loadingText}>Cargando datos de usuario y disponibilidad...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {currentLocation ? (
                <MapView
                    style={styles.map}
                    initialRegion={{
                        latitude: currentLocation.latitude,
                        longitude: currentLocation.longitude,
                        latitudeDelta: 0.005,
                        longitudeDelta: 0.005,
                    }}
                    showsUserLocation={true}
                    followsUserLocation={true}
                >
                    <Marker
                        coordinate={{
                            latitude: currentLocation.latitude,
                            longitude: currentLocation.longitude,
                        }}
                        title="Mi Ubicación"
                        description="Aquí estás tú"
                        pinColor={"#00f0ff"}
                    />
                    {currentTripRequest && (
                        <>
                            <Marker
                                coordinate={{
                                    latitude: currentTripRequest.pickupLocation.latitude,
                                    longitude: currentTripRequest.pickupLocation.longitude,
                                }}
                                title="Recogida Pasajero"
                                description={currentTripRequest.pickupLocation.address}
                                pinColor={"#FFD700"} // Amarillo para recogida
                            />
                            {currentTripRequest.destination && (
                                <Marker
                                    coordinate={{
                                        latitude: currentTripRequest.destination.latitude,
                                        longitude: currentTripRequest.destination.longitude,
                                    }}
                                    title="Destino Pasajero"
                                    description={currentTripRequest.destination.address}
                                    pinColor={"#FF4500"} // Naranja para destino
                                />
                            )}
                        </>
                    )}
                </MapView>
            ) : (
                <View style={styles.mapLoadingContainer}>
                    <ActivityIndicator size="large" color="#00f0ff" />
                    <Text style={styles.loadingText}>Cargando mapa y ubicación...</Text>
                    {locationErrorMsg && (
                        <Text style={styles.errorText}>{locationErrorMsg}</Text>
                    )}
                </View>
            )}
            {/* Panel de control flotante */}
            <View style={styles.controlPanel}>
                <Text style={styles.title}>Panel del Conductor</Text>
                <Text style={styles.infoText}>Bienvenido, {user.name || "Conductor"}</Text>

                <View style={styles.availabilityContainer}>
                    <Text style={styles.availabilityText}>Estado: {isAvailable ? "Disponible" : "No Disponible"}</Text>
                    {loadingAvailability ? (
                        <ActivityIndicator size="small" color="#00f0ff" />
                    ) : (
                        <Switch
                            onValueChange={toggleAvailability}
                            value={isAvailable}
                            trackColor={{ false: "#767577", true: "#0cf574" }}
                            thumbColor={isAvailable ? "#f4f3f4" : "#f4f4f4"}
                            ios_backgroundColor="#3e3e3e"
                        />
                    )}
                </View>
                {currentTripRequest && (
                    <View style={styles.tripRequestCard}>
                        <Text style={styles.tripRequestTitle}>¡Solicitud de Viaje!</Text>
                        <Text style={styles.tripRequestText}>Desde: {currentTripRequest.pickupLocation.address}</Text>
                        <Text style={styles.tripRequestText}>Hacia: {currentTripRequest.destination.address}</Text>
                        <Text style={styles.tripRequestFare}>Tarifa Estimada: $ {currentTripRequest.estimatedFare}</Text>
                        <View style={styles.tripRequestButtons}>
                            <TouchableOpacity
                                style={[styles.tripButton, styles.acceptButton]}
                                onPress={() =>
                                    handleRespondToTripRequest(
                                        currentTripRequest.rideId,
                                        "accepted"
                                    )
                                }
                            >
                                <Text style={styles.tripButtonText}>Aceptar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.tripButton, styles.rejectButton]}
                                onPress={() =>
                                    handleRespondToTripRequest(
                                        currentTripRequest.rideId,
                                        "rejected"
                                    )
                                }
                            >
                                <Text style={styles.tripButtonText}>Rechazar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
                <Button title="Cerrar Sesión" onPress={handleLogout} color="#ff4d4d" />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#0a0f1c",
    },
    loadingContainer: {
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
        width: width,
        height: height * 0.7,
    },
    mapLoadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#0a0f1c",
    },
    errorText: {
        color: "#ff4d4d",
        marginTop: 10,
        textAlign: "center",
    },
    controlPanel: {
        position: "absolute",
        bottom: 0,
        width: "100%",
        backgroundColor: "#0a0f1c",
        padding: 20,
        paddingBottom: 30,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.5,
        shadowRadius: 5,
        elevation: 10,
    },
    title: {
        fontSize: 24,
        fontWeight: "bold",
        color: "#00f0ff",
        marginBottom: 10,
    },
    infoText: {
        fontSize: 16,
        color: "#fff",
        marginBottom: 5,
    },
    availabilityContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginVertical: 15,
        backgroundColor: "#1a1f2e",
        padding: 15,
        borderRadius: 10,
        width: "90%",
        justifyContent: "space-between",
        borderWidth: 1,
        borderColor: "#00f0ff",
    },
    availabilityText: {
        fontSize: 18,
        color: "#fff",
        fontWeight: "bold",
    },
    // Estilos para la tarjeta de solicitud de viaje
    tripRequestCard: {
        backgroundColor: "#1a1f2e",
        padding: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: "#00f0ff",
        width: "95%",
        marginBottom: 20,
        alignItems: "center",
        shadowColor: "#00f0ff",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.7,
        shadowRadius: 10,
        elevation: 5,
    },
    tripRequestTitle: {
        fontSize: 22,
        fontWeight: "bold",
        color: "#0cf574",
        marginBottom: 10,
    },
    tripRequestText: {
        fontSize: 16,
        color: "#fff",
        marginBottom: 5,
        textAlign: "center",
    },
    tripRequestFare: {
        fontSize: 20,
        fontWeight: "bold",
        color: "#FFD700",
        marginVertical: 10,
    },
    tripRequestButtons: {
        flexDirection: "row",
        justifyContent: "space-around",
        width: "100%",
        marginTop: 15,
    },
    tripButton: {
        paddingVertical: 12,
        paddingHorizontal: 25,
        borderRadius: 8,
        minWidth: 120,
        alignItems: "center",
    },
    acceptButton: {
        backgroundColor: "#0cf574",
    },
    rejectButton: {
        backgroundColor: "#ff4d4d",
    },
    tripButtonText: {
        color: "#0a0f1c",
        fontSize: 16,
        fontWeight: "bold",
    },
});

export default DriverHomeScreen;