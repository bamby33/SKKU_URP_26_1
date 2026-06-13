/**
 * 공용 화면 프레임 — 모든 주요 화면 하단에 고정 탭바를 붙임.
 * 화면은 자기 헤더/내용을 children으로 넘기고, 루트는 SafeAreaView를 쓰지 말 것(여기서 처리).
 * navigation: 화면의 navigation, active: 현재 탭 key, role: 'user'|'guardian'(없으면 저장값)
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BottomBar, { BarItem } from './BottomBar';
import { colors } from '../theme/colors';
import { api } from '../api/client';

type Role = 'user' | 'guardian';

export default function AppFrame({
  navigation, active, role, children,
}: {
  navigation: any;
  active?: string;
  role?: Role;
  children: React.ReactNode;
}) {
  const [r, setR] = useState<Role | null>(role ?? null);
  useEffect(() => {
    if (!role) AsyncStorage.getItem('role').then(v => setR(v === 'guardian' ? 'guardian' : 'user'));
  }, [role]);

  const logout = () => {
    Alert.alert('로그아웃', '로그아웃 할까요?', [
      { text: '아니요', style: 'cancel' },
      { text: '네', style: 'destructive', onPress: async () => {
        await AsyncStorage.clear();
        navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
      } },
    ]);
  };
  const emergency = async () => {
    const uid = await AsyncStorage.getItem('user_id');
    if (uid) api.post(`/guardian/user/${uid}/emergency`).catch(() => {});
    Alert.alert('보호자 연락', '보호자에게 알림을 보냈어요.');
  };

  const isG = r === 'guardian';
  const items: BarItem[] = isG ? [
    { key: 'home', label: '홈', icon: 'home', active: active === 'home', onPress: () => navigation.navigate('GuardianReport') },
    { key: 'edit', label: '일과 편집', icon: 'create-outline', active: active === 'edit', onPress: () => navigation.navigate('ScheduleEdit') },
    { key: 'logout', label: '로그아웃', icon: 'log-out-outline', danger: true, onPress: logout },
  ] : [
    { key: 'call', label: '보호자 연락', icon: 'call-outline', onPress: emergency },
    { key: 'ai', label: 'AI챗', icon: 'chatbubble-ellipses-outline', active: active === 'ai', onPress: () => navigation.navigate('AIChat') },
    { key: 'home', label: '홈', icon: 'home', active: active === 'home', onPress: () => navigation.navigate('Schedule') }, // 가운데
    { key: 'edit', label: '일과 수정', icon: 'create-outline', active: active === 'edit', onPress: () => navigation.navigate('ScheduleEdit') },
    { key: 'logout', label: '로그아웃', icon: 'log-out-outline', danger: true, onPress: logout },
  ];

  const brand = isG ? colors.guardian : colors.primary;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top', 'bottom']}>
      {/* 고정 Routy 헤더 (모든 페이지 유지) */}
      <View style={styles.routyBar}>
        <Text style={[styles.routyText, { color: brand }]}>Routy</Text>
      </View>
      <View style={{ flex: 1 }}>{children}</View>
      <BottomBar items={items} color={brand} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  routyBar: {
    height: 60, justifyContent: 'center', paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: '#EEF2F7', backgroundColor: '#fff',
  },
  routyText: { fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
});
