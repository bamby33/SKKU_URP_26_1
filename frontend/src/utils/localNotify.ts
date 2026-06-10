/**
 * 로컬 알림 (당사자 기기) — iOS·Android 공용
 * - 스케줄 시각에 기기에서 알림 예약 (EAS/서버 불필요)
 * - 탭하면 ScheduleScreen의 리스너가 해당 일과 확인 흐름을 띄움
 * ⚠️ 삼성 갤럭시는 배터리 최적화로 지연될 수 있음 → '배터리 최적화 제외' 권장
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const ANDROID_CHANNEL = 'schedule';
const SLEEP_KW = ['취침', '수면', '자기', '잠자기', '잠'];
const todayIdx = () => (new Date().getDay() + 6) % 7;
const stripEmoji = (t: string) =>
  t.replace(/\p{Extended_Pictographic}/gu, '').replace(/️/g, '').trim();

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

type Sched = { id: number; title: string; scheduled_time: string; days_of_week: string };

/** 오늘 남은 일과들에 대해 시각별 로컬 알림 예약 (기존 예약은 모두 갱신) */
export async function scheduleTodayNotifications(schedules: Sched[]): Promise<void> {
  const ok = await ensureNotifPermission();
  if (!ok) return;
  await Notifications.cancelAllScheduledNotificationsAsync();

  const today = todayIdx();
  const now = new Date();
  const PRE_MIN = 10; // 전환 예고: 시작 10분 전
  for (const s of schedules) {
    if (!s.days_of_week.split(',').map(Number).includes(today)) continue;
    const [h, m] = s.scheduled_time.split(':').map(Number);
    const when = new Date();
    when.setHours(h, m, 0, 0);

    const name = stripEmoji(s.title) || '일과';

    // ① 전환 예고 (10분 전) — 자폐 전환 어려움 배려, 응답 요구 없는 안내
    const preWhen = new Date(when.getTime() - PRE_MIN * 60000);
    if (preWhen.getTime() > now.getTime()) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '곧 시작이에요',
          body: `${PRE_MIN}분 뒤 ${name} 시간이에요 😊`,
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
    const sumWhen = new Date();
    sumWhen.setHours(sh, sm, 0, 0);
    sumWhen.setTime(sumWhen.getTime() - 60 * 60000); // 1시간 전
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
