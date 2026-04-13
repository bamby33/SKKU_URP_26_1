/**
 * 화면 1 · 사용자(당사자)
 * 실시간 스케줄 공지 + AI 채팅
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

type ChatMessage = {
  id: number;
  text: string;
};

const MOCK_SCHEDULES: ScheduleItem[] = [
  { id: 1, title: '기상 · 세면', time: '08:00', status: 'done' },
  { id: 2, title: '🍚 아침 식사', time: '09:00', status: 'active' },
  { id: 3, title: '여가 시간', time: '10:00', status: 'upcoming' },
  { id: 4, title: '🚶 산책', time: '10:30', status: 'upcoming' },
];

const MOCK_CHAT: ChatMessage[] = [
  { id: 1, text: '🍚 밥 먹을 시간이에요!\n아침 식사를 해볼까요? 😊' },
];

export default function ScheduleScreen({ navigation }: Props) {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const [chatMessages] = useState<ChatMessage[]>(MOCK_CHAT);

  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const timeStr = `${hour < 12 ? '오전' : '오후'} ${hour <= 12 ? hour : hour - 12}:${String(minute).padStart(2, '0')}`;

  const nextSchedule = MOCK_SCHEDULES.find(s => s.status === 'upcoming');
  const currentSchedule = MOCK_SCHEDULES.find(s => s.status === 'active');

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -10, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

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

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더: 다음 일과 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.nextLabel}>다음 일과</Text>
          <Text style={styles.nextText}>
            {nextSchedule ? `${nextSchedule.time} ${nextSchedule.title}` : '일과 없음'}
          </Text>
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

        {/* 현재 일과 이모지 */}
        <Animated.Text style={[styles.emojiBig, { transform: [{ translateY: bounceAnim }] }]}>
          🍚
        </Animated.Text>

        {/* 현재 일과 안내 */}
        <View style={styles.currentCard}>
          <Text style={styles.currentLabel}>지금 할 일이에요!</Text>
          <Text style={styles.currentTitle}>{currentSchedule?.title ?? '🍚 아침 식사'}</Text>
          <Text style={styles.currentTime}>{currentSchedule ? `오전 ${currentSchedule.time}` : '오전 9:00'}</Text>
        </View>

        {/* AI 채팅 메시지 */}
        <View style={styles.chatSection}>
          {chatMessages.map(msg => (
            <View key={msg.id} style={styles.chatBubbleRow}>
              <Text style={styles.chatAvatar}>🤖</Text>
              <View style={styles.chatBubble}>
                <Text style={styles.chatText}>{msg.text}</Text>
              </View>
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
  nextLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  nextText: { color: colors.white, fontSize: 15, fontWeight: '800' },

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

  chatSection: {
    width: '100%',
    gap: 10,
  },
  chatBubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  chatAvatar: { fontSize: 24 },
  chatBubble: {
    backgroundColor: colors.white,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: '80%',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  chatText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 24,
  },
});
