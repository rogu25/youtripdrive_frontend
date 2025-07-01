import React, { use, useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Button,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import RideChat from "../components/RideChat";
import { socket } from "../utils/socket";

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
  const [region, setRegion] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [ride, setRide] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        const userData = await AsyncStorage.getItem("user");
        const storedToken = await AsyncStorage.getItem("token");

        if (!userData || !storedToken) return;

        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        setToken(storedToken);

        await getPassengerLocation();
        await fetchDrivers();
        await checkActiveRide(parsedUser, storedToken);

        const interval = setInterval(fetchDrivers, 10000);
        return () => clearInterval(interval);
      } catch (err) {
        console.error("Error inicializando:", err.message);
      }
    };

    initialize();
  }, []);

  const getPassengerLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      console.log("Permiso de ubicación denegado");
      return;
    }

    const loc = await Location.getCurrentPositionAsync({});
    setRegion({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  };

  const fetchDrivers = async () => {
    try {
      const res = await axios.get(
        "http://192.168.0.254:4000/api/location/available"
      );

      setDrivers((prevDrivers) =>
        res.data.map((newDriver) => {
          const prev = prevDrivers.find((d) => d._id === newDriver._id);
          let rotation = 0;
          if (prev) {
            rotation = calculateBearing(
              prev.coordinates.lat,
              prev.coordinates.lng,
              newDriver.coordinates.lat,
              newDriver.coordinates.lng
            );
          }
          return { ...newDriver, rotation };
        })
      );
    } catch (err) {
      console.error("Error cargando conductores:", err.message);
    }
  };

  const checkActiveRide = async (parsedUser, token) => {
    if (!token || !parsedUser) return;

    try {
      const res = await axios.get(
        "http://192.168.0.254:4000/api/rides/active",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setRide(res.data);
    } catch (err) {
      if (err.response?.status !== 404) {
        console.error("Error al verificar viaje activo:", err.message);
      }
    }
  };

  const handleRequestRide = async () => {
    try {
      const userData = await AsyncStorage.getItem("user");
      const token = await AsyncStorage.getItem("token");
      const parsedUser = JSON.parse(userData);
      setUser(parsedUser);

      if (!parsedUser || !region) return;

      const rideRequest = {
        passengerId: parsedUser.id,
        origin: {
          lat: region.latitude,
          lng: region.longitude,
        },
      };

      const response = await axios.post(
        "http://192.168.0.254:4000/api/rides/request",
        rideRequest,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      console.log("Solicitud de viaje enviada:", response.data);
      setRide(response.data); // Actualizamos el estado ride si es exitoso
    } catch (err) {
      if (err.response?.status === 409) {
        alert("Ya tienes un viaje pendiente o en curso.");
      } else {
        console.error("Error al solicitar viaje:", err.message);
        alert("Error al solicitar viaje. Intenta nuevamente.");
      }
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem("user");
    await AsyncStorage.removeItem("token");
    navigation.replace("Login");
  };

  useEffect(() => {
    socket.on("aceptado", async (data) => {
      console.log("¡Viaje aceptado!", data);
      try {
        const res = await axios.get(
          "http://192.168.0.254:4000/api/rides/active",
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setRide(res.data);
        if (res.data.driverLocation) {
          setDriverLocation(res.data.driverLocation.coordinates);
        }
      } catch (err) {
        console.error("Error al obtener viaje activo:", err.message);
      }
    });

    return () => socket.off("aceptado");
  }, [token]);

  useEffect(() => {
    if (!ride || !ride.driver?._id) return;

    socket.on("ubicacion_conductor", (data) => {
      if (data.driverId === ride.driver._id) {
        setDriverLocation(data.coordinates);
      }
    });

    return () => socket.off("ubicacion_conductor");
  }, [ride]);

  if (!region) return null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <MapView style={styles.map} initialRegion={region}>
        {drivers.map((driver) => (
          <Marker
            key={driver._id}
            coordinate={{
              latitude: driver.coordinates.lat,
              longitude: driver.coordinates.lng,
            }}
            title={driver.user.name}
            description={"Conductor disponible"}
          >
            <Image
              source={require("../assets/car-icon.png")}
              style={{
                width: 40,
                height: 40,
                transform: [{ rotate: `${driver.rotation}deg` }],
              }}
              resizeMode="contain"
            />
          </Marker>
        ))}

        <Marker
          coordinate={{
            latitude: region.latitude,
            longitude: region.longitude,
          }}
          title={"Tú estás aquí"}
          pinColor="green"
        />
      </MapView>

      <View style={styles.buttonContainer}>
        <Button
          title="Ir al Chat"
          onPress={() => {
            if (ride && user) {
              navigation.navigate("RideChat", {
                rideId: ride._id,
                userId: user._id,
              });
            }
          }}
        />
        {!ride ? (
          <Button title="Solicitar viaje" onPress={handleRequestRide} />
        ) : (
          <Button
            title="Ya tienes un viaje activo"
            disabled={true}
            color="gray"
          />
        )}
        <Button title="Cerrar sesión" onPress={handleLogout} />
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: {
    flex: 1,
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height,
  },
  buttonContainer: {
    position: "absolute",
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: "white",
    padding: 10,
    borderRadius: 10,
    elevation: 5,
  },
});

export default PassengerHomeScreen;
