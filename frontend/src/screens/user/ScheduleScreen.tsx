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
import { Accelerometer } from 'expo-sensors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect, RouteProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import * as Notifications from 'expo-notifications';
import { getSchedules, api } from '../../api/client';
import { cleanForSpeech } from '../../utils/text';
import { scheduleTodayNotifications } from '../../utils/localNotify';

const { width: SW } = Dimensions.get('window');

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Schedule'>;
  route: RouteProp<RootStackParamList, 'Schedule'>;
};
type Schedule = {
  id: number;
  title: string;
  scheduled_time: string;
  end_time?: string | null;
  color?: string | null;
  days_of_week: string;
};

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const SLEEP_KW   = ['취침', '수면', '자기', '잠자기', '잠'];

const isSleep    = (t: string) => SLEEP_KW.some(k => t.includes(k));
const getEmoji   = (t: string) => t.match(/\p{Emoji_Presentation}/u)?.[0] ?? '📋';
// 제목("🌅 기상·세면")을 앞 이모지 + 이름으로 분리 (이모지 중복/불일치 방지)
const parseTitle = (t: string): { emoji: string; name: string } => {
  const parts = t.trim().split(/\s+/);
  if (parts.length >= 2 && /\p{Extended_Pictographic}/u.test(parts[0])) {
    return { emoji: parts[0], name: parts.slice(1).join(' ') };
  }
  return { emoji: '📋', name: t.trim() };
};
const todayIdx   = () => (new Date().getDay() + 6) % 7;
const nowHHMM    = () => {
  const n = new Date();
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
};

const DRAWER_W = 260;

