/**
 * 사용자(당사자) 메인 화면
 * 지금 할 일 · 오늘 일과 타임라인 인라인 표시 · AI 마이크
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Animated, Easing, Alert, ActivityIndicator,
  Modal, Dimensions, Image,
} from 'react-native';
import { scheduleImage } from '../../utils/scheduleImage';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect, useIsFocused, RouteProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import * as Notifications from 'expo-notifications';
import { getSchedules, api } from '../../api/client';
import { cleanForSpeech } from '../../utils/text';
import { scheduleTodayNotifications, notifState } from '../../utils/localNotify';
import AppFrame from '../../components/AppFrame';
import WalkIcon, { isWalk } from '../../components/WalkIcon';

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
  category?: string | null; // productive | routine | fixed | sleep | rest
};

// 카테고리 헬퍼 + 장애정도별 독려 주기
const catOf = (s?: Schedule | null) => (s?.category || 'routine');
const isProductive = (s?: Schedule | null) => catOf(s) === 'productive';
const ENCOURAGE_MS = { mild: 15 * 60000, moderate: 10 * 60000, severe: 5 * 60000 };

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const SLEEP_KW   = ['취침', '수면', '자기', '잠자기', '잠'];

// 예비신호(0단계로): 차분한 거부 표현
const REFUSE_PRE = ['싫어', '싫다', '안해', '안 해', '하기 싫어', '하기 싫다', '못해', '모르겠어', '몰라', '귀찮아', '안 할래'];
// 위기신호(2단계 즉시): 격한 표현
const REFUSE_CRISIS = ['하기 싫다고', '그만해', '시끄러워', '하지 말라고', '짜증나', '저리 가'];
const isPreRefuse    = (t: string) => REFUSE_PRE.some(k => t.includes(k));
const isCrisisRefuse = (t: string) => REFUSE_CRISIS.some(k => t.includes(k));
// 감지 임계: 예비신호 → 0단계 확인 / 위기신호 → 2단계 즉시 (기기 테스트로 조정)
const DB_PRE    = 85;  // 예비신호(0단계)
const DB_CRISIS = 95;  // 위기신호(2단계)
const ZERO_TIMEOUT_MS = 6000; // 0단계 무반응 → 1단계

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
  const screenFocused = useIsFocused(); // 이 화면이 떠 있을 때만 오버레이 표시
  const bounceAnim    = useRef(new Animated.Value(0)).current;
  const drawerAnim    = useRef(new Animated.Value(DRAWER_W)).current;
  const countdownAnim = useRef(new Animated.Value(1)).current;
  const countdownRef       = useRef<Animated.CompositeAnimation | null>(null);
  const announcedRef       = useRef<Set<number>>(new Set());
  const snoozeRef          = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const encourageRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const encouragePopupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inProgStartRef     = useRef<number>(0);
  const todaySchedRef      = useRef<Schedule[]>([]);
  const recordingRef       = useRef<Audio.Recording | null>(null);
  const meterInterval      = useRef<ReturnType<typeof setInterval> | null>(null);
  const burstTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIdRef          = useRef<number | null>(null);
  const levelRef           = useRef<'mild' | 'moderate' | 'severe'>('mild'); // 장애 정도(독려 주기)
  const lastApiCallRef     = useRef<number>(0);
  const behaviorFollowupRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const achievePopupAnim   = useRef(new Animated.Value(1)).current;
  const lastTranscriptRef  = useRef<string>(''); // 감지 중 캡처한 최근 말소리(STT)
  const currentDbRef       = useRef<number>(0);  // 측정 중 최근 데시벨
  const triggeredRef       = useRef(false);      // 한 측정 세션당 1회만 전환
  const pendingRef         = useRef<Schedule | null>(null); // 떠 있는 시작 팝업
  const isFocusedRef       = useRef(true);       // 이 화면이 포커스 상태인지
  const detectCtxRef       = useRef<'transition' | 'in_activity'>('transition'); // 감지 맥락
  const currentSchedRef    = useRef<Schedule | null>(null); // 감지 당시 진행 일과
  const inProgRef          = useRef<Schedule | null>(null);  // 진행 중 일과 미러
  const zeroTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zeroSpokenRef      = useRef<{ spoken: string; trigger: string; decibel?: number }>({ spoken: '', trigger: '' });
  const zeroCooldownRef    = useRef<number>(0);
  const [zeroCheck, setZeroCheck] = useState(false); // 0단계 사전확인 표시

  // 위기 표현 → 2단계 즉시 / 예비 거부 → 0단계 확인
  useSpeechRecognitionEvent('result', e => {
    const txt = e.results?.[0]?.transcript ?? '';
    if (!txt) return;
    lastTranscriptRef.current = txt;
    if (!recordingRef.current) return;       // 측정 중일 때만 반응
    if (isCrisisRefuse(txt))   detectRef.current?.crisis(txt, 'text_crisis', currentDbRef.current >= DB_PRE ? currentDbRef.current : undefined);
    else if (isPreRefuse(txt)) detectRef.current?.pre(txt, 'text_refusal');
  });
  // 아래에서 정의되므로 ref 로 우회 참조
  const detectRef = useRef<{
    pre: (s: string, t: string, d?: number) => void;
    crisis: (s: string, t: string, d?: number) => void;
  } | null>(null);

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
  const doneIdsRef         = useRef<Set<number>>(new Set());
  const missedIdsRef       = useRef<Set<number>>(new Set());
  const [catchUp,          setCatchUp]          = useState<Schedule | null>(null);
  const catchUpSeenRef     = useRef<Set<number>>(new Set()); // 이번 세션에 캐치업 띄운 일과
  const [retryActivity,    setRetryActivity]    = useState<Schedule | null>(null); // "다시 해볼래?" 재시도 팝업
  const retryTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRetryRef   = useRef<((s: Schedule) => void) | null>(null);
  const [inProg,           setInProg]           = useState<Schedule | null>(null);  // 진행 중인 일과
  const [toast,            setToast]            = useState<string | null>(null);     // 짧은 안내 토스트
  const [encouragePopup,   setEncouragePopup]   = useState<string | null>(null);     // productive 독려 팝업(10분마다, 8초 자동소멸)

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
  // ⚠️ 단, 한낮에 일과 사이 빈 시간이 생겨도 '취침'이 잘못 뜨지 않도록
  //    오늘 첫 일과 시작 전(=실제 새벽 시간대)일 때만 carryover 적용
  const firstTodayTime = todaySchedules[0]?.scheduled_time;
  const beforeFirstTask = !firstTodayTime || nowTime < firstTodayTime;
  const inOvernight = !current && beforeFirstTask && nowTime < '12:00';
  const effectiveCurrent = current ?? (inOvernight && yLast && isSleep(yLast.title) ? yLast : null);

  // 취침 준비 이후 ~ 다음날 기상 전까지는 '취침' 상태로 채움
  const isSleepingNow = !!effectiveCurrent && isSleep(effectiveCurrent.title);

  // 현재 일과의 상태 (완료/미수행/대기) — 방법 1: 상태에 따라 카드 모양만 변경
  const curDone   = !!effectiveCurrent && doneIds.has(effectiveCurrent.id);
  const curMissed = !!effectiveCurrent && !curDone && missedIds.has(effectiveCurrent.id);

  // 캐치업 후보: 10분 이상 지났는데 미확인 (10분 이내면 '늦음' 아님 → 정상 시작 팝업으로)
  const minsLate = (hhmm: string) => {
    const [nh, nm] = nowTime.split(':').map(Number);
    const [h, m] = hhmm.split(':').map(Number);
    return (nh * 60 + nm) - (h * 60 + m);
  };
  const catchUpCandidates = todaySchedules.filter(s =>
    !isSleepingNow &&
    minsLate(s.scheduled_time) >= 10 &&
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
    clearEncouragePopup();
    setPending(null);
    setInProg(null);
    setToast(null);
  };
  // 문제행동 채팅으로 갈 때: 진행 중 일과는 유지 (돌아와서 이어서 완료 가능)
  const pauseFlows = () => {
    if (startTimerRef.current) { clearTimeout(startTimerRef.current); startTimerRef.current = null; }
    if (encourageRef.current) { clearInterval(encourageRef.current); encourageRef.current = null; }
    if (toastTimerRef.current) { clearTimeout(toastTimerRef.current); toastTimerRef.current = null; }
    clearEncouragePopup();
    setPending(null);
    setToast(null);
    // inProg 는 유지!
  };

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  };

  // productive 독려 팝업 — 떴다가 8초 뒤 자동으로 사라짐
  const showEncourage = (msg: string) => {
    setEncouragePopup(msg);
    if (encouragePopupTimerRef.current) clearTimeout(encouragePopupTimerRef.current);
    encouragePopupTimerRef.current = setTimeout(() => setEncouragePopup(null), 8000);
  };
  const clearEncouragePopup = () => {
    if (encouragePopupTimerRef.current) { clearTimeout(encouragePopupTimerRef.current); encouragePopupTimerRef.current = null; }
    setEncouragePopup(null);
  };

  // 시작 알림 — '시작할게요 / 조금있다가요' 모달 + 8초 무반응 → no_response
  const announce = (s: Schedule) => {
    detectCtxRef.current = 'transition'; // 시작/전환 시점 감지
    currentSchedRef.current = s;
    if (catOf(s) !== 'sleep') startMeterting(); // sleep 제외 — 0단계/감지 안 함
    Speech.speak(`${cleanForSpeech(s.title)} 시간이에요! 지금 시작할까요?`, { language: 'ko-KR' });
    setPending(s);
    countdownAnim.setValue(1); // 시간 제한 없음 — 응답할 때까지 계속 표시
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
      // 조금 있다가요(나중에) / 무응답 → 강요 X, 잠시 뒤 "다시 해볼까요?" 재시도
      Speech.speak('괜찮아요. 잠시 뒤에 다시 물어볼게요.', { language: 'ko-KR' });
      stopMetering();
      currentSchedRef.current = null;
      scheduleRetryRef.current?.(s);
    }
  };

  // 진행 중 시작 — 독려 토스트는 productive 일과에서만, 장애정도별 주기
  const beginInProgress = (s: Schedule) => {
    setInProg(s);
    inProgRef.current = s;
    detectCtxRef.current = 'in_activity'; // 수행 중 감지로 전환
    currentSchedRef.current = s;
    if (catOf(s) !== 'sleep') startMeterting(); // sleep 제외, 진행 동안 측정
    inProgStartRef.current = Date.now();
    Speech.speak(`${cleanForSpeech(s.title)} 시작해요! 잘 할 수 있어요.`, { language: 'ko-KR' });
    if (encourageRef.current) { clearInterval(encourageRef.current); encourageRef.current = null; }
    if (isProductive(s)) { // 독려는 성취 활동(productive)에서만, 10분마다 팝업(8초 자동소멸)
      const interval = 10 * 60 * 1000;
      encourageRef.current = setInterval(() => {
        showEncourage(ENCOURAGES[Math.floor(Date.now() / interval) % ENCOURAGES.length]);
      }, interval);
    }
  };

  // ── 휴식 후 재시도 ("다시 해볼래?" 5분 뒤) ──
  const RETRY_MS = 30 * 1000; // 테스트용 30초 (실제: 5 * 60 * 1000)
  const scheduleRetry = (s: Schedule) => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      if (doneIdsRef.current.has(s.id) || missedIdsRef.current.has(s.id)) return; // 이미 처리됨
      setRetryActivity(s);
    }, RETRY_MS);
  };
  scheduleRetryRef.current = scheduleRetry;

  const handleRetry = async (yes: boolean) => {
    const s = retryActivity;
    setRetryActivity(null);
    if (!s) return;
    if (yes) {
      beginInProgress(s); // 다시 진행
    } else {
      // 아니요 → 미달성 표기 + 부드러운 마무리 (강요 X)
      setMissedIds(prev => new Set(prev).add(s.id));
      Speech.speak('괜찮아요. 다음에 또 같이 해봐요.', { language: 'ko-KR' });
      showToast('괜찮아요. 다음에 또 같이 해봐요 😊');
      const id = userIdRef.current;
      try {
        await api.post('/schedules/check', { schedule_id: s.id, achieved: false });
        if (id) await refreshReport(id);
      } catch {}
    }
  };

  // 종료 — completed=true('다 했어요') / false('그만할래요'). 둘 다 진행시간 기록, 아이에겐 긍정 피드백.
  const handleStop = async (completed: boolean) => {
    const s = inProg;
    if (!s) return;
    if (encourageRef.current) { clearInterval(encourageRef.current); encourageRef.current = null; }
    clearEncouragePopup();
    stopMetering(); // 일과 종료 → 감지 종료
    inProgRef.current = null;
    currentSchedRef.current = null;
    const mins = Math.max(0, Math.round((Date.now() - inProgStartRef.current) / 60000));
    setInProg(null);
    setToast(null);
    setDoneIds(prev => new Set(prev).add(s.id));
    const id = userIdRef.current;
    // 전환 지연(Phase 3): 완료 시에만 측정 = 지금 시각 − 다음 일과 시작 시각(분). 음수=원활, 양수=지연
    let transition_delay_min: number | undefined;
    let next_schedule_id: number | undefined;
    if (completed) {
      const next = todaySchedRef.current
        .filter(x => x.id !== s.id && x.scheduled_time > s.scheduled_time)
        .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))[0];
      if (next) {
        const d = new Date();
        const nowMin = d.getHours() * 60 + d.getMinutes();
        const [nh, nm] = next.scheduled_time.split(':').map(Number);
        transition_delay_min = nowMin - (nh * 60 + nm);
        next_schedule_id = next.id;
      }
    }
    try {
      // 다 했어요 → 완료, 그만할래요 → 중도 종료(early_stop)
      await api.post(`/schedules/${s.id}/stop`, {
        achieved: true, early_stop: !completed, duration_min: mins,
        transition_delay_min, next_schedule_id,
      });
      if (id) await refreshReport(id);
    } catch {}
    if (completed) {
      if (isProductive(s)) {
        // productive만 칭찬 + 보호자에게 완료 알림
        Speech.speak('끝까지 잘했어요! 정말 멋져요.', { language: 'ko-KR' });
        if (id) api.post(`/guardian/user/${id}/notify-done`, { schedule_id: s.id }).catch(() => {});
      } else {
        Speech.speak('다 했네요. 수고했어요 😊', { language: 'ko-KR' }); // 그 외는 칭찬·보호자알림 X
      }
      // 초과로 밀려 대기하던 다음 일과를 순차 안내
      setTimeout(() => {
        const now = nowHHMM();
        const next = todaySchedRef.current.find(x =>
          x.id !== s.id && x.scheduled_time <= now &&
          !announcedRef.current.has(x.id) && !doneIds.has(x.id) && !missedIds.has(x.id));
        if (next) { announcedRef.current.add(next.id); announce(next); }
      }, 2500);
    } else {
      // 중도포기 → 왜 그만뒀는지 AIChat에서 물어봄 (AIChat이 질문을 말함)
      navigation.navigate('AIChat', { reasonAsk: { scheduleId: s.id, title: s.title, kind: 'gaveup' } });
    }
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

  // 보호자 연락 (긴급 호출)
  const handleGuardianCall = () => {
    const uid = userIdRef.current;
    if (uid) api.post(`/guardian/user/${uid}/emergency`).catch(() => {});
    Alert.alert('보호자 연락', '보호자에게 알림을 보냈어요.');
  };

  // 로컬 알림(배너) 탭 → 홈으로 이동 후 시작 팝업 (어느 화면에 있든 동작)
  useEffect(() => {
    const handle = (data: any) => {
      if (data?.type === 'schedule' && data.scheduleId) {
        navigation.navigate('Schedule', { announceScheduleId: Number(data.scheduleId) });
      } else if (data?.type === 'daily_summary') {
        navigation.navigate('DailySummary');
      }
    };
    const sub = Notifications.addNotificationResponseReceivedListener(resp => {
      handle(resp.notification.request.content.data);
    });
    // 앱 사용 중(포그라운드)에 자기평가 시각이 오면 알림 대신 바로 평가 화면으로
    const subRecv = Notifications.addNotificationReceivedListener(notif => {
      if (notif.request.content.data?.type === 'daily_summary') navigation.navigate('DailySummary');
    });
    // 앱이 꺼진 상태에서 알림 탭으로 켜진 경우(콜드스타트) 마지막 응답 처리
    Notifications.getLastNotificationResponseAsync().then(resp => {
      if (resp) handle(resp.notification.request.content.data);
    }).catch(() => {});
    return () => { sub.remove(); subRecv.remove(); };
  }, []);

  // 배너 탭/홈 복귀로 받은 announceScheduleId → 시작 팝업
  useEffect(() => {
    const sid = route.params?.announceScheduleId;
    if (sid == null) return;
    navigation.setParams({ announceScheduleId: undefined });
    const s = todaySchedRef.current.find(x => x.id === sid);
    // 명시적 재안내(배너 탭/거절 후 복귀) → 이미 안내됐어도 다시 띄움 (완료된 건 제외)
    if (s && !doneIds.has(s.id)) {
      announcedRef.current.add(s.id);
      announce(s);
    }
  }, [route.params?.announceScheduleId]);

  // 홈 포커스 여부를 알림 핸들러에 공유 (스케줄 배너 표시 판단)
  useEffect(() => { notifState.onHome = screenFocused; }, [screenFocused]);

  // 캐치업 후보가 있으면 하나씩 물어봄. 단, 이번 세션에 이미 보여준 건 다시 안 띄움
  // (홈에 돌아올 때마다 같은 팝업이 반복되던 문제 방지)
  useEffect(() => {
    if (loading || catchUp) return;
    const next = catchUpCandidates.find(s => !catchUpSeenRef.current.has(s.id));
    if (next) { catchUpSeenRef.current.add(next.id); setCatchUp(next); }
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

  // 휴식(쉬고 싶어요/도와주세요 마침) → 진행 해제 + 5분 뒤 "다시 해볼래?" 예약
  useEffect(() => {
    if (!route.params?.restWithRetry) return;
    navigation.setParams({ restWithRetry: undefined });
    const s = inProgRef.current || currentSchedRef.current; // 진행 중 일과(없으면 문제행동 일과)
    inProgRef.current = null;
    currentSchedRef.current = null;
    setInProg(null);
    if (encourageRef.current) { clearInterval(encourageRef.current); encourageRef.current = null; }
    stopMetering();
    if (s && !doneIds.has(s.id)) scheduleRetryRef.current?.(s); // 5분 뒤 재시도 예약
  }, [route.params?.restWithRetry]);

  // pending(시작 팝업) 미러 — STT 핸들러 등 ref 접근용
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  useEffect(() => { doneIdsRef.current = doneIds; }, [doneIds]);
  useEffect(() => { missedIdsRef.current = missedIds; }, [missedIds]);

  // 인터벌 — 시간 도래 시 시작 팝업. 단, 이 화면이 포커스일 때만 (다른 화면 위에 안 뜨게)
  useEffect(() => {
    const iv = setInterval(() => {
      if (!isFocusedRef.current) return;
      if (inProgRef.current || pendingRef.current) return; // 진행 중/시작 팝업 중이면 다음 일과 알림 보류(초과 대기)
      const t = nowHHMM();
      const due = todaySchedRef.current.find(s => s.scheduled_time === t
        && !announcedRef.current.has(s.id)
        && !doneIdsRef.current.has(s.id) && !missedIdsRef.current.has(s.id)); // 완료/미완료는 안내 안 함
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
        // 장애 정도 (독려 주기 결정) — 실패해도 기본 mild
        api.get(`/users/${id}`).then(r => {
          const lv = String(r.data?.disability_level || 'mild').toLowerCase();
          levelRef.current = (lv === 'moderate' || lv === 'severe') ? lv : 'mild';
        }).catch(() => {});
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
  // ── 문제행동 감지 → 전환 (위기 즉시 / 예비 → 0단계 확인) ──
  const logBehavior = (stage: 'stage_1' | 'stage_2', trigger: string, decibel?: number) => {
    const uid = userIdRef.current;
    if (uid) api.post(`/chat/log-behavior/${uid}`, {
      stage, trigger, decibel,
      schedule_id: currentSchedRef.current?.id ?? undefined,
      context: detectCtxRef.current,
    }).catch(() => {});
  };

  const triggerCrisis = (spoken: string, trigger: string, decibel?: number) => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    if (zeroTimerRef.current) { clearTimeout(zeroTimerRef.current); zeroTimerRef.current = null; }
    setZeroCheck(false);
    pauseFlows(); // 진행 중 일과 유지 → 돌아와서 이어서 완료
    navigation.navigate('AIChat', { behaviorAlert: true, spokenText: spoken || undefined });
    stopMetering();
    logBehavior('stage_2', trigger, decibel);
  };

  const escalateStage1 = () => {
    const z = zeroSpokenRef.current;
    if (zeroTimerRef.current) { clearTimeout(zeroTimerRef.current); zeroTimerRef.current = null; }
    setZeroCheck(false);
    pauseFlows(); // 진행 중 일과 유지 → 돌아와서 이어서 완료
    navigation.navigate('AIChat', { behaviorStage1: true, spokenText: z.spoken || undefined });
    stopMetering();
    logBehavior('stage_1', z.trigger, z.decibel);
  };

  const triggerPre = (spoken: string, trigger: string, decibel?: number) => {
    if (triggeredRef.current) return;
    // 시작 팝업이 떠 있으면 → 그 일과를 '거절'로 (사유 묻기)
    if (pendingRef.current) {
      triggeredRef.current = true;
      stopMetering();
      handleStartResp(pendingRef.current, 'later');
      return;
    }
    if (Date.now() < zeroCooldownRef.current) return; // 0단계 ✓ 직후 쿨다운
    triggeredRef.current = true;
    zeroSpokenRef.current = { spoken, trigger, decibel };
    setZeroCheck(true);
    Speech.speak('잘 하고 있어요?', { language: 'ko-KR' });
    if (zeroTimerRef.current) clearTimeout(zeroTimerRef.current);
    zeroTimerRef.current = setTimeout(escalateStage1, ZERO_TIMEOUT_MS); // 무반응 → 1단계
  };

  const zeroOK = () => {  // ✓ 괜찮음 → 복귀
    if (zeroTimerRef.current) { clearTimeout(zeroTimerRef.current); zeroTimerRef.current = null; }
    setZeroCheck(false);
    triggeredRef.current = false;                 // 다시 감지 가능
    zeroCooldownRef.current = Date.now() + 60000;  // 60초 쿨다운
  };
  const zeroNo = () => escalateStage1();            // ✗ 힘듦 → 1단계

  detectRef.current = { pre: triggerPre, crisis: triggerCrisis };

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
      triggeredRef.current = false; // 새 측정 세션 시작 → 전환 가드 리셋

      // 말소리(STT)도 함께 캡처 — 큰 소리 순간의 실제 단어를 백엔드 판정에 사용
      try {
        const sp = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (sp.granted) {
          lastTranscriptRef.current = '';
          ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: true, continuous: true });
        }
      } catch {}

      // 일과 진행 동안 계속 측정 (handleStop/거절 시 종료). 1분 자동종료 폐지.
      meterInterval.current = setInterval(async () => {
        const s = await recording.getStatusAsync();
        if (!s.isRecording) return;
        const approxDB = (s.metering ?? -160) + 100;
        currentDbRef.current = approxDB;
        if (approxDB >= DB_CRISIS) {        // 위기 → 2단계 즉시
          triggerCrisis(lastTranscriptRef.current, 'voice_decibel', approxDB);
        } else if (approxDB >= DB_PRE) {    // 예비 → 0단계 확인
          triggerPre(lastTranscriptRef.current, 'voice_decibel', approxDB);
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
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
  };

  // 언마운트 시 정리
  useEffect(() => {
    return () => { stopMetering(); clearFlows(); };
  }, []);

  useFocusEffect(useCallback(() => {
    isFocusedRef.current = true;
    // 진행 중 일과가 있으면 오버레이 복원 + 감지 재개 (다른 화면 다녀온 경우)
    if (inProgRef.current) setInProg(prev => prev || inProgRef.current);
    if (inProgRef.current && !recordingRef.current) startMeterting();
    const uid = userIdRef.current;
    if (uid) {
      api.get(`/notifications/user/${uid}/unread`)
        .then(r => setNotifications(r.data))
        .catch(() => {});
      refreshReport(uid).catch(() => {});
    }
    return () => { isFocusedRef.current = false; stopMetering(); }; // 화면 떠나면 마이크 정리
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
    <AppFrame navigation={navigation} active="home" role="user">
     <View style={styles.root}>

      {/* ─── 상단 고정 영역 ─── (Routy 헤더는 AppFrame에서 제공) */}
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
          // 진행 중인 일과가 있으면(시간이 지나 current가 바뀌어도) 그 일과를 카드에 우선 표시 → 버튼 유지
          const inProgActive = !!inProg && !doneIds.has(inProg.id) && !missedIds.has(inProg.id) && !isSleepingNow;
          const showInlineBtns = inProgActive;
          const cardSched = showInlineBtns ? inProg : effectiveCurrent;
          const dCur = !showInlineBtns && curDone;
          const mCur = !showInlineBtns && curMissed;
          const accent = showInlineBtns ? theme : isSleepingNow ? theme : dCur ? DONE_C : mCur ? MISS_C : theme;
          const chipText = isSleepingNow ? '취침' : dCur ? '완료' : mCur ? '괜찮아요' : '지금 할 일';
          return (
            <View style={[
              styles.nowCard,
              dCur && { borderWidth: 2, borderColor: DONE_C },
              mCur && { borderWidth: 2, borderColor: MISS_C },
            ]}>
              <View style={styles.nowCardRow}>
                {!isSleepingNow && cardSched && isWalk(cardSched.title) ? (
                  <WalkIcon size={84} animated />
                ) : scheduleImage(cardSched?.title) ? (
                  <Image source={scheduleImage(cardSched?.title)!} style={styles.nowImg} />
                ) : (
                  <Animated.Text style={[styles.nowEmoji, { transform: [{ translateY: bounceAnim }] }]}>
                    {isSleepingNow ? '😴' : (cardSched ? parseTitle(cardSched.title).emoji : '📋')}
                  </Animated.Text>
                )}
                <View style={styles.nowInfo}>
                  <Text style={[styles.nowChip, { color: accent, backgroundColor: accent + '18' }]}>
                    {showInlineBtns ? '진행 중' : chipText}
                  </Text>
                  <Text style={[styles.nowTitle, { color: '#1E293B' }]} numberOfLines={2}>
                    {isSleepingNow ? '취침 시간이에요' : (cardSched ? parseTitle(cardSched.title).name : '일과를 확인 중이에요')}
                  </Text>
                  {isSleepingNow ? (
                    <Text style={styles.nowTime}>내일 아침까지 푹 쉬세요 🌙</Text>
                  ) : showInlineBtns ? (
                    <Text style={[styles.nowTime, { color: theme, fontWeight: '700' }]}>지금 하고 있어요 👍</Text>
                  ) : dCur ? (
                    <Text style={[styles.nowTime, { color: DONE_C, fontWeight: '800' }]}>✓ 완료했어요! 잘했어요</Text>
                  ) : mCur ? (
                    <Text style={[styles.nowTime, { color: MISS_C, fontWeight: '800' }]}>다음에 또 같이 해봐요 😊</Text>
                  ) : cardSched?.scheduled_time ? (
                    <Text style={styles.nowTime}>{cardSched.scheduled_time}</Text>
                  ) : null}
                </View>
              </View>
              {showInlineBtns && (
                <View style={styles.nowBtnRow}>
                  <TouchableOpacity style={styles.nowStopBtn} activeOpacity={0.85} onPress={() => handleStop(false)}>
                    <Text style={styles.nowStopText}>그만할래요</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.nowDoneBtn, { backgroundColor: theme }]} activeOpacity={0.85} onPress={() => handleStop(true)}>
                    <Text style={styles.nowDoneText}>다 했어요</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })()}

        {/* 취침 시간엔 하루 평가 진입 버튼 상시 노출 (알림 놓쳐도 진입 가능) */}
        {isSleepingNow && (
          <TouchableOpacity style={[styles.assessBtn, { borderColor: theme }]} activeOpacity={0.85}
            onPress={() => navigation.navigate('DailySummary')}>
            <Text style={[styles.assessBtnText, { color: theme }]}>오늘 하루 평가하기 →</Text>
          </TouchableOpacity>
        )}

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
                const sDone   = doneIds.has(s.id);
                const sMissed = missedIds.has(s.id);
                // '진행 중'은 완료/미완료가 아닐 때만 (완료된 걸 진행 중으로 표시하던 모순 방지)
                const isCurrent = !isSleepingNow && effectiveCurrent?.id === s.id && !sDone && !sMissed;
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
                      isCurrent && { borderColor: theme + '66', borderWidth: 1.5 },
                    ]}>
                      <Text style={styles.tlTime}>{s.scheduled_time}</Text>
                      {isWalk(s.title) ? <WalkIcon size={30} />
                        : scheduleImage(s.title) ? <Image source={scheduleImage(s.title)!} style={styles.tlImg} />
                        : <Text style={styles.tlEmoji}>{sEmoji}</Text>}
                      <Text style={[styles.tlTitle, isCurrent && { color: '#1E293B', fontWeight: '900' }]}
                        numberOfLines={1}>
                        {sName}
                      </Text>
                      {isCurrent && <Text style={styles.nowLabel}>진행 중</Text>}
                      {sDone && <Text style={[styles.nowLabel, { color: '#2D9D63' }]}>완료</Text>}
                      {sMissed && <Text style={[styles.nowLabel, { color: '#8C9BB0' }]}>괜찮아요</Text>}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

        </View>

      </View>

      {/* ====== 시작 알림 모달 (시작할게요 / 조금있다가요) ====== */}
      <Modal visible={!!pending && screenFocused} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.notifyBg}>
          <View style={styles.notifyCard}>
            {scheduleImage(pending?.title)
              ? <Image source={scheduleImage(pending?.title)!} style={styles.notifyImg} />
              : <Text style={styles.notifyEmoji}>{pending ? getEmoji(pending.title) : '📋'}</Text>}
            <Text style={styles.notifyTime}>{pending?.scheduled_time}</Text>
            <Text style={[styles.notifyTitle, { color: theme }]}>{pending ? parseTitle(pending.title).name : ''}</Text>
            <Text style={styles.notifyMsg}>지금 시작할까요? 😊</Text>
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

      {/* ====== 0단계 예비신호 확인 (부정언어·dB 감지 시에만) ====== */}
      <Modal visible={zeroCheck && screenFocused} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.notifyBg}>
          <View style={styles.notifyCard}>
            <Text style={styles.notifyEmoji}>😊</Text>
            <Text style={[styles.notifyTitle, { color: theme }]}>잘 하고 있어요?</Text>
            <Text style={styles.notifyMsg}>지금 어때요?</Text>
            <View style={styles.notifyRow}>
              <TouchableOpacity style={styles.notifyLater} activeOpacity={0.85} onPress={zeroNo}>
                <Text style={styles.notifyLaterText}>조금 힘들어요</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.notifyOk, { backgroundColor: theme }]} activeOpacity={0.85} onPress={zeroOK}>
                <Text style={styles.notifyOkText}>네, 괜찮아요</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ====== 독려 팝업 (productive, 10분마다 · 8초 자동소멸) ====== */}
      <Modal visible={!!encouragePopup && screenFocused} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.notifyBg}>
          <View style={styles.notifyCard}>
            <Animated.Text style={[styles.notifyEmoji, { transform: [{ translateY: bounceAnim }] }]}>🎉</Animated.Text>
            <Text style={[styles.notifyTitle, { color: theme }]}>{encouragePopup}</Text>
            <Text style={styles.notifyMsg}>지금처럼만 하면 돼요 😊</Text>
          </View>
        </View>
      </Modal>

      {/* ====== 재시도 팝업 ("다시 해볼래?") ====== */}
      <Modal visible={!!retryActivity && screenFocused} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.notifyBg}>
          <View style={styles.notifyCard}>
            {scheduleImage(retryActivity?.title)
              ? <Image source={scheduleImage(retryActivity?.title)!} style={styles.notifyImg} />
              : <Text style={styles.notifyEmoji}>{retryActivity ? getEmoji(retryActivity.title) : '📋'}</Text>}
            <Text style={[styles.notifyTitle, { color: theme }]}>{retryActivity ? parseTitle(retryActivity.title).name : ''}</Text>
            <Text style={styles.notifyMsg}>다시 해볼까요? 😊</Text>
            <View style={styles.notifyRow}>
              <TouchableOpacity style={styles.notifyLater} activeOpacity={0.85} onPress={() => handleRetry(false)}>
                <Text style={styles.notifyLaterText}>아니요</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.notifyOk, { backgroundColor: theme }]} activeOpacity={0.85} onPress={() => handleRetry(true)}>
                <Text style={styles.notifyOkText}>네, 해볼게요</Text>
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

      {/* 캐치업: 놓친 이전 일과 확인 */}
      <Modal visible={!!catchUp} transparent animationType="fade">
        <View style={styles.cuOverlay}>
          <View style={styles.cuCard}>
            {scheduleImage(catchUp?.title)
              ? <Image source={scheduleImage(catchUp?.title)!} style={styles.cuImg} />
              : <Text style={styles.cuEmoji}>{catchUp ? getEmoji(catchUp.title) : '📋'}</Text>}
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

      {/* ====== 짧은 안내 토스트 (하단, 비차단) ====== */}
      {toast && (
        <View style={styles.toastWrap} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

     </View>
    </AppFrame>
  );
}

