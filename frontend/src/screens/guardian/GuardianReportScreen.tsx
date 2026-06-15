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
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { api } from '../../api/client';
import { registerPushToken } from '../../utils/push';
import WeeklyRateChart from '../../components/WeeklyRateChart';
import AppFrame from '../../components/AppFrame';
import { SchedIcon } from '../../components/SchedIcon';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'GuardianReport'>;
};

type CurrentSchedule = { id: number; title: string; time: string; started?: boolean; status?: 'in_progress' | 'todo' | 'done' | 'missed' };
const CUR_STATUS: Record<string, { label: string; color: string }> = {
  in_progress: { label: '지금 진행 중', color: '#2D9D63' },
  todo:        { label: '지금 할 일',   color: '#E07B39' },
  done:        { label: '완료했어요',   color: '#2D9D63' },
  missed:      { label: '못했어요',     color: '#8C9BB0' },
};
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
  behavior_count?: number;
  behavior_events?: { id: number; logged_at: string; stage_label: string; summary: string }[];
  has_unread: boolean;
  ai_summary: string | null;
  tomorrow_schedules: TomorrowSchedule[];
  suitability?: Suitability[];
  self_assessment?: 'good' | 'soso' | 'bad' | null;
  today_items?: { schedule_id: number; title: string; time: string; status: string; end?: string | null; early_stop?: boolean; duration?: number | null; note?: string | null; ai_summary?: string | null }[];
  weekly_rates?: { label: string; rate: number; has: boolean }[];
  user_name?: string;
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
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? '오전' : '오후';
  const hour = h % 12 || 12;
  return `${ampm} ${hour}:${String(m).padStart(2, '0')}`;
}

