import axios from 'axios';

// 개발 중: 에뮬레이터에서 10.0.2.2 = 로컬호스트
const BASE_URL = 'http://10.0.2.2:8000';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
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
  api.get(`/schedules/?user_id=${userId}`);

export const checkSchedule = (scheduleId: number, achieved: boolean, note?: string) =>
  api.post('/schedules/check', { schedule_id: scheduleId, achieved, note });