// ── 스타일 ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },

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
    shadowColor: '#0A1F6B', shadowOpacity: 0.07,
    shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 4,
  },
  nowCardRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  nowBtnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  nowStopBtn: {
    flex: 0.65, paddingVertical: 15, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  nowStopText: { fontSize: 15, fontWeight: '800', color: '#94A3B8' },
  nowDoneBtn: {
    flex: 1, paddingVertical: 15, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  nowDoneText: { fontSize: 17, fontWeight: '900', color: '#fff' },
  nowEmoji: { fontSize: 80, lineHeight: 90 },
  nowImg: { width: 112, height: 112, resizeMode: 'cover', borderRadius: 22 },
  assessBtn: { borderWidth: 2, borderRadius: 18, paddingVertical: 16, alignItems: 'center', backgroundColor: '#fff' },
  assessBtnText: { fontSize: 16, fontWeight: '900' },
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
  tlImg: { width: 38, height: 38, resizeMode: 'cover', borderRadius: 9 },
  tlTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: '#334155' },
  nowBadge: {
    borderRadius: 20, paddingHorizontal: 11, paddingVertical: 4,
  },
  nowBadgeText: { fontSize: 12, fontWeight: '900', color: '#fff' },
  nowLabel: { fontSize: 12, fontWeight: '800', color: '#94A3B8' },

  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', paddingVertical: 16 },
  tomorrowHint: { fontSize: 12, color: '#94A3B8', fontWeight: '600', marginBottom: 8 },

  // 캐치업 모달
  cuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 28 },
  cuCard: { backgroundColor: '#fff', borderRadius: 24, padding: 26, width: '100%', alignItems: 'center', gap: 6 },
  cuEmoji: { fontSize: 48, marginBottom: 4 },
  cuImg: { width: 96, height: 96, resizeMode: 'cover', borderRadius: 20, marginBottom: 6 },
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
    flex: 1, backgroundColor: 'rgba(15,23,42,0.62)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28,
  },
  notifyCard: {
    backgroundColor: '#fff', borderRadius: 32,
    paddingVertical: 34, paddingHorizontal: 28,
    alignItems: 'center', width: '100%', gap: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: '#0B1220', shadowOpacity: 0.35,
    shadowRadius: 34, shadowOffset: { width: 0, height: 16 }, elevation: 24,
  },
  notifyEmoji: { fontSize: 64, lineHeight: 74, marginBottom: 4 },
  notifyImg: { width: 128, height: 128, resizeMode: 'cover', borderRadius: 24, marginBottom: 8 },
  notifyTime:  { fontSize: 13, color: '#94A3B8', fontWeight: '800', letterSpacing: 0.6 },
  notifyTitle: { fontSize: 25, fontWeight: '900', textAlign: 'center', letterSpacing: -0.5, marginTop: 2 },
  notifyMsg:   { fontSize: 15.5, color: '#64748B', fontWeight: '600', textAlign: 'center', lineHeight: 23, marginTop: 4 },
  notifyRow:   { flexDirection: 'row', gap: 11, marginTop: 22, width: '100%' },
  notifyOk: {
    flex: 1.3, borderRadius: 22, paddingVertical: 17, alignItems: 'center',
    shadowColor: '#0B1220', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 6,
  },
  notifyOkText:    { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: -0.2 },
  notifyLater:     { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 22, paddingVertical: 17, alignItems: 'center' },
  notifyLaterText: { color: '#64748B', fontWeight: '800', fontSize: 15 },
  notifyMissed:    { width: '100%', backgroundColor: '#FEF2F2', borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  notifyMissedText: { color: '#DC2626', fontWeight: '700', fontSize: 15 },

  achievePopupRate: { fontSize: 48, fontWeight: '900', lineHeight: 56 },

  // 하단 안내 토스트
  toastWrap: {
    position: 'absolute', left: 24, right: 24, bottom: 40,
    backgroundColor: 'rgba(15,23,42,0.92)', borderRadius: 18,
    paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center',
  },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },

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
