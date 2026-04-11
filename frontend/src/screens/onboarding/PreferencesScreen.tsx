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

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Preferences'>;
  route: RouteProp<RootStackParamList, 'Preferences'>;
};

const LIKE_SUGGESTIONS = ['음악 듣기', '산책', '그림 그리기', '블록 놀이', 'TV 보기', '요리'];
const DISLIKE_SUGGESTIONS = ['큰 소리', '갑작스러운 변화', '낯선 장소', '긴 대기', '붐비는 곳'];

export default function PreferencesScreen({ navigation, route }: Props) {
  const { userName, age, gender } = route.params;

  const [likes, setLikes] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [likeInput, setLikeInput] = useState('');
  const [dislikeInput, setDislikeInput] = useState('');

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
    navigation.navigate('ScheduleSetup', { userName, age, gender, likes, dislikes });
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
              <Text style={styles.backText}>←</Text>
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
            <Text style={styles.emoji}>💝</Text>
            <Text style={styles.title}>{userName}의{'\n'}특성을 알려주세요</Text>
            <Text style={styles.subtitle}>AI가 더 잘 도와줄 수 있어요</Text>
          </View>

          {/* 좋아하는 것 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionEmoji}>😊</Text>
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
              <Text style={styles.sectionEmoji}>😣</Text>
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
  container: { flex: 1, backgroundColor: '#f4f7ff' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 22, color: colors.primary },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d0daf0' },
  stepDotActive: { backgroundColor: colors.primary },
  stepDotDone: { backgroundColor: colors.primaryLight },
  stepLine: { width: 24, height: 2, backgroundColor: '#d0daf0' },
  stepLineDone: { backgroundColor: colors.primaryLight },

  content: { padding: 24, gap: 20 },

  titleArea: { alignItems: 'center', gap: 8 },
  emoji: { fontSize: 48 },
  title: {
    fontSize: 22, fontWeight: '900', color: colors.primary,
    textAlign: 'center', lineHeight: 30,
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
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.primary },

  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestionChip: {
    backgroundColor: colors.primaryBg,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  dislikeChip: {
    backgroundColor: '#fff0f0',
    borderColor: '#f5c0c0',
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dislikeChipSelected: { backgroundColor: colors.alertLight, borderColor: colors.alertLight },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  chipTextSelected: { color: colors.white },
  dislikeChipTextSelected: { color: colors.white },

  inputRow: { flexDirection: 'row', gap: 8 },
  tagInput: {
    flex: 1,
    backgroundColor: '#f4f7ff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnAlert: { backgroundColor: colors.alertLight },
  addBtnText: { color: colors.white, fontSize: 22, fontWeight: '700', lineHeight: 26 },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  tagChipAlert: { backgroundColor: colors.alertLight },
  tagChipText: { color: colors.white, fontSize: 12, fontWeight: '600' },
  tagChipTextAlert: { color: colors.white },

  nextBtn: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    elevation: 4,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  nextBtnText: { color: colors.white, fontWeight: '800', fontSize: 16 },
  skipHint: { textAlign: 'center', fontSize: 11, color: '#bbb' },
});
