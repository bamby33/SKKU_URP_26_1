import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AuthScreen from '../screens/auth/AuthScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import PersonInfoScreen from '../screens/onboarding/PersonInfoScreen';
import PreferencesScreen from '../screens/onboarding/PreferencesScreen';
import ScheduleSetupScreen from '../screens/onboarding/ScheduleSetupScreen';
import BasicScheduleScreen from '../screens/onboarding/BasicScheduleScreen';
import AccountSetupScreen from '../screens/onboarding/AccountSetupScreen';
import PINSetupScreen from '../screens/onboarding/PINSetupScreen';
import WelcomeScreen from '../screens/onboarding/WelcomeScreen';
import PINLoginScreen from '../screens/auth/PINLoginScreen';

import ScheduleScreen from '../screens/user/ScheduleScreen';
import FeedbackScreen from '../screens/user/FeedbackScreen';
import EmergencyScreen from '../screens/user/EmergencyScreen';
import GuardianReportScreen from '../screens/guardian/GuardianReportScreen';
import AIChatScreen from '../screens/user/AIChatScreen';
import TodayScheduleEditScreen from '../screens/user/TodayScheduleEditScreen';
import WeekScheduleEditScreen from '../screens/user/WeekScheduleEditScreen';
import ScheduleEditScreen from '../screens/user/ScheduleEditScreen';
import DailySummaryScreen from '../screens/user/DailySummaryScreen';
import GuardianTomorrowScreen from '../screens/guardian/GuardianTomorrowScreen';
import GuardianTodayScreen from '../screens/guardian/GuardianTodayScreen';
import GuardianRecapScreen from '../screens/guardian/GuardianRecapScreen';


export type ScheduleParam = {
  day: number;       // 0=월 … 6=일
  startSlot: number; // 0 = 06:00, 1 = 06:30 ... (그리드 위치용)
  endSlot: number;   // exclusive
  startTime?: string; // 실제 저장용 정확한 시각 "HH:MM" (없으면 slot 사용)
  endTime?: string;
  activity: string;
  emoji: string;
  color: string;
};

// 회원가입 데이터를 화면간 전달하는 공통 타입
type SignupBase = {
  userName: string;
  age: string;
  gender: string;
  disabilityType: string;
  disabilityLevel: string;   // 'mild' | 'moderate' | 'severe'
  occupation: string;
  likes: string;
  dislikes: string;
  problemNotes: string;       // 문제행동 특이사항
  themeColor: string;
  schedules: ScheduleParam[];
};

type AccountInfo = SignupBase & {
  guardianName: string;
  guardianPhone: string;
  username: string;
  password: string;
};

export type RootStackParamList = {
  Auth: undefined;
  Login: { role?: 'guardian' } | undefined;
  PINLogin: undefined;
  Home: undefined;
  PersonInfo: undefined;
  Preferences: { userName: string; age: string; gender: string; disabilityType: string; disabilityLevel: string; occupation: string };
  BasicSchedule: Omit<SignupBase, 'schedules'>;
  ScheduleSetup: SignupBase;
  AccountSetup: SignupBase;
  PINSetup: AccountInfo;
  Welcome: AccountInfo & { pin: string };
  Schedule: { justAchieved?: boolean; achieveRate?: number; behaviorResolved?: boolean; snoozeScheduleId?: number; announceScheduleId?: number; restWithRetry?: boolean } | undefined;
  Feedback: { scheduleId: number; achieved: boolean; title: string };
  Emergency: { stage?: 'stage_1' | 'stage_2' | 'stage_3' };
  GuardianReport: undefined;
  AIChat: { followUpSchedule?: string; followUpId?: number; followUpAttempt?: number; behaviorAlert?: boolean; behaviorStage1?: boolean; behaviorFollowup?: boolean; spokenText?: string; scheduleTitle?: string; scheduleCategory?: string; reasonAsk?: { scheduleId: number; title: string; kind: 'refused' | 'gaveup' } } | undefined;
  TodayScheduleEdit: undefined;
  WeekScheduleEdit: undefined;
  ScheduleEdit: undefined;
  DailySummary: undefined;
  GuardianTomorrow: undefined;
  GuardianToday: undefined;
  GuardianRecap: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  // 세션 복원(자동 로그인): 저장된 로그인 정보가 있으면 해당 홈으로 바로 진입
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const pairs = await AsyncStorage.multiGet(['user_id', 'role']);
        const uid = pairs[0][1];
        const role = pairs[1][1];
        if (uid) setInitialRoute(role === 'guardian' ? 'GuardianReport' : 'Schedule');
        else setInitialRoute('Auth');
      } catch {
        setInitialRoute('Auth');
      }
    })();
  }, []);

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator size="large" color="#3B4A6B" />
      </View>
    );
  }

  return (
    <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Auth" component={AuthScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="PersonInfo" component={PersonInfoScreen} />
      <Stack.Screen name="Preferences" component={PreferencesScreen} />
      <Stack.Screen name="BasicSchedule" component={BasicScheduleScreen} />
      <Stack.Screen name="ScheduleSetup" component={ScheduleSetupScreen} />
      <Stack.Screen name="AccountSetup" component={AccountSetupScreen} />
      <Stack.Screen name="PINSetup" component={PINSetupScreen} />
      <Stack.Screen name="PINLogin" component={PINLoginScreen} />
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Schedule" component={ScheduleScreen} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} />
      <Stack.Screen name="Emergency" component={EmergencyScreen} />
      <Stack.Screen name="GuardianReport" component={GuardianReportScreen} />
      <Stack.Screen
        name="AIChat"
        component={AIChatScreen}
        options={{ animation: 'fade' }}
      />
      <Stack.Screen name="TodayScheduleEdit" component={TodayScheduleEditScreen} />
      <Stack.Screen name="WeekScheduleEdit" component={WeekScheduleEditScreen} />
      <Stack.Screen name="ScheduleEdit" component={ScheduleEditScreen} />
      <Stack.Screen name="DailySummary" component={DailySummaryScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="GuardianTomorrow" component={GuardianTomorrowScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="GuardianToday" component={GuardianTodayScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="GuardianRecap" component={GuardianRecapScreen} options={{ animation: 'fade' }} />
    </Stack.Navigator>
  );
}
