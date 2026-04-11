/**
 * 온보딩 5 · 보호자 전용
 * 당사자 취향 3문제 설정 (로그인 PIN 역할)
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, PINItem } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PINSetup'>;
  route: RouteProp<RootStackParamList, 'PINSetup'>;
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

export default function PINSetupScreen({ navigation, route }: Props) {
  const params = route.params;
  const { userName } = params;

  const [selected, setSelected] = useState<(number | null)[]>([null, null, null]);

  const canNext = selected.every((s) => s !== null);

  const handleSelect = (qIndex: number, optIndex: number) => {
    const next = [...selected];
    next[qIndex] = optIndex;
    setSelected(next);
  };

  const handleNext = () => {
    const pins: PINItem[] = QUESTIONS.map((q, i) => {
      const opt = q.options[selected[i]!];
      return {
        order: q.order,
        question: q.question,
        correct_answer: opt.label,
        correct_emoji: opt.emoji,
      };
    });
    navigation.navigate('Welcome', { ...params, pins });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <View style={styles.stepRow}>
            {[0, 1, 2, 3, 4].map((i) => (
              <React.Fragment key={i}>
                <View style={[styles.stepDot, i < 4 ? styles.stepDotDone : styles.stepDotActive]} />
                {i < 4 && <View style={[styles.stepLine, styles.stepLineDone]} />}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* 타이틀 */}
        <View style={styles.titleArea}>
          <Text style={styles.emoji}>🎯</Text>
          <Text style={styles.title}>{userName}의{'\n'}취향을 골라주세요</Text>
          <Text style={styles.subtitle}>당사자가 로그인할 때 이 3가지를 선택해요</Text>
        </View>

        {/* 질문 3개 */}
        {QUESTIONS.map((q, qIndex) => (
          <View key={q.order} style={styles.questionCard}>
            <View style={styles.questionHeader}>
              <View style={[styles.qNum, selected[qIndex] !== null && styles.qNumDone]}>
                <Text style={styles.qNumText}>{q.order}</Text>
              </View>
              <Text style={styles.questionText}>{q.question}</Text>
              {selected[qIndex] !== null && (
                <Text style={styles.checkMark}>✓</Text>
              )}
            </View>
            <View style={styles.optionGrid}>
              {q.options.map((opt, optIndex) => (
                <TouchableOpacity
                  key={opt.label}
                  style={[
                    styles.optionBtn,
                    selected[qIndex] === optIndex && styles.optionBtnSelected,
                  ]}
                  onPress={() => handleSelect(qIndex, optIndex)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                  <Text style={[
                    styles.optionLabel,
                    selected[qIndex] === optIndex && styles.optionLabelSelected,
                  ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* 안내 */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            💡 당사자가 이 3가지를 순서대로 선택하면 로그인돼요.{'\n'}
            당사자가 확실히 좋아하는 것으로 골라주세요!
          </Text>
        </View>

        {/* 다음 버튼 */}
        <TouchableOpacity
          style={[styles.nextBtn, !canNext && styles.nextBtnDisabled]}
          onPress={handleNext}
          disabled={!canNext}
          activeOpacity={0.85}
        >
          <Text style={styles.nextBtnText}>
            {canNext ? '설정 완료 →' : `${selected.filter(s => s !== null).length}/3 선택됨`}
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7ff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 22, color: colors.primary },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d0daf0' },
  stepDotActive: { backgroundColor: colors.primary },
  stepDotDone: { backgroundColor: colors.primaryLight },
  stepLine: { width: 16, height: 2, backgroundColor: '#d0daf0' },
  stepLineDone: { backgroundColor: colors.primaryLight },

  content: { padding: 24, gap: 20 },
  titleArea: { alignItems: 'center', gap: 8 },
  emoji: { fontSize: 48 },
  title: { fontSize: 22, fontWeight: '900', color: colors.primary, textAlign: 'center', lineHeight: 30 },
  subtitle: { fontSize: 13, color: '#888', textAlign: 'center' },

  questionCard: {
    backgroundColor: colors.white, borderRadius: 18, padding: 16, gap: 14,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  questionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  qNumDone: { backgroundColor: colors.primary },
  qNumText: { fontSize: 13, fontWeight: '800', color: colors.white },
  questionText: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.primary },
  checkMark: { fontSize: 18, color: colors.success },

  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn: {
    width: '22%', aspectRatio: 1,
    backgroundColor: colors.card, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', gap: 3,
    borderWidth: 2, borderColor: 'transparent',
  },
  optionBtnSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionEmoji: { fontSize: 26 },
  optionLabel: { fontSize: 10, fontWeight: '700', color: colors.primary },
  optionLabelSelected: { color: colors.white },

  infoBox: {
    backgroundColor: '#fff8e1', borderRadius: 14, padding: 14,
    borderLeftWidth: 3, borderLeftColor: colors.warning,
  },
  infoText: { fontSize: 12, color: '#5d4037', lineHeight: 19 },

  nextBtn: {
    backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', elevation: 4,
    shadowColor: colors.primary, shadowOpacity: 0.3,
    shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  nextBtnDisabled: { backgroundColor: '#c5d0e8', elevation: 0, shadowOpacity: 0 },
  nextBtnText: { color: colors.white, fontWeight: '800', fontSize: 16 },
});
