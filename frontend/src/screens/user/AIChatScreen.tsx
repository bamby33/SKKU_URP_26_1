/**
 * AI 대화 화면
 * ScheduleScreen 마이크 버튼 → 페이드 전환
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Animated, Easing, ActivityIndicator,
  KeyboardAvoidingView, Platform, TextInput,
} from 'react-native';
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { sendChat, api } from '../../api/client';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AIChat'>;
  route: RouteProp<RootStackParamList, 'AIChat'>;
};

type Message = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  choices?: string[];
  aacButtons?: string[];
};

const GREETING = '안녕하세요! 무엇을 도와드릴까요? 😊';

// ── 파형 아이콘 ────────────────────────────────────────────────────────────────
const WAVE_BARS = 5;
const STAGGER   = 110; // ms

type WaveState = 'idle' | 'listening' | 'thinking';

function WaveformIcon({
  state,
  color,
  barH = 30,
  barW = 4,
  gap  = 4,
}: {
  state: WaveState;
  color: string;
  barH?: number;
  barW?: number;
  gap?:  number;
}) {
  const anims = useRef(
    Array.from({ length: WAVE_BARS }, (_, i) =>
      new Animated.Value(i % 2 === 0 ? 0.25 : 0.38)
    )
  ).current;

  useEffect(() => {
    const cfg: Record<WaveState, { peaks: number[]; dur: number }> = {
      idle:      { peaks: [0.22, 0.42, 0.28, 0.48, 0.22], dur: 950 },
      listening: { peaks: [0.55, 1.00, 0.80, 1.00, 0.55], dur: 270 },
      thinking:  { peaks: [0.40, 0.72, 0.52, 0.72, 0.40], dur: 520 },
    };
    const { peaks, dur } = cfg[state];

    const loops = anims.map((anim, i) => {
      const d = dur + i * STAGGER;
      return Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: peaks[i],        duration: d, useNativeDriver: false }),
          Animated.timing(anim, { toValue: peaks[i] * 0.22, duration: d, useNativeDriver: false }),
        ])
      );
    });
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [state]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap, height: barH + 4 }}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={{
            width: barW,
            borderRadius: barW / 2,
            backgroundColor: color,
            height: anim.interpolate({ inputRange: [0, 1], outputRange: [3, barH] }),
          }}
        />
      ))}
    </View>
  );
}

export default function AIChatScreen({ navigation, route }: Props) {
  const scrollRef    = useRef<ScrollView>(null);
  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const fadeAnim     = useRef(new Animated.Value(0)).current;
  const micRingAnim  = useRef(new Animated.Value(1)).current;

  const [userId,    setUserId]    = useState<number | null>(null);
  const [theme,     setTheme]     = useState(colors.primary);
  const [messages,  setMessages]  = useState<Message[]>([
    { id: 0, role: 'assistant', content: GREETING },
  ]);
  const [listening,  setListening]  = useState(false);
  const [aiLoading,  setAiLoading]  = useState(false);
  const [inputText,  setInputText]  = useState('');

  // ── 음성 인식 ──────────────────────────────────────────────────────────────
  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end',   () => setListening(false));
  useSpeechRecognitionEvent('error', () => setListening(false));
  useSpeechRecognitionEvent('result', e => {
    const txt = e.results[0]?.transcript ?? '';
    if (txt && e.isFinal) handleSend(txt);
  });

  // ── 초기 로드 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem('user_id');
      const id = stored ? Number(stored) : null;
      if (id) setUserId(id);
      const col = await AsyncStorage.getItem('theme_color');
      if (col) setTheme(col);

      // followup 자동 메시지: 팝업 3분 후 AI가 먼저 질문
      const followUp = route.params?.followUpSchedule;
      if (followUp && id) {
        const followMsg = `${followUp} 하셨나요? 😊`;
        setMessages([
          { id: 0, role: 'assistant', content: followMsg },
        ]);
        Speech.speak(followMsg, { language: 'ko-KR' });
      } else {
        Speech.speak(GREETING, { language: 'ko-KR' });
      }
    })();

    // 페이드 인
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 300, useNativeDriver: true,
    }).start();
  }, []);

  // ── 마이크 링 펄스 ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (listening) {
      Animated.loop(Animated.sequence([
        Animated.timing(micRingAnim, { toValue: 1.35, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(micRingAnim, { toValue: 1,    duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])).start();
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 500, useNativeDriver: true }),
      ])).start();
    } else {
      micRingAnim.stopAnimation(); micRingAnim.setValue(1);
      pulseAnim.stopAnimation();   pulseAnim.setValue(1);
    }
  }, [listening]);

  // ── 메시지 추가 시 스크롤 ──────────────────────────────────────────────────
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages]);

  // ── 마이크 토글 ────────────────────────────────────────────────────────────
  const handleMic = async () => {
    if (listening) { ExpoSpeechRecognitionModule.stop(); return; }
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (granted) ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: false });
  };

  // ── AI 전송 ────────────────────────────────────────────────────────────────
  const clearChoices = (msgId: number) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, choices: undefined, aacButtons: undefined } : m));
  };

  const handleSend = async (text: string, fromMsgId?: number) => {
    if (!userId || aiLoading || !text.trim()) return;

    // 버튼 선택 시 해당 메시지의 선택지 제거
    if (fromMsgId !== undefined) clearChoices(fromMsgId);

    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: text }]);
    setAiLoading(true);

    try {
      const res = await sendChat(userId, text);
      const { reply, stage, feedback } = res.data;
      if (reply) {
        const newMsg: Message = { id: Date.now() + 1, role: 'assistant', content: reply };
        if (stage === 'stage_1' && feedback) {
          newMsg.choices    = feedback.choices    ?? undefined;
          newMsg.aacButtons = feedback.aac_buttons ?? undefined;
        }
        setMessages(prev => [...prev, newMsg]);
        Speech.speak(reply, { language: 'ko-KR' });
      }
      if (stage === 'stage_2') {
        api.post(`/chat/log-behavior/${userId}`, { stage: 'stage_2', trigger: 'text_agitation' }).catch(() => {});
        navigation.navigate('Emergency', { stage: 'stage_2' });
      } else if (stage === 'stage_3') {
        api.post(`/chat/log-behavior/${userId}`, { stage: 'stage_3', trigger: 'text_calm' }).catch(() => {});
        navigation.navigate('Emergency', { stage: 'stage_3' });
      }
    } catch {
      const err = '죄송해요, 잠시 후 다시 시도해 주세요 😢';
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: err }]);
      Speech.speak(err, { language: 'ko-KR' });
    } finally {
      setAiLoading(false);
    }
  };

  // ── 파형 상태 ──────────────────────────────────────────────────────────────
  const waveState: WaveState = listening ? 'listening' : aiLoading ? 'thinking' : 'idle';

  // ── 뒤로가기 ───────────────────────────────────────────────────────────────
  const handleBack = () => {
    Speech.stop();
    ExpoSpeechRecognitionModule.stop();
    Animated.timing(fadeAnim, { toValue: 0, duration: 220, useNativeDriver: true })
      .start(() => navigation.goBack());
  };

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <Animated.View style={[styles.root, { opacity: fadeAnim }]}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

          {/* ─── 헤더 ─── */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
              <Text style={[styles.backIcon, { color: theme }]}>←</Text>
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <View style={[styles.waveContainer, { backgroundColor: theme + '18' }]}>
                <WaveformIcon state={waveState} color={theme} barH={26} barW={4} gap={4} />
              </View>
              <View>
                <Text style={[styles.headerTitle, { color: theme }]}>AI 도우미</Text>
                <Text style={styles.headerSub}>
                  {listening ? '듣고 있어요…' : aiLoading ? '생각하고 있어요…' : '말해보세요'}
                </Text>
              </View>
            </View>
          </View>

          {/* ─── 채팅 목록 ─── */}
          <ScrollView
            ref={scrollRef}
            style={styles.chatArea}
            contentContainerStyle={styles.chatContent}
            showsVerticalScrollIndicator={false}
          >
            {messages.map(msg => (
              <View key={msg.id}>
                <View style={[styles.bubbleRow, msg.role === 'user' && styles.bubbleRowUser]}>
                  {msg.role === 'assistant' && (
                    <View style={[styles.avatarSmall, { backgroundColor: theme + '18' }]}>
                      <WaveformIcon state="idle" color={theme} barH={13} barW={2} gap={2} />
                    </View>
                  )}
                  <View style={[
                    styles.bubble,
                    msg.role === 'user'
                      ? { backgroundColor: theme }
                      : { backgroundColor: '#fff' },
                  ]}>
                    <Text style={[
                      styles.bubbleText,
                      msg.role === 'user' && { color: '#fff' },
                    ]}>
                      {msg.content}
                    </Text>
                  </View>
                </View>

                {/* stage_1 선택지 버튼 */}
                {msg.role === 'assistant' && (msg.choices?.length || msg.aacButtons?.length) ? (
                  <View style={styles.choicesWrap}>
                    {msg.choices?.map((c, i) => (
                      <TouchableOpacity
                        key={`c-${i}`}
                        style={[styles.choiceBtn, { borderColor: theme }]}
                        onPress={() => handleSend(c, msg.id)}
                        disabled={aiLoading}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.choiceBtnText, { color: theme }]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                    {msg.aacButtons?.map((b, i) => (
                      <TouchableOpacity
                        key={`a-${i}`}
                        style={[styles.aacBtn, { backgroundColor: theme + '18', borderColor: theme + '40' }]}
                        onPress={() => handleSend(b, msg.id)}
                        disabled={aiLoading}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.aacBtnText, { color: theme }]}>{b}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}

            {aiLoading && (
              <View style={styles.bubbleRow}>
                <View style={[styles.avatarSmall, { backgroundColor: theme + '18' }]}>
                  <WaveformIcon state="thinking" color={theme} barH={13} barW={2} gap={2} />
                </View>
                <View style={styles.bubble}>
                  <ActivityIndicator color={theme} size="small" />
                </View>
              </View>
            )}
          </ScrollView>

          {/* ─── 입력 영역 ─── */}
          <View style={styles.inputArea}>
            {/* 텍스트 입력 */}
            <View style={styles.textRow}>
              <TextInput
                style={[styles.textInput, { borderColor: theme + '60' }]}
                placeholder="메시지를 입력하세요…"
                placeholderTextColor="#94A3B8"
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={() => { if (inputText.trim()) { handleSend(inputText); setInputText(''); } }}
                returnKeyType="send"
                editable={!aiLoading}
                multiline={false}
              />
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: inputText.trim() ? theme : '#E2E8F0' }]}
                onPress={() => { if (inputText.trim()) { handleSend(inputText); setInputText(''); } }}
                disabled={!inputText.trim() || aiLoading}
                activeOpacity={0.8}
              >
                <Text style={styles.sendBtnText}>↑</Text>
              </TouchableOpacity>
            </View>

            {/* 마이크 버튼 */}
            <View style={styles.micRow}>
              <Animated.View style={[
                styles.micRing,
                { borderColor: listening ? '#EF4444' : theme, transform: [{ scale: micRingAnim }] },
              ]} />
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <TouchableOpacity
                  style={[styles.micBtn, { backgroundColor: listening ? '#EF4444' : theme }]}
                  onPress={handleMic}
                  disabled={aiLoading}
                  activeOpacity={0.85}
                >
                  {aiLoading
                    ? <ActivityIndicator color="#fff" size={26} />
                    : (
                      <View style={styles.micIconWrap}>
                        <View style={[styles.micBody, { borderColor: '#fff' }]} />
                        <View style={[styles.micArch, { borderColor: '#fff' }]} />
                        <View style={styles.micStem} />
                        <View style={styles.micBase} />
                      </View>
                    )
                  }
                </TouchableOpacity>
              </Animated.View>
              <Text style={[styles.micLabel, listening && { color: '#EF4444' }]}>
                {listening ? '탭해서 중지' : aiLoading ? 'AI 응답 중…' : '탭해서 말하기'}
              </Text>
            </View>
          </View>

        </KeyboardAvoidingView>
      </SafeAreaView>
    </Animated.View>
  );
}

// ── 스타일 ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4FAF7' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E4EFE8',
    gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F4FAF7',
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { fontSize: 20, fontWeight: '700' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  waveContainer: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle:  { fontSize: 16, fontWeight: '800' },
  headerSub:    { fontSize: 12, color: '#94A3B8', fontWeight: '600', marginTop: 1 },

  chatArea: { flex: 1 },
  chatContent: { paddingHorizontal: 16, paddingVertical: 16, gap: 12 },

  bubbleRow:     { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubbleRowUser: { justifyContent: 'flex-end' },

  avatarSmall: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },

  bubble: {
    maxWidth: '75%', borderRadius: 20,
    paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.06,
    shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  bubbleText: { fontSize: 15, fontWeight: '600', color: '#1E293B', lineHeight: 22 },

  inputArea: {
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#E4EFE8',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16,
    gap: 12,
  },
  textRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  textInput: {
    flex: 1, height: 44, borderRadius: 22,
    borderWidth: 1.5, paddingHorizontal: 16,
    fontSize: 15, color: '#1E293B',
    backgroundColor: '#F8FAFF',
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnText: { fontSize: 18, fontWeight: '800', color: '#fff' },
  micRow: {
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  micRing: {
    position: 'absolute',
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 2,
  },
  micBtn: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2,
    shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 7,
  },
  micIconWrap: { alignItems: 'center', gap: 2 },
  micBody: {
    width: 13, height: 18, borderRadius: 7,
    borderWidth: 2.5, backgroundColor: 'transparent',
  },
  micArch: {
    width: 20, height: 11,
    borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
    borderLeftWidth: 2.5, borderRightWidth: 2.5, borderBottomWidth: 2.5,
    backgroundColor: 'transparent', marginTop: -2,
  },
  micStem: { width: 2.5, height: 4, backgroundColor: '#fff' },
  micBase: { width: 13, height: 2.5, borderRadius: 2, backgroundColor: '#fff' },
  micLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },

  // stage_1 선택지
  choicesWrap: {
    marginLeft: 40, marginTop: 6, gap: 8,
    flexDirection: 'row', flexWrap: 'wrap',
  },
  choiceBtn: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20, borderWidth: 1.5,
    backgroundColor: '#fff',
  },
  choiceBtnText: { fontSize: 14, fontWeight: '700' },
  aacBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1,
  },
  aacBtnText: { fontSize: 13, fontWeight: '600' },
});
