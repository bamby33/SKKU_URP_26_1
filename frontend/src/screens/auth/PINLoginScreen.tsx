/**
 * 당사자 취향 PIN 로그인
 * 3문제 순서대로 선택 → 일치 시 "xxx님 맞으신가요?" 확인
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { api } from '../../api/client';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PINLogin'>;
};

type Option = { emoji: string; label: string };

const QUESTIONS: { order: number; question: string; options: Option[] }[] = [
  {
    order: 1,
    question: '제일 좋아하는 음식은?',
    options: [
      { emoji: '🍗', label: '치킨' }, { emoji: '🍕', label: '피자' },
      { emoji: '🍜', label: '라면' }, { emoji: '🍣', label: '초밥' },
      { emoji: '🍔', label: '햄버거' }, { emoji: '🍚', label: '밥' },
      { emoji: '🍩', label: '도넛' }, { emoji: '🍦', label: '아이스크림' },
    ],
  },
  {
    order: 2,
    question: '제일 좋아하는 동물은?',
    options: [
      { emoji: '🐶', label: '강아지' }, { emoji: '🐱', label: '고양이' },
      { emoji: '🐰', label: '토끼' }, { emoji: '🐻', label: '곰' },
      { emoji: '🦊', label: '여우' }, { emoji: '🐸', label: '개구리' },
      { emoji: '🐧', label: '펭귄' }, { emoji: '🐼', label: '판다' },
    ],
  },
  {
    order: 3,
    question: '제일 좋아하는 색깔은?',
    options: [
      { emoji: '❤️', label: '빨강' }, { emoji: '🧡', label: '주황' },
      { emoji: '💛', label: '노랑' }, { emoji: '💚', label: '초록' },
      { emoji: '💙', label: '파랑' }, { emoji: '💜', label: '보라' },
      { emoji: '🤍', label: '하양' }, { emoji: '🖤', label: '검정' },
    ],
  },
];

export default function PINLoginScreen({ navigation }: Props) {
  const [step, setStep] = useState(0);             // 0, 1, 2 → 질문 인덱스
  const [answers, setAnswers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [matchedName, setMatchedName] = useState('');
  const [matchedUserId, setMatchedUserId] = useState<number | null>(null);

  const currentQ = QUESTIONS[step];

  const handleSelect = async (opt: Option) => {
    const newAnswers = [...answers, opt.label];

    if (step < 2) {
      setAnswers(newAnswers);
      setStep(step + 1);
      return;
    }

    // 3번째 선택 완료 → 백엔드 검증
    setLoading(true);
    try {
      const res = await api.post('/users/pin-login', {
        food: newAnswers[0],
        animal: newAnswers[1],
        color: newAnswers[2],
      });
      setMatchedName(res.data.name);
      setMatchedUserId(res.data.user_id);
      setConfirming(true);
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? '일치하는 정보가 없어요.';
      Alert.alert('로그인 실패', msg, [
        { text: '다시 시도', onPress: () => { setStep(0); setAnswers([]); } },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!matchedUserId) return;
    await AsyncStorage.setItem('user_id', String(matchedUserId));
    await AsyncStorage.setItem('role', 'user');
    navigation.reset({ index: 0, routes: [{ name: 'Schedule' }] });
  };

  const handleDeny = () => {
    setConfirming(false);
    setStep(0);
    setAnswers([]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          {/* 진행 바 */}
          <View style={styles.progressRow}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={[
                  styles.progressBar,
                  i < step && styles.progressBarDone,
                  i === step && styles.progressBarActive,
                ]}
              />
            ))}
          </View>
        </View>

        {/* 타이틀 */}
        <View style={styles.titleArea}>
          <Text style={styles.stepLabel}>{step + 1} / 3</Text>
          <Text style={styles.question}>{currentQ.question}</Text>
          <Text style={styles.hint}>좋아하는 걸 골라주세요 😊</Text>
        </View>

        {/* 선택지 그리드 */}
        {loading ? (
          <View style={styles.loadingArea}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>확인 중...</Text>
          </View>
        ) : (
          <View style={styles.optionGrid}>
            {currentQ.options.map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={styles.optionBtn}
                onPress={() => handleSelect(opt)}
                activeOpacity={0.7}
              >
                <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                <Text style={styles.optionLabel}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* 이미 선택한 답 표시 */}
        {answers.length > 0 && (
          <View style={styles.answerRow}>
            {answers.map((a, i) => (
              <View key={i} style={styles.answerChip}>
                <Text style={styles.answerChipText}>
                  {QUESTIONS[i].options.find(o => o.label === a)?.emoji} {a}
                </Text>
              </View>
            ))}
          </View>
        )}

      </ScrollView>

      {/* 확인 모달 */}
      <Modal visible={confirming} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>🎉</Text>
            <Text style={styles.modalTitle}>
              <Text style={styles.modalName}>{matchedName}</Text>님{'\n'}맞으신가요?
            </Text>
            <Text style={styles.modalDesc}>맞으면 로그인돼요!</Text>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalBtnNo} onPress={handleDeny}>
                <Text style={styles.modalBtnNoText}>아니에요</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnYes} onPress={handleConfirm}>
                <Text style={styles.modalBtnYesText}>네, 맞아요! 👋</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7ff' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, gap: 16,
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 22, color: colors.primary },
  progressRow: { flex: 1, flexDirection: 'row', gap: 6 },
  progressBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#d0daf0' },
  progressBarDone: { backgroundColor: colors.primaryLight },
  progressBarActive: { backgroundColor: colors.primary },

  content: { padding: 24, gap: 28 },

  titleArea: { alignItems: 'center', gap: 10 },
  stepLabel: { fontSize: 12, fontWeight: '700', color: '#aaa', letterSpacing: 1 },
  question: { fontSize: 24, fontWeight: '900', color: colors.primary, textAlign: 'center' },
  hint: { fontSize: 14, color: '#888' },

  loadingArea: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  loadingText: { fontSize: 14, color: colors.primary, fontWeight: '600' },

  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  optionBtn: {
    width: '22%', aspectRatio: 1,
    backgroundColor: colors.white, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', gap: 4,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.07,
    shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  optionEmoji: { fontSize: 30 },
  optionLabel: { fontSize: 11, fontWeight: '700', color: colors.primary },

  answerRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  answerChip: {
    backgroundColor: colors.primaryBg, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.border,
  },
  answerChipText: { fontSize: 13, color: colors.primary, fontWeight: '600' },

  // 모달
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: colors.white, borderRadius: 24, padding: 32,
    alignItems: 'center', gap: 12, width: '80%',
    elevation: 10, shadowColor: '#000', shadowOpacity: 0.2,
    shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
  },
  modalEmoji: { fontSize: 56 },
  modalTitle: { fontSize: 22, fontWeight: '900', color: colors.primary, textAlign: 'center', lineHeight: 32 },
  modalName: { color: colors.primaryLight },
  modalDesc: { fontSize: 13, color: '#888' },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 8, width: '100%' },
  modalBtnNo: {
    flex: 1, backgroundColor: colors.primaryBg, borderRadius: 14,
    paddingVertical: 13, alignItems: 'center',
  },
  modalBtnNoText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  modalBtnYes: {
    flex: 2, backgroundColor: colors.primary, borderRadius: 14,
    paddingVertical: 13, alignItems: 'center',
  },
  modalBtnYesText: { fontSize: 14, fontWeight: '800', color: colors.white },
});
