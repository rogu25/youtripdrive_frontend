import React from "react";
import { View, Text } from "react-native";
import RideChat from "../components/RideChat";

const RideChatScreen = ({ route, user }) => {
  const { rideId } = route.params;

  return (
    <View style={{ flex: 1 }}>
      <RideChat rideId={rideId} user={user} />
    </View>
  );
};

export default RideChatScreen;
