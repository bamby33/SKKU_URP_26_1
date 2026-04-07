import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ScheduleScreen from '../screens/user/ScheduleScreen';
import FeedbackScreen from '../screens/user/FeedbackScreen';
import EmergencyScreen from '../screens/user/EmergencyScreen';
import GuardianReportScreen from '../screens/guardian/GuardianReportScreen';

export type RootStackParamList = {
  Schedule: undefined;
  Feedback: { scheduleId: number; achieved: boolean };
  Emergency: undefined;
  GuardianReport: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Schedule" component={ScheduleScreen} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} />
      <Stack.Screen name="Emergency" component={EmergencyScreen} />
      <Stack.Screen name="GuardianReport" component={GuardianReportScreen} />
    </Stack.Navigator>
  );
}
