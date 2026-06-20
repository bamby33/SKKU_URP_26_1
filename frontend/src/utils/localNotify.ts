/**
 * 로컬 알림 (당사자 기기) — iOS·Android 공용
 * - 스케줄 시각에 기기에서 알림 예약 (EAS/서버 불필요)
 * - 탭하면 ScheduleScreen의 리스너가 해당 일과 확인 흐름을 띄움
 * ⚠️ 삼성 갤럭시는 배터리 최적화로 지연될 수 있음 → '배터리 최적화 제외' 권장
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ANDROID_CHANNEL = 'schedule';
const SLEEP_KW = ['취침', '수면', '자기', '잠자기', '잠'];
const todayIdx = () => (new Date().getDay() + 6) % 7;
const stripEmoji = (t: string) =>
  t.replace(/\p{Extended_Pictographic}/gu, '').replace(/️/g, '').trim();

// 화면 상태(홈/행동채팅) — 스케줄 배너 표시 여부 결정에 사용
export const notifState = { onHome: false, inBehaviorChat: false };

// 앱 포그라운드 알림 표시 정책:
// - 홈 화면: 앱이 직접 시작 팝업을 띄우므로 스케줄 배너 억제
// - 행동 채팅(1·2단계) 중: 방해 금지 → 배너 억제
// - 그 외 화면(일과수정 등): 상단 시스템 배너로 알림 (탭하면 시작)
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const type = (notification.request.content.data as any)?.type;
    const isSchedule = type === 'schedule';
    // 보호자용 알림(완료·긴급호출 등)은 보호자 역할 기기에서만 표시 — 당사자 화면엔 안 띄움
    if (type === 'guardian') {
      const role = await AsyncStorage.getItem('role');
      const show = role === 'guardian';
      return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
    }
    // 자기평가: 포그라운드면 화면으로 바로 전환하므로 배너는 띄우지 않음
    if (type === 'daily_summary') {
      return { shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };
    }
    const showSched = isSchedule && !notifState.onHome && !notifState.inBehaviorChat;
    return {
      shouldShowBanner: isSchedule ? showSched : true,
      shouldShowList: true,
      shouldPlaySound: isSchedule ? showSched : true,
      shouldSetBadge: false,
    };
  },
});

// 스케줄 시작과 ±5분 내로 겹치면 빈 시간대로 이동 (마무리/Recap이 스케줄 알림과 안 겹치게)
function quietTimeMin(targetMin: number, busyMins: number[]): number {
  const clash = (m: number) => busyMins.some(b => Math.abs(b - m) < 5);
  if (!clash(targetMin)) return targetMin;
  for (let d = 5; d <= 30; d += 5) {
    if (targetMin - d >= 0 && !clash(targetMin - d)) return targetMin - d; // 더 일찍(취침 더 전)
    if (!clash(targetMin + d)) return targetMin + d;                       // 더 늦게
  }
  return Math.max(0, targetMin - 30);
}
const startMins = (schedules: Sched[], today: number): number[] =>
  schedules
    .filter(s => s.days_of_week.split(',').map(Number).includes(today))
    .map(s => { const [h, m] = s.scheduled_time.split(':').map(Number); return h * 60 + m; });
const atMin = (min: number): Date => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setTime(d.getTime() + min * 60000); return d; };

export async function ensureNotifPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  let s = status;
  if (s !== 'granted') {
    s = (await Notifications.requestPermissionsAsync()).status;
  }
  if (s !== 'granted') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: '일과 알림',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
  return true;
}

type Sched = { id: number; title: string; scheduled_time: string; days_of_week: string; category?: string | null };

/** 보호자 기기: 취침 1시간 전 'Recap' 알림 예약 (탭하면 GuardianRecap) */
export async function scheduleGuardianRecap(schedules: Sched[]): Promise<void> {
  const ok = await ensureNotifPermission();
  if (!ok) return;
  const today = todayIdx();
  const now = new Date();
  const sleep = schedules
    .filter(s => s.days_of_week.split(',').map(Number).includes(today) && SLEEP_KW.some(k => s.title.includes(k)))
    .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))
    .pop();
  if (!sleep) return;
  const [h, m] = sleep.scheduled_time.split(':').map(Number);
  const sumMin = quietTimeMin(h * 60 + m - 60, startMins(schedules, today)); // 취침 1시간 전, 스케줄과 충돌 회피
  const when = atMin(sumMin);
  if (when.getTime() <= now.getTime()) return;

  // 기존 recap 예약 제거 (중복 방지)
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if ((n.content.data as any)?.type === 'guardian_recap') {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '오늘 하루 돌아보기',
      body: '오늘 하루를 정리하고 내일을 준비해볼까요? 😊',
      data: { type: 'guardian_recap' },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      channelId: Platform.OS === 'android' ? ANDROID_CHANNEL : undefined,
    },
  });
}

