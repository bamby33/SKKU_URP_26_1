/**
 * 온보딩 2 · 보호자 전용
 * 당사자 취미·좋아하는 것 / 싫어하는 것 / 문제행동 특이사항 입력
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
import { DEFAULT_THEME_COLOR } from '../../theme/palette';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Preferences'>;
  route: RouteProp<RootStackParamList, 'Preferences'>;
};

export default function PreferencesScreen({ navigation, route }: Props) {
  const { userName, age, gender, disabilityType, disabilityLevel, occupation } = route.params;

  const [likes, setLikes] = useState('');
  const [dislikes, setDislikes] = useState('');
  const [problemNotes, setProblemNotes] = useState('');
  const themeColor = DEFAULT_THEME_COLOR.color;

  const handleNext = () => {
    navigation.navigate('BasicSchedule', {
      userName, age, gender, disabilityType, disabilityLevel, occupation,
      likes, dislikes, problemNotes, themeColor,
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

          {/* 취미 및 좋아하는 것 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>취미 및 좋아하는 것</Text>
            <Text style={styles.notesHint}>
              즐기는 활동, 좋아하는 것을 자유롭게 적어주세요{'\n'}
              AI가 스케줄 최적화 시 활용해요
            </Text>
            <TextInput
              style={styles.notesInput}
              placeholder={'예) 음악 듣기, 블록 놀이를 좋아해요. 주말엔 그림 그리기를 즐겨요.\n좋아하는 캐릭터는 뽀로로예요.'}
              placeholderTextColor="#bbb"
              value={likes}
              onChangeText={setLikes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* 싫어하는 것 / 힘든 것 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>싫어하는 것 / 힘든 것</Text>
            <Text style={styles.notesHint}>
              힘들어하거나 싫어하는 것을 자유롭게 적어주세요{'\n'}
              AI가 피드백과 중재에 활용해요
            </Text>
            <TextInput
              style={styles.notesInput}
              placeholder={'예) 큰 소리, 갑작스러운 변화, 낯선 장소가 싫어요.\n긴 대기 시간에 힘들어해요.'}
              placeholderTextColor="#bbb"
              value={dislikes}
              onChangeText={setDislikes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* 문제행동 특이사항 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>문제행동 특이사항</Text>
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
          <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.85}>
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
  },
  backBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E2E8F0',
    borderRadius: 14,
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
  title: { fontSize: 22, fontWeight: '900', color: '#1E293B', lineHeight: 30 },
  subtitle: { fontSize: 13, color: '#888' },
  section: {
    backgroundColor: colors.white, borderRadius: 18, padding: 16, gap: 12,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1E293B' },
  notesHint: { fontSize: 12, color: '#888', lineHeight: 18 },
  notesInput: {
    backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1,
    borderColor: '#E2E8F0', padding: 14, fontSize: 14,
    color: '#1E293B', minHeight: 100,
  },
  nextBtn: {
    backgroundColor: '#fff', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  nextBtnText: { color: colors.primary, fontWeight: '800', fontSize: 16 },
  skipHint: { textAlign: 'center', fontSize: 11, color: '#bbb' },
});
