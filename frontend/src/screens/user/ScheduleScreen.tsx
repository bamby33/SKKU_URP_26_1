/**
 * 화면 1 · 사용자(당사자)
 * 실시간 스케줄 공지 + 마이크 응답
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Animated, Easing, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Schedule'>;
};

type ScheduleItem = {
  id: number;
  title: string;
  time: string;
  status: 'done' | 'active' | 'upcoming';
};

const MOCK_SCHEDULES: ScheduleItem[] = [
  { id: 1, title: '기상 · 세면', time: '08:00', status: 'done' },
  { id: 2, title: '🍚 아침 식사', time: '09:00', status: 'active' },
  { id: 3, title: '여가 시간', time: '10:00', status: 'upcoming' },
  { id: 4, title: '산책', time: '10:30', status: 'upcoming' },
];

export default function ScheduleScreen({ navigation }: Props) {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [listening, setListening] = useState(true);
  const now = new Date();
  const hour = now.getHours();
  const timeStr = `${hour < 12 ? '오전' : '오후'} ${hour <= 12 ? hour : hour - 12}:${String(now.getMinutes()).padStart(2, '0')}`;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -10, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (!listening) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.6, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [listening]);

  const handleOk = () => {
    navigation.navigate('Feedback', { scheduleId: 2, achieved: true });
  };

  const handleLogout = () => {
    Alert.alert('로그아웃', '로그아웃 할까요?', [
      { text: '아니요', style: 'cancel' },
      {
        text: '네',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.clear();
          navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
        },
      },
    ]);
  };

  const dotColor = (status: ScheduleItem['status']) => {
    if (status === 'done') return colors.success;
    if (status === 'active') return colors.warning;
    return colors.border;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>🤖</Text>
          <Text style={styles.headerTitle}>AI 돌봄 도우미</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.75}>
          <Text style={styles.logoutText}>🚪 나가기</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 시간 배지 */}
        <View style={styles.timeBadge}>
          <Text style={styles.timeBadgeText}>⏰ {timeStr}</Text>
        </View>

        {/* 현재 일과 이모지 (크게) */}
        <Animated.Text style={[styles.emojiBig, { transform: [{ translateY: bounceAnim }] }]}>
          🍚
        </Animated.Text>

        {/* 현재 일과 안내 */}
        <View style={styles.currentCard}>
          <Text style={styles.currentLabel}>지금 할 일이에요!</Text>
          <Text style={styles.currentTitle}>🍚 아침 식사</Text>
          <Text style={styles.currentTime}>오전 9:00</Text>
        </View>

        {/* 마이크 버튼 */}
        <View style={styles.micWrap}>
          <View style={styles.micOuter}>
            {listening && (
              <Animated.View style={[styles.micPulse, { transform: [{ scale: pulseAnim }] }]} />
            )}
            <TouchableOpacity
              style={[styles.micBtn, listening && styles.micBtnListening]}
              onPress={() => setListening(!listening)}
            >
              <Text style={styles.micIcon}>🎙️</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.micLabel, listening && styles.micLabelListening]}>
            {listening ? '듣고 있어요… 말해보세요 😊' : '버튼을 눌러서 말하기'}
          </Text>
        </View>

        {/* 행동 버튼 (크게 - 당사자 접근성) */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.btnOk} onPress={handleOk} activeOpacity={0.85}>
            <Text style={styles.btnOkEmoji}>✅</Text>
            <Text style={styles.btnOkText}>알겠어요!</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnLater} activeOpacity={0.85}>
            <Text style={styles.btnLaterEmoji}>⏱</Text>
            <Text style={styles.btnLaterText}>3분 뒤에</Text>
          </TouchableOpacity>
        </View>

        {/* 오늘 일과 */}
        <View style={styles.scheduleCard}>
          <Text style={styles.scheduleTitle}>📅 오늘 일과</Text>
          {MOCK_SCHEDULES.map((item) => (
            <View key={item.id} style={[styles.scheduleItem, item.status === 'active' && styles.scheduleItemActive]}>
              <View style={[styles.dot, { backgroundColor: dotColor(item.status) }]} />
              <Text style={[
                styles.scheduleText,
                item.status === 'done' && styles.scheduleTextDone,
                item.status === 'active' && styles.scheduleTextActive,
              ]}>
                {item.title}
              </Text>
              <Text style={[styles.scheduleTime, item.status === 'active' && { color: colors.warning, fontWeight: '700' }]}>
                {item.time}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#DBEAFE' },

  header: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIcon: { fontSize: 20 },
  headerTitle: { color: colors.white, fontSize: 16, fontWeight: '700' },

  logoutBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  logoutText: { color: colors.white, fontSize: 12, fontWeight: '700' },

  content: {
    alignItems: 'center',
    padding: 16,
    gap: 16,
  },

  timeBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 20,
  },
  timeBadgeText: { color: colors.white, fontWeight: '700', fontSize: 14 },

  emojiBig: { fontSize: 88, lineHeight: 96 },

  currentCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 4,
    width: '100%',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  currentLabel: { fontSize: 13, color: colors.primaryLight, fontWeight: '700' },
  currentTitle: { fontSize: 24, fontWeight: '900', color: colors.primary },
  currentTime: { fontSize: 14, color: '#94A3B8', fontWeight: '600' },

  micWrap: { alignItems: 'center', gap: 10 },
  micOuter: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  micPulse: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(239,68,68,0.3)',
  },
  micBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  micBtnListening: { backgroundColor: colors.alertLight },
  micIcon: { fontSize: 30 },
  micLabel: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  micLabelListening: { color: colors.alert },

  actionRow: { flexDirection: 'row', gap: 12, width: '100%' },
  btnOk: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 4,
    elevation: 5,
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  btnOkEmoji: { fontSize: 26 },
  btnOkText: { color: colors.white, fontWeight: '900', fontSize: 16 },
  btnLater: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  btnLaterEmoji: { fontSize: 26 },
  btnLaterText: { color: colors.primary, fontWeight: '800', fontSize: 16 },

  scheduleCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    width: '100%',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    gap: 2,
  },
  scheduleTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 6,
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 10,
    borderRadius: 10,
  },
  scheduleItemActive: {
    backgroundColor: '#EFF6FF',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  scheduleText: { flex: 1, fontSize: 15, color: '#334155', fontWeight: '500' },
  scheduleTextDone: { textDecorationLine: 'line-through', color: '#CBD5E1' },
  scheduleTextActive: { fontWeight: '800', color: colors.primary },
  scheduleTime: { fontSize: 13, color: '#94A3B8', fontWeight: '500' },
});
