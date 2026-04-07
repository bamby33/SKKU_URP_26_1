/**
 * 화면 2 · 보호자
 * 일과 달성률 리포트 + 내일 스케줄
 */
import React from 'react';
import {
  View, Text, ScrollView, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';

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

export default function GuardianReportScreen() {
  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>📊</Text>
          <Text style={styles.headerTitle}>AI 돌봄 · 보호자</Text>
        </View>
        <View style={styles.newBadge}>
          <Text style={styles.newBadgeText}>NEW</Text>
        </View>
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
              <Text style={task.done ? styles.checkOk : styles.checkNg}>
                {task.done ? '✓' : '✗'}
              </Text>
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
            📅 내일 스케줄{' '}
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
  container: { flex: 1, backgroundColor: '#f7f9fc' },

  header: {
    backgroundColor: colors.guardian,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIcon: { fontSize: 18 },
  headerTitle: { color: colors.white, fontWeight: '700', fontSize: 15 },
  newBadge: {
    backgroundColor: '#ff5722',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  newBadgeText: { color: colors.white, fontSize: 10, fontWeight: '700' },

  content: { padding: 14, gap: 12 },

  sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.primary },

  reportCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  reportDate: { fontSize: 11, color: '#999', fontWeight: '600', marginBottom: 2 },
  reportLabel: { fontSize: 10, color: '#bbb' },
  reportScore: { fontSize: 28, fontWeight: '900', color: colors.guardian, lineHeight: 30 },

  progressBg: {
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    height: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: colors.guardianLight,
  },

  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  taskName: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  taskEmoji: { fontSize: 14 },
  taskText: { fontSize: 12, color: '#555' },
  checkOk: { color: colors.guardianLight, fontWeight: '700', fontSize: 14 },
  checkNg: { color: colors.alertLight, fontWeight: '700', fontSize: 14 },

  alertCard: {
    backgroundColor: '#e8f5e9',
    borderRadius: 14,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.guardianLight,
  },
  alertTitle: { fontWeight: '800', color: colors.guardian, marginBottom: 4, fontSize: 12 },
  alertBody: { fontSize: 11, color: '#5d4037', lineHeight: 18 },

  tomorrowCard: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: 14,
  },
  tomorrowTitle: { fontSize: 13, fontWeight: '800', color: colors.white, marginBottom: 10 },
  tomorrowSub: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '400' },
  tItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 6,
  },
  tEmoji: { fontSize: 14 },
  tTime: { color: '#7c93d0', fontWeight: '700', fontSize: 11, width: 42 },
  tLabel: { flex: 1, fontSize: 12, color: '#c5cfe8' },
  adjustedBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  adjustedText: { fontSize: 9, color: '#a5c8ff' },
});
