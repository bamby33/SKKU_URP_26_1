/**
 * 화면 2 · 보호자 대시보드
 * - 일과 중: 현재 수행 중인 일과 표시
 * - 일과 종료 후: AI 분석 리포트 표시
 * - 항상: 오늘의 확인사항(이상행동 알림), 내일 스케줄
 */
import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { api } from '../../api/client';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'GuardianReport'>;
};

type CurrentSchedule = { id: number; title: string; time: string };
type ReportItem = { schedule_id: number; title: string; time: string; status: string };
type TodayReport = {
  date: string; achieved: number; total: number; achievement_rate: number; items: ReportItem[];
};
type BehaviorAlert = {
  id: number; stage: string; stage_label: string;
  schedule_title: string | null; trigger: string | null;
  logged_at: string; is_read: boolean;
};
type TomorrowSchedule = { id: number; title: string; time: string };

type Dashboard = {
  current_schedule: CurrentSchedule | null;
  day_complete: boolean;
  today_report: TodayReport | null;
  behavior_alerts: BehaviorAlert[];
  has_unread: boolean;
  ai_summary: string | null;
  tomorrow_schedules: TomorrowSchedule[];
};

/* ── 유틸 ── */
function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? '오전' : '오후';
  const hour = h % 12 || 12;
  return `${ampm} ${hour}:${String(m).padStart(2, '0')}`;
}

function formatLogTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function statusLabel(status: string) {
  if (status === 'achieved') return '✓ 완료';
  if (status === 'missed') return '✗ 미완료';
  return '⋯ 대기';
}
function statusBg(status: string) {
  if (status === 'achieved') return '#D1FAE5';
  if (status === 'missed') return '#FEE2E2';
  return '#F1F5F9';
}

function stageBg(stage: string) {
  if (stage === 'stage_1') return '#FEF9C3';
  if (stage === 'stage_2') return '#FEE2E2';
  return '#E0F2FE';
}
function stageColor(stage: string) {
  if (stage === 'stage_1') return '#92400E';
  if (stage === 'stage_2') return '#991B1B';
  return '#075985';
}

