import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Button,
  ActivityIndicator,
  StyleSheet,
  Alert,
  RefreshControl, // Para permitir "pull to refresh"
} from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../utils/config';

const AvailableRidesScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false); // Estado para el pull-to-refresh

  const fetchRides = async () => {
    setLoading(true); // Siempre true al iniciar la carga
    try {
      const token = user?.token || await AsyncStorage.getItem("token"); // Prioriza el token del contexto

      if (!token) {
        Alert.alert("Error de autenticación", "No se encontró el token de usuario.");
        navigation.replace('Login'); // Redirige a login si no hay token
        return;
      }

      const res = await axios.get(`${API_BASE_URL}/rides/available`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // NO FILTRAMOS si el pasajero es null, pero SÍ verificamos si passenger existe antes de acceder a sus propiedades
      // También ajustamos para 'lat' y 'lng'
      const processedRides = res.data.map(ride => {
        // Asegúrate de que origin y destination siempre sean objetos
        const origin = ride.origin || {};
        const destination = ride.destination || {};
        const passenger = ride.passenger || {}; // Asegura que passenger sea un objeto para evitar errores

        return {
          ...ride,
          origin: {
            latitude: origin.lat, // Acceder a 'lat'
            longitude: origin.lng, // Acceder a 'lng'
            address: origin.address || `Lat: ${origin.lat?.toFixed(4)}, Lng: ${origin.lng?.toFixed(4)}`
          },
          destination: {
            latitude: destination.lat, // Acceder a 'lat'
            longitude: destination.lng, // Acceder a 'lng'
            address: destination.address || `Lat: ${destination.lat?.toFixed(4)}, Lng: ${destination.lng?.toFixed(4)}`
          },
          passenger: {
            _id: passenger._id,
            name: passenger.name || 'Pasajero Desconocido', // Usa 'Pasajero Desconocido' si no hay nombre
            email: passenger.email,
          }
        };
      }).filter(ride => ride.passenger?._id !== null); // Filtra viajes donde el pasajero es realmente nulo después del procesamiento.
                                                 // Aunque si tu backend devuelve null para 'passenger' en estado 'buscando',
                                                 // es un problema de diseño del backend.

      setRides(processedRides);

    } catch (err) {
      console.error(
        "Error al cargar viajes disponibles:",
        err.response?.data?.message || err.message
      );
      Alert.alert("Error", "No se pudieron cargar los viajes disponibles.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleAcceptRide = async (rideId) => {
    try {
      const token = user?.token || await AsyncStorage.getItem("token");
      console.log("que contiene rideID: ", rideId)
      if (!token) {
        Alert.alert("Error de autenticación", "No se encontró el token de usuario.");
        navigation.replace('Login');
        return;
      }

      const res = await axios.put(
        `${API_BASE_URL}/rides/accept/${rideId}`,
        { price_accepted: 10 }, // Por ahora fijo
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      console.log("Viaje aceptado:", res.data.ride._id);
      Alert.alert("Viaje Aceptado", `¡Has aceptado el viaje con ${res.data.ride.passenger?.name || 'el pasajero'}! Dirígete al punto de recogida.`);

      // Redirigir a pantalla de viaje en curso
      navigation.replace("RideInProgressDriverScreen", { rideId: res.data.ride._id });
    } catch (err) {
      console.error(
        "Error al aceptar viaje:",
        err.response?.data?.message || err.message
      );
      Alert.alert(
        "Error",
        err.response?.data?.message || "No se pudo aceptar el viaje."
      );
    }
  };

  useEffect(() => {
    fetchRides();
    // Opcional: Refrescar la lista de viajes cada cierto tiempo
    const interval = setInterval(fetchRides, 30000); // Cada 30 segundos
    return () => clearInterval(interval); // Limpiar el intervalo al desmontar
  }, []);

  // Función para manejar el "pull-to-refresh"
  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    fetchRides();
  }, []);

  if (loading && !refreshing) { // Mostrar ActivityIndicator solo en la carga inicial
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00f0ff" />
        <Text style={styles.loadingText}>Cargando viajes disponibles...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Viajes disponibles:</Text>
      <FlatList
        data={rides}
        keyExtractor={(item) => item._id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#00f0ff']} // Color del spinner de refresco
            tintColor={'#00f0ff'} // Para iOS
          />
        }
        renderItem={({ item }) => (
          <View style={styles.rideItem}>
            <Text style={styles.rideInfoText}>
              <Text style={styles.boldText}>Pasajero:</Text> {item.passenger.name}
            </Text>
            {item.passenger.email && (
                <Text style={styles.rideInfoText}>
                    <Text style={styles.boldText}>Email:</Text> {item.passenger.email}
                </Text>
            )}
            
            <Text style={styles.rideInfoText}>
              <Text style={styles.boldText}>Origen:</Text> {item.origin.address}
            </Text>
            {item.destination && item.destination.address && ( // Mostrar destino solo si existe y tiene dirección
                <Text style={styles.rideInfoText}>
                    <Text style={styles.boldText}>Destino:</Text> {item.destination.address}
                </Text>
            )}
            <Text style={styles.rideInfoText}>
                <Text style={styles.boldText}>Precio Ofertado:</Text> ${item.price_offered?.toFixed(2) || 'N/A'}
            </Text>
            <Button
              title="Aceptar Viaje"
              onPress={() => handleAcceptRide(item._id)}
              color="#00f0ff"
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyListText}>No hay viajes disponibles en este momento.</Text>
            <Text style={styles.emptyListSubText}>(Asegúrate que haya pasajeros solicitando viajes y que tu backend los devuelva correctamente)</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#0a0f1c',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#00f0ff',
    marginBottom: 20,
    textAlign: 'center',
  },
  rideItem: {
    backgroundColor: '#1a1f2e',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#0cf574',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  rideInfoText: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 5,
  },
  boldText: {
    fontWeight: 'bold',
  },
  emptyListText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyListSubText: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
  }
});

export default AvailableRidesScreen;