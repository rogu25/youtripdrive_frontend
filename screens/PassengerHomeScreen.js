import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Button,
  Dimensions,
  Image
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

// Función para calcular el ángulo de rotación entre dos puntos
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

  useEffect(() => {
    const fetchDrivers = async () => {
      try {
        const res = await axios.get("http://192.168.0.8:4000/api/location/available");

        // // Simula movimiento en frontend para test
        // const simulated = res.data.map((driver) => ({
        //   ...driver,
        //   coordinates: {
        //     lat: driver.coordinates.lat + (Math.random() - 0.5) * 0.0001,
        //     lng: driver.coordinates.lng + (Math.random() - 0.5) * 0.0001
        //   }
        // }));

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
    
            return {
              ...newDriver,
              rotation,
            };
          })
        );
      } catch (err) {
        console.error("Error cargando conductores:", err.message);
      }
    };

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

    getPassengerLocation();
    fetchDrivers();
    const interval = setInterval(fetchDrivers, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleRequestRide = async () => {
    try {
        const userData = await AsyncStorage.getItem("user");
        const user = JSON.parse(userData);
        console.log("lo que contiene user: ", user)
        if (!user || !region) {
            console.log("Usuario no identificado o sin ubicación");
            return;
        }

        const rideRequest = {
            passengerId: user._id,
            origin: {
                lat: region.latitude,
                lng: region.longitude,
            },
        };

        const response = await axios.post("http://192.168.0.8:4000/api/rides/request", rideRequest, 
          {
            headers: { Authorization: `Bearer ${user.token}` },
          }
        );
        console.log("Solicitud de viaje enviada:", response.data);
        // Aquí puedes redirigir a otra pantalla o mostrar un modal de espera
    } catch (err) {
        console.error("Error al solicitar viaje:", err.message);
    }
};


  const handleLogout = async () => {
    await AsyncStorage.removeItem("user");
    navigation.replace("Login");
  };

  if (!region) return null;

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={region}>
        {/* Marcadores de conductores */}
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

        {/* Marcador del pasajero */}
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
        <Button title="Solicitar viaje" onPress={handleRequestRide} />
        <Button title="Cerrar sesión" onPress={handleLogout} />
      </View>
    </View>
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
