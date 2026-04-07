import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import PersonInfoScreen from '../screens/onboarding/PersonInfoScreen';
import PreferencesScreen from '../screens/onboarding/PreferencesScreen';
import ScheduleSetupScreen from '../screens/onboarding/ScheduleSetupScreen';
import WelcomeScreen from '../screens/onboarding/WelcomeScreen';
import ScheduleScreen from '../screens/user/ScheduleScreen';
import FeedbackScreen from '../screens/user/FeedbackScreen';
import EmergencyScreen from '../screens/user/EmergencyScreen';
import GuardianReportScreen from '../screens/guardian/GuardianReportScreen';

export type RootStackParamList = {
  Home: undefined;
  PersonInfo: { role: 'user' | 'guardian' };
  Preferences: { name: string; age: string; gender: string };
  ScheduleSetup: { name: string; age: string; gender: string; likes: string[]; dislikes: string[] };
  Welcome: { name: string; role: 'user' | 'guardian' };
  Schedule: undefined;
  Feedback: { scheduleId: number; achieved: boolean };
  Emergency: undefined;
  GuardianReport: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="PersonInfo" component={PersonInfoScreen} />
      <Stack.Screen name="Preferences" component={PreferencesScreen} />
      <Stack.Screen name="ScheduleSetup" component={ScheduleSetupScreen} />
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Schedule" component={ScheduleScreen} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} />
      <Stack.Screen name="Emergency" component={EmergencyScreen} />
      <Stack.Screen name="GuardianReport" component={GuardianReportScreen} />
    </Stack.Navigator>
  );
}
