/**
 * 화면 1 · 사용자(당사자)
 * 실시간 스케줄 공지 + AI 채팅 연동 + 일주일 스케줄 표
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Animated, Easing, Alert, ActivityIndicator,
  TextInput, Keyboard, Modal,
} from 'react-native';
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
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
const SLEEP_KEYWORDS = ['취침', '수면', '자기', '잠자기', '잠'];

function isSleepSchedule(title: string): boolean {
  return SLEEP_KEYWORDS.some(kw => title.includes(kw));
}

function extractEmoji(title: string): string {
  const match = title.match(/\p{Emoji_Presentation}/u);
  return match ? match[0] : '📋';
}

function getTodayIndex(): number {
  return (new Date().getDay() + 6) % 7;
}

const DRAWER_WIDTH = 260;

export default function ScheduleScreen({ navigation }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const drawerAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const announcedRef = useRef<Set<number>>(new Set());
  const snoozeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const todaySchedulesRef = useRef<Schedule[]>([]);

  const [userId, setUserId] = useState<number | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [pendingSchedule, setPendingSchedule] = useState<Schedule | null>(null);
  const [themeColor, setThemeColor] = useState(colors.primary);

  const openDrawer = () => {
    setShowMenu(true);
    Animated.timing(drawerAnim, { toValue: 0, duration: 260, useNativeDriver: true }).start();
  };
  const closeDrawer = () => {
    Animated.timing(drawerAnim, { toValue: DRAWER_WIDTH, duration: 220, useNativeDriver: true }).start(
      () => setShowMenu(false)
    );
  };

  // 음성 인식 이벤트
  useSpeechRecognitionEvent('start', () => setIsListening(true));
  useSpeechRecognitionEvent('end', () => setIsListening(false));
  useSpeechRecognitionEvent('error', () => setIsListening(false));
  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript ?? '';
    if (text && event.isFinal) handleSend(text);
  });

  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const nowTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  const todayIndex = getTodayIndex();
  const todaySchedules = schedules
    .filter(s => s.days_of_week.split(',').map(Number).includes(todayIndex))
    .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));

  const currentSchedule = [...todaySchedules].reverse().find(s => s.scheduled_time <= nowTime);
  const nextSchedule = todaySchedules.find(s => s.scheduled_time > nowTime);

  // 취침 야간 연장: 오늘 아직 시작된 일과가 없으면 어제 마지막 일과가 취침인지 확인
  const yesterdayIndex = (todayIndex + 6) % 7;
  const yesterdayLast = schedules
    .filter(s => s.days_of_week.split(',').map(Number).includes(yesterdayIndex))
    .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))
    .at(-1);
  const effectiveCurrent = currentSchedule
    ?? (!currentSchedule && yesterdayLast && isSleepSchedule(yesterdayLast.title) ? yesterdayLast : null);

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

  // todaySchedules ref 동기화 (interval 클로저에서 최신값 참조)
  todaySchedulesRef.current = todaySchedules;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // 스케줄 알림 함수
  const announceSchedule = (schedule: Schedule) => {
    const emoji = extractEmoji(schedule.title);
    const msg = `${emoji} ${schedule.title} 시간이에요! 지금 할 준비가 됐나요?`;
    setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: msg }]);
    Speech.speak(msg, { language: 'ko-KR' });
    setPendingSchedule(schedule);
  };

  const handleConfirm = () => {
    setPendingSchedule(null);
    if (snoozeRef.current) clearTimeout(snoozeRef.current);
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: '알겠어요!' }]);
    const reply = '잘했어요! 👍 파이팅!';
    setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: reply }]);
    Speech.speak(reply, { language: 'ko-KR' });
  };

  const handleSnooze = () => {
    const saved = pendingSchedule;
    setPendingSchedule(null);
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: '조금 이따가 할래요' }]);
    const reply = '알겠어요! 3분 뒤에 다시 알려드릴게요 😊';
    setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: reply }]);
    Speech.speak(reply, { language: 'ko-KR' });
    if (snoozeRef.current) clearTimeout(snoozeRef.current);
    snoozeRef.current = setTimeout(() => {
      if (saved) announceSchedule(saved);
    }, 3 * 60 * 1000);
  };

  // 스케줄 시간 감지 interval (30초마다 체크)
  useEffect(() => {
    const check = () => {
      const n = new Date();
      const t = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
      const due = todaySchedulesRef.current.find(
        s => s.scheduled_time === t && !announcedRef.current.has(s.id)
      );
      if (due) {
        announcedRef.current.add(due.id);
        announceSchedule(due);
      }
    };
    const interval = setInterval(check, 30000);
    return () => { clearInterval(interval); if (snoozeRef.current) clearTimeout(snoozeRef.current); };
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

        // 테마 색 로드
        const savedColor = await AsyncStorage.getItem('theme_color');
        if (savedColor) setThemeColor(savedColor);

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

  const handleSend = async (voiceText?: string) => {
    const text = (voiceText ?? inputText).trim();
    if (!text || !userId || aiLoading) return;

    const userMsg: ChatMessage = { id: Date.now(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    if (!voiceText) setInputText('');
    setAiLoading(true);

    try {
      const res = await sendChat(userId, text);
      const reply = res.data.reply;
      if (reply) {
        setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: reply }]);
        Speech.speak(reply, { language: 'ko-KR' });
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

  const handleMicPress = async () => {
    if (isListening) {
      ExpoSpeechRecognitionModule.stop();
    } else {
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('권한 필요', '마이크 권한을 허용해 주세요.');
        return;
      }
      ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: false });
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
      {/* 헤더: 다음 일과 + 메뉴 */}
      <View style={[styles.header, { backgroundColor: themeColor }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.nextLabel}>다음 일과</Text>
          <Text style={styles.nextText}>
            {nextSchedule ? `${nextSchedule.scheduled_time} ${nextSchedule.title}` : '오늘 일과 없음'}
          </Text>
        </View>
        <TouchableOpacity style={styles.menuBtn} onPress={openDrawer} activeOpacity={0.75}>
          <Text style={styles.menuBtnText}>☰</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        {/* 현재 할 일 + 이모지 */}
        <View style={styles.topContent}>
          <Animated.Text style={[styles.emojiBig, { transform: [{ translateY: bounceAnim }] }]}>
            {effectiveCurrent ? extractEmoji(effectiveCurrent.title) : '📋'}
          </Animated.Text>
          <View style={styles.currentCard}>
            <Text style={[styles.currentLabel, { color: themeColor }]}>지금 할 일이에요!</Text>
            <Text style={[styles.currentTitle, { color: themeColor }]}>{effectiveCurrent?.title ?? '일과를 확인 중이에요'}</Text>
            <Text style={styles.currentTime}>{effectiveCurrent?.scheduled_time ?? ''}</Text>
          </View>
          {/* 임시 테스트 버튼 */}
          <TouchableOpacity onPress={() => announceSchedule({ id: 9999, title: '🧪 테스트 알림', scheduled_time: '14:15', days_of_week: '2' })}
            style={{ backgroundColor: '#FEF3C7', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16, marginBottom: 4 }}>
            <Text style={{ color: '#92400E', fontWeight: '700', fontSize: 13 }}>⚙️ 알림 테스트</Text>
          </TouchableOpacity>

          {/* 연락 버튼 */}
          <View style={styles.contactRow}>
            <TouchableOpacity style={[styles.contactBtn, { borderColor: themeColor + '55', backgroundColor: themeColor + '12' }]} activeOpacity={0.8}
              onPress={() => Alert.alert('보호자 연락', '보호자에게 연락합니다.')}>
              <Text style={styles.contactIcon}>👨‍👩‍👧</Text>
              <Text style={[styles.contactText, { color: themeColor }]}>보호자에게{'\n'}연락하기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.contactBtn, { borderColor: themeColor + '55', backgroundColor: themeColor + '12' }]} activeOpacity={0.8}
              onPress={() => Alert.alert('기관 연락', '기관에 연락합니다.')}>
              <Text style={styles.contactIcon}>🏢</Text>
              <Text style={[styles.contactText, { color: themeColor }]}>기관에{'\n'}연락하기</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 채팅 + 입력 영역 (남은 공간 채움) */}
        <View style={[styles.chatBox, { marginBottom: keyboardHeight }]}>
          {/* 채팅 메시지 */}
          <ScrollView
            ref={scrollRef}
            style={styles.chatSection}
            contentContainerStyle={styles.chatContent}
            showsVerticalScrollIndicator={false}
          >
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
                <View style={[styles.chatBubble, msg.role === 'user' && { ...styles.chatBubbleUser, backgroundColor: themeColor }]}>
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
                  <ActivityIndicator size="small" color={themeColor} />
                </View>
              </View>
            )}
          </ScrollView>

          {/* 스케줄 알림 행동 버튼 */}
          {pendingSchedule && (
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.btnOk, { backgroundColor: themeColor }]} onPress={handleConfirm} activeOpacity={0.85}>
                <Text style={styles.btnOkEmoji}>✅</Text>
                <Text style={styles.btnOkText}>알겠어요!</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnLater} onPress={handleSnooze} activeOpacity={0.85}>
                <Text style={styles.btnLaterEmoji}>⏱</Text>
                <Text style={styles.btnLaterText}>조금 이따가</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 입력창 */}
          <View style={styles.inputBar}>
            <TouchableOpacity
              style={[styles.micBtn, isListening && styles.micBtnActive]}
              onPress={handleMicPress}
              activeOpacity={0.8}
            >
              <Text style={styles.micBtnText}>{isListening ? '⏹' : '🎤'}</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder={isListening ? '듣고 있어요…' : 'AI에게 말해보세요…'}
              placeholderTextColor={isListening ? themeColor : '#94A3B8'}
              returnKeyType="send"
              onSubmitEditing={() => handleSend()}
              editable={!aiLoading && !isListening}
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: themeColor }, (!inputText.trim() || aiLoading) && styles.sendBtnDisabled]}
              onPress={() => handleSend()}
              disabled={!inputText.trim() || aiLoading}
              activeOpacity={0.8}
            >
              <Text style={styles.sendBtnText}>전송</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 사이드 드로어 */}
        <Modal visible={showMenu} animationType="none" transparent onRequestClose={closeDrawer}>
          <TouchableOpacity style={styles.drawerOverlay} activeOpacity={1} onPress={closeDrawer} />
          <Animated.View style={[styles.drawer, { transform: [{ translateX: drawerAnim }] }]}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>메뉴</Text>
              <TouchableOpacity onPress={closeDrawer} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={styles.drawerClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.drawerDivider} />
            <TouchableOpacity style={styles.drawerItem} activeOpacity={0.7}
              onPress={() => { closeDrawer(); setTimeout(() => setShowSchedule(true), 240); }}>
              <Text style={styles.drawerItemIcon}>📅</Text>
              <Text style={styles.drawerItemText}>일주일 스케줄</Text>
            </TouchableOpacity>
            <View style={styles.drawerDivider} />
            <TouchableOpacity style={styles.drawerItem} activeOpacity={0.7}
              onPress={() => { closeDrawer(); setTimeout(handleLogout, 240); }}>
              <Text style={styles.drawerItemIcon}>🚪</Text>
              <Text style={[styles.drawerItemText, { color: '#C9303F' }]}>로그아웃</Text>
            </TouchableOpacity>
          </Animated.View>
        </Modal>

        {/* 일주일 스케줄 모달 */}
        <Modal visible={showSchedule} animationType="slide" transparent onRequestClose={() => setShowSchedule(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowSchedule(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📅 일주일 스케줄</Text>
              <TouchableOpacity onPress={() => setShowSchedule(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {scheduleLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
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
        </Modal>

      </View>
    </SafeAreaView>
  );
}

const CELL_W = 52;
const TIME_W = 48;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },

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

  menuBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  menuBtnText: { color: colors.white, fontSize: 18, fontWeight: '700' },

  // 사이드 드로어
  drawerOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  drawer: {
    position: 'absolute', top: 0, right: 0, bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: colors.white,
    paddingTop: 56,
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: -4, height: 0 },
  },
  drawerHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 16,
  },
  drawerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  drawerClose: { fontSize: 18, color: colors.textMuted },
  drawerDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: 0 },
  drawerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 18, paddingHorizontal: 20,
  },
  drawerItemIcon: { fontSize: 20 },
  drawerItemText: { fontSize: 16, fontWeight: '600', color: colors.text },

  // 연락 버튼
  contactRow: { flexDirection: 'row', gap: 10, width: '100%' },
  contactBtn: {
    flex: 1, backgroundColor: colors.primaryBg,
    borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.border,
  },
  contactBtnAlt: {
    backgroundColor: '#EEF7F2',
    borderColor: '#C3DDD1',
  },
  contactIcon: { fontSize: 22 },
  contactText: { fontSize: 13, fontWeight: '700', color: colors.primary, textAlign: 'center', lineHeight: 18 },

  content: { alignItems: 'center', padding: 16, gap: 16, paddingBottom: 8 },
  topContent: { alignItems: 'center', padding: 16, gap: 12 },

  timeBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 20,
  },
  timeBadgeText: { color: colors.white, fontWeight: '700', fontSize: 14 },

  emojiBig: { fontSize: 80, lineHeight: 90 },

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

  chatSection: { flex: 1, width: '100%' },
  chatContent: { gap: 10, paddingVertical: 4 },
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

  chatBox: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
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

  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnActive: {
    backgroundColor: '#FEE2E2',
  },
  micBtnText: { fontSize: 20 },


  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: colors.primary },
  modalClose: { fontSize: 18, color: '#94A3B8', fontWeight: '600' },
});