// app 요일(0=월..6=일) → 시각별 '반복' 트리거 목록.
// 매일(7요일) 이면 DAILY 1개, 특정 요일이면 요일별 WEEKLY. → 앱을 안 열어도 매일/매주 자동으로 울림.
function repeatTriggers(daysCsv: string, hour: number, minute: number): any[] {
  const ch = Platform.OS === 'android' ? ANDROID_CHANNEL : undefined;
  const days = daysCsv.split(',').map(Number).filter(d => d >= 0 && d <= 6);
  if (days.length === 0) return [];
  if (days.length >= 7) {
    return [{ type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: ch }];
  }
  return days.map(d => {
    const weekday = ((d + 1) % 7) + 1; // 0=월..6=일 → Expo weekday(1=일..7=토)
    return { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday, hour, minute, channelId: ch };
  });
}

/** 일과별 '반복' 로컬 알림 예약 (앱을 안 열어도 매일/매주 자동 발생). 호출 시 기존 예약 전체 갱신.
 * ⚠️ iOS는 예약 알림을 최대 64개만 유지(가장 빨리 울릴 순)하므로, 시작 알림을 먼저 다 잡고 예고는 남는 만큼만. */
export async function scheduleTodayNotifications(schedules: Sched[]): Promise<void> {
  const ok = await ensureNotifPermission();
  if (!ok) return;
  await Notifications.cancelAllScheduledNotificationsAsync();

  const MAX = 60; // 64 한도 여유
  type N = { content: any; trigger: any };
  const starts: N[] = [], pres: N[] = [], summary: N[] = [];

  // 아침 일과가 한도에 밀리지 않게 시각 오름차순 처리
  const sorted = [...schedules].sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
  for (const s of sorted) {
    const [h, m] = s.scheduled_time.split(':').map(Number);
    const name = stripEmoji(s.title) || '일과';
    const isFixed = s.category === 'fixed';
    const isSleepCat = s.category === 'sleep' || SLEEP_KW.some(k => s.title.includes(k));

    // 시작 알림 (필수)
    for (const trigger of repeatTriggers(s.days_of_week, h, m)) {
      starts.push({ content: { title: '일과 시간이에요', body: `${name} 시작할까요? 눌러서 확인해요`, data: { type: 'schedule', scheduleId: s.id }, sound: true }, trigger });
    }
    // 전환 예고 (여유 있을 때만) — 10분 전, fixed는 20분 전. sleep 제외, 자정 이전 넘어가면 생략
    const preMin = isFixed ? 20 : 10;
    const preTotal = h * 60 + m - preMin;
    if (!isSleepCat && preTotal >= 0) {
      for (const trigger of repeatTriggers(s.days_of_week, Math.floor(preTotal / 60), preTotal % 60)) {
        pres.push({ content: { title: '곧 시작이에요', body: isFixed ? `곧 ${name} 갈 시간이에요. 준비해볼까요? 🎒` : `${preMin}분 뒤 ${name} 시간이에요 😊`, data: { type: 'pretransition', scheduleId: s.id }, sound: false }, trigger });
      }
    }
  }

  // 하루 마무리 — 취침 1시간 전 (탭하면 DailySummary)
  const today = todayIdx();
  const sleepSched = sorted.filter(s => SLEEP_KW.some(k => s.title.includes(k))).pop();
  if (sleepSched) {
    const [sh, sm] = sleepSched.scheduled_time.split(':').map(Number);
    const sumMin = quietTimeMin(sh * 60 + sm - 60, startMins(schedules, today));
    if (sumMin >= 0) {
      for (const trigger of repeatTriggers(sleepSched.days_of_week, Math.floor(sumMin / 60), sumMin % 60)) {
        summary.push({ content: { title: '오늘 하루 어땠어요?', body: '오늘 하루를 함께 정리해볼까요? 눌러주세요 😊', data: { type: 'daily_summary' }, sound: true }, trigger });
      }
    }
  }

  // 우선순위: 시작 알림 → 마무리 → 예고. 64 한도 내에서만 예약(초과분 버림 → 시작 알림이 살아남게).
  for (const n of [...starts, ...summary, ...pres].slice(0, MAX)) {
    await Notifications.scheduleNotificationAsync({ content: n.content, trigger: n.trigger });
  }
}