export default function GuardianReportScreen({ navigation }: Props) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [alertsExpanded, setAlertsExpanded] = useState(false);

  const fetchDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) return;
      const res = await api.get(`/guardian/user/${userId}/dashboard`);
      setData(res.data);
    } catch {
      // 실패 시 기존 데이터 유지
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // 화면 포커스마다 새로고침 + 1분 타이머
  useFocusEffect(
    useCallback(() => {
      fetchDashboard();
      const tick = setInterval(() => fetchDashboard(), 60_000);
      return () => clearInterval(tick);
    }, [fetchDashboard])
  );

  const handleMarkRead = async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) return;
      await api.put(`/guardian/user/${userId}/mark-alerts-read`);
      setData((prev) => prev ? {
        ...prev,
        has_unread: false,
        behavior_alerts: prev.behavior_alerts.map((a) => ({ ...a, is_read: true })),
      } : prev);
    } catch {}
  };

  const handleLogout = () => {
    Alert.alert('로그아웃', '로그아웃 하시겠어요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃', style: 'destructive',
        onPress: async () => {
          await AsyncStorage.clear();
          navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
        },
      },
    ]);
  };

  const handleAlertsToggle = () => {
    if (!alertsExpanded && data?.has_unread) {
      handleMarkRead();
    }
    setAlertsExpanded((v) => !v);
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

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.guardian} />
          <Text style={styles.loadingText}>대시보드를 불러오는 중...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchDashboard(true)}
              colors={[colors.guardian]}
            />
          }
        >
          {/* ── 1. 현재 수행 중인 일과 OR 오늘 일과 리포트 ── */}
          {!data?.day_complete ? (
            /* 일과 진행 중: 현재 스케줄 */
            <>
              <Text style={styles.sectionTitle}>⏱ 현재 수행 중인 일과</Text>
              {data?.current_schedule ? (
                <View style={styles.currentCard}>
                  <View style={styles.currentLeft}>
                    <View style={styles.liveDot} />
                    <View>
                      <Text style={styles.currentTime}>{formatTime(data.current_schedule.time)}</Text>
                      <Text style={styles.currentTitle}>{data.current_schedule.title}</Text>
                    </View>
                  </View>
                  <View style={styles.inProgressBadge}>
                    <Text style={styles.inProgressText}>진행 중</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>지금 진행 중인 일과가 없어요.</Text>
                </View>
              )}
            </>
          ) : (
            /* 일과 종료: AI 분석 리포트 */
            <>
              <Text style={styles.sectionTitle}>📋 오늘 일과 리포트</Text>
              {data.today_report ? (
                <View style={styles.reportCard}>
                  <View style={styles.reportHeader}>
                    <View>
                      <Text style={styles.reportDate}>{data.today_report.date.replace(/-/g, '. ')}</Text>
                      <Text style={styles.reportLabel}>일과 달성률</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.reportScore}>{data.today_report.achievement_rate}%</Text>
                      <Text style={styles.reportLabel}>
                        {data.today_report.achieved} / {data.today_report.total} 완료
                      </Text>
                    </View>
                  </View>
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, { width: `${data.today_report.achievement_rate}%` as any }]} />
                  </View>
                  {data.today_report.items.map((item, i) => (
                    <View key={item.schedule_id} style={[
                      styles.taskRow,
                      i === data.today_report!.items.length - 1 && { borderBottomWidth: 0 },
                    ]}>
                      <Text style={styles.taskTime}>{formatTime(item.time)}</Text>
                      <Text style={styles.taskText} numberOfLines={1}>{item.title}</Text>
                      <View style={[styles.taskBadge, { backgroundColor: statusBg(item.status) }]}>
                        <Text style={styles.taskBadgeText}>{statusLabel(item.status)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>리포트를 준비 중이에요.</Text>
                </View>
              )}
            </>
          )}

          {/* ── 2. 오늘의 확인사항 (이상행동 알림) ── */}
          <TouchableOpacity
            style={styles.alertsHeader}
            onPress={handleAlertsToggle}
            activeOpacity={0.8}
          >
            <Text style={styles.sectionTitle}>📋 오늘의 확인사항</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {data?.has_unread && (
                <View style={styles.redDot} />
              )}
              <Text style={styles.expandIcon}>{alertsExpanded ? '▲' : '▼'}</Text>
            </View>
          </TouchableOpacity>

          {alertsExpanded && (
            <View style={styles.alertsCard}>
              {!data?.behavior_alerts.length ? (
                <Text style={styles.emptyAlertsText}>오늘 이상행동 기록이 없어요. 👍</Text>
              ) : (
                data.behavior_alerts.map((alert) => (
                  <View key={alert.id} style={[styles.alertRow, { backgroundColor: stageBg(alert.stage) }]}>
                    <View style={styles.alertLeft}>
                      <Text style={[styles.alertStage, { color: stageColor(alert.stage) }]}>
                        {alert.stage_label}
                      </Text>
                      {alert.schedule_title && (
                        <Text style={styles.alertSchedule}>{alert.schedule_title} 일과 중</Text>
                      )}
                      <Text style={styles.alertTrigger}>
                        {alert.trigger?.includes('voice') ? '🎙 음성 감지' :
                         alert.trigger?.includes('text') ? '💬 텍스트 감지' :
                         alert.trigger?.includes('gps') ? '📍 GPS 감지' : '감지됨'}
                      </Text>
                    </View>
                    <Text style={styles.alertTime}>{formatLogTime(alert.logged_at)}</Text>
                  </View>
                ))
              )}
            </View>
          )}

          {/* ── 3. AI 스케줄 분석 (일과 종료 후만) ── */}
          {data?.day_complete && data.ai_summary && (
            <View style={styles.aiCard}>
              <Text style={styles.aiTitle}>✨ AI 하루 분석</Text>
              <Text style={styles.aiBody}>{data.ai_summary}</Text>
            </View>
          )}

          {/* ── 4. 내일 스케줄 ── */}
          <Text style={styles.sectionTitle}>📅 내일 스케줄</Text>
          {data?.tomorrow_schedules.length ? (
            <View style={styles.tomorrowCard}>
              {data.tomorrow_schedules.map((item) => (
                <View key={item.id} style={styles.tItem}>
                  <Text style={styles.tTime}>{formatTime(item.time)}</Text>
                  <Text style={styles.tLabel}>{item.title}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.emptyCard, { backgroundColor: colors.primary }]}>
              <Text style={[styles.emptyText, { color: '#BFDBFE' }]}>내일 등록된 스케줄이 없어요.</Text>
            </View>
          )}
        </ScrollView>
      )}
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

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#94A3B8', fontSize: 13 },

  content: { padding: 14, gap: 12 },

  sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.primary },

  /* 현재 일과 */
  currentCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 5,
    borderLeftColor: colors.guardian,
    elevation: 4,
    shadowColor: colors.guardian,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  currentLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  liveDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: colors.guardian,
  },
  currentTime: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginBottom: 2 },
  currentTitle: { fontSize: 18, fontWeight: '900', color: colors.primary },
  inProgressBadge: {
    backgroundColor: '#D1FAE5',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  inProgressText: { fontSize: 12, fontWeight: '700', color: '#065F46' },

  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  emptyText: { fontSize: 13, color: '#94A3B8' },

  /* 리포트 카드 */
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
    backgroundColor: '#F1F5F9', borderRadius: 8, height: 10,
    marginBottom: 14, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 8, backgroundColor: colors.guardianLight },
  taskRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: '#F8FAFC', gap: 8,
  },
  taskTime: { fontSize: 11, color: '#94A3B8', fontWeight: '600', width: 60 },
  taskText: { flex: 1, fontSize: 13, color: '#334155', fontWeight: '500' },
  taskBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  taskBadgeText: { fontSize: 11, fontWeight: '700', color: '#374151' },

  /* 확인사항 */
  alertsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expandIcon: { fontSize: 11, color: colors.primary, fontWeight: '700' },
  redDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  alertsCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    gap: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  emptyAlertsText: { fontSize: 13, color: '#94A3B8', textAlign: 'center', paddingVertical: 8 },
  alertRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    padding: 10,
  },
  alertLeft: { gap: 2, flex: 1 },
  alertStage: { fontSize: 12, fontWeight: '800' },
  alertSchedule: { fontSize: 11, color: '#475569', fontWeight: '600' },
  alertTrigger: { fontSize: 11, color: '#64748B' },
  alertTime: { fontSize: 12, fontWeight: '700', color: '#475569' },

  /* AI 분석 */
  aiCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: colors.guardianLight,
  },
  aiTitle: { fontWeight: '800', color: colors.guardian, marginBottom: 6, fontSize: 13 },
  aiBody: { fontSize: 12, color: '#065F46', lineHeight: 20, opacity: 0.85 },

  /* 내일 스케줄 */
  tomorrowCard: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    padding: 16,
    gap: 4,
  },
  tItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 10 },
  tTime: { color: '#93C5FD', fontWeight: '700', fontSize: 11, width: 70 },
  tLabel: { flex: 1, fontSize: 12, color: '#BFDBFE' },
});
