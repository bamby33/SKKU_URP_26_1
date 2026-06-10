/**
 * 보호자 기기 푸시 알림 등록 유틸
 * - registerPushToken: 권한 요청 → Expo 푸시 토큰 발급 → 백엔드 저장
 *   (EAS projectId가 없으면 조용히 건너뜀 — `eas init` 후 자동 동작)
 */
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { api } from '../api/client';

// 포그라운드에서도 알림 배너 표시
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerPushToken(userId: number): Promise<void> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    const projectId =
      (Constants.expoConfig as any)?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId;
    if (!projectId) {
      console.warn('[push] EAS projectId 없음 — eas init 필요. 푸시 토큰 등록 건너뜀');
      return;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.post(`/guardian/user/${userId}/push-token`, { token: tokenData.data });
  } catch (e) {
    console.warn('[push] 토큰 등록 실패', e);
  }
}