export default function ScheduleScreen({ navigation, route }: Props) {
  const bounceAnim    = useRef(new Animated.Value(0)).current;
  const drawerAnim    = useRef(new Animated.Value(DRAWER_W)).current;
  const countdownAnim = useRef(new Animated.Value(1)).current;
  const countdownRef       = useRef<Animated.CompositeAnimation | null>(null);
  const announcedRef       = useRef<Set<number>>(new Set());
  const snoozeRef          = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const encourageRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inProgStartRef     = useRef<number>(0);
  const todaySchedRef      = useRef<Schedule[]>([]);
  const recordingRef       = useRef<Audio.Recording | null>(null);
  const meterInterval      = useRef<ReturnType<typeof setInterval> | null>(null);
  const burstTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIdRef          = useRef<number | null>(null);
  const lastApiCallRef     = useRef<number>(0);
  const behaviorFollowupRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const achievePopupAnim   = useRef(new Animated.Value(1)).current;
  const accelSubRef        = useRef<ReturnType<typeof Accelerometer.addListener> | null>(null);
  const accelShakeCountRef = useRef(0);

  const [schedules,        setSchedules]        = useState<Schedule[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [showMenu,         setShowMenu]         = useState(false);
  const [pending,          setPending]          = useState<Schedule | null>(null);
  const [theme,            setTheme]            = useState(colors.primary);
  const [nowTime,          setNowTime]          = useState(nowHHMM());
  const [notifications,    setNotifications]    = useState<any[]>([]);
  const [achieveRate,      setAchieveRate]      = useState(0);
  const [achieveCount,     setAchieveCount]     = useState(0);
  const [achieveTotal,     setAchieveTotal]     = useState(0);
  const [showAchievePopup, setShowAchievePopup] = useState(false);
  const [popupAchieveRate, setPopupAchieveRate] = useState(0);
  const [doneIds,          setDoneIds]          = useState<Set<number>>(new Set());
  const [missedIds,        setMissedIds]        = useState<Set<number>>(new Set());
  const [catchUp,          setCatchUp]          = useState<Schedule | null>(null);
  const [inProg,           setInProg]           = useState<Schedule | null>(null);  // 진행 중인 일과
  const [toast,            setToast]            = useState<string | null>(null);     // 진행 중 독려 메시지

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

  // 어제 마지막 일과 (자정~기상 사이 취침 표시용)
  const yIdx = (today + 6) % 7;
  const yLast = schedules
    .filter(s => s.days_of_week.split(',').map(Number).includes(yIdx))
    .sort((a,b) => a.scheduled_time.localeCompare(b.scheduled_time)).at(-1);

  // 현재 일과: 없으면(기상 전 새벽) 어제 취침이 이어지는 것으로 간주
  const effectiveCurrent = current ?? (yLast && isSleep(yLast.title) ? yLast : null);

  // 취침 준비 이후 ~ 다음날 기상 전까지는 '취침' 상태로 채움
  const isSleepingNow = !!effectiveCurrent && isSleep(effectiveCurrent.title);

  // 현재 일과의 상태 (완료/미수행/대기) — 방법 1: 상태에 따라 카드 모양만 변경
  const curDone   = !!effectiveCurrent && doneIds.has(effectiveCurrent.id);
  const curMissed = !!effectiveCurrent && !curDone && missedIds.has(effectiveCurrent.id);

  // 캐치업 후보: 시간 지났는데 미확인 + 다음 일과가 이미 시작됨(=알림 놓침)
  const catchUpCandidates = todaySchedules.filter(s =>
    !isSleepingNow &&
    s.scheduled_time <= nowTime &&
    effectiveCurrent?.id !== s.id &&
    !doneIds.has(s.id) && !missedIds.has(s.id)
  );

  // 현재 + 앞으로 남은 일과만 표시 (지난 건 숨김).
  const upcomingSchedules = todaySchedules.filter(
    s => s.scheduled_time >= nowTime || effectiveCurrent?.id === s.id
  );

  // 내일 일과 (취침 중이면 이걸 보여줌)
  const tomorrow = (today + 1) % 7;
  const tomorrowSchedules = schedules
    .filter(s => s.days_of_week.split(',').map(Number).includes(tomorrow))
    .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));

  // 취침 중이면 '오늘 남은 일과' 대신 '내일 일과'를 표시
  const listSchedules = isSleepingNow ? tomorrowSchedules : upcomingSchedules;

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

  // ── 달성 팝업 ──────────────────────────────────────────────────────────────
  const showAchievementPopup = (rate: number) => {
    setPopupAchieveRate(rate);
    achievePopupAnim.setValue(1);
    setShowAchievePopup(true);
    Animated.timing(achievePopupAnim, {
      toValue: 0, duration: 5000, useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) setShowAchievePopup(false);
    });
  };

  // justAchieved / behaviorResolved 파라미터 처리
  useEffect(() => {
    if (route.params?.justAchieved) {
      const rate = route.params.achieveRate ?? achieveRate;
      setAchieveRate(rate);
      showAchievementPopup(rate);
      navigation.setParams({ justAchieved: undefined, achieveRate: undefined });
    }
  }, [route.params?.justAchieved]);

  useEffect(() => {
    if (route.params?.behaviorResolved) {
      navigation.setParams({ behaviorResolved: undefined });
      startMeterting(); // AI 대화 복귀 후 1분간 dB 측정
      if (behaviorFollowupRef.current) clearTimeout(behaviorFollowupRef.current);
      behaviorFollowupRef.current = setTimeout(() => {
        navigation.navigate('AIChat', { behaviorFollowup: true });
      }, 10 * 60 * 1000); // 10분 후 AI 팔로업
    }
  }, [route.params?.behaviorResolved]);

  // ── 동행 흐름: 시작 → 진행 → 종료 ──────────────────────────────────────────
  const START_TIMEOUT_MS = 8000;            // 시작 모달 무반응 → no_response
  const ENCOURAGE_INTERVAL_MS = 30 * 1000;  // 진행 중 독려 주기 (테스트용 30초; 실제 5~15분)
  const SNOOZE_MS = 5 * 60 * 1000;          // '조금있다가요' 후 다시 안내까지
  const ENCOURAGES = ['잘하고 있어요! 👏', '조금만 더 힘내요!', '멋져요, 계속 해봐요!', '천천히 해도 괜찮아요 😊'];

  const clearFlows = () => {
    if (startTimerRef.current) { clearTimeout(startTimerRef.current); startTimerRef.current = null; }
    if (encourageRef.current) { clearInterval(encourageRef.current); encourageRef.current = null; }
    if (toastTimerRef.current) { clearTimeout(toastTimerRef.current); toastTimerRef.current = null; }
    setPending(null);
    setInProg(null);
    setToast(null);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  };

  // 시작 알림 — '시작할게요 / 조금있다가요' 모달 + 8초 무반응 → no_response
  const announce = (s: Schedule) => {
    startMeterting(); // 음성 시작 전 측정 켜기
    Speech.speak(`${cleanForSpeech(s.title)} 시간이에요! 지금 시작할까요?`, { language: 'ko-KR' });
    setPending(s);
    countdownAnim.setValue(1);
    const anim = Animated.timing(countdownAnim, { toValue: 0, duration: START_TIMEOUT_MS, useNativeDriver: false });
    countdownRef.current = anim;
    anim.start();
    if (startTimerRef.current) clearTimeout(startTimerRef.current);
    startTimerRef.current = setTimeout(() => handleStartResp(s, 'no_response'), START_TIMEOUT_MS);
  };

  // 시작 모달 응답 처리 (started / later / no_response)
  const handleStartResp = (s: Schedule, type: 'started' | 'later' | 'no_response') => {
    if (startTimerRef.current) { clearTimeout(startTimerRef.current); startTimerRef.current = null; }
    countdownRef.current?.stop();
    setPending(null);
    api.post(`/schedules/${s.id}/start`, { response_type: type }).catch(() => {});

    // 전환 결과 기록: 직전 일과 → 이 일과 (started=accepted / later=refused / no_response)
    const uid = userIdRef.current;
    const list = todaySchedRef.current;
    const idx = list.findIndex(x => x.id === s.id);
    const prev = idx > 0 ? list[idx - 1] : null;
    const result = type === 'started' ? 'accepted' : type === 'later' ? 'refused' : 'no_response';
    if (uid) {
      api.post('/schedules/transition', {
        user_id: uid, from_schedule_id: prev?.id ?? null, to_schedule_id: s.id, result,
      }).catch(() => {});
    }

    if (type === 'started') {
      beginInProgress(s);
    } else {
      // 강요하지 않음 — 부드럽게 안내하고 잠시 뒤 다시
      Speech.speak('괜찮아요. 준비되면 다시 알려드릴게요.', { language: 'ko-KR' });
      if (snoozeRef.current) clearTimeout(snoozeRef.current);
      snoozeRef.current = setTimeout(() => {
        const target = todaySchedRef.current.find(x => x.id === s.id);
        if (target && !doneIds.has(s.id)) announce(target);
      }, SNOOZE_MS);
    }
  };

  // 진행 중 시작 — 독려 토스트 주기적으로
  const beginInProgress = (s: Schedule) => {
    setInProg(s);
    inProgStartRef.current = Date.now();
    Speech.speak(`${cleanForSpeech(s.title)} 시작해요! 잘 할 수 있어요.`, { language: 'ko-KR' });
    if (encourageRef.current) clearInterval(encourageRef.current);
    encourageRef.current = setInterval(() => {
      showToast(ENCOURAGES[Math.floor(Date.now() / ENCOURAGE_INTERVAL_MS) % ENCOURAGES.length]);
    }, ENCOURAGE_INTERVAL_MS);
  };

  // 종료 — completed=true('다 했어요') / false('그만할래요'). 둘 다 진행시간 기록, 아이에겐 긍정 피드백.
  const handleStop = async (completed: boolean) => {
    const s = inProg;
    if (!s) return;
    if (encourageRef.current) { clearInterval(encourageRef.current); encourageRef.current = null; }
    const mins = Math.max(0, Math.round((Date.now() - inProgStartRef.current) / 60000));
    setInProg(null);
    setToast(null);
    setDoneIds(prev => new Set(prev).add(s.id));
    const id = userIdRef.current;
    try {
      // 다 했어요 → 완료, 그만할래요 → 중도 종료(early_stop)
      await api.post(`/schedules/${s.id}/stop`, { achieved: true, early_stop: !completed, duration_min: mins });
      if (id) await refreshReport(id);
    } catch {}
    Speech.speak(completed ? '끝까지 잘했어요! 정말 멋져요.' : '여기까지 한 것도 잘했어요. 수고했어요.', { language: 'ko-KR' });
  };

  // 재안내(스누즈): 다른 화면에서 돌아온 snoozeScheduleId로 N분 뒤 다시 안내
  useEffect(() => {
    const sid = route.params?.snoozeScheduleId;
    if (sid == null) return;
    navigation.setParams({ snoozeScheduleId: undefined });
    if (snoozeRef.current) clearTimeout(snoozeRef.current);
    snoozeRef.current = setTimeout(() => {
      const target = todaySchedRef.current.find(x => x.id === sid);
      if (target && !doneIds.has(sid)) announce(target);
    }, SNOOZE_MS);
  }, [route.params?.snoozeScheduleId]);

  // AI 마이크 — AIChat 화면으로 페이드 전환
  const handleMic = () => navigation.navigate('AIChat');

  // 로컬 알림 탭 → 해당 일과 확인 흐름 띄움
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(resp => {
      const data: any = resp.notification.request.content.data;
      if (data?.type === 'schedule' && data.scheduleId) {
        const s = todaySchedRef.current.find(x => x.id === Number(data.scheduleId));
        if (s && !announcedRef.current.has(s.id)) {
          announcedRef.current.add(s.id);
          announce(s);
        }
      } else if (data?.type === 'daily_summary') {
        navigation.navigate('DailySummary');
      }
    });
    return () => sub.remove();
  }, []);

  // 캐치업 후보가 있으면 하나씩 물어봄 (단, 오늘 달성현황 로딩 끝난 뒤에만)
  useEffect(() => {
    if (!loading && !catchUp && catchUpCandidates.length > 0) setCatchUp(catchUpCandidates[0]);
  }, [loading, catchUpCandidates.length, catchUp]);

  // 캐치업 응답: 안했으면 재안내·이유 없이 그냥 미달성 (passive)
  const handleCatchUp = async (achieved: boolean) => {
    const s = catchUp;
    const id = userIdRef.current;
    if (!s || !id) { setCatchUp(null); return; }
    // 먼저 로컬 상태에서 제외해야 모달이 같은 걸로 다시 안 뜸
    if (achieved) setDoneIds(prev => new Set(prev).add(s.id));
    else setMissedIds(prev => new Set(prev).add(s.id));
    setCatchUp(null);
    try {
      await api.post('/schedules/check', { schedule_id: s.id, achieved }); // 거부 카운트 안 함
      await refreshReport(id);
    } catch {}
  };

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
        scheduleTodayNotifications(res.data).catch(() => {}); // 오늘 일과 로컬 알림 예약
        const notifRes = await api.get(`/notifications/user/${id}/unread`);
        setNotifications(notifRes.data);
        try { await refreshReport(id); } catch {}
      } catch (e) { console.warn(e); }
      finally { setLoading(false); }
    })();
  }, []);

  // 오늘 달성 현황 새로고침 (달성률 + 완료/미수행 일과 id)
  const refreshReport = async (id: number) => {
    const reportRes = await api.get(`/schedules/user/${id}/today-report`);
    const d = reportRes.data;
    setAchieveRate(d.achievement_rate ?? 0);
    setAchieveCount(d.achieved ?? 0);
    setAchieveTotal(d.total ?? 0);
    const items = d.items ?? [];
    setDoneIds(new Set<number>(items.filter((it: any) => it.status === 'achieved').map((it: any) => it.schedule_id)));
    setMissedIds(new Set<number>(items.filter((it: any) => it.status === 'missed').map((it: any) => it.schedule_id)));
    return d.achievement_rate ?? 0;
  };

  // ── 데시벨 모니터링 ────────────────────────────────────────────────────────
  // approxDB = (metering dBFS) + 100. 일반 대화 ≈ 75~80 → 그보다 충분히 높게 설정.
  // (이전 70/85는 평상시 말소리에도 오탐 → 상향)
  const DB_STAGE2 = 95;  // 소리 지름
  const DB_STAGE1 = 85;  // 격앙된 목소리

  // 알림/AI 대화 후 1분간 dB 측정
  const METER_DURATION = 60000; // 1분

  const startMeterting = async () => {
    if (recordingRef.current) return; // 이미 측정 중이면 skip
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      recordingRef.current = recording;
      startAccelerometer(); // dB와 함께 시작

      // 1분 후 자동 종료
      burstTimerRef.current = setTimeout(() => stopMetering(), METER_DURATION);

      meterInterval.current = setInterval(async () => {
        const s = await recording.getStatusAsync();
        if (!s.isRecording) return;
        const approxDB = (s.metering ?? -160) + 100;

        if (approxDB >= DB_STAGE2) {
          await stopMetering();
          clearFlows();
          navigation.navigate('AIChat', { behaviorAlert: true });
          const uid = userIdRef.current;
          if (uid) {
            api.post(`/chat/log-behavior/${uid}`, {
              stage: 'stage_2', trigger: 'voice_decibel', decibel: approxDB,
            }).catch(() => {});
          }
        } else if (approxDB >= DB_STAGE1) {
          const now = Date.now();
          if (now - lastApiCallRef.current > 30000) {
            lastApiCallRef.current = now;
            await stopMetering();
            clearFlows();
            navigation.navigate('AIChat', { behaviorStage1: true });
          }
        }
      }, 500);
    } catch (e) { console.warn('[Meter] 시작 실패', e); }
  };

  const stopMetering = async () => {
    if (burstTimerRef.current) { clearTimeout(burstTimerRef.current); burstTimerRef.current = null; }
    if (meterInterval.current) { clearInterval(meterInterval.current); meterInterval.current = null; }
    if (recordingRef.current) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch {}
      recordingRef.current = null;
    }
    stopAccelerometer(); // dB와 함께 종료
  };

  // 언마운트 시 정리
  useEffect(() => {
    return () => { stopMetering(); clearFlows(); };
  }, []);

  // ── 가속도계 (dB와 동일 조건에서 활성화) ─────────────────────────────────
  const ACCEL_THRESHOLD = 2.5;
  const ACCEL_SHAKE_MIN = 3;

  const startAccelerometer = () => {
    if (accelSubRef.current) return;
    accelShakeCountRef.current = 0;
    Accelerometer.setUpdateInterval(200);
    accelSubRef.current = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      if (magnitude > ACCEL_THRESHOLD) {
        accelShakeCountRef.current += 1;
        if (accelShakeCountRef.current >= ACCEL_SHAKE_MIN) {
          accelShakeCountRef.current = 0;
          clearFlows();
          const uid = userIdRef.current;
          if (uid) {
            api.post(`/chat/log-behavior/${uid}`, {
              stage: 'stage_2', trigger: 'accelerometer',
            }).catch(() => {});
          }
          navigation.navigate('AIChat', { behaviorAlert: true });
        }
      } else {
        accelShakeCountRef.current = 0;
      }
    });
  };

  const stopAccelerometer = () => {
    accelSubRef.current?.remove();
    accelSubRef.current = null;
    accelShakeCountRef.current = 0;
  };

  useFocusEffect(useCallback(() => {
    const uid = userIdRef.current;
    if (!uid) return;
    api.get(`/notifications/user/${uid}/unread`)
      .then(r => setNotifications(r.data))
      .catch(() => {});
    refreshReport(uid).catch(() => {});
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


  // ── 렌더 ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root}>

      {/* ─── 헤더 ─── */}
      <View style={styles.header}>
        <Text style={[styles.hBrand, { color: theme }]}>Routy</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.guardianBtn, { backgroundColor: theme }]}
            activeOpacity={0.8}
            onPress={async () => {
              const uid = userIdRef.current;
              if (uid) api.post(`/guardian/user/${uid}/emergency`).catch(() => {});
              Alert.alert('보호자 연락', '보호자에게 알림을 보냈어요.');
            }}
          >
            <Text style={styles.guardianBtnIcon}>👨‍👩‍👧</Text>
            <Text style={styles.guardianBtnText}>보호자 연락</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuBtn, { backgroundColor: theme + '18' }]} onPress={openDrawer} activeOpacity={0.75}>
            <Text style={[styles.menuIcon, { color: theme }]}>☰</Text>
          </TouchableOpacity>
        </View>
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

        {/* 현재 일과 카드 — 상태(대기/완료/미수행)에 따라 모양 변화 */}
        {(() => {
          const DONE_C = '#2D9D63', MISS_C = '#8C9BB0'; // 미수행은 부드러운 회색(부정 표현 완화)
          const accent = isSleepingNow ? theme : curDone ? DONE_C : curMissed ? MISS_C : theme;
          const chipText = isSleepingNow ? '취침' : curDone ? '완료' : curMissed ? '괜찮아요' : '지금 할 일';
          return (
            <View style={[
              styles.nowCard,
              curDone && { backgroundColor: '#E4F7EC', borderWidth: 2.5, borderColor: DONE_C },
              curMissed && { backgroundColor: '#F1F5F9', borderWidth: 2.5, borderColor: MISS_C },
            ]}>
              <Animated.Text style={[styles.nowEmoji, { transform: [{ translateY: bounceAnim }] }]}>
                {isSleepingNow ? '😴' : (effectiveCurrent ? parseTitle(effectiveCurrent.title).emoji : '📋')}
              </Animated.Text>
              <View style={styles.nowInfo}>
                <Text style={[styles.nowChip, { color: accent, backgroundColor: accent + '18' }]}>
                  {chipText}
                </Text>
                <Text style={[styles.nowTitle, { color: theme }]} numberOfLines={2}>
                  {isSleepingNow ? '취침 시간이에요' : (effectiveCurrent ? parseTitle(effectiveCurrent.title).name : '일과를 확인 중이에요')}
                </Text>
                {isSleepingNow ? (
                  <Text style={styles.nowTime}>내일 아침까지 푹 쉬세요 🌙</Text>
                ) : curDone ? (
                  <Text style={[styles.nowTime, { color: DONE_C, fontWeight: '800' }]}>✓ 완료했어요! 잘했어요</Text>
                ) : curMissed ? (
                  <Text style={[styles.nowTime, { color: MISS_C, fontWeight: '800' }]}>다음에 또 같이 해봐요 😊</Text>
                ) : effectiveCurrent?.scheduled_time ? (
                  <Text style={styles.nowTime}>{effectiveCurrent.scheduled_time}</Text>
                ) : null}
              </View>
            </View>
          );
        })()}

        {/* 오늘 남은 일과 (달성률 포함, flex: 1 — 남은 공간 채움) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{isSleepingNow ? '내일 일과' : '오늘 남은 일과'}</Text>
            <Text style={styles.sectionSub}>{DAY_LABELS[isSleepingNow ? tomorrow : today]}요일</Text>
          </View>

          {/* 오늘 달성률 (취침 중엔 숨김) */}
          {!isSleepingNow && (
            <View style={styles.achieveInline}>
              <View style={styles.achieveRow}>
                <Text style={styles.achieveLabel}>오늘 달성률</Text>
                <Text style={[styles.achievePct, { color: theme }]}>{achieveRate}%  ·  {achieveCount}/{achieveTotal}</Text>
              </View>
              <View style={styles.achieveTrack}>
                <Animated.View style={[styles.achieveFill, { width: `${achieveRate}%` as any, backgroundColor: theme }]} />
              </View>
            </View>
          )}

          {loading ? (
            <ActivityIndicator color={theme} style={{ marginVertical: 20 }} />
          ) : listSchedules.length === 0 ? (
            <Text style={styles.emptyText}>
              {isSleepingNow
                ? '내일 등록된 일과가 없어요 😴'
                : '오늘 남은 일과가 없어요 🎉'}
            </Text>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {isSleepingNow && (
                <Text style={styles.tomorrowHint}>😴 지금은 취침 시간이에요. 내일 일과를 미리 볼까요?</Text>
              )}
              {listSchedules.map((s, i) => {
                const isCurrent = !isSleepingNow && effectiveCurrent?.id === s.id;
                const isLast    = i === listSchedules.length - 1;
                const { emoji: sEmoji, name: sName } = parseTitle(s.title);
                return (
                  <View key={s.id} style={styles.tlRow}>
                    <View style={styles.tlTrack}>
                      <View style={[
                        styles.tlDot,
                        s.color ? { backgroundColor: s.color } : null,
                        isCurrent && { backgroundColor: s.color ?? theme, width: 14, height: 14, borderRadius: 7, marginLeft: -1 },
                      ]} />
                      {!isLast && <View style={styles.tlLine} />}
                    </View>
                    <View style={[
                      styles.tlCard,
                      isCurrent && { backgroundColor: theme + '0F', borderColor: theme + '55', borderWidth: 1.5 },
                    ]}>
                      <Text style={styles.tlTime}>{s.scheduled_time}</Text>
                      <Text style={styles.tlEmoji}>{sEmoji}</Text>
                      <Text style={[styles.tlTitle, isCurrent && { color: theme, fontWeight: '800' }]}
                        numberOfLines={1}>
                        {sName}
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

      {/* ====== 시작 알림 모달 (시작할게요 / 조금있다가요) ====== */}
      <Modal visible={!!pending} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.notifyBg}>
          <View style={styles.notifyCard}>
            <Text style={styles.notifyEmoji}>{pending ? getEmoji(pending.title) : '📋'}</Text>
            <Text style={styles.notifyTime}>{pending?.scheduled_time}</Text>
            <Text style={[styles.notifyTitle, { color: theme }]}>{pending ? parseTitle(pending.title).name : ''}</Text>
            <Text style={styles.notifyMsg}>지금 시작할까요? 😊</Text>
            {/* 8초 카운트다운 바 */}
            <View style={styles.cdTrack}>
              <Animated.View style={[styles.cdFill, {
                width: countdownAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              }]} />
            </View>
            <View style={styles.notifyRow}>
              <TouchableOpacity style={styles.notifyLater} activeOpacity={0.85}
                onPress={() => pending && handleStartResp(pending, 'later')}>
                <Text style={styles.notifyLaterText}>조금 있다가요</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.notifyOk, { backgroundColor: theme }]} activeOpacity={0.85}
                onPress={() => pending && handleStartResp(pending, 'started')}>
                <Text style={styles.notifyOkText}>시작할게요</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ====== 진행 중 오버레이 (독려 + 그만할래요) ====== */}
      <Modal visible={!!inProg} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.notifyBg}>
          <View style={styles.notifyCard}>
            <Animated.Text style={[styles.notifyEmoji, { transform: [{ translateY: bounceAnim }] }]}>
              {inProg ? getEmoji(inProg.title) : '📋'}
            </Animated.Text>
            <Text style={[styles.notifyTitle, { color: theme }]}>{inProg ? parseTitle(inProg.title).name : ''}</Text>
            <Text style={styles.notifyMsg}>{toast ?? '잘 하고 있어요! 👏'}</Text>
            <View style={styles.notifyRow}>
              <TouchableOpacity style={styles.notifyLater} activeOpacity={0.85} onPress={() => handleStop(false)}>
                <Text style={styles.notifyLaterText}>그만할래요</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.notifyOk, { backgroundColor: theme }]} activeOpacity={0.85} onPress={() => handleStop(true)}>
                <Text style={styles.notifyOkText}>다 했어요</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ====== 달성 팝업 ====== */}
      <Modal visible={showAchievePopup} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.notifyBg}>
          <View style={styles.notifyCard}>
            <Text style={styles.notifyEmoji}>🎉</Text>
            <Text style={[styles.notifyTitle, { color: theme }]}>잘하셨어요!</Text>
            <Text style={styles.notifyMsg}>오늘 달성률</Text>
            <Text style={[styles.achievePopupRate, { color: theme }]}>{popupAchieveRate}%</Text>
            <View style={styles.cdTrack}>
              <Animated.View style={[styles.cdFill, {
                width: achievePopupAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
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
            onPress={() => { closeDrawer(); setTimeout(() => navigation.navigate('ScheduleEdit'), 240); }}>
            <Text style={styles.drawerRowIcon}>🗓</Text>
            <Text style={styles.drawerRowText}>일과 보기·수정</Text>
          </TouchableOpacity>
          <View style={styles.drawerDivider} />
          <TouchableOpacity style={styles.drawerRow} activeOpacity={0.7}
            onPress={() => { closeDrawer(); setTimeout(() => navigation.navigate('DailySummary'), 240); }}>
            <Text style={styles.drawerRowIcon}>🌙</Text>
            <Text style={styles.drawerRowText}>오늘 하루 마무리</Text>
          </TouchableOpacity>
          <View style={styles.drawerDivider} />
          <TouchableOpacity style={styles.drawerRow} activeOpacity={0.7}
            onPress={() => {
              closeDrawer();
              setTimeout(() => announce(
                upcomingSchedules[0] ?? { id: 9999, title: '🍽️ 저녁 식사', scheduled_time: nowTime, days_of_week: String(today) }
              ), 240);
            }}>
            <Text style={styles.drawerRowIcon}>🧪</Text>
            <Text style={styles.drawerRowText}>알림 테스트</Text>
          </TouchableOpacity>
          <View style={styles.drawerDivider} />
          <TouchableOpacity style={styles.drawerRow} activeOpacity={0.7}
            onPress={() => { closeDrawer(); handleLogout(); }}>
            <Text style={styles.drawerRowIcon}>🚪</Text>
            <Text style={[styles.drawerRowText, { color: '#E53E3E' }]}>로그아웃</Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>

      {/* 캐치업: 놓친 이전 일과 확인 */}
      <Modal visible={!!catchUp} transparent animationType="fade">
        <View style={styles.cuOverlay}>
          <View style={styles.cuCard}>
            <Text style={styles.cuEmoji}>{catchUp ? getEmoji(catchUp.title) : '📋'}</Text>
            <Text style={styles.cuTitle}>이전에 이거 하셨어요?</Text>
            <Text style={[styles.cuName, { color: theme }]} numberOfLines={2}>
              {catchUp ? `${catchUp.scheduled_time}  ${parseTitle(catchUp.title).name}` : ''}
            </Text>
            <View style={styles.cuBtns}>
              <TouchableOpacity style={[styles.cuBtn, styles.cuBtnNo]} activeOpacity={0.85} onPress={() => handleCatchUp(false)}>
                <Text style={styles.cuBtnNoText}>안 했어요</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cuBtn, { backgroundColor: theme }]} activeOpacity={0.85} onPress={() => handleCatchUp(true)}>
                <Text style={styles.cuBtnYesText}>✓ 했어요</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  hBrand: { fontSize: 30, fontWeight: '900', letterSpacing: -0.5 },
  hValue: { fontSize: 13, fontWeight: '700', marginTop: 1, maxWidth: SW - 160, color: '#8FA99A' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  guardianBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  guardianBtnIcon: { fontSize: 14 },
  guardianBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
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
  nowEmoji: { fontSize: 80, lineHeight: 90 },
  nowInfo: { flex: 1, gap: 6 },
  nowChip: {
    alignSelf: 'flex-start', fontSize: 11, fontWeight: '800',
    letterSpacing: 0.3, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20,
  },
  nowTitle: { fontSize: 28, fontWeight: '900', lineHeight: 34 },
  nowTime:  { fontSize: 13, color: '#94A3B8', fontWeight: '600' },

  // 수행 체크
  checkRow: { flexDirection: 'row', gap: 10 },
  checkBtn: {
    flex: 1, paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  checkBtnNo: { flex: 0.6, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E2E8F0' },
  checkBtnNoText: { fontSize: 15, fontWeight: '800', color: '#94A3B8' },
  checkBtnYesText: { fontSize: 17, fontWeight: '900', color: '#fff' },
  doneBadge: {
    borderRadius: 16, borderWidth: 1.5, paddingVertical: 16, alignItems: 'center',
  },
  doneBadgeText: { fontSize: 16, fontWeight: '900' },

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
  tlRow:   { flexDirection: 'row', alignItems: 'stretch', minHeight: 84 },
  tlTrack: { width: 26, alignItems: 'center' },
  tlDot:   {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#CBD5E1', marginTop: 24,
  },
  tlLine: { flex: 1, width: 2, backgroundColor: '#E8EDF5', marginVertical: 3 },
  tlCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8FAFF', borderRadius: 16,
    marginLeft: 10, marginVertical: 5,
    paddingHorizontal: 16, paddingVertical: 18,
    gap: 12, borderWidth: 1, borderColor: '#EEF1F8',
  },
  tlTime:  { fontSize: 15, fontWeight: '800', color: '#94A3B8', width: 52 },
  tlEmoji: { fontSize: 30 },
  tlTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: '#334155' },
  nowBadge: {
    borderRadius: 20, paddingHorizontal: 11, paddingVertical: 4,
  },
  nowBadgeText: { fontSize: 12, fontWeight: '900', color: '#fff' },

  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', paddingVertical: 16 },
  tomorrowHint: { fontSize: 12, color: '#94A3B8', fontWeight: '600', marginBottom: 8 },

  // 캐치업 모달
  cuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 28 },
  cuCard: { backgroundColor: '#fff', borderRadius: 24, padding: 26, width: '100%', alignItems: 'center', gap: 6 },
  cuEmoji: { fontSize: 48, marginBottom: 4 },
  cuTitle: { fontSize: 18, fontWeight: '900', color: '#334155' },
  cuName: { fontSize: 20, fontWeight: '900', textAlign: 'center', marginVertical: 8 },
  cuBtns: { flexDirection: 'row', gap: 12, marginTop: 10, alignSelf: 'stretch' },
  cuBtn: { flex: 1, paddingVertical: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cuBtnNo: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#E2E8F0' },
  cuBtnNoText: { fontSize: 16, fontWeight: '800', color: '#94A3B8' },
  cuBtnYesText: { fontSize: 18, fontWeight: '900', color: '#fff' },

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

  achievePopupRate: { fontSize: 48, fontWeight: '900', lineHeight: 56 },

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
  achieveInline: { gap: 6, marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' },
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
