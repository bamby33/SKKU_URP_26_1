/**
 * 화면 5 · 사용자
 * 문제행동 대응 (긴급) — stage 2: 흥분 상태
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { api } from '../../api/client';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Emergency'>;
  route: RouteProp<RootStackParamList, 'Emergency'>;
};

const OPTIONS = [
  { emoji: '🎵', label: '좋아하는\n음악 듣기', bg: '#e8f5e9' },
  { emoji: '🧸', label: '특아 한 것\n꼭 안기', bg: '#e3f2fd' },
  { emoji: '🚶', label: '잠깐\n자리 이동', bg: colors.alertBg },
  { emoji: '🧊', label: '물 한 잔\n마시기', bg: '#fff8e1' },
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
  const [listening, setListening] = useState(true);
  const [sending, setSending] = useState(false);

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

        {/* 활동 선택 */}
        <Text style={styles.optionsLabel}>도움이 될 것 해볼까요? 😊</Text>
        <View style={styles.optionsGrid}>
          {OPTIONS.map((opt, i) => (
            <TouchableOpacity key={i} style={[styles.optCard, { backgroundColor: opt.bg }]}>
              <Text style={styles.optEmoji}>{opt.emoji}</Text>
              <Text style={styles.optText}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 음성 입력 */}
        <View style={[styles.voiceRow, listening && styles.voiceRowListening]}>
          <TouchableOpacity
            style={[styles.micBtn, listening && styles.micBtnListening]}
            onPress={() => setListening(!listening)}
          >
            <Text style={{ fontSize: 18 }}>🎙️</Text>
          </TouchableOpacity>
          <View>
            <Text style={[styles.voiceLabel, listening && styles.voiceLabelListening]}>
              {listening ? '듣고 있어요' : '지금 어떤지 말해봐요'}
            </Text>
            <Text style={styles.voiceHint}>느낌이나 원하는 걸 말해주면 도와줄게요</Text>
          </View>
        </View>

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
  container: { flex: 1, backgroundColor: colors.white },

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

  contactBtn: {
    backgroundColor: colors.alert,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  contactText: { color: colors.white, fontWeight: '800', fontSize: 14 },
});
