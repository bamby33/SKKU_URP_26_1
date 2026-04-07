/**
 * 화면 1 · 사용자
 * 실시간 스케줄 공지 + 마이크 응답
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { getSchedules } from '../../api/client';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Schedule'>;
};

const USER_ID = 1; // TODO: 실제 로그인 연동 시 교체

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
  const timeStr = `오전 ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

  // 이모지 바운스 애니메이션
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -8, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // 마이크 펄스 애니메이션
  useEffect(() => {
    if (!listening) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.5, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [listening]);

  const handleOk = () => {
    navigation.navigate('Feedback', { scheduleId: 2, achieved: true });
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
        <Text style={styles.headerIcon}>🤖</Text>
        <Text style={styles.headerTitle}>AI 돌봄 도우미</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 시간 배지 */}
        <View style={styles.timeBadge}>
          <Text style={styles.timeBadgeText}>⏰ {timeStr}</Text>
        </View>

        {/* 바운스 이모지 */}
        <Animated.Text style={[styles.emojiBig, { transform: [{ translateY: bounceAnim }] }]}>
          🍚
        </Animated.Text>

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
            {listening ? '듣고 있어요… 말해보세요' : '버튼을 눌러 말하기'}
          </Text>
        </View>

        {/* 행동 버튼 */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.btnOk} onPress={handleOk}>
            <Text style={styles.btnOkText}>✅ 알겠어요!</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnLater}>
            <Text style={styles.btnLaterText}>⏱ 3분 뒤</Text>
          </TouchableOpacity>
        </View>

        {/* 오늘 일과 */}
        <View style={styles.scheduleCard}>
          <Text style={styles.scheduleTitle}>오늘 일과</Text>
          {MOCK_SCHEDULES.map((item) => (
            <View key={item.id} style={styles.scheduleItem}>
              <View style={[styles.dot, { backgroundColor: dotColor(item.status) }]} />
              <Text style={[styles.scheduleText, item.status === 'done' && styles.scheduleTextDone]}>
                {item.title}
              </Text>
              <Text style={styles.scheduleTime}>{item.time}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#dce8ff' },
  header: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerIcon: { fontSize: 18 },
  headerTitle: { color: colors.white, fontSize: 15, fontWeight: '700' },

  content: {
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },

  timeBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 16,
  },
  timeBadgeText: { color: colors.white, fontWeight: '700', fontSize: 13 },

  emojiBig: { fontSize: 72, lineHeight: 80 },

  micWrap: { alignItems: 'center', gap: 8 },
  micOuter: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  micPulse: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(239,83,80,0.35)',
  },
  micBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  micBtnListening: { backgroundColor: colors.alertLight },
  micIcon: { fontSize: 26 },
  micLabel: { fontSize: 12, fontWeight: '700', color: '#666' },
  micLabelListening: { color: colors.alert },

  actionRow: { flexDirection: 'row', gap: 10, width: '100%' },
  btnOk: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnOkText: { color: colors.white, fontWeight: '800', fontSize: 14 },
  btnLater: {
    flex: 1,
    backgroundColor: colors.primaryBg,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnLaterText: { color: colors.primary, fontWeight: '800', fontSize: 14 },

  scheduleCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 14,
    width: '100%',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  scheduleTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#aaa',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    gap: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  scheduleText: { flex: 1, fontSize: 13, color: '#444' },
  scheduleTextDone: { textDecorationLine: 'line-through', color: '#bbb' },
  scheduleTime: { fontSize: 11, color: '#aaa' },
});