function formatLogTime(iso: string): string {
  // 백엔드 logged_at은 UTC(naive) → 타임존 표기가 없으면 UTC로 간주해 KST로 변환
  const hasTz = /[zZ]|[+-]\d\d:?\d\d$/.test(iso);
  const d = new Date(hasTz ? iso : iso + 'Z');
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

  // 오늘 Recap 확인 플래그 (하루 1회 자동 진입)
  const recapDoneRef = useRef(false);
  const recapKey = async () => {
    const uid = await AsyncStorage.getItem('user_id');
    const d = new Date();
    return `recapSeen:${uid}:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };
  const markRecapSeen = useCallback(async () => {
    recapDoneRef.current = true;
    try { await AsyncStorage.setItem(await recapKey(), '1'); } catch {}
  }, []);
  // 아직 오늘 Recap을 확인 안 했으면 자동 진입 (탭/푸시 타이밍 무관)
  const autoOpenRecap = useCallback(async () => {
    if (recapDoneRef.current) return;
    try { if (await AsyncStorage.getItem(await recapKey())) { recapDoneRef.current = true; return; } } catch {}
    await markRecapSeen();
    navigation.navigate('GuardianRecap');
  }, [navigation, markRecapSeen]);

  // 푸시 토큰 등록 + 알림 처리
  useEffect(() => {
    AsyncStorage.getItem('user_id').then((uid) => {
      if (uid) registerPushToken(Number(uid));
    });
    // 알림 탭(명시적) → 항상 Recap 이동 + 확인 처리
    const subResp = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data: any = resp.notification.request.content.data;
      if (data?.type === 'guardian_recap') { markRecapSeen(); navigation.navigate('GuardianRecap'); }
      else fetchDashboard(true);
    });
    // 앱 사용 중 자기평가 완료 푸시 수신 → 자동 진입(아직 확인 안 했으면)
    const subRecv = Notifications.addNotificationReceivedListener((notif) => {
      if (notif.request.content.data?.type === 'guardian_recap') autoOpenRecap();
    });
    // 콜드스타트(앱 꺼진 상태에서 알림 탭으로 켜짐)
    Notifications.getLastNotificationResponseAsync().then((resp) => {
      if (resp?.notification.request.content.data?.type === 'guardian_recap') { markRecapSeen(); navigation.navigate('GuardianRecap'); }
    }).catch(() => {});
    return () => { subResp.remove(); subRecv.remove(); };
  }, [fetchDashboard, autoOpenRecap, markRecapSeen]);

  // 앱 진입 시: 당사자가 오늘 자기평가를 마쳤는데 아직 Recap 확인 안 했으면 자동으로 띄움
  useEffect(() => {
    if (data?.self_assessment) autoOpenRecap();
  }, [data?.self_assessment, autoOpenRecap]);

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
    <AppFrame navigation={navigation} active="home" role="guardian">
     <View style={styles.container}>
      {/* Routy 헤더는 AppFrame에서 제공 */}
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
            const behaviorCount = data.behavior_count ?? 0;
            return (
              <View style={styles.summaryCard}>
                <TouchableOpacity style={[styles.summaryItem, detail === 'achievement' && styles.summaryItemActive]} activeOpacity={0.7} onPress={() => toggleExpand('achievement')}>
                  <Text style={styles.sumValueRate}>{data.live_rate}%</Text>
                  <Text style={styles.sumLabel}>오늘 달성률</Text>
                </TouchableOpacity>
                <View style={styles.summaryDivider} />
                <TouchableOpacity style={[styles.summaryItem, detail === 'alerts' && styles.summaryItemActive]} activeOpacity={0.7} onPress={() => toggleExpand('alerts')}>
                  <Text style={[styles.sumValueBeh, behaviorCount === 0 && { color: '#94A3B8' }]}>{behaviorCount}</Text>
                  <Text style={styles.sumLabel}>문제행동</Text>
                </TouchableOpacity>
              </View>
            );
          })()}
          {detail === null && <Text style={styles.summaryHint}>항목을 누르면 자세히 볼 수 있어요</Text>}

          {/* 인라인 펼침 — 오늘 달성률 → 오늘 일과 목록 */}
          {detail === 'achievement' && (
            <View style={styles.expandCard}>
              {!data?.today_items?.length ? (
                <Text style={styles.emptyText}>오늘 등록된 일과가 없어요.</Text>
              ) : data.today_items.map((item, i) => (
                <View key={item.schedule_id} style={[styles.tItem, i === data.today_items!.length - 1 && styles.tItemLast]}>
                  <Text style={styles.tTime}>{formatTime(item.time)}</Text>
                  <SchedIcon title={item.title} size={30} radius={8} />
                  <Text style={styles.tLabel} numberOfLines={1}>{noEmoji(item.title)}</Text>
                  <View style={[styles.taskBadge, { backgroundColor: statusBg(item.status) }]}>
                    <Text style={styles.taskBadgeText}>{statusLabel(item.status)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* 인라인 펼침 — 문제행동: 몇시에 무슨 문제행동 + AI 요약 */}
          {detail === 'alerts' && (
            <View style={styles.expandCard}>
              {!data?.behavior_events?.length ? (
                <Text style={styles.emptyAlertsText}>오늘 감지된 문제행동이 없어요.</Text>
              ) : data.behavior_events.map((ev, i) => {
                const bullets = (ev.summary || '').split('\n').map(l => l.trim()).filter(Boolean);
                return (
                  <View key={ev.id} style={[styles.behItem, i === data.behavior_events!.length - 1 && { borderBottomWidth: 0, paddingBottom: 0 }]}>
                    <Text style={styles.behTime}>{formatLogTime(ev.logged_at)}</Text>
                    <View style={styles.storyWrap}>
                      <View style={styles.storyHead}>
                        <Text style={styles.storyQ}>무슨 일이 있었을까요?</Text>
                        <View style={styles.aiChip}>
                          <Ionicons name="sparkles" size={11} color={colors.primary} />
                          <Text style={styles.aiChipText}>AI 요약</Text>
                        </View>
                      </View>
                      {bullets.map((b, k) => (
                        <View key={k} style={styles.bulletRow}>
                          <Text style={styles.bulletDot}>•</Text>
                          <Text style={styles.bulletText}>{b}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ── 지금 당사자 상황 (진행중/완료/미달성/할 일) ── */}
          <Text style={styles.sectionTitle}>지금 당사자 상황</Text>
          {data?.current_schedule ? (() => {
            const st = CUR_STATUS[data.current_schedule.status || 'todo'] || CUR_STATUS.todo;
            return (
              <View style={[styles.currentCard, { flexDirection: 'row', alignItems: 'center', gap: 16 }]}>
                <SchedIcon title={data.current_schedule.title} size={72} radius={16} />
                <View style={{ flex: 1 }}>
                  <View style={styles.nowTag}>
                    <View style={[styles.nowDot, { backgroundColor: st.color }]} />
                    <Text style={[styles.nowTagText, { color: st.color }]}>{st.label}</Text>
                  </View>
                  <Text style={styles.currentTime}>{formatTime(data.current_schedule.time)}</Text>
                  <Text style={styles.currentTitle}>{noEmoji(data.current_schedule.title)}</Text>
                </View>
              </View>
            );
          })() : (
            <View style={styles.currentCard}>
              <Text style={styles.emptyText}>아직 시작한 일과가 없어요.</Text>
            </View>
          )}

          {/* ── 오늘 남은 일과 ── */}
          {(() => {
            const now = nowHHMM();
            const remaining = (data?.today_items ?? []).filter(it => it.time >= now);
            return (
              <>
                <Text style={styles.sectionTitle}>오늘 남은 일과</Text>
                {remaining.length ? (
                  <View style={styles.tomorrowCard}>
                    {remaining.map((item, i) => (
                      <View key={item.schedule_id} style={[styles.tItem, i === remaining.length - 1 && styles.tItemLast]}>
                        <Text style={styles.tTime}>{formatTime(item.time)}</Text>
                        <SchedIcon title={item.title} size={34} radius={9} />
                        <Text style={styles.tLabel} numberOfLines={1}>{noEmoji(item.title)}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyText}>오늘 남은 일과가 없어요.</Text>
                  </View>
                )}
              </>
            );
          })()}

          {/* ── 오늘 힘들어한 일과 (실시간) ── */}
          {(() => {
            const its = data?.today_items ?? [];
            type HardRow = { it: any; kind: string; color: string; detail: string | null };
            const rows: HardRow[] = [
              ...its.filter(i => i.status === 'missed')
                .map(it => ({ it, kind: '거절', color: '#D64545', detail: it.note ? `“${it.note}”` : null })),
              ...its.filter(i => i.status === 'achieved' && i.early_stop)
                .map(it => ({ it, kind: '중도 포기', color: '#C97A2B', detail: it.note ? `“${it.note}”` : null })),
              ...its.filter(i => i.status === 'achieved' && !i.early_stop && i.duration && i.end && i.duration > (toMin(i.end) - toMin(i.time)))
                .map(it => ({ it, kind: '오래 걸림', color: '#E07B39', detail: `예상보다 +${(it.duration ?? 0) - (toMin(it.end!) - toMin(it.time))}분` })),
            ];
            const parseStory = (s: string) => {
              const lines = (s || '').split('\n').map(l => l.trim()).filter(Boolean);
              if (lines.length >= 2) return { title: lines[0], body: lines.slice(1).join('\n') };
              return { title: '', body: (s || '').trim() };
            };
            return (
              <>
                <Text style={styles.sectionTitle}>오늘 힘들어한 일과</Text>
                <View style={styles.tomorrowCard}>
                  {rows.length === 0 && (
                    <Text style={styles.hardEmpty}>아직 힘들어한 일과가 없어요 🌷</Text>
                  )}
                  {rows.map((r, i) => {
                    const hasStory = !!(r.it.ai_summary || r.it.note);
                    const parsed = parseStory(r.it.ai_summary || '');
                    const isLast = i === rows.length - 1;
                    return (
                      <View key={`${r.kind}-${r.it.schedule_id}`}>
                        <View style={styles.hardItem}>
                          <Text style={styles.hardTimeGray}>{formatTime(r.it.time)}</Text>
                          <Text style={styles.hardLabel} numberOfLines={1}>{noEmoji(r.it.title)}</Text>
                          <Text style={[styles.hardTag, { color: r.color, backgroundColor: r.color + '14' }]}>{r.kind}</Text>
                        </View>
                        {hasStory ? (
                          <View style={[styles.storyWrap, isLast && { marginBottom: 2 }]}>
                            <View style={styles.storyHead}>
                              <Text style={styles.storyQ}>왜 그랬을까요?</Text>
                              <View style={styles.aiChip}>
                                <Ionicons name="sparkles" size={11} color={colors.primary} />
                                <Text style={styles.aiChipText}>AI 요약</Text>
                              </View>
                            </View>
                            {(r.it.ai_summary ? r.it.ai_summary.split('\n') : [r.it.note]).map((l: any) => (l || '').trim()).filter(Boolean).map((b: string, k: number) => (
                              <View key={k} style={styles.bulletRow}>
                                <Text style={styles.bulletDot}>•</Text>
                                <Text style={styles.bulletText}>{b}</Text>
                              </View>
                            ))}
                          </View>
                        ) : (
                          r.detail ? <Text style={[styles.hardReasonInline, r.kind === '오래 걸림' && { color: r.color }]}>{r.detail}</Text> : null
                        )}
                      </View>
                    );
                  })}
                </View>
              </>
            );
          })()}

          {/* ── 오늘 아이 자기평가 ── */}
          {data?.self_assessment && (
            <View style={styles.moodCard}>
              <Text style={styles.moodCardLabel}>오늘 아이의 하루 평가</Text>
              <Text style={styles.moodCardValue}>{MOOD_META[data.self_assessment] ?? '-'}</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* 토스트 */}
      <Animated.View style={[styles.toast, { opacity: toastOpacity }]} pointerEvents="none">
        <Text style={styles.toastText}>AI가 저장했어요. 내일 스케줄에 반영할게요.</Text>
      </Animated.View>
     </View>
    </AppFrame>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

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

  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#1E293B' },

  /* 현재 일과 — 흰 배경(원래색 유지) */
  currentCard: {
    backgroundColor: colors.white,
    borderRadius: 22,
    paddingVertical: 24,
    paddingHorizontal: 22,
    elevation: 3,
    shadowColor: '#0A1F44',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
  },
  nowTag: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  nowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  nowTagText: { fontSize: 12, fontWeight: '800', color: colors.primary, letterSpacing: 0.3 },
  currentLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  liveDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: colors.guardian,
  },
  currentTime: { fontSize: 14, color: '#94A3B8', fontWeight: '700', marginBottom: 4 },
  currentTitle: { fontSize: 28, fontWeight: '900', color: '#1E293B' },
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
    backgroundColor: colors.white,
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
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
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4, borderRadius: 12 },
  summaryItemActive: { backgroundColor: colors.primary + '10' },
  summaryDivider: { width: 1, height: 40, backgroundColor: '#EEF1F8' },
  sumValueRate: { fontSize: 30, fontWeight: '900', color: colors.primary },
  sumValueBeh: { fontSize: 30, fontWeight: '900', color: '#D64545' },
  sumLabel: { fontSize: 14, fontWeight: '800', color: '#475569' },
  summaryHint: { fontSize: 11, color: '#94A3B8', fontWeight: '600', textAlign: 'center', marginTop: -2 },
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

  // 오늘 힘들어한 일과 (유형 태그형)
  hardRow2: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  hardBar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  hardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hardName2: { flex: 1, fontSize: 15, fontWeight: '800', color: '#1E293B' },
  hardTime2: { fontSize: 12, fontWeight: '700', color: '#94A3B8' },
  hardReason2: { fontSize: 13, fontWeight: '600', color: '#64748B', marginTop: 3 },
  hardTag: { fontSize: 12, fontWeight: '800', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },

  // 오늘 힘들어한 일과 — 행(오늘 남은 일과처럼 정렬) + 펼침
  hardItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  hardLabel: { flex: 1, fontSize: 15, color: '#334155', fontWeight: '600' },
  hardEmpty: { fontSize: 14, color: '#94A3B8', fontWeight: '600', paddingVertical: 10, textAlign: 'center' },
  hardReasonInline: { fontSize: 13, fontWeight: '600', color: '#64748B', marginTop: -4, marginBottom: 10 },

  // 문제행동 펼침 — 시간 + AI 요약(제목/내용)
  behItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  behTime: { fontSize: 13, fontWeight: '800', color: '#94A3B8', marginBottom: 8 },
  hardTimeGray: { color: '#94A3B8', fontWeight: '800', fontSize: 13, width: 76 },

  // AI 요약 (박스 없이) — 라벨+제목 한 줄, 내용은 아래 회색
  storyWrap: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 15, marginTop: 4, marginBottom: 12, borderWidth: 1, borderColor: '#EEF2F7' },
  storyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  storyQ: { fontSize: 17, fontWeight: '900', color: '#1E293B', letterSpacing: -0.3 },
  aiChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.primary + '14', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20,
  },
  aiChipText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'flex-start' },
  bulletDot: { fontSize: 15, color: '#64748B', lineHeight: 22, marginTop: 1 },
  bulletText: { flex: 1, fontSize: 14.5, fontWeight: '500', color: '#475569', lineHeight: 22 },

  // 자기평가 카드
  moodCard: {
    backgroundColor: colors.white, borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  moodCardLabel: { fontSize: 13, fontWeight: '800', color: colors.primary },
  moodCardValue: { fontSize: 16, fontWeight: '900', color: '#334155' },
});
