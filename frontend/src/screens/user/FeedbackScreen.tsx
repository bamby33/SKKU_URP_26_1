/**
 * 화면 4 · 사용자
 * 미달성 피드백 대화 + 이유 선택
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Feedback'>;
  route: RouteProp<RootStackParamList, 'Feedback'>;
};

const REASONS = [
  { emoji: '😴', label: '배가 안\n고파서요', key: 'not_hungry' },
  { emoji: '😢', label: '하기\n싫었어요', key: 'refused' },
  { emoji: '😰', label: '무서워서요', key: 'scared' },
  { emoji: '🤷', label: '잘 모르겠어요', key: 'unknown' },
];

const AI_SUGGESTIONS: Record<string, string> = {
  not_hungry: '배가 안 고팠군요! 괜찮아요 😊\n조금 있다가 과일 한 조각\n먹어볼까요? 🍎',
  refused: '그랬군요, 괜찮아요 💙\n다음에 같이 해봐요!',
  scared: '걱정하지 않아도 돼요 😊\n천천히 같이 해봐요.',
  unknown: '그럴 수 있어요! 괜찮아요 😊\n조금 쉬었다 해봐요.',
};

export default function FeedbackScreen({ navigation, route }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  const suggestion = selected ? AI_SUGGESTIONS[selected] : null;

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI와 대화하기</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* AI 말풍선 */}
        <View style={styles.aiRow}>
          <View style={styles.aiAvatar}><Text style={{ fontSize: 16 }}>🤖</Text></View>
          <View style={styles.aiBubble}>
            <Text style={styles.qEmoji}>🤔</Text>
            <Text style={styles.aiBubbleText}>
              아침 식사를{'\n'}못 했군요.{'\n'}왜 그러셨는지{'\n'}알려줄 수 있어요?
            </Text>
          </View>
        </View>

        {/* 이유 선택 */}
        <Text style={styles.reasonLabel}>이유를 골라주세요</Text>
        <Text style={styles.reasonHint}>또는 🎙️ 버튼을 눌러 말해도 돼요</Text>

        <View style={styles.reasonGrid}>
          {REASONS.map((r) => (
            <TouchableOpacity
              key={r.key}
              style={[styles.reasonBtn, selected === r.key && styles.reasonBtnSelected]}
              onPress={() => setSelected(r.key)}
            >
              <Text style={styles.rEmoji}>{r.emoji}</Text>
              <Text style={[styles.rText, selected === r.key && styles.rTextSelected]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* AI 제안 */}
        {suggestion && (
          <View style={styles.aiRespond}>
            <Text style={styles.rtTitle}>💬 AI 제안</Text>
            <Text style={styles.rtBody}>{suggestion}</Text>
          </View>
        )}

        {/* 음성 입력 */}
        <View style={styles.voiceRow}>
          <TouchableOpacity
            style={[styles.micBtn, listening && styles.micBtnListening]}
            onPress={() => setListening(!listening)}
          >
            <Text style={{ fontSize: 18 }}>🎙️</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.voiceLabel}>음성으로 말하기</Text>
            <Text style={styles.voiceHint}>버튼을 누르고 말해보세요</Text>
          </View>
        </View>

        {/* 완료 버튼 */}
        <TouchableOpacity
          style={styles.submitBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.submitText}>알겠어요! 😊</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },

  header: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: { color: colors.white, fontSize: 20 },
  headerTitle: { color: colors.white, fontWeight: '700', fontSize: 14 },

  content: { padding: 16, gap: 14 },

  aiRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  aiAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiBubble: {
    backgroundColor: colors.primaryBg,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    padding: 12,
    maxWidth: 200,
  },
  qEmoji: { fontSize: 20, marginBottom: 4 },
  aiBubbleText: { fontSize: 13, color: colors.primary, lineHeight: 20 },

  reasonLabel: { fontSize: 13, fontWeight: '700', color: '#777' },
  reasonHint: { fontSize: 11, color: '#aaa', marginTop: -8 },

  reasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  reasonBtn: {
    width: '47%',
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
  },
  reasonBtnSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rEmoji: { fontSize: 24, marginBottom: 6 },
  rText: { fontSize: 12, color: colors.primary, fontWeight: '700', textAlign: 'center', lineHeight: 17 },
  rTextSelected: { color: colors.white },

  aiRespond: {
    backgroundColor: colors.warningBg,
    borderRadius: 14,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  rtTitle: { fontWeight: '800', color: '#e65100', marginBottom: 4, fontSize: 12 },
  rtBody: { fontSize: 12, color: '#5d4037', lineHeight: 19 },

  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
  },
  micBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  micBtnListening: { backgroundColor: colors.alertLight },
  voiceLabel: { fontSize: 13, fontWeight: '700', color: colors.primary },
  voiceHint: { fontSize: 11, color: '#888', marginTop: 2 },

  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
