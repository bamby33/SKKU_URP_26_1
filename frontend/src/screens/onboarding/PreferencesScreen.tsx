/**
 * 온보딩 2 · 보호자 전용
 * 당사자 좋아하는 것 / 싫어하는 것 입력
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { THEME_PALETTE, DEFAULT_THEME_COLOR } from '../../theme/palette';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Preferences'>;
  route: RouteProp<RootStackParamList, 'Preferences'>;
};

const LIKE_SUGGESTIONS = ['음악 듣기', '산책', '그림 그리기', '블록 놀이', 'TV 보기', '요리'];
const DISLIKE_SUGGESTIONS = ['큰 소리', '갑작스러운 변화', '낯선 장소', '긴 대기', '붐비는 곳'];

export default function PreferencesScreen({ navigation, route }: Props) {
  const { userName, age, gender, disabilityType, disabilityLevel, occupation } = route.params;

  const [likes, setLikes] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [likeInput, setLikeInput] = useState('');
  const [dislikeInput, setDislikeInput] = useState('');
  const [problemNotes, setProblemNotes] = useState('');
  const [dailyLife, setDailyLife] = useState('');
  const themeColor = DEFAULT_THEME_COLOR.color;

  const addTag = (
    input: string,
    setInput: (v: string) => void,
    list: string[],
    setList: (v: string[]) => void,
  ) => {
    const trimmed = input.trim();
    if (trimmed && !list.includes(trimmed)) {
      setList([...list, trimmed]);
    }
    setInput('');
  };

  const removeTag = (item: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.filter((t) => t !== item));
  };

  const toggleSuggestion = (
    item: string,
    list: string[],
    setList: (v: string[]) => void,
  ) => {
    if (list.includes(item)) {
      setList(list.filter((t) => t !== item));
    } else {
      setList([...list, item]);
    }
  };

  const handleNext = () => {
    navigation.navigate('BasicSchedule', {
      userName, age, gender, disabilityType, disabilityLevel, occupation,
      likes, dislikes, problemNotes, dailyLife, themeColor,
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* 헤더 */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backText}>← 뒤로</Text>
            </TouchableOpacity>
            <View style={styles.stepRow}>
              <View style={[styles.stepDot, styles.stepDotDone]} />
              <View style={[styles.stepLine, styles.stepLineDone]} />
              <View style={[styles.stepDot, styles.stepDotActive]} />
              <View style={styles.stepLine} />
              <View style={styles.stepDot} />
            </View>
          </View>

          {/* 타이틀 */}
          <View style={styles.titleArea}>
            <Text style={styles.title}>{userName}의 특성을 알려주세요</Text>
            <Text style={styles.subtitle}>AI가 더 잘 도와줄 수 있어요</Text>
          </View>

          {/* 좋아하는 것 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>좋아하는 것</Text>
            </View>

            {/* 추천 태그 */}
            <View style={styles.suggestions}>
              {LIKE_SUGGESTIONS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.suggestionChip, likes.includes(s) && styles.chipSelected]}
                  onPress={() => toggleSuggestion(s, likes, setLikes)}
                >
                  <Text style={[styles.chipText, likes.includes(s) && styles.chipTextSelected]}>
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 직접 입력 */}
            <View style={styles.inputRow}>
              <TextInput
                style={styles.tagInput}
                placeholder="직접 입력..."
                placeholderTextColor="#bbb"
                value={likeInput}
                onChangeText={setLikeInput}
                onSubmitEditing={() => addTag(likeInput, setLikeInput, likes, setLikes)}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => addTag(likeInput, setLikeInput, likes, setLikes)}
              >
                <Text style={styles.addBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* 선택된 태그 */}
            {likes.length > 0 && (
              <View style={styles.tagRow}>
                {likes.map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={styles.tagChip}
                    onPress={() => removeTag(tag, likes, setLikes)}
                  >
                    <Text style={styles.tagChipText}>{tag} ✕</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* 싫어하는 것 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>싫어하는 것 / 힘든 것</Text>
            </View>

            <View style={styles.suggestions}>
              {DISLIKE_SUGGESTIONS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.suggestionChip, styles.dislikeChip, dislikes.includes(s) && styles.dislikeChipSelected]}
                  onPress={() => toggleSuggestion(s, dislikes, setDislikes)}
                >
                  <Text style={[styles.chipText, dislikes.includes(s) && styles.dislikeChipTextSelected]}>
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.tagInput}
                placeholder="직접 입력..."
                placeholderTextColor="#bbb"
                value={dislikeInput}
                onChangeText={setDislikeInput}
                onSubmitEditing={() => addTag(dislikeInput, setDislikeInput, dislikes, setDislikes)}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[styles.addBtn, styles.addBtnAlert]}
                onPress={() => addTag(dislikeInput, setDislikeInput, dislikes, setDislikes)}
              >
                <Text style={styles.addBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            {dislikes.length > 0 && (
              <View style={styles.tagRow}>
                {dislikes.map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.tagChip, styles.tagChipAlert]}
                    onPress={() => removeTag(tag, dislikes, setDislikes)}
                  >
                    <Text style={[styles.tagChipText, styles.tagChipTextAlert]}>{tag} ✕</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* 취미 및 일상 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>취미 및 일상</Text>
            </View>
            <Text style={styles.notesHint}>
              평소 즐기는 활동, 루틴, 생활 패턴을 자유롭게 적어주세요{'\n'}
              AI가 맞춤 시간표를 만들 때 활용해요
            </Text>
            <TextInput
              style={styles.notesInput}
              placeholder={'예) 매일 저녁 산책을 즐겨요. 주말엔 그림 그리기를 좋아해요.\n좋아하는 캐릭터는 뽀로로이고 낮잠을 자주 자요.'}
              placeholderTextColor="#bbb"
              value={dailyLife}
              onChangeText={setDailyLife}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* 문제행동 특이사항 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>문제행동 특이사항</Text>
            </View>
            <Text style={styles.notesHint}>
              평소 문제행동, 빈도, 진정 방법 등 자유롭게 적어주세요{'\n'}
              AI가 이 정보를 기억하고 맞춤 대응해요
            </Text>
            <TextInput
              style={styles.notesInput}
              placeholder={'예) 큰 소리에 민감, 일과 변화 시 거부 반응 주 2~3회\n음악 들으면 진정됨'}
              placeholderTextColor="#bbb"
              value={problemNotes}
              onChangeText={setProblemNotes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* 다음 버튼 */}
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={handleNext}
            activeOpacity={0.85}
          >
            <Text style={styles.nextBtnText}>다음 →</Text>
          </TouchableOpacity>
          <Text style={styles.skipHint}>입력하지 않아도 나중에 수정할 수 있어요</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E2E8F0',
    borderRadius: 20,
  },
  backText: { fontSize: 15, color: colors.primary, fontWeight: '800' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d0daf0' },
  stepDotActive: { backgroundColor: colors.primary },
  stepDotDone: { backgroundColor: colors.primaryLight },
  stepLine: { width: 24, height: 2, backgroundColor: '#d0daf0' },
  stepLineDone: { backgroundColor: colors.primaryLight },

  content: { padding: 24, gap: 20 },

  titleArea: { alignItems: 'flex-start', gap: 8 },
  emoji: { fontSize: 48 },
  title: {
    fontSize: 22, fontWeight: '900', color: '#1E293B',
    lineHeight: 30,
  },
  subtitle: { fontSize: 13, color: '#888' },

  section: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    gap: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionEmoji: { fontSize: 22 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1E293B' },

  colorRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  colorSwatch: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  colorSwatchSelected: {
    borderWidth: 3, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 5,
  },
  colorCheck: { color: '#fff', fontSize: 18, fontWeight: '900' },
  colorLabel: { fontSize: 13, color: colors.textSub, fontWeight: '600', marginTop: -4 },

  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestionChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dislikeChip: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  chipSelected: { backgroundColor: '#334155', borderColor: '#334155' },
  dislikeChipSelected: { backgroundColor: '#334155', borderColor: '#334155' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  chipTextSelected: { color: '#fff' },
  dislikeChipTextSelected: { color: '#fff' },

  inputRow: { flexDirection: 'row', gap: 8 },
  tagInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1E293B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnAlert: { backgroundColor: '#fff', borderColor: '#E2E8F0' },
  addBtnText: { color: colors.primary, fontSize: 22, fontWeight: '700', lineHeight: 26 },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: {
    backgroundColor: '#334155',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  tagChipAlert: { backgroundColor: '#334155' },
  tagChipText: { color: colors.white, fontSize: 12, fontWeight: '600' },
  tagChipTextAlert: { color: colors.white },

  notesHint: { fontSize: 12, color: '#888', lineHeight: 18 },
  notesInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    fontSize: 14,
    color: '#1E293B',
    minHeight: 100,
  },

  nextBtn: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  nextBtnText: { color: colors.primary, fontWeight: '800', fontSize: 16 },
  skipHint: { textAlign: 'center', fontSize: 11, color: '#bbb' },
});
