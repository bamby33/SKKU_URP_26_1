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

/** 오늘 남은 일과들에 대해 시각별 로컬 알림 예약 (기존 예약은 모두 갱신) */
export async function scheduleTodayNotifications(schedules: Sched[]): Promise<void> {
  const ok = await ensureNotifPermission();
  if (!ok) return;
  await Notifications.cancelAllScheduledNotificationsAsync();

  const today = todayIdx();
  const now = new Date();
  for (const s of schedules) {
    if (!s.days_of_week.split(',').map(Number).includes(today)) continue;
    const [h, m] = s.scheduled_time.split(':').map(Number);
    const when = new Date();
    when.setHours(h, m, 0, 0);

    const name = stripEmoji(s.title) || '일과';
    const isFixed = s.category === 'fixed';
    const isSleepCat = s.category === 'sleep' || SLEEP_KW.some(k => s.title.includes(k));

    // ① 전환 예고 — 기본 10분 전, fixed(외부기관)는 20분 전 + 준비 문구. sleep은 예고 없음
    const preMin = isFixed ? 20 : 10;
    const preWhen = new Date(when.getTime() - preMin * 60000);
    if (!isSleepCat && preWhen.getTime() > now.getTime()) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '곧 시작이에요',
          body: isFixed ? `곧 ${name} 갈 시간이에요. 준비해볼까요? 🎒` : `${preMin}분 뒤 ${name} 시간이에요 😊`,
          data: { type: 'pretransition', scheduleId: s.id },
          sound: false,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: preWhen,
          channelId: Platform.OS === 'android' ? ANDROID_CHANNEL : undefined,
        },
      });
    }

    // ② 시작 알림 (정시) — 눌러서 시작 흐름
    if (when.getTime() <= now.getTime()) continue; // 이미 지난 시각은 예약 안 함
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '일과 시간이에요',
        body: `${name} 시작할까요? 눌러서 확인해요`,
        data: { type: 'schedule', scheduleId: s.id },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
        channelId: Platform.OS === 'android' ? ANDROID_CHANNEL : undefined,
      },
    });
  }

  // ③ 하루 마무리 — 취침 1시간 전 (탭하면 DailySummary)
  const sleepSched = schedules
    .filter(s => s.days_of_week.split(',').map(Number).includes(today) && SLEEP_KW.some(k => s.title.includes(k)))
    .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))
    .pop();
  if (sleepSched) {
    const [sh, sm] = sleepSched.scheduled_time.split(':').map(Number);
    const sumMin = quietTimeMin(sh * 60 + sm - 60, startMins(schedules, today)); // 취침 1시간 전, 스케줄과 충돌 회피
    const sumWhen = atMin(sumMin);
    if (sumWhen.getTime() > now.getTime()) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '오늘 하루 어땠어요?',
          body: '오늘 하루를 함께 정리해볼까요? 눌러주세요 😊',
          data: { type: 'daily_summary' },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: sumWhen,
          channelId: Platform.OS === 'android' ? ANDROID_CHANNEL : undefined,
        },
      });
    }
  }
}
