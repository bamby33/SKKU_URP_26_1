/**
 * 화면 2 · 보호자 대시보드
 * - 일과 중: 현재 수행 중인 일과 표시
 * - 일과 종료 후: AI 분석 리포트 표시
 * - 항상: 오늘의 확인사항(이상행동 알림), 내일 스케줄
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl, TextInput, Animated, Modal,
  LayoutAnimation, UIManager, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { api } from '../../api/client';
import { registerPushToken } from '../../utils/push';

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
type HeatStatus = 'green' | 'yellow' | 'red' | 'none';
type Suitability = {
  schedule_id: number; title: string; time: string;
  grade: 'green' | 'yellow' | 'red' | 'unknown';
  days: number; completed_full: number; early_stop: number; missed: number; refused_transitions: number;
  cells: { label: string; status: HeatStatus }[];
};
const HEAT_COLOR: Record<HeatStatus, string> = {
  green: '#22C55E', yellow: '#FBBF24', red: '#EF4444', none: '#E9EDF3',
};

type Dashboard = {
  current_schedule: CurrentSchedule | null;
  day_complete: boolean;
  today_report: TodayReport | null;
  live_achieved: number;
  live_total: number;
  live_rate: number;
  behavior_alerts: BehaviorAlert[];
  has_unread: boolean;
  ai_summary: string | null;
  tomorrow_schedules: TomorrowSchedule[];
  suitability?: Suitability[];
  self_assessment?: 'good' | 'soso' | 'bad' | null;
  today_items?: { schedule_id: number; title: string; time: string; status: string }[];
};

const GRADE_META: Record<string, { dot: string; label: string }> = {
  green:   { dot: '🟢', label: '잘 맞아요' },
  yellow:  { dot: '🟡', label: '버거워해요' },
  red:     { dot: '🔴', label: '안 맞아요' },
  unknown: { dot: '⚪', label: '데이터 부족' },
};
const MOOD_META: Record<string, string> = {
  good: '😊 좋았어요', soso: '😐 그저 그래요', bad: '😢 힘들었어요',
};

/* ── 유틸 ── */
// 일과 제목에서 이모지 제거 (보호자 화면은 텍스트만 표시)
function noEmoji(t: string): string {
  return t.replace(/\p{Extended_Pictographic}/gu, '').replace(/️/g, '').trim();
}

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function nowHHMM(): string {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}

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
  if (status === 'achieved') return '완료';
  if (status === 'missed') return '미완료';
  return '대기';
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
  const [detail, setDetail] = useState<'achievement' | 'alerts' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start();
    }, 2500);
  };

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

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

  // 푸시 토큰 등록 + 알림 탭 시 대시보드 새로고침
  useEffect(() => {
    AsyncStorage.getItem('user_id').then((uid) => {
      if (uid) registerPushToken(Number(uid));
    });
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      fetchDashboard(true);
    });
    return () => sub.remove();
  }, [fetchDashboard]);

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

  const toggleExpand = (kind: 'achievement' | 'alerts') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (kind === 'alerts' && data?.has_unread) handleMarkRead();
    setDetail((prev) => (prev === kind ? null : kind));
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 — 당사자 페이지와 통일 (Routy 브랜드) */}
      <View style={styles.header}>
        <Text style={styles.hBrand}>Routy</Text>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setMenuOpen(true)} activeOpacity={0.75}>
          <Text style={styles.menuIcon}>☰</Text>
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
          {/* ── 상단 요약 (탭하면 상세) ── */}
          {data && (() => {
            const newAlerts = data.behavior_alerts.filter(a => !a.is_read).length;
            const redCount = (data.suitability ?? []).filter(s => s.grade === 'red').length;
            return (
              <View style={styles.summaryCard}>
                <TouchableOpacity style={[styles.summaryItem, detail === 'achievement' && styles.summaryItemActive]} activeOpacity={0.7} onPress={() => toggleExpand('achievement')}>
                  <Text style={styles.summaryValue}>{data.live_rate}%</Text>
                  <Text style={styles.summaryLabel}>오늘 달성률</Text>
                </TouchableOpacity>
                <View style={styles.summaryDivider} />
                <TouchableOpacity style={[styles.summaryItem, detail === 'alerts' && styles.summaryItemActive]} activeOpacity={0.7} onPress={() => toggleExpand('alerts')}>
                  <Text style={[styles.summaryValue, newAlerts > 0 && { color: '#DC2626' }]}>{newAlerts}</Text>
                  <Text style={styles.summaryLabel}>새 확인사항</Text>
                </TouchableOpacity>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, redCount > 0 && { color: '#DC2626' }]}>{redCount}</Text>
                  <Text style={styles.summaryLabel}>🔴 안 맞는 일과</Text>
                </View>
              </View>
            );
          })()}
          {detail === null && <Text style={styles.summaryHint}>달성률·확인사항을 누르면 자세히 볼 수 있어요</Text>}

          {/* 인라인 펼침 — 오늘 달성률 → 오늘 일과 목록 */}
          {detail === 'achievement' && (
            <View style={styles.expandCard}>
              {!data?.today_items?.length ? (
                <Text style={styles.emptyText}>오늘 등록된 일과가 없어요.</Text>
              ) : data.today_items.map((item, i) => (
                <View key={item.schedule_id} style={[styles.tItem, i === data.today_items!.length - 1 && styles.tItemLast]}>
                  <Text style={styles.tTime}>{formatTime(item.time)}</Text>
                  <Text style={styles.tLabel} numberOfLines={1}>{noEmoji(item.title)}</Text>
                  <View style={[styles.taskBadge, { backgroundColor: statusBg(item.status) }]}>
                    <Text style={styles.taskBadgeText}>{statusLabel(item.status)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* 인라인 펼침 — 새 확인사항 */}
          {detail === 'alerts' && (
            <View style={styles.expandCard}>
              {!data?.behavior_alerts.length ? (
                <Text style={styles.emptyAlertsText}>오늘 이상행동 기록이 없어요.</Text>
              ) : data.behavior_alerts.map((alert) => (
                <View key={alert.id} style={[styles.alertRow, { backgroundColor: stageBg(alert.stage) }]}>
                  <View style={styles.alertLeft}>
                    <Text style={[styles.alertStage, { color: stageColor(alert.stage) }]}>{alert.stage_label}</Text>
                    {alert.schedule_title && <Text style={styles.alertSchedule}>{alert.schedule_title} 일과 중</Text>}
                    <Text style={styles.alertTrigger}>
                      {alert.trigger?.includes('emergency') ? '긴급 호출 (당사자 요청)' :
                       alert.trigger?.includes('voice') ? '음성 감지' :
                       alert.trigger?.includes('text') ? '텍스트 감지' :
                       alert.trigger?.includes('gps') ? 'GPS 감지' : '감지됨'}
                    </Text>
                  </View>
                  <Text style={styles.alertTime}>{formatLogTime(alert.logged_at)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── 현재 수행 중인 일과 (탭 → 오늘 일과 페이지) ── */}
          <Text style={styles.sectionTitle}>현재 수행 중인 일과</Text>
          <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('GuardianToday')}>
            {data?.current_schedule ? (
              <View style={styles.currentCard}>
                <View style={styles.currentLeft}>
                  <View style={styles.liveDot} />
                  <View>
                    <Text style={styles.currentTime}>{formatTime(data.current_schedule.time)}</Text>
                    <Text style={styles.currentTitle}>{noEmoji(data.current_schedule.title)}</Text>
                  </View>
                </View>
                <View style={styles.inProgressBadge}>
                  <Text style={styles.inProgressText}>진행 중</Text>
                </View>
              </View>
            ) : (
              <View style={styles.currentCard}>
                <Text style={styles.emptyText}>지금 진행 중인 일과가 없어요.</Text>
              </View>
            )}
            <Text style={styles.tapHint}>탭하면 오늘 일과 전체를 볼 수 있어요 ›</Text>
          </TouchableOpacity>

          {/* ── 일과별 적합도 (상시 표시) ── */}
          {data?.suitability && data.suitability.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>일과별 적합도 <Text style={styles.sectionSub}>(최근 7일)</Text></Text>
              <View style={styles.heatCard}>
                <View style={styles.heatRow}>
                  <View style={styles.heatNameCol} />
                  {(data.suitability[0]?.cells ?? []).map((c, i) => (
                    <Text key={i} style={styles.heatColLabel}>{c.label}</Text>
                  ))}
                </View>
                {data.suitability.map(su => (
                  <View key={su.schedule_id} style={styles.heatRow}>
                    <Text style={styles.heatName} numberOfLines={1}>{noEmoji(su.title)}</Text>
                    {su.cells.map((c, i) => (
                      <View key={i} style={styles.heatCellWrap}>
                        <View style={[styles.heatCell, { backgroundColor: HEAT_COLOR[c.status] }]} />
                      </View>
                    ))}
                  </View>
                ))}
                <View style={styles.heatLegend}>
                  {([['green','완료'],['yellow','중단'],['red','미수행'],['none','기록없음']] as [HeatStatus,string][]).map(([st, label]) => (
                    <View key={st} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: HEAT_COLOR[st] }]} />
                      <Text style={styles.legendText}>{label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          )}

          {/* ── 오늘 아이 자기평가 ── */}
          {data?.self_assessment && (
            <View style={styles.moodCard}>
              <Text style={styles.moodCardLabel}>오늘 아이의 하루 평가</Text>
              <Text style={styles.moodCardValue}>{MOOD_META[data.self_assessment] ?? '-'}</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── 메뉴 (내일 준비 / 일과 수정 / 로그아웃) ── */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.menuBg} activeOpacity={1} onPress={() => setMenuOpen(false)} />
        <View style={styles.menuPanel}>
          <Text style={styles.menuPanelTitle}>Menu</Text>
          <TouchableOpacity style={styles.menuRow} activeOpacity={0.7}
            onPress={() => { setMenuOpen(false); navigation.navigate('GuardianTomorrow'); }}>
            <Text style={styles.menuRowText}>내일 일과</Text>
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuRow} activeOpacity={0.7}
            onPress={() => { setMenuOpen(false); navigation.navigate('ScheduleEdit'); }}>
            <Text style={styles.menuRowText}>일과 편집</Text>
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuRow} activeOpacity={0.7}
            onPress={() => { setMenuOpen(false); handleLogout(); }}>
            <Text style={[styles.menuRowText, { color: '#E53E3E' }]}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* 토스트 */}
      <Animated.View style={[styles.toast, { opacity: toastOpacity }]} pointerEvents="none">
        <Text style={styles.toastText}>AI가 저장했어요. 내일 스케줄에 반영할게요.</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FB' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  hBrand: { fontSize: 30, fontWeight: '900', letterSpacing: -0.5, color: colors.guardian },
  menuBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.guardian + '18',
  },
  menuIcon: { fontSize: 16, color: colors.guardian },
  menuBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)' },
  menuPanel: {
    position: 'absolute', top: 0, right: 0, bottom: 0, width: 240,
    backgroundColor: '#fff', paddingTop: 60, paddingHorizontal: 8,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: -4, height: 0 }, elevation: 16,
  },
  menuPanelTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', paddingHorizontal: 12, marginBottom: 8 },
  menuRow: { paddingVertical: 18, paddingHorizontal: 12 },
  menuRowText: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  menuDivider: { height: 1, backgroundColor: '#F1F5F9' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIcon: { fontSize: 18 },
  headerTitle: { color: colors.white, fontWeight: '700', fontSize: 15 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smsTestBtn: {
    backgroundColor: colors.guardian + '18',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  smsTestText: { color: colors.guardian, fontSize: 11, fontWeight: '800' },
  logoutBtn: {
    backgroundColor: colors.guardian + '18',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  logoutText: { color: colors.guardian, fontSize: 12, fontWeight: '800' },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#94A3B8', fontSize: 13 },

  content: { padding: 14, gap: 12 },

  sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.primary },

  /* 현재 일과 — 당사자 메인처럼 크게 */
  currentCard: {
    backgroundColor: colors.white,
    borderRadius: 22,
    paddingVertical: 26,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 6,
    borderLeftColor: colors.guardian,
    elevation: 4,
    shadowColor: colors.guardian,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
  },
  currentLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  liveDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: colors.guardian,
  },
  currentTime: { fontSize: 14, color: '#94A3B8', fontWeight: '700', marginBottom: 4 },
  currentTitle: { fontSize: 28, fontWeight: '900', color: colors.primary },
  inProgressBadge: {
    backgroundColor: '#D1FAE5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  inProgressText: { fontSize: 13, fontWeight: '800', color: '#065F46' },

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

  /* 일과 수정 버튼 */
  tomorrowNoteCard: {
    backgroundColor: colors.white, borderRadius: 16, padding: 16,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  tomorrowNoteLabel: { fontSize: 14, fontWeight: '800', color: colors.guardian, marginBottom: 10 },
  tomorrowNoteInput: {
    backgroundColor: '#F8FAFC', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#E2E8F0',
    padding: 12, fontSize: 14, color: '#1E293B', minHeight: 72,
    marginBottom: 10,
  },
  updateNoteBtn: {
    backgroundColor: colors.guardian, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
    elevation: 3, shadowColor: colors.guardian, shadowOpacity: 0.25,
    shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  updateNoteBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  toast: {
    position: 'absolute', bottom: 32, left: 24, right: 24,
    backgroundColor: '#1E293B', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 18,
    alignItems: 'center',
    elevation: 12, shadowColor: '#000', shadowOpacity: 0.25,
    shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' },

  editBtn: {
    borderRadius: 16, borderWidth: 1.5, borderColor: colors.guardian + '70',
    paddingVertical: 14, alignItems: 'center', backgroundColor: colors.white,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  editBtnText: { fontSize: 14, fontWeight: '800', color: colors.guardian },

  /* 달성률 카드 */
  achieveCard: {
    backgroundColor: colors.white, borderRadius: 18, padding: 16, gap: 8,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  achieveRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  achieveTitle: { fontSize: 13, fontWeight: '800', color: '#475569' },
  achievePct: { fontSize: 22, fontWeight: '900', color: colors.guardian },
  achieveTrack: { height: 10, backgroundColor: '#F1F5F9', borderRadius: 5, overflow: 'hidden' },
  achieveFill: { height: 10, borderRadius: 5, backgroundColor: colors.guardian },
  achieveSub: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },

  /* 내일 스케줄 */
  tomorrowCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 4,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  tItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  tItemLast: { borderBottomWidth: 0 },
  tTime: { color: colors.guardian, fontWeight: '800', fontSize: 13, width: 76 },
  tLabel: { flex: 1, fontSize: 15, color: '#334155', fontWeight: '600' },

  // 적합도 히트맵
  sectionSub: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  heatCard: {
    backgroundColor: colors.white, borderRadius: 18, padding: 14,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  heatRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 3 },
  heatNameCol: { width: 76 },
  heatName: { width: 76, fontSize: 13, fontWeight: '700', color: '#334155', paddingRight: 6 },
  heatColLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#94A3B8' },
  heatCellWrap: { flex: 1, alignItems: 'center' },
  heatCell: { width: 26, height: 26, borderRadius: 7 },
  heatLegend: {
    flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 14,
    marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 4 },
  legendText: { fontSize: 11, fontWeight: '600', color: '#64748B' },

  // 상단 요약 카드
  summaryCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 8,
    marginBottom: 6,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4, borderRadius: 12 },
  summaryItemActive: { backgroundColor: colors.guardian + '12' },
  summaryValue: { fontSize: 24, fontWeight: '900', color: colors.primary },
  summaryLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8' },
  summaryDivider: { width: 1, height: 34, backgroundColor: '#EEF1F8' },
  summaryHint: { fontSize: 11, color: '#94A3B8', fontWeight: '600', textAlign: 'center', marginTop: -4 },
  expandCard: {
    backgroundColor: colors.white, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginTop: -4,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  tapHint: { fontSize: 11, color: '#94A3B8', fontWeight: '600', textAlign: 'right', marginTop: 6 },

  // 상세 모달 (요약 타일 탭)
  detailBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  detailSheet: {
    backgroundColor: '#F8FAFC', borderTopLeftRadius: 26, borderTopRightRadius: 26,
    padding: 18, paddingBottom: 36, maxHeight: '82%',
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 14 },
  detailHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  detailTitle: { fontSize: 18, fontWeight: '900', color: colors.primary },
  detailX: { fontSize: 18, color: '#94A3B8', fontWeight: '700' },

  // 자기평가 카드
  moodCard: {
    backgroundColor: colors.white, borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  moodCardLabel: { fontSize: 13, fontWeight: '800', color: colors.primary },
  moodCardValue: { fontSize: 16, fontWeight: '900', color: '#334155' },
});
