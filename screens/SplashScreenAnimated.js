import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, Image, Easing } from "react-native";
import { Audio } from "expo-av";
import * as SplashScreen from "expo-splash-screen";

const SplashScreenAnimated = ({ navigation }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const playSound = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require("../assets/intro.mp3")
      );
      await sound.playAsync();
      // Opcional: Asegúrate de descargar el sonido para liberar memoria si es necesario
      // sound.unloadAsync();
    } catch (error) {
      console.warn("Error al reproducir el sonido de intro:", error);
      // No detengas la aplicación si el sonido falla
    }
  };

  useEffect(() => {
    playSound();

    // Inicia tus animaciones
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }),
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 1500,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
    ]).start();

    // Después de que las animaciones y el sonido hayan tenido tiempo de ejecutarse,
    // oculta el splash nativo y navega a la pantalla 'Root'.
    // RootNavigator se encargará de decidir la ruta final (Login, PassengerHome, DriverHome).
    const timeout = setTimeout(async () => {
      await SplashScreen.hideAsync(); // oculta la splash nativa de Expo
      // *** CAMBIO CRÍTICO AQUÍ ***
      // Siempre navega a 'Root'. RootNavigator contendrá la lógica condicional.
      navigation.replace("Root");
    }, 2800); // Ajusta la duración total si es necesario para que coincida con tus animaciones

    return () => clearTimeout(timeout); // Limpia el temporizador al desmontar
  }, [navigation]); // Añadimos navigation a las dependencias del useEffect

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["-15deg", "0deg"],
  });

  return (
    <View style={styles.container}>
      <Animated.Image
        source={require("../assets/logo.jpg")} // Asegúrate de que esta ruta sea correcta
        style={[
          styles.logo,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }, { rotate: rotateInterpolate }],
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0f1c",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 220,
    height: 220,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: "#00f0ff",
  },
});

export default SplashScreenAnimated;
