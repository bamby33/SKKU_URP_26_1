/**
 * 화면 5 · 사용자
 * 문제행동 대응 (긴급) — stage 2: 흥분 상태
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';

const OPTIONS = [
  { emoji: '🎵', label: '좋아하는\n음악 듣기', bg: '#e8f5e9' },
  { emoji: '🧸', label: '특아 한 것\n꼭 안기', bg: '#e3f2fd' },
  { emoji: '🚶', label: '잠깐\n자리 이동', bg: colors.alertBg },
  { emoji: '🧊', label: '물 한 잔\n마시기', bg: '#fff8e1' },
];

const STAGES = ['지나감', '지금', '이후'];

export default function EmergencyScreen() {
  const [currentStage] = useState(1); // 0=stage1 지남, 1=stage2 현재, 2=stage3 이후
  const [listening, setListening] = useState(true);

  const handleCallGuardian = () => {
    Alert.alert('보호자 알림', '보호자에게 긴급 알림을 보냅니다.', [
      { text: '취소', style: 'cancel' },
      { text: '보내기', style: 'destructive' },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 경고 헤더 */}
      <View style={styles.alertHeader}>
        <Text style={styles.alertEmoji}>🤗</Text>
        <Text style={styles.alertTitle}>괜찮아요, 진정해봐요</Text>
        <Text style={styles.alertSub}>AI가 도와줄게요 💙</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 단계 표시 */}
        <View style={styles.stageRow}>
          {STAGES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.stageDot,
                i < currentStage && styles.stageDotPassed,
                i === currentStage && styles.stageDotActive,
                i > currentStage && styles.stageDotUpcoming,
              ]}
            />
          ))}
        </View>
        <Text style={styles.stageText}>지금 단계 2 → 흥분 상태예요</Text>

        {/* 진정 카드 */}
        <View style={styles.calmCard}>
          <Text style={styles.calmEmoji}>🌬️</Text>
          <Text style={styles.calmTitle}>천천히 숨을 쉬어봐요</Text>
          <Text style={styles.calmSub}>
            코로 깊게 들이쉬고…{'\n'}
            입으로 천천히 내쉬어요
          </Text>
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
        <TouchableOpacity style={styles.contactBtn} onPress={handleCallGuardian}>
          <Text style={styles.contactText}>📞 보호자에게 알리기</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },

  alertHeader: {
    backgroundColor: colors.alert,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
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
    backgroundColor: '#f4f7ff',
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
