/**
 * 화면 5 · 사용자
 * 문제행동 대응 (긴급) — stage 2: 흥분 상태
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { api, sendChat } from '../../api/client';
import { cleanForSpeech, cleanForDisplay } from '../../utils/text';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Emergency'>;
  route: RouteProp<RootStackParamList, 'Emergency'>;
};

const OPTIONS = [
  { emoji: '🎵', label: '좋아하는\n음악 듣기', bg: '#e8f5e9', speech: '좋아하는 음악을 틀어봐요. 음악이 도움이 될 거예요.' },
  { emoji: '🧸', label: '좋아하는 것\n꼭 안기',  bg: '#e3f2fd', speech: '좋아하는 물건을 꼭 안아봐요. 안아주면 마음이 편해질 거예요.' },
  { emoji: '🚶', label: '잠깐\n자리 이동',    bg: colors.alertBg, speech: '잠깐 다른 곳으로 이동해봐요. 조금 걸으면 도움이 될 거예요.' },
  { emoji: '🧊', label: '물 한 잔\n마시기',   bg: '#fff8e1', speech: '물 한 잔 마셔봐요. 천천히 마시면 마음이 차분해질 거예요.' },
];

const STAGES = ['지나감', '지금', '이후'];

const STAGE_CONFIG = {
  stage_1: {
    stageIndex: 0,
    headerEmoji: '💛',
    headerTitle: '잠깐, 좀 힘든가요?',
    headerSub: 'AI가 도와줄게요',
    headerBg: '#F59E0B',
    calmEmoji: '🌿',
    calmTitle: '잠깐 쉬어도 괜찮아요',
    calmSub: '지금 당장 안 해도 돼요.\n편한 방법으로 해볼까요?',
    stageLabel: '지금 단계 1 → 잠깐 힘든 것 같아요',
  },
  stage_2: {
    stageIndex: 1,
    headerEmoji: '🤗',
    headerTitle: '괜찮아요, 진정해봐요',
    headerSub: 'AI가 도와줄게요',
    headerBg: colors.alert,
    calmEmoji: '🌬️',
    calmTitle: '천천히 숨을 쉬어봐요',
    calmSub: '코로 깊게 들이쉬고…\n입으로 천천히 내쉬어요',
    stageLabel: '지금 단계 2 → 흥분 상태예요',
  },
  stage_3: {
    stageIndex: 2,
    headerEmoji: '😌',
    headerTitle: '많이 진정됐어요',
    headerSub: '잘 했어요, 대화해볼까요?',
    headerBg: '#2D6A4F',
    calmEmoji: '💙',
    calmTitle: '몸에 다친 곳은 없나요?',
    calmSub: '아까 어떤 기분이었는지\n이야기해줄 수 있어요?',
    stageLabel: '단계 3 → 진정 후',
  },
};

export default function EmergencyScreen({ navigation, route }: Props) {
  const stage = route.params?.stage ?? 'stage_2';
  const config = STAGE_CONFIG[stage];
  const [listening, setListening] = useState(false);
  const [sending, setSending] = useState(false);
  const [calming, setCalming] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [aiReply, setAiReply] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedOpt, setSelectedOpt] = useState<number | null>(null);

  const recRef        = useRef<Audio.Recording | null>(null);
  const meterRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const listeningRef  = useRef(false);
  const reEscalatedRef = useRef(false);
  const DB_REESCALATE = 95; // 재격화로 판단할 데시벨

  useEffect(() => { listeningRef.current = listening; }, [listening]);
  useEffect(() => {
    AsyncStorage.getItem('user_id').then(v => { if (v) setUserId(Number(v)); });
  }, []);

  // ── 음성 인식(STT) ──
  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end',   () => setListening(false));
  useSpeechRecognitionEvent('error', () => setListening(false));
  useSpeechRecognitionEvent('result', e => {
    const txt = e.results[0]?.transcript ?? '';
    if (txt && e.isFinal) handleUserSpeech(txt);
  });

  const toggleMic = async () => {
    if (listening) { ExpoSpeechRecognitionModule.stop(); return; }
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (granted) ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: false });
  };

  const speakSlow = (t: string) => {
    const s = cleanForSpeech(t);
    if (s) Speech.speak(s, { language: 'ko-KR', rate: 0.9 });
  };

  // 사용자가 말한 내용 → AI 응답 + 단계 전이
  const handleUserSpeech = async (text: string) => {
    if (!userId || aiLoading || !text.trim()) return;
    setAiLoading(true);
    try {
      const res = await sendChat(userId, text, { behavior_stage: stage });
      const { reply, stage: newStage } = res.data;
      if (reply) { setAiReply(cleanForDisplay(reply)); speakSlow(reply); }
      if (newStage && newStage !== stage && (newStage === 'stage_2' || newStage === 'stage_3')) {
        setTimeout(() => navigation.replace('Emergency', { stage: newStage }), 1800);
      }
    } catch {
      setAiReply('죄송해요, 잠시 후 다시 이야기해요.');
    } finally {
      setAiLoading(false);
    }
  };

  // ── 재격화 데시벨 감지 (STT 미사용 중에만) ──
  const stopMeter = async () => {
    if (meterRef.current) { clearInterval(meterRef.current); meterRef.current = null; }
    if (recRef.current) { try { await recRef.current.stopAndUnloadAsync(); } catch {} recRef.current = null; }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted' || !active) return;
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const { recording } = await Audio.Recording.createAsync({
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true,
        });
        if (!active) { try { await recording.stopAndUnloadAsync(); } catch {} return; }
        recRef.current = recording;
        meterRef.current = setInterval(async () => {
          if (listeningRef.current) return; // STT 중엔 측정 건너뜀
          const s = await recording.getStatusAsync();
          if (!s.isRecording) return;
          const approxDB = (s.metering ?? -160) + 100;
          if (approxDB >= DB_REESCALATE && stage !== 'stage_2' && !reEscalatedRef.current) {
            reEscalatedRef.current = true;
            if (userId) {
              api.post(`/chat/log-behavior/${userId}`, {
                stage: 'stage_2', trigger: 'voice_reescalate', decibel: approxDB,
              }).catch(() => {});
            }
            await stopMeter();
            navigation.replace('Emergency', { stage: 'stage_2' });
          }
        }, 500);
      } catch {}
    })();
    return () => { active = false; stopMeter(); };
  }, [stage, userId]);

  // 화면 떠날 때 음성/인식 정리
  useEffect(() => () => { Speech.stop(); ExpoSpeechRecognitionModule.stop(); }, []);

  // stage 진입 시 TTS 자동 재생 (낮고 느린 속도)
  useEffect(() => {
    const messages: Record<string, string> = {
      stage_2: '괜찮아요. 천천히 숨을 쉬어봐요. 코로 깊게 들이쉬고, 입으로 천천히 내쉬어요.',
      stage_3: '많이 진정됐어요. 잘 했어요. 몸에 다친 곳은 없나요?',
    };
    const msg = messages[stage];
    if (msg) {
      Speech.speak(msg, { language: 'ko-KR', rate: 0.82, pitch: 0.95 });
    }
    return () => { Speech.stop(); };
  }, [stage]);

  const handleCalmDown = async () => {
    setCalming(true);
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (userId) {
        const uid = Number(userId);
        // 60분 후 followup 예약
        api.post(`/chat/schedule-followup/${uid}`).catch(() => {});
        // stage_3 로그 직접 저장
        api.post(`/chat/log-behavior/${uid}`, {
          stage: 'stage_3',
          trigger: 'manual_calm_down',
        }).catch(() => {});
      }
    } finally {
      setCalming(false);
      navigation.replace('Emergency', { stage: 'stage_3' });
    }
  };

  const handleCallGuardian = () => {
    Alert.alert('보호자 알림', '보호자에게 긴급 알림을 보냅니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '보내기', style: 'destructive',
        onPress: async () => {
          setSending(true);
          try {
            const userId = await AsyncStorage.getItem('user_id');
            if (!userId) throw new Error('user_id 없음');
            await api.post(`/guardian/user/${userId}/emergency`);
            Alert.alert('전송 완료', '보호자에게 긴급 알림을 보냈어요.');
          } catch {
            Alert.alert('오류', '알림 전송에 실패했어요. 다시 시도해주세요.');
          } finally {
            setSending(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 단계별 헤더 */}
      <View style={[styles.alertHeader, { backgroundColor: config.headerBg }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.alertCenter}>
          <Text style={styles.alertEmoji}>{config.headerEmoji}</Text>
          <Text style={styles.alertTitle}>{config.headerTitle}</Text>
          <Text style={styles.alertSub}>{config.headerSub}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 단계 표시 */}
        <View style={styles.stageRow}>
          {STAGES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.stageDot,
                i < config.stageIndex && styles.stageDotPassed,
                i === config.stageIndex && styles.stageDotActive,
                i > config.stageIndex && styles.stageDotUpcoming,
              ]}
            />
          ))}
        </View>
        <Text style={styles.stageText}>{config.stageLabel}</Text>

        {/* 진정/안내 카드 */}
        <View style={styles.calmCard}>
          <Text style={styles.calmEmoji}>{config.calmEmoji}</Text>
          <Text style={styles.calmTitle}>{config.calmTitle}</Text>
          <Text style={styles.calmSub}>{config.calmSub}</Text>
        </View>

        {/* 활동 선택 — 탭하면 TTS 안내 */}
        <Text style={styles.optionsLabel}>도움이 될 것 해볼까요? 😊</Text>
        <View style={styles.optionsGrid}>
          {OPTIONS.map((opt, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.optCard, { backgroundColor: opt.bg }, selectedOpt === i && styles.optCardSelected]}
              onPress={() => { setSelectedOpt(i); Speech.speak(cleanForSpeech(opt.speech), { language: 'ko-KR', rate: 0.85 }); }}
              activeOpacity={0.75}
            >
              <Text style={styles.optEmoji}>{opt.emoji}</Text>
              <Text style={styles.optText}>{opt.label}</Text>
              {selectedOpt === i && <Text style={styles.optCheck}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {/* 음성 입력 — 탭하면 실제 음성인식 */}
        <TouchableOpacity
          style={[styles.voiceRow, listening && styles.voiceRowListening]}
          onPress={toggleMic}
          activeOpacity={0.8}
        >
          <View style={[styles.micBtn, listening && styles.micBtnListening]}>
            <Text style={{ fontSize: 18 }}>🎙️</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.voiceLabel, listening && styles.voiceLabelListening]}>
              {listening ? '듣고 있어요…' : '눌러서 말해봐요'}
            </Text>
            <Text style={styles.voiceHint}>느낌이나 원하는 걸 말해주면 도와줄게요</Text>
          </View>
          {aiLoading && <ActivityIndicator color={colors.alert} />}
        </TouchableOpacity>

        {/* AI 응답 */}
        {aiReply ? (
          <View style={styles.aiReplyCard}>
            <Text style={styles.aiReplyText}>{aiReply}</Text>
          </View>
        ) : null}

        {/* stage_2 전용: 진정됐어요 버튼 */}
        {stage === 'stage_2' && (
          <TouchableOpacity
            style={styles.calmBtn}
            onPress={handleCalmDown}
            disabled={calming}
            activeOpacity={0.8}
          >
            {calming
              ? <ActivityIndicator color="#2D6A4F" />
              : <Text style={styles.calmBtnText}>😌  이제 괜찮아요</Text>
            }
          </TouchableOpacity>
        )}

        {/* stage_3 전용: AI와 대화 연결 */}
        {stage === 'stage_3' && (
          <TouchableOpacity
            style={styles.talkBtn}
            onPress={() => navigation.navigate('AIChat', { behaviorFollowup: true })}
            activeOpacity={0.85}
          >
            <Text style={styles.talkBtnText}>💬  AI와 이야기하기</Text>
          </TouchableOpacity>
        )}

        {/* 보호자 알림 */}
        <TouchableOpacity style={styles.contactBtn} onPress={handleCallGuardian} disabled={sending}>
          {sending
            ? <ActivityIndicator color={colors.white} />
            : <Text style={styles.contactText}>📞 보호자에게 알리기</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  alertHeader: {
    backgroundColor: colors.alert,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  backBtn: { padding: 4, marginBottom: 4 },
  backText: { fontSize: 22, color: 'rgba(255,255,255,0.85)' },
  alertCenter: { alignItems: 'center' },
  alertEmoji: { fontSize: 28, marginBottom: 4 },
  alertTitle: { color: colors.white, fontSize: 18, fontWeight: '800' },
  alertSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 3 },

  content: { padding: 16, gap: 12 },

  stageRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  stageDot: { width: 32, height: 8, borderRadius: 4 },
  stageDotPassed: { backgroundColor: colors.warning },
  stageDotActive: { backgroundColor: colors.alertLight },
  stageDotUpcoming: { backgroundColor: '#e0e0e0' },
  stageText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: colors.alertLight,
  },

  calmCard: {
    backgroundColor: colors.alertBg,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  calmEmoji: { fontSize: 32, marginBottom: 6 },
  calmTitle: { fontSize: 17, fontWeight: '800', color: colors.alert, marginBottom: 6 },
  calmSub: { fontSize: 12, color: '#666', lineHeight: 20, textAlign: 'center' },

  optionsLabel: { fontSize: 13, fontWeight: '700', color: '#555' },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optCard: {
    width: '47%',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  optEmoji: { fontSize: 28, marginBottom: 6 },
  optText: { fontSize: 12, color: '#333', fontWeight: '700', textAlign: 'center', lineHeight: 17 },
  optCardSelected: { borderWidth: 2.5, borderColor: colors.alert },
  optCheck: { position: 'absolute', top: 6, right: 8, fontSize: 14, fontWeight: '900', color: colors.alert },

  aiReplyCard: {
    backgroundColor: '#EEF6FF', borderRadius: 14, padding: 14,
    borderLeftWidth: 4, borderLeftColor: colors.primary,
  },
  aiReplyText: { fontSize: 14, color: colors.primary, fontWeight: '600', lineHeight: 21 },

  talkBtn: {
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
  },
  talkBtnText: { color: colors.white, fontWeight: '800', fontSize: 15 },

  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F4FAF7',
    borderRadius: 14,
    padding: 12,
  },
  voiceRowListening: { backgroundColor: colors.alertBg },
  micBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  micBtnListening: { backgroundColor: colors.alert },
  voiceLabel: { fontSize: 13, fontWeight: '700', color: colors.primary },
  voiceLabelListening: { color: colors.alert },
  voiceHint: { fontSize: 10, color: '#999', marginTop: 2 },

  calmBtn: {
    backgroundColor: '#D1FAE5',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#6EE7B7',
  },
  calmBtnText: { color: '#2D6A4F', fontWeight: '900', fontSize: 15 },

  contactBtn: {
    backgroundColor: colors.alert,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  contactText: { color: colors.white, fontWeight: '800', fontSize: 14 },
});
