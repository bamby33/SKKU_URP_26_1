import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AuthScreen from '../screens/auth/AuthScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import PersonInfoScreen from '../screens/onboarding/PersonInfoScreen';
import PreferencesScreen from '../screens/onboarding/PreferencesScreen';
import ScheduleSetupScreen from '../screens/onboarding/ScheduleSetupScreen';
import AccountSetupScreen from '../screens/onboarding/AccountSetupScreen';
import PINSetupScreen from '../screens/onboarding/PINSetupScreen';
import WelcomeScreen from '../screens/onboarding/WelcomeScreen';
import PINLoginScreen from '../screens/auth/PINLoginScreen';
import ScheduleScreen from '../screens/user/ScheduleScreen';
import FeedbackScreen from '../screens/user/FeedbackScreen';
import EmergencyScreen from '../screens/user/EmergencyScreen';
import GuardianReportScreen from '../screens/guardian/GuardianReportScreen';

export type PINItem = {
  order: number;
  question: string;
  correct_answer: string;
  correct_emoji: string;
};

// 회원가입 데이터를 화면간 전달하는 공통 타입
type SignupBase = {
  userName: string;   // 당사자 이름
  age: string;
  gender: string;
  likes: string[];
  dislikes: string[];
};

type AccountInfo = SignupBase & {
  guardianName: string;
  guardianPhone: string;
  username: string;
  password: string;
};

export type RootStackParamList = {
  Auth: undefined;
  Login: undefined;
  PINLogin: undefined;
  Home: undefined;
  PersonInfo: undefined;
  Preferences: { userName: string; age: string; gender: string };
  ScheduleSetup: SignupBase;
  AccountSetup: SignupBase;
  PINSetup: AccountInfo;
  Welcome: AccountInfo & { pins: PINItem[] };
  Schedule: undefined;
  Feedback: { scheduleId: number; achieved: boolean };
  Emergency: undefined;
  GuardianReport: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Auth" component={AuthScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="PersonInfo" component={PersonInfoScreen} />
      <Stack.Screen name="Preferences" component={PreferencesScreen} />
      <Stack.Screen name="ScheduleSetup" component={ScheduleSetupScreen} />
      <Stack.Screen name="AccountSetup" component={AccountSetupScreen} />
      <Stack.Screen name="PINSetup" component={PINSetupScreen} />
      <Stack.Screen name="PINLogin" component={PINLoginScreen} />
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Schedule" component={ScheduleScreen} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} />
      <Stack.Screen name="Emergency" component={EmergencyScreen} />
      <Stack.Screen name="GuardianReport" component={GuardianReportScreen} />
    </Stack.Navigator>
  );
}
