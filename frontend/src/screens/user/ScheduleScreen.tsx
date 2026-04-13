/**
 * 화면 1 · 사용자(당사자)
 * 실시간 스케줄 공지 + AI 채팅 연동 + 일주일 스케줄 표
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Animated, Easing, Alert, ActivityIndicator,
  TextInput, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { sendChat, getChatHistory, getSchedules } from '../../api/client';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Schedule'>;
};

type Schedule = {
  id: number;
  title: string;
  scheduled_time: string;
  days_of_week: string;
};

type ChatMessage = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
};

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const MEAL_KEYWORDS = ['밥 먹을 시간', '식사 시간', '밥 먹자', '식사해요', '식사할', '아침', '점심', '저녁'];

function isMealAlert(text: string): boolean {
  return MEAL_KEYWORDS.some(kw => text.includes(kw));
}

function getTodayIndex(): number {
  return (new Date().getDay() + 6) % 7;
}

export default function ScheduleScreen({ navigation }: Props) {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  const [userId, setUserId] = useState<number | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const nowTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const timeStr = `${hour < 12 ? '오전' : '오후'} ${hour <= 12 ? hour : hour - 12}:${String(minute).padStart(2, '0')}`;

  const todayIndex = getTodayIndex();
  const todaySchedules = schedules
    .filter(s => s.days_of_week.split(',').map(Number).includes(todayIndex))
    .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));

  const currentSchedule = [...todaySchedules].reverse().find(s => s.scheduled_time <= nowTime);
  const nextSchedule = todaySchedules.find(s => s.scheduled_time > nowTime);

  // 일주일 그리드
  const times = [...new Set(schedules.map(s => s.scheduled_time))].sort();
  const grid: Record<string, Record<number, Schedule>> = {};
  for (const s of schedules) {
    const days = s.days_of_week.split(',').map(Number);
    for (const day of days) {
      if (!grid[s.scheduled_time]) grid[s.scheduled_time] = {};
      grid[s.scheduled_time][day] = s;
    }
  }

  // 마지막 AI 메시지가 식사 알림이면 버튼 표시
  const lastAiMsg = [...messages].reverse().find(m => m.role === 'assistant');
  const showActionButtons = lastAiMsg ? isMealAlert(lastAiMsg.content) : false;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -10, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('user_id');
        if (!stored) return;
        const id = Number(stored);
        setUserId(id);

        // 스케줄 + 채팅 기록 병렬 로드
        const [scheduleRes, historyRes] = await Promise.all([
          getSchedules(id),
          getChatHistory(id, 20),
        ]);
        setSchedules(scheduleRes.data);
        setMessages(historyRes.data.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        })));
      } catch (e) {
        console.warn('초기 로드 실패', e);
      } finally {
        setScheduleLoading(false);
      }
    })();
  }, []);

  // 메시지 추가 시 스크롤 아래로
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !userId || aiLoading) return;

    const userMsg: ChatMessage = { id: Date.now(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setAiLoading(true);

    try {
      const res = await sendChat(userId, text);
      const reply = res.data.reply;
      if (reply) {
        setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: reply }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        content: '죄송해요, 잠시 후 다시 시도해 주세요 😢',
      }]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('로그아웃', '로그아웃 할까요?', [
      { text: '아니요', style: 'cancel' },
      {
        text: '네',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.clear();
          navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더: 다음 일과 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.nextLabel}>다음 일과</Text>
          <Text style={styles.nextText}>
            {nextSchedule ? `${nextSchedule.scheduled_time} ${nextSchedule.title}` : '오늘 일과 없음'}
          </Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.75}>
          <Text style={styles.logoutText}>🚪 나가기</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* 시간 배지 */}
          <View style={styles.timeBadge}>
            <Text style={styles.timeBadgeText}>⏰ {timeStr}</Text>
          </View>

          {/* 현재 일과 이모지 */}
          <Animated.Text style={[styles.emojiBig, { transform: [{ translateY: bounceAnim }] }]}>
            🍚
          </Animated.Text>

          {/* 현재 일과 안내 */}
          <View style={styles.currentCard}>
            <Text style={styles.currentLabel}>지금 할 일이에요!</Text>
            <Text style={styles.currentTitle}>{currentSchedule?.title ?? '일과를 확인 중이에요'}</Text>
            <Text style={styles.currentTime}>{currentSchedule?.scheduled_time ?? ''}</Text>
          </View>

          {/* AI 채팅 메시지 */}
          <View style={styles.chatSection}>
            {messages.length === 0 && !aiLoading && (
              <View style={styles.chatBubbleRow}>
                <Text style={styles.chatAvatar}>🤖</Text>
                <View style={styles.chatBubble}>
                  <Text style={styles.chatText}>안녕하세요! 무엇이든 물어보세요 😊</Text>
                </View>
              </View>
            )}
            {messages.map(msg => (
              <View
                key={msg.id}
                style={[styles.chatBubbleRow, msg.role === 'user' && styles.chatBubbleRowUser]}
              >
                {msg.role === 'assistant' && <Text style={styles.chatAvatar}>🤖</Text>}
                <View style={[styles.chatBubble, msg.role === 'user' && styles.chatBubbleUser]}>
                  <Text style={[styles.chatText, msg.role === 'user' && styles.chatTextUser]}>
                    {msg.content}
                  </Text>
                </View>
              </View>
            ))}
            {aiLoading && (
              <View style={styles.chatBubbleRow}>
                <Text style={styles.chatAvatar}>🤖</Text>
                <View style={styles.chatBubble}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              </View>
            )}
          </View>

          {/* 식사 알림 시 행동 버튼 */}
          {showActionButtons && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.btnOk}
                onPress={() => handleSend()}
                activeOpacity={0.85}
              >
                <Text style={styles.btnOkEmoji}>✅</Text>
                <Text style={styles.btnOkText}>알겠어요!</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnLater} activeOpacity={0.85}>
                <Text style={styles.btnLaterEmoji}>⏱</Text>
                <Text style={styles.btnLaterText}>3분 뒤에</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 일주일 스케줄 표 */}
          <View style={styles.tableCard}>
            <Text style={styles.tableTitle}>📅 일주일 스케줄</Text>
            {scheduleLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
            ) : times.length === 0 ? (
              <Text style={styles.emptyText}>등록된 스케줄이 없어요</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  <View style={styles.tableRow}>
                    <View style={styles.timeLabelCell} />
                    {DAY_LABELS.map((d, i) => (
                      <View key={i} style={[styles.dayHeaderCell, i === todayIndex && styles.todayHeaderCell]}>
                        <Text style={[styles.dayHeaderText, i === todayIndex && styles.todayHeaderText]}>{d}</Text>
                      </View>
                    ))}
                  </View>
                  {times.map(time => (
                    <View key={time} style={styles.tableRow}>
                      <View style={styles.timeLabelCell}>
                        <Text style={styles.timeLabelText}>{time}</Text>
                      </View>
                      {[0, 1, 2, 3, 4, 5, 6].map(day => {
                        const s = grid[time]?.[day];
                        const isToday = day === todayIndex;
                        return (
                          <View key={day} style={[styles.cell, isToday && styles.todayCell]}>
                            {s ? (
                              <Text style={styles.cellText} numberOfLines={2}>{s.title}</Text>
                            ) : (
                              <Text style={styles.cellEmpty}>-</Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        </ScrollView>

        {/* 입력창 */}
        <View style={[styles.inputBar, { marginBottom: keyboardHeight }]}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="AI에게 말해보세요…"
            placeholderTextColor="#94A3B8"
            returnKeyType="send"
            onSubmitEditing={handleSend}
            editable={!aiLoading}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || aiLoading) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || aiLoading}
            activeOpacity={0.8}
          >
            <Text style={styles.sendBtnText}>전송</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const CELL_W = 52;
const TIME_W = 48;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#DBEAFE' },

  header: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nextLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  nextText: { color: colors.white, fontSize: 15, fontWeight: '800' },

  logoutBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  logoutText: { color: colors.white, fontSize: 12, fontWeight: '700' },

  content: { alignItems: 'center', padding: 16, gap: 16, paddingBottom: 8 },

  timeBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 20,
  },
  timeBadgeText: { color: colors.white, fontWeight: '700', fontSize: 14 },

  emojiBig: { fontSize: 88, lineHeight: 96 },

  currentCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 4,
    width: '100%',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  currentLabel: { fontSize: 13, color: colors.primaryLight, fontWeight: '700' },
  currentTitle: { fontSize: 24, fontWeight: '900', color: colors.primary },
  currentTime: { fontSize: 14, color: '#94A3B8', fontWeight: '600' },

  chatSection: { width: '100%', gap: 10 },
  chatBubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  chatBubbleRowUser: { justifyContent: 'flex-end' },
  chatAvatar: { fontSize: 24 },
  chatBubble: {
    backgroundColor: colors.white,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: '75%',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  chatBubbleUser: {
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
  },
  chatText: { fontSize: 16, fontWeight: '600', color: '#1E293B', lineHeight: 24 },
  chatTextUser: { color: colors.white },

  actionRow: { flexDirection: 'row', gap: 12, width: '100%' },
  btnOk: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 4,
    elevation: 5,
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  btnOkEmoji: { fontSize: 26 },
  btnOkText: { color: colors.white, fontWeight: '900', fontSize: 16 },
  btnLater: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  btnLaterEmoji: { fontSize: 26 },
  btnLaterText: { color: colors.primary, fontWeight: '800', fontSize: 16 },

  tableCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    width: '100%',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  tableTitle: { fontSize: 13, fontWeight: '800', color: colors.primary, marginBottom: 12 },
  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', paddingVertical: 12 },

  tableRow: { flexDirection: 'row' },
  timeLabelCell: {
    width: TIME_W,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 6,
  },
  timeLabelText: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  dayHeaderCell: {
    width: CELL_W,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 8,
  },
  todayHeaderCell: { backgroundColor: colors.primary },
  dayHeaderText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  todayHeaderText: { color: colors.white },
  cell: {
    width: CELL_W,
    minHeight: 44,
    paddingVertical: 4,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  todayCell: { backgroundColor: '#EFF6FF' },
  cellText: { fontSize: 10, fontWeight: '700', color: colors.primary, textAlign: 'center' },
  cellEmpty: { fontSize: 12, color: '#E2E8F0' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  input: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1E293B',
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  sendBtnDisabled: { backgroundColor: '#CBD5E1' },
  sendBtnText: { color: colors.white, fontWeight: '800', fontSize: 14 },
});
