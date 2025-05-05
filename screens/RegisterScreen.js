import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  StyleSheet,
} from "react-native";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";

const RegisterScreen = ({ navigation }) => {
  const [role, setRole] = useState("pasajero");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Campos adicionales si es conductor
  const [dni, setDni] = useState("");
  const [license, setLicense] = useState("");
  const [vehicle, setVehicle] = useState({
    brand: "",
    model: "",
    color: "",
    year: "",
  });

  const handleRegister = async () => {
    if (!name || !email || !password) {
      return Alert.alert("Error", "Completa los campos obligatorios.");
    }

    const payload = {
      name,
      email,
      password,
      role,
    };

    if (role === "conductor") {
      if (!dni || !license || !vehicle.brand || !vehicle.model || !vehicle.color || !vehicle.year) {
        return Alert.alert("Error", "Faltan datos del conductor.");
      }
      payload.dni = dni;
      payload.license = license;
      payload.vehicle = vehicle;
    }

    try {
      console.log("LO que contiene payload: ", payload)
      await axios.post("http://192.168.0.8:4000/api/auth/register", payload);
      Alert.alert("Listo", "Usuario registrado correctamente");
      navigation.replace("Login");
    } catch (error) {
      console.error(error);
      console.log("que contiene el payoad; ", payload)
      Alert.alert("Error", "No se pudo registrar el usuario");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Crear cuenta</Text>

      <View style={styles.roleContainer}>
        <TouchableOpacity
          style={[styles.roleButton, role === "pasajero" && styles.selected]}
          onPress={() => setRole("pasajero")}
        >
          <Text style={styles.roleText}>Pasajero</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.roleButton, role === "conductor" && styles.selected]}
          onPress={() => setRole("conductor")}
        >
          <Text style={styles.roleText}>Conductor</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Nombre completo"
        placeholderTextColor="#bbb"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Correo electrónico"
        placeholderTextColor="#bbb"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        placeholderTextColor="#bbb"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {role === "conductor" && (
        <>
          <TextInput
            style={styles.input}
            placeholder="DNI"
            placeholderTextColor="#bbb"
            value={dni}
            onChangeText={setDni}
          />
          <TextInput
            style={styles.input}
            placeholder="Carnet de conducir"
            placeholderTextColor="#bbb"
            value={license}
            onChangeText={setLicense}
          />
          <TextInput
            style={styles.input}
            placeholder="Marca del vehículo"
            placeholderTextColor="#bbb"
            value={vehicle.brand}
            onChangeText={(text) => setVehicle({ ...vehicle, brand: text })}
          />
          <TextInput
            style={styles.input}
            placeholder="Modelo del vehículo"
            placeholderTextColor="#bbb"
            value={vehicle.model}
            onChangeText={(text) => setVehicle({ ...vehicle, model: text })}
          />
          <TextInput
            style={styles.input}
            placeholder="Color del vehículo"
            placeholderTextColor="#bbb"
            value={vehicle.color}
            onChangeText={(text) => setVehicle({ ...vehicle, color: text })}
          />
          <TextInput
            style={styles.input}
            placeholder="Año de fabricación"
            placeholderTextColor="#bbb"
            keyboardType="numeric"
            value={vehicle.year}
            onChangeText={(text) => setVehicle({ ...vehicle, year: text })}
          />
        </>
      )}

      <TouchableOpacity onPress={handleRegister}>
        <LinearGradient
          colors={["#00f0ff", "#0cf574"]}
          start={[0, 0]}
          end={[1, 1]}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Registrarse</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: "#0a0f1c",
    flexGrow: 1,
    justifyContent: "center",
  },
  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    alignSelf: "center",
  },
  input: {
    backgroundColor: "#1a1f2e",
    color: "#fff",
    padding: 14,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#00f0ff",
  },
  button: {
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
    shadowColor: "#0cf574",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  buttonText: {
    color: "#0a0f1c",
    fontWeight: "bold",
    fontSize: 16,
  },
  roleContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 20,
  },
  roleButton: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#1a1f2e",
    borderWidth: 1,
    borderColor: "#00f0ff",
  },
  selected: {
    backgroundColor: "#00f0ff",
  },
  roleText: {
    color: "#fff",
    fontWeight: "bold",
  },
});

export default RegisterScreen;
