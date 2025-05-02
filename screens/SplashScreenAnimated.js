import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, Image, Easing } from "react-native";
import { Audio } from "expo-av";
import * as SplashScreen from "expo-splash-screen";

const SplashScreenAnimated = ({ navigation }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const playSound = async () => {
    const { sound } = await Audio.Sound.createAsync(
      require("../assets/intro.mp3")
    );
    await sound.playAsync();
  };

  useEffect(() => {
    playSound();

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

    const timeout = setTimeout(async () => {
      await SplashScreen.hideAsync(); // oculta la splash nativa
      navigation.replace("Login"); // o "Rides" si ya hay usuario
    }, 2800);

    return () => clearTimeout(timeout);
  }, []);

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["-15deg", "0deg"],
  });

  return (
    <View style={styles.container}>
      <Animated.Image
        source={require("../assets/logo.jpg")}
        style={[
          styles.logo,
          {
            opacity: fadeAnim,
            transform: [
              { scale: scaleAnim },
              { rotate: rotateInterpolate },
            ],
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
