/**
 * 화면 2 · 보호자
 * 일과 달성률 리포트 + 내일 스케줄
 */
import React from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'GuardianReport'>;
};

type Task = { emoji: string; name: string; done: boolean };

const TASKS: Task[] = [
  { emoji: '🍚', name: '아침 식사', done: true },
  { emoji: '🦷', name: '양치질', done: true },
  { emoji: '🚶', name: '산책', done: false },
  { emoji: '🍱', name: '점심 식사', done: true },
  { emoji: '📖', name: '독서 활동', done: false },
];

const TOMORROW = [
  { emoji: '🌅', time: '08:00', label: '기상 · 세면' },
  { emoji: '🍚', time: '09:00', label: '아침 식사' },
  { emoji: '📖', time: '10:30', label: '독서 활동' },
  { emoji: '🚶', time: '13:30', label: '산책', adjusted: true },
];

const achieved = TASKS.filter((t) => t.done).length;
const total = TASKS.length;
const rate = Math.round((achieved / total) * 100);

export default function GuardianReportScreen({ navigation }: Props) {
  const handleLogout = () => {
    Alert.alert('로그아웃', '로그아웃 하시겠어요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
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
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>📊</Text>
          <Text style={styles.headerTitle}>AI 돌봄 · 보호자</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.75}>
          <Text style={styles.logoutText}>🚪 로그아웃</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 섹션 타이틀 */}
        <Text style={styles.sectionTitle}>📋 오늘 일과 리포트</Text>

        {/* 리포트 카드 */}
        <View style={styles.reportCard}>
          <View style={styles.reportHeader}>
            <View>
              <Text style={styles.reportDate}>2026년 4월 7일 (월)</Text>
              <Text style={styles.reportLabel}>일과 달성률</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.reportScore}>{rate}%</Text>
              <Text style={styles.reportLabel}>{achieved} / {total} 완료</Text>
            </View>
          </View>

          {/* 프로그레스 바 */}
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${rate}%` as any }]} />
          </View>

          {/* 태스크 목록 */}
          {TASKS.map((task, i) => (
            <View key={i} style={styles.taskRow}>
              <View style={styles.taskName}>
                <Text style={styles.taskEmoji}>{task.emoji}</Text>
                <Text style={styles.taskText}>{task.name}</Text>
              </View>
              <View style={[styles.taskBadge, task.done ? styles.taskBadgeOk : styles.taskBadgeNg]}>
                <Text style={styles.taskBadgeText}>{task.done ? '✓ 완료' : '✗ 미완료'}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* AI 최적화 알림 */}
        <View style={styles.alertCard}>
          <Text style={styles.alertTitle}>✨ AI 스케줄 자동 최적화 완료</Text>
          <Text style={styles.alertBody}>
            오늘 산책 거부 패턴을 학습했어요.{'\n'}
            내일 산책 시간을 오후로 조정하고{'\n'}
            점심 식사 후 자연스럽게 연결되도록{'\n'}
            스케줄을 자동으로 업데이트했어요.
          </Text>
        </View>

        {/* 내일 스케줄 */}
        <View style={styles.tomorrowCard}>
          <Text style={styles.tomorrowTitle}>
            📅 내일 스케줄{'  '}
            <Text style={styles.tomorrowSub}>AI 자동 조정됨</Text>
          </Text>
          {TOMORROW.map((item, i) => (
            <View key={i} style={styles.tItem}>
              <Text style={styles.tEmoji}>{item.emoji}</Text>
              <Text style={styles.tTime}>{item.time}</Text>
              <Text style={styles.tLabel}>{item.label}</Text>
              {item.adjusted && (
                <View style={styles.adjustedBadge}>
                  <Text style={styles.adjustedText}>↑ 조정</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    backgroundColor: colors.guardian,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIcon: { fontSize: 18 },
  headerTitle: { color: colors.white, fontWeight: '700', fontSize: 15 },

  logoutBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  logoutText: { color: colors.white, fontSize: 12, fontWeight: '700' },

  content: { padding: 14, gap: 12 },

  sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.primary },

  reportCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  reportDate: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginBottom: 2 },
  reportLabel: { fontSize: 10, color: '#CBD5E1' },
  reportScore: { fontSize: 30, fontWeight: '900', color: colors.guardian, lineHeight: 32 },

  progressBg: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    height: 10,
    marginBottom: 14,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 8,
    backgroundColor: colors.guardianLight,
  },

  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  taskName: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  taskEmoji: { fontSize: 16 },
  taskText: { fontSize: 13, color: '#334155', fontWeight: '500' },
  taskBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  taskBadgeOk: { backgroundColor: '#D1FAE5' },
  taskBadgeNg: { backgroundColor: '#FEE2E2' },
  taskBadgeText: { fontSize: 11, fontWeight: '700', color: '#374151' },

  alertCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: colors.guardianLight,
  },
  alertTitle: { fontWeight: '800', color: colors.guardian, marginBottom: 6, fontSize: 13 },
  alertBody: { fontSize: 12, color: '#065F46', lineHeight: 20, opacity: 0.8 },

  tomorrowCard: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    padding: 16,
  },
  tomorrowTitle: { fontSize: 13, fontWeight: '800', color: colors.white, marginBottom: 12 },
  tomorrowSub: { fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: '400' },
  tItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    gap: 8,
  },
  tEmoji: { fontSize: 16 },
  tTime: { color: '#93C5FD', fontWeight: '700', fontSize: 11, width: 44 },
  tLabel: { flex: 1, fontSize: 12, color: '#BFDBFE' },
  adjustedBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  adjustedText: { fontSize: 10, color: '#BAE6FD', fontWeight: '600' },
});
