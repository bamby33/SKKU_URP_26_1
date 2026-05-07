/**
 * 사용자(당사자) 메인 화면
 * 지금 할 일 · 오늘 일과 타임라인 인라인 표시 · AI 마이크
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Animated, Easing, Alert, ActivityIndicator,
  Modal, Dimensions,
} from 'react-native';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { getSchedules, api } from '../../api/client';

const { width: SW } = Dimensions.get('window');

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Schedule'>;
};
type Schedule = {
  id: number;
  title: string;
  scheduled_time: string;
  days_of_week: string;
};

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const SLEEP_KW   = ['취침', '수면', '자기', '잠자기', '잠'];

const isSleep    = (t: string) => SLEEP_KW.some(k => t.includes(k));
const getEmoji   = (t: string) => t.match(/\p{Emoji_Presentation}/u)?.[0] ?? '📋';
const todayIdx   = () => (new Date().getDay() + 6) % 7;
const nowHHMM    = () => {
  const n = new Date();
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
};

const DRAWER_W = 260;

export default function ScheduleScreen({ navigation }: Props) {
  const bounceAnim    = useRef(new Animated.Value(0)).current;
  const drawerAnim    = useRef(new Animated.Value(DRAWER_W)).current;
  const countdownAnim = useRef(new Animated.Value(1)).current;
  const countdownRef  = useRef<Animated.CompositeAnimation | null>(null);
  const aiFollowupRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followupSchedRef = useRef<Schedule | null>(null);
  const announcedRef  = useRef<Set<number>>(new Set());
  const snoozeRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const todaySchedRef = useRef<Schedule[]>([]);
  const recordingRef    = useRef<Audio.Recording | null>(null);
  const meterInterval   = useRef<ReturnType<typeof setInterval> | null>(null);
  const userIdRef       = useRef<number | null>(null);
  const lastApiCallRef  = useRef<number>(0);

  const [schedules,        setSchedules]        = useState<Schedule[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [showMenu,         setShowMenu]         = useState(false);
  const [showWeek,         setShowWeek]         = useState(false);
  const [pending,          setPending]          = useState<Schedule | null>(null);
  const [theme,            setTheme]            = useState(colors.primary);
  const [nowTime,          setNowTime]          = useState(nowHHMM());
  const [notifications,    setNotifications]    = useState<any[]>([]);
  const [achieveRate,      setAchieveRate]      = useState(0);
  const [achieveCount,     setAchieveCount]     = useState(0);
  const [achieveTotal,     setAchieveTotal]     = useState(0);

  // 시간 갱신 (1분마다)
  useEffect(() => {
    const t = setInterval(() => setNowTime(nowHHMM()), 60000);
    return () => clearInterval(t);
  }, []);

  const today = todayIdx();
  const todaySchedules = schedules
    .filter(s => s.days_of_week.split(',').map(Number).includes(today))
    .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));

  const current   = [...todaySchedules].reverse().find(s => s.scheduled_time <= nowTime);
  const nextSched = todaySchedules.find(s => s.scheduled_time > nowTime);

  // 현재 + 앞으로 남은 일과만 표시 (지난 건 숨김)
  const upcomingSchedules = todaySchedules.filter(
    s => s.scheduled_time >= nowTime || effectiveCurrent?.id === s.id
  );
  const yIdx = (today + 6) % 7;
  const yLast = schedules
    .filter(s => s.days_of_week.split(',').map(Number).includes(yIdx))
    .sort((a,b) => a.scheduled_time.localeCompare(b.scheduled_time)).at(-1);
  const effectiveCurrent = current ?? (!current && yLast && isSleep(yLast.title) ? yLast : null);

  todaySchedRef.current = todaySchedules;

  const openDrawer = () => {
    setShowMenu(true);
    Animated.timing(drawerAnim, { toValue: 0, duration: 260, useNativeDriver: true }).start();
  };
  const closeDrawer = () => {
    Animated.timing(drawerAnim, { toValue: DRAWER_W, duration: 220, useNativeDriver: true }).start(
      () => setShowMenu(false)
    );
  };

  // ── 카운트다운 ─────────────────────────────────────────────────────────────
  const COUNTDOWN_MS = 8000; // 8초

  const startCountdown = (s: Schedule) => {
    countdownAnim.setValue(1);
    followupSchedRef.current = s;
    const anim = Animated.timing(countdownAnim, {
      toValue: 0, duration: COUNTDOWN_MS, useNativeDriver: false,
    });
    countdownRef.current = anim;
    anim.start(({ finished }) => {
      if (finished) {
        // 카운트다운 완료 → 팝업 닫고 3분 후 AI 전환
        setPending(null);
        scheduleAiFollowup(s);
      }
    });
  };

  const scheduleAiFollowup = (s: Schedule) => {
    if (aiFollowupRef.current) clearTimeout(aiFollowupRef.current);
    aiFollowupRef.current = setTimeout(() => {
      navigation.navigate('AIChat', { followUpSchedule: s.title, followUpId: s.id });
    }, 10 * 1000); // 테스트용 10초 (실제: 3 * 60 * 1000)
  };

  // ── 스케줄 알림 ────────────────────────────────────────────────────────────
  const announce = (s: Schedule) => {
    Speech.speak(`${s.title} 시간이에요! 지금 할 준비가 됐나요?`, { language: 'ko-KR' });
    setPending(s);
    startCountdown(s);
  };

  // AI 마이크 — AIChat 화면으로 페이드 전환
  const handleMic = () => navigation.navigate('AIChat');

  // 인터벌
  useEffect(() => {
    const iv = setInterval(() => {
      const t = nowHHMM();
      const due = todaySchedRef.current.find(s => s.scheduled_time === t && !announcedRef.current.has(s.id));
      if (due) { announcedRef.current.add(due.id); announce(due); }
    }, 30000);
    return () => { clearInterval(iv); if (snoozeRef.current) clearTimeout(snoozeRef.current); };
  }, []);

  // 이모지 바운스
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(bounceAnim, { toValue: -8, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(bounceAnim, { toValue: 0,  duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);

  // 초기 로드
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('user_id');
        if (!stored) return;
        const id = Number(stored);
        userIdRef.current = id;
        const col = await AsyncStorage.getItem('theme_color');
        if (col) setTheme(col);
        const res = await getSchedules(id);
        setSchedules(res.data);
        const notifRes = await api.get(`/notifications/user/${id}/unread`);
        setNotifications(notifRes.data);
        try {
          const reportRes = await api.get(`/schedules/user/${id}/today-report`);
          setAchieveRate(reportRes.data.achievement_rate ?? 0);
          setAchieveCount(reportRes.data.achieved ?? 0);
          setAchieveTotal(reportRes.data.total ?? 0);
        } catch {}
      } catch (e) { console.warn(e); }
      finally { setLoading(false); }
    })();
  }, []);

  // ── 데시벨 모니터링 ────────────────────────────────────────────────────────
  const DB_STAGE2 = 85;
  const DB_STAGE1 = 70;

  const startMeterting = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[Meter] 마이크 권한 없음');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      recordingRef.current = recording;

      meterInterval.current = setInterval(async () => {
        const s = await recording.getStatusAsync();
        if (!s.isRecording) return;
        const raw = s.metering ?? -160;
        // expo-av: -160~0 dBFS. +100 오프셋으로 대략적인 dB 환산
        const approxDB = raw + 100;
        console.log(`[Meter] raw=${raw.toFixed(1)} approx=${approxDB.toFixed(1)} dB`);

        if (approxDB >= DB_STAGE2) {
          await stopMetering();
          setPending(null);
          navigation.navigate('Emergency', { stage: 'stage_2' });
          const uid = userIdRef.current;
          if (uid) {
            api.post(`/chat/log-behavior/${uid}`, {
              stage: 'stage_2',
              trigger: 'voice_decibel',
              decibel: approxDB,
            }).catch(() => {});
          }
        } else if (approxDB >= DB_STAGE1) {
          // 30초에 한 번만 API 호출 (429 방지)
          const now = Date.now();
          if (now - lastApiCallRef.current > 30000) {
            lastApiCallRef.current = now;
            const uid = userIdRef.current;
            if (uid) {
              api.post('/chat/', {
                user_id: uid,
                message: '(스케줄 알림 중 반응 감지)',
                context: { decibel: approxDB },
              }).catch(() => {});
            }
          }
        }
      }, 500);
    } catch (e) { console.warn('[Meter] 시작 실패', e); }
  };

  const stopMetering = async () => {
    if (meterInterval.current) { clearInterval(meterInterval.current); meterInterval.current = null; }
    if (recordingRef.current) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch {}
      recordingRef.current = null;
    }
  };

  // 컴포넌트 언마운트 시 recording 정리
  useEffect(() => {
    return () => { stopMetering(); };
  }, []);

  // pending 모달 열릴 때 메터링 시작 / 닫힐 때 중지
  useEffect(() => {
    if (pending) {
      startMeterting();
    } else {
      stopMetering();
    }
  }, [pending]);

  useFocusEffect(useCallback(() => {
    const uid = userIdRef.current;
    if (!uid) return;
    api.get(`/notifications/user/${uid}/unread`)
      .then(r => setNotifications(r.data))
      .catch(() => {});
  }, []));

  const handleLogout = () => {
    Alert.alert('로그아웃', '로그아웃 할까요?', [
      { text: '아니요', style: 'cancel' },
      { text: '네', style: 'destructive', onPress: async () => {
        await AsyncStorage.clear();
        navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
      }},
    ]);
  };

  // 일주일 그리드용
  const times = [...new Set(schedules.map(s => s.scheduled_time))].sort();
  const grid: Record<string, Record<number, Schedule>> = {};
  for (const s of schedules) {
    s.days_of_week.split(',').map(Number).forEach(d => {
      if (!grid[s.scheduled_time]) grid[s.scheduled_time] = {};
      grid[s.scheduled_time][d] = s;
    });
  }

  // ── 렌더 ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root}>

      {/* ─── 헤더 ─── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.hLabel}>다음 일과</Text>
          <Text style={[styles.hValue, { color: theme }]} numberOfLines={1}>
            {nextSched ? `${nextSched.scheduled_time}  ${nextSched.title}` : '오늘 일과 없음'}
          </Text>
        </View>
        <TouchableOpacity style={[styles.menuBtn, { backgroundColor: theme + '18' }]} onPress={openDrawer} activeOpacity={0.75}>
          <Text style={[styles.menuIcon, { color: theme }]}>☰</Text>
        </TouchableOpacity>
      </View>

      {/* ─── 상단 고정 영역 ─── */}
      <View style={styles.body}>

        {/* 보호자 알림 카드 */}
        {notifications.map(n => (
          <View key={n.id} style={styles.notifCard}>
            <Text style={styles.notifMsg}>{n.message}</Text>
            <TouchableOpacity
              style={[styles.notifReadBtn, { backgroundColor: theme }]}
              activeOpacity={0.8}
              onPress={async () => {
                await api.put(`/notifications/${n.id}/read`);
                setNotifications(p => p.filter(x => x.id !== n.id));
              }}
            >
              <Text style={styles.notifReadText}>확인</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* 현재 일과 카드 */}
        <View style={styles.nowCard}>
          <Animated.Text style={[styles.nowEmoji, { transform: [{ translateY: bounceAnim }] }]}>
            {effectiveCurrent ? getEmoji(effectiveCurrent.title) : '📋'}
          </Animated.Text>
          <View style={styles.nowInfo}>
            <Text style={[styles.nowChip, { color: theme, backgroundColor: theme + '18' }]}>
              지금 할 일
            </Text>
            <Text style={[styles.nowTitle, { color: theme }]} numberOfLines={2}>
              {effectiveCurrent?.title ?? '일과를 확인 중이에요'}
            </Text>
            {effectiveCurrent?.scheduled_time
              ? <Text style={styles.nowTime}>{effectiveCurrent.scheduled_time}</Text>
              : null}
          </View>
        </View>

        {/* 연락 pill 버튼 */}
        <View style={styles.contactRow}>
          <TouchableOpacity
            style={[styles.contactPill, { borderColor: theme + '60' }]}
            activeOpacity={0.75}
            onPress={() => Alert.alert('보호자 연락', '보호자에게 연락합니다.')}>
            <Text style={styles.contactPillIcon}>👨‍👩‍👧</Text>
            <Text style={[styles.contactPillText, { color: theme }]}>보호자 연락</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.contactPill, { borderColor: theme + '60' }]}
            activeOpacity={0.75}
            onPress={() => Alert.alert('기관 연락', '기관에 연락합니다.')}>
            <Text style={styles.contactPillIcon}>🏢</Text>
            <Text style={[styles.contactPillText, { color: theme }]}>기관 연락</Text>
          </TouchableOpacity>
        </View>

        {/* 달성률 바 */}
        <View style={styles.achieveWrap}>
          <View style={styles.achieveRow}>
            <Text style={styles.achieveLabel}>오늘 달성률</Text>
            <Text style={[styles.achievePct, { color: theme }]}>{achieveRate}%</Text>
          </View>
          <View style={styles.achieveTrack}>
            <Animated.View style={[styles.achieveFill, { width: `${achieveRate}%` as any, backgroundColor: theme }]} />
          </View>
          <Text style={styles.achieveSub}>{achieveCount} / {achieveTotal} 완료</Text>
        </View>

        {/* 오늘 일과 타임라인 (flex: 1 — 남은 공간 채움) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>오늘 남은 일과</Text>
            <Text style={styles.sectionSub}>{DAY_LABELS[today]}요일</Text>
          </View>

          {loading ? (
            <ActivityIndicator color={theme} style={{ marginVertical: 20 }} />
          ) : upcomingSchedules.length === 0 ? (
            <Text style={styles.emptyText}>오늘 남은 일과가 없어요 🎉</Text>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {upcomingSchedules.map((s, i) => {
                const isCurrent = effectiveCurrent?.id === s.id;
                const isLast    = i === upcomingSchedules.length - 1;
                return (
                  <View key={s.id} style={styles.tlRow}>
                    <View style={styles.tlTrack}>
                      <View style={[
                        styles.tlDot,
                        isCurrent && { backgroundColor: theme, width: 14, height: 14, borderRadius: 7, marginLeft: -1 },
                      ]} />
                      {!isLast && <View style={styles.tlLine} />}
                    </View>
                    <View style={[
                      styles.tlCard,
                      isCurrent && { backgroundColor: theme + '0F', borderColor: theme + '55', borderWidth: 1.5 },
                    ]}>
                      <Text style={styles.tlTime}>{s.scheduled_time}</Text>
                      <Text style={styles.tlEmoji}>{getEmoji(s.title)}</Text>
                      <Text style={[styles.tlTitle, isCurrent && { color: theme, fontWeight: '800' }]}
                        numberOfLines={1}>
                        {s.title}
                      </Text>
                      {isCurrent && (
                        <View style={[styles.nowBadge, { backgroundColor: theme }]}>
                          <Text style={styles.nowBadgeText}>지금</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* 일과 수정하기 */}
          <TouchableOpacity
            style={[styles.editBtn, { borderColor: theme + '70' }]}
            activeOpacity={0.8}
            onPress={() => Alert.alert('일과 수정', '어떤 일과를 수정할까요?', [
              { text: '취소', style: 'cancel' },
              { text: '오늘 일과 수정', onPress: () => navigation.navigate('TodayScheduleEdit') },
              { text: '일주일 일과 수정', onPress: () => navigation.navigate('WeekScheduleEdit') },
            ])}>
            <Text style={[styles.editBtnText, { color: theme }]}>✏️  일과 수정하기</Text>
          </TouchableOpacity>

          {/* 🧪 테스트 버튼 — 확인 후 삭제 */}
          <TouchableOpacity
            style={[styles.editBtn, { borderColor: '#F59E0B70', marginTop: 6 }]}
            activeOpacity={0.8}
            onPress={() => announce(
              upcomingSchedules[0] ?? { id: 9999, title: '🍽️ 저녁 식사', scheduled_time: nowTime, days_of_week: String(today) }
            )}>
            <Text style={[styles.editBtnText, { color: '#F59E0B' }]}>🧪 알림 테스트</Text>
          </TouchableOpacity>
        </View>

        {/* AI 마이크 (하단 고정) */}
        <View style={styles.micSection}>
          <View style={[styles.micRipple, { backgroundColor: theme + '28' }]} />
          <TouchableOpacity
            style={[styles.micCircle, { backgroundColor: theme }]}
            activeOpacity={0.82}
            onPress={handleMic}
          >
            <View style={styles.micIconWrap}>
              <View style={[styles.micBody, { borderColor: '#fff' }]} />
              <View style={[styles.micArch, { borderColor: '#fff' }]} />
              <View style={styles.micStem} />
              <View style={styles.micBase} />
            </View>
          </TouchableOpacity>
          <Text style={styles.micStatusText}>AI에게 말해보세요</Text>
        </View>

      </View>

      {/* ====== 스케줄 알림 모달 ====== */}
      <Modal visible={!!pending} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.notifyBg}>
          <View style={styles.notifyCard}>
            <Text style={styles.notifyEmoji}>{pending ? getEmoji(pending.title) : '📋'}</Text>
            <Text style={styles.notifyTime}>{pending?.scheduled_time}</Text>
            <Text style={[styles.notifyTitle, { color: theme }]}>{pending?.title}</Text>
            <Text style={styles.notifyMsg}>지금 할 시간이에요! 😊</Text>
            {/* 카운트다운 바 */}
            <View style={styles.cdTrack}>
              <Animated.View style={[styles.cdFill, {
                width: countdownAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              }]} />
            </View>
          </View>
        </View>
      </Modal>

      {/* ====== 드로어 ====== */}
      <Modal visible={showMenu} animationType="none" transparent onRequestClose={closeDrawer}>
        <TouchableOpacity style={styles.drawerBg} activeOpacity={1} onPress={closeDrawer} />
        <Animated.View style={[styles.drawer, { transform: [{ translateX: drawerAnim }] }]}>
          <View style={styles.drawerHead}>
            <Text style={styles.drawerTitle}>메뉴</Text>
            <TouchableOpacity onPress={closeDrawer} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.drawerX}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.drawerDivider} />
          <TouchableOpacity style={styles.drawerRow} activeOpacity={0.7}
            onPress={() => { closeDrawer(); setTimeout(() => setShowWeek(true), 240); }}>
            <Text style={styles.drawerRowIcon}>🗓</Text>
            <Text style={styles.drawerRowText}>일주일 스케줄</Text>
          </TouchableOpacity>
          <View style={styles.drawerDivider} />
          <TouchableOpacity style={styles.drawerRow} activeOpacity={0.7}
            onPress={() => { closeDrawer(); handleLogout(); }}>
            <Text style={styles.drawerRowIcon}>🚪</Text>
            <Text style={[styles.drawerRowText, { color: '#E53E3E' }]}>로그아웃</Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>

      {/* ====== 일주일 스케줄 모달 ====== */}
      <Modal visible={showWeek} animationType="slide" transparent onRequestClose={() => setShowWeek(false)}>
        <TouchableOpacity style={styles.sheetBg} activeOpacity={1} onPress={() => setShowWeek(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: theme }]}>🗓  일주일 스케줄</Text>
            <TouchableOpacity onPress={() => setShowWeek(false)}>
              <Text style={styles.sheetX}>✕</Text>
            </TouchableOpacity>
          </View>
          {loading ? (
            <ActivityIndicator color={theme} style={{ margin: 24 }} />
          ) : times.length === 0 ? (
            <Text style={styles.emptyText}>등록된 스케줄이 없어요</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={styles.tr}>
                  <View style={{ width: 48 }} />
                  {DAY_LABELS.map((d, i) => (
                    <View key={i} style={[styles.th, i === today && { backgroundColor: theme }]}>
                      <Text style={[styles.thText, i === today && { color: '#fff' }]}>{d}</Text>
                    </View>
                  ))}
                </View>
                {times.map(t => (
                  <View key={t} style={styles.tr}>
                    <View style={styles.td0}><Text style={styles.tdTime}>{t}</Text></View>
                    {[0,1,2,3,4,5,6].map(d => {
                      const s = grid[t]?.[d];
                      return (
                        <View key={d} style={[styles.td, d === today && { backgroundColor: theme + '12' }]}>
                          {s
                            ? <Text style={[styles.tdText, { color: theme }]} numberOfLines={2}>{s.title}</Text>
                            : <Text style={styles.tdEmpty}>–</Text>}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ── 스타일 ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F6FB' },

  // 헤더
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10,
  },
  hLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, color: '#8FA99A' },
  hValue: { fontSize: 15, fontWeight: '800', marginTop: 2, maxWidth: SW - 80 },
  menuBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  menuIcon: { fontSize: 16 },

  body: { flex: 1, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 16, gap: 12 },

  // 보호자 알림 카드
  notifCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 16, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderColor: '#BFDBFE',
    shadowColor: '#3B82F6', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  notifMsg: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1E40AF', lineHeight: 20 },
  notifReadBtn: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20,
  },
  notifReadText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  // 현재 일과 카드
  nowCard: {
    backgroundColor: '#fff',
    borderRadius: 22, paddingVertical: 18, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', gap: 16,
    shadowColor: '#0A1F6B', shadowOpacity: 0.07,
    shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 4,
  },
  nowEmoji: { fontSize: 64, lineHeight: 72 },
  nowInfo: { flex: 1, gap: 6 },
  nowChip: {
    alignSelf: 'flex-start', fontSize: 11, fontWeight: '800',
    letterSpacing: 0.3, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20,
  },
  nowTitle: { fontSize: 22, fontWeight: '900', lineHeight: 28 },
  nowTime:  { fontSize: 13, color: '#94A3B8', fontWeight: '600' },

  // 연락 pill 버튼
  contactRow: { flexDirection: 'row', gap: 10 },
  contactPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, backgroundColor: '#fff',
    borderRadius: 30, borderWidth: 1.5,
    paddingVertical: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  contactPillIcon: { fontSize: 16 },
  contactPillText: { fontSize: 13, fontWeight: '700' },

  // 섹션
  section: {
    flex: 1,
    backgroundColor: '#fff', borderRadius: 22,
    padding: 18,
    shadowColor: '#0A1F6B', shadowOpacity: 0.06,
    shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'baseline',
    justifyContent: 'space-between', marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: '#1E293B' },
  sectionSub:   { fontSize: 12, color: '#94A3B8', fontWeight: '600' },

  // 타임라인
  timeline: { gap: 0 },
  tlRow:   { flexDirection: 'row', alignItems: 'stretch', minHeight: 60 },
  tlTrack: { width: 24, alignItems: 'center' },
  tlDot:   {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#CBD5E1', marginTop: 16,
  },
  tlLine: { flex: 1, width: 2, backgroundColor: '#E8EDF5', marginVertical: 3 },
  tlCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8FAFF', borderRadius: 14,
    marginLeft: 10, marginVertical: 4,
    paddingHorizontal: 14, paddingVertical: 12,
    gap: 10, borderWidth: 1, borderColor: '#EEF1F8',
  },
  tlTime:  { fontSize: 12, fontWeight: '700', color: '#94A3B8', width: 40 },
  tlEmoji: { fontSize: 22 },
  tlTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: '#334155' },
  nowBadge: {
    borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3,
  },
  nowBadgeText: { fontSize: 10, fontWeight: '900', color: '#fff' },

  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', paddingVertical: 16 },

  // 일과 수정 버튼
  editBtn: {
    marginTop: 14, borderRadius: 14, borderWidth: 1.5,
    paddingVertical: 13, alignItems: 'center',
  },
  editBtnText: { fontSize: 14, fontWeight: '800' },

  // 마이크
  micSection: { alignItems: 'center', gap: 6 },
  micRipple: {
    position: 'absolute',
    width: 80, height: 80, borderRadius: 40,
  },
  micCircle: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.22,
    shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  micIconWrap: { alignItems: 'center', gap: 2 },
  micBody: {
    width: 14, height: 20, borderRadius: 7,
    borderWidth: 2.5, backgroundColor: 'transparent',
  },
  micArch: {
    width: 22, height: 12,
    borderBottomLeftRadius: 11, borderBottomRightRadius: 11,
    borderLeftWidth: 2.5, borderRightWidth: 2.5, borderBottomWidth: 2.5,
    backgroundColor: 'transparent', marginTop: -2,
  },
  micStem: { width: 2.5, height: 5, backgroundColor: '#fff' },
  micBase: { width: 14, height: 2.5, borderRadius: 2, backgroundColor: '#fff' },
  micStatusText: { fontSize: 12, fontWeight: '600', color: '#94A3B8', marginTop: 2 },

  // 알림 모달
  notifyBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
  },
  notifyCard: {
    backgroundColor: '#fff', borderRadius: 28,
    paddingVertical: 36, paddingHorizontal: 28,
    alignItems: 'center', width: '100%', gap: 10,
    shadowColor: '#000', shadowOpacity: 0.2,
    shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 20,
  },
  notifyEmoji: { fontSize: 72, lineHeight: 82 },
  notifyTime:  { fontSize: 14, color: '#94A3B8', fontWeight: '700' },
  notifyTitle: { fontSize: 26, fontWeight: '900', textAlign: 'center' },
  notifyMsg:   { fontSize: 16, color: '#475569', fontWeight: '600', textAlign: 'center', lineHeight: 24 },
  notifyRow:   { flexDirection: 'row', gap: 10, marginTop: 12, width: '100%' },
  notifyOk: {
    flex: 1, borderRadius: 18, paddingVertical: 16, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  notifyOkText:    { color: '#fff', fontWeight: '900', fontSize: 16 },
  notifyLater:     { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  notifyLaterText: { color: '#475569', fontWeight: '800', fontSize: 16 },
  notifyMissed:    { width: '100%', backgroundColor: '#FEF2F2', borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  notifyMissedText: { color: '#DC2626', fontWeight: '700', fontSize: 15 },

  // 카운트다운 바
  cdTrack: { width: '100%', height: 6, backgroundColor: '#E8F5EE', borderRadius: 3, overflow: 'hidden', marginTop: 8 },
  cdFill:  { height: 6, backgroundColor: '#22C55E', borderRadius: 3 },

  // dB 미터
  dbMeter: {
    width: '100%', height: 28, backgroundColor: '#F1F5F9',
    borderRadius: 14, overflow: 'hidden', justifyContent: 'center',
  },
  dbBar: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 14 },
  dbLabel: { textAlign: 'center', fontSize: 12, fontWeight: '800', color: '#1E293B', zIndex: 1 },

  // 드로어
  drawerBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)' },
  drawer: {
    position: 'absolute', top: 0, right: 0, bottom: 0,
    width: DRAWER_W, backgroundColor: '#fff', paddingTop: 56,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: -4, height: 0 }, elevation: 16,
  },
  drawerHead: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16,
  },
  drawerTitle:   { fontSize: 18, fontWeight: '800', color: '#1E293B' },
  drawerX:       { fontSize: 18, color: '#94A3B8' },
  drawerDivider: { height: 1, backgroundColor: '#F1F5F9' },
  drawerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 18, paddingHorizontal: 20,
  },
  drawerRowIcon: { fontSize: 20 },
  drawerRowText: { fontSize: 16, fontWeight: '600', color: '#1E293B' },

  // 일주일 바텀시트
  sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    padding: 20, paddingBottom: 36, maxHeight: '85%',
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#E2E8F0', alignSelf: 'center', marginBottom: 16,
  },
  sheetHead: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 16,
  },
  sheetTitle: { fontSize: 16, fontWeight: '800' },
  sheetX:     { fontSize: 18, color: '#94A3B8' },

  // 주간 그리드
  tr:  { flexDirection: 'row' },
  th:  { width: 52, paddingVertical: 6, alignItems: 'center', borderRadius: 8 },
  thText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  td0: { width: 48, paddingVertical: 8, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 6 },
  tdTime:  { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  td: {
    width: 52, minHeight: 44, paddingVertical: 4, paddingHorizontal: 2,
    alignItems: 'center', justifyContent: 'center',
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  tdText:  { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  tdEmpty: { fontSize: 12, color: '#E2E8F0' },

  // 달성률 바
  achieveWrap:  { backgroundColor: '#fff', borderRadius: 18, padding: 14, gap: 6, shadowColor: '#0A1F6B', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  achieveRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  achieveLabel: { fontSize: 13, fontWeight: '700', color: '#475569' },
  achievePct:   { fontSize: 15, fontWeight: '900' },
  achieveTrack: { height: 10, backgroundColor: '#E8F5EE', borderRadius: 5, overflow: 'hidden' },
  achieveFill:  { height: 10, borderRadius: 5 },
  achieveSub:   { fontSize: 11, color: '#94A3B8', fontWeight: '600' },

  // AI 대화 오버레이
  voiceBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  voiceCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    paddingTop: 28, paddingBottom: 48, paddingHorizontal: 28,
    alignItems: 'center', gap: 18,
    shadowColor: '#000', shadowOpacity: 0.2,
    shadowRadius: 24, shadowOffset: { width: 0, height: -6 }, elevation: 20,
  },
  voiceClose: {
    position: 'absolute', top: 18, right: 22,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  voiceCloseText: { fontSize: 14, color: '#64748B', fontWeight: '700' },
  voiceAvatarRing: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 3, alignItems: 'center', justifyContent: 'center',
  },
  voiceAvatar: {
    width: 76, height: 76, borderRadius: 38,
    alignItems: 'center', justifyContent: 'center',
  },
  voiceAvatarEmoji: { fontSize: 36 },
  voiceTextArea: {
    alignItems: 'center', gap: 8,
    minHeight: 60, width: '100%',
  },
  voiceStatusText: {
    fontSize: 16, fontWeight: '600', color: '#94A3B8', textAlign: 'center',
  },
  voiceReplyText: {
    fontSize: 17, fontWeight: '700', color: '#1E293B',
    textAlign: 'center', lineHeight: 26,
  },
  voiceSpokenText: {
    fontSize: 13, color: '#94A3B8', fontStyle: 'italic', textAlign: 'center',
  },
  voiceMicBtn: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.18,
    shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 7,
  },
  voiceMicLabel: {
    fontSize: 12, fontWeight: '600', color: '#94A3B8', marginTop: -6,
  },
});
