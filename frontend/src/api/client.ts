import axios from 'axios';

// Android 에뮬레이터: 10.0.2.2 / 실제 iPhone: 10.5.5.72
const DEV_MODE: 'emulator' | 'iphone' = 'emulator';
const BASE_URL = DEV_MODE === 'iphone' ? 'http://10.5.5.72:8000' : 'http://10.0.2.2:8000';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

// 채팅 API
export const sendChat = (userId: number, message: string, context?: object) =>
  api.post('/chat/', { user_id: userId, message, context });

export const getChatHistory = (userId: number, limit = 20) =>
  api.get(`/chat/history/${userId}?limit=${limit}`);

// 사용자 API
export const getUser = (userId: number) =>
  api.get(`/users/${userId}`);

// 스케줄 API
export const getSchedules = (userId: number) =>
  api.get(`/schedules/user/${userId}`);

export const checkSchedule = (scheduleId: number, achieved: boolean, note?: string) =>
  api.post('/schedules/check', { schedule_id: scheduleId, achieved, note });
