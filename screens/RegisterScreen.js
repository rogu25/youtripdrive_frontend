import React, { useState } from "react";
import {
  View,
  Text, // Importa Text para asegurar que todo el texto está envuelto
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { API_BASE_URL } from "../utils/config";

const RegisterScreen = ({ navigation }) => {
  const [role, setRole] = useState("pasajero");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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
    // Validaciones básicas de campos obligatorios
    if (!name.trim() || !email.trim() || !password.trim()) {
      // Mensajes de alerta siempre deben ser strings
      Alert.alert("Error de registro", "Por favor, completa todos los campos básicos: Nombre, Correo y Contraseña.");
      return;
    }

    // Validación de formato de email (simple)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert("Error de registro", "Por favor, ingresa un formato de correo electrónico válido.");
      return;
    }

    // Validación de longitud de contraseña (ejemplo)
    if (password.length < 6) {
      Alert.alert("Error de registro", "La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    const payload = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role,
    };

    if (role === "conductor") {
      // Validaciones específicas para el conductor
      if (
        !dni.trim() ||
        !license.trim() ||
        !vehicle.brand.trim() ||
        !vehicle.model.trim() ||
        !vehicle.color.trim() ||
        !vehicle.year.trim()
      ) {
        Alert.alert("Error de registro", "Como conductor, por favor completa todos los datos del vehículo y personales (DNI, Licencia).");
        return;
      }

      payload.dni = dni.trim();
      payload.license = license.trim();

      // Convertir año a número y validarlo
      const parsedYear = parseInt(vehicle.year, 10); // Base 10 para parseInt
      if (isNaN(parsedYear) || vehicle.year.trim().length !== 4) { // Verifica también longitud original del string
        Alert.alert("Error de registro", "El año del vehículo debe ser un número de 4 dígitos válido.");
        return;
      }
      const currentYear = new Date().getFullYear();
      if (parsedYear < 1900 || parsedYear > currentYear + 1) {
        Alert.alert("Error de registro", `El año del vehículo debe estar entre 1900 y ${currentYear + 1}.`);
        return;
      }

      payload.vehicle = {
        brand: vehicle.brand.trim(),
        model: vehicle.model.trim(),
        color: vehicle.color.trim(),
        year: parsedYear, // Usar el año parseado
      };
    }

    setLoading(true);
    try {
      console.log("Payload enviado:", payload);
      const res = await axios.post(`${API_BASE_URL}/auth/register`, payload);

      Alert.alert("Registro Exitoso", "Tu cuenta ha sido creada. Ahora puedes iniciar sesión.");
      navigation.replace("Login");
    } catch (err) {
      console.error("Error de registro:", err.response?.data || err.message);
      let errorMessage = "Ocurrió un error inesperado. Por favor, intenta de nuevo.";

      if (err.response) {
        if (err.response.status === 400 && err.response.data?.message) {
          errorMessage = err.response.data.message;
        } else if (err.response.status === 500) {
          errorMessage = "Error del servidor. Por favor, intenta de nuevo más tarde.";
        }
      } else if (err.request) {
        errorMessage = "No se pudo conectar con el servidor. Verifica tu conexión a internet o intenta más tarde.";
      }
      Alert.alert("Error de Registro", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Crear cuenta</Text>

        <View style={styles.roleContainer}>
          <TouchableOpacity
            style={[styles.roleButton, role === "pasajero" && styles.selected]}
            onPress={() => setRole("pasajero")}
            disabled={loading}
          >
            <Text style={styles.roleText}>Pasajero</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.roleButton, role === "conductor" && styles.selected]}
            onPress={() => setRole("conductor")}
            disabled={loading}
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
          editable={!loading}
        />
        <TextInput
          style={styles.input}
          placeholder="Correo electrónico"
          placeholderTextColor="#bbb"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          editable={!loading}
        />
        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor="#bbb"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!loading}
        />

        {role === "conductor" && (
          <>
            <TextInput
              style={styles.input}
              placeholder="DNI"
              placeholderTextColor="#bbb"
              keyboardType="numeric"
              value={dni}
              onChangeText={(text) => setDni(text.replace(/[^0-9]/g, ''))} // Solo números
              maxLength={8} // Asumiendo DNI de 8 dígitos en Perú
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Carnet de conducir"
              placeholderTextColor="#bbb"
              value={license}
              onChangeText={setLicense}
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Marca del vehículo"
              placeholderTextColor="#bbb"
              value={vehicle.brand}
              onChangeText={(text) => setVehicle({ ...vehicle, brand: text })}
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Modelo del vehículo"
              placeholderTextColor="#bbb"
              value={vehicle.model}
              onChangeText={(text) => setVehicle({ ...vehicle, model: text })}
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Color del vehículo"
              placeholderTextColor="#bbb"
              value={vehicle.color}
              onChangeText={(text) => setVehicle({ ...vehicle, color: text })}
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Año de fabricación"
              placeholderTextColor="#bbb"
              keyboardType="numeric"
              value={vehicle.year}
              onChangeText={(text) => setVehicle({ ...vehicle, year: text.replace(/[^0-9]/g, "") })} // Solo números
              maxLength={4} // Máximo 4 dígitos para el año
              editable={!loading}
            />
          </>
        )}

        <TouchableOpacity onPress={handleRegister} disabled={loading}>
          <LinearGradient
            colors={["#00f0ff", "#0cf574"]}
            start={[0, 0]}
            end={[1, 1]}
            style={styles.button}
          >
            {loading ? (
              <ActivityIndicator color="#0a0f1c" />
            ) : (
              <Text style={styles.buttonText}>Registrarse</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate("Login")} disabled={loading}>
          <Text style={styles.link}>¿Ya tienes cuenta? Inicia Sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
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
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: "#1a1f2e",
    borderWidth: 1,
    borderColor: "#00f0ff",
    minWidth: 120,
    alignItems: "center",
  },
  selected: {
    backgroundColor: "#00f0ff",
    borderColor: "#0cf574",
  },
  roleText: {
    color: "#fff",
    fontWeight: "bold",
  },
  link: {
    color: "#bbb",
    textAlign: "center",
    marginTop: 20,
  },
});

export default RegisterScreen;