/**
 * 온보딩 3 · 보호자 전용
 * 기본 스케줄 설정
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ScheduleSetup'>;
  route: RouteProp<RootStackParamList, 'ScheduleSetup'>;
};

type ScheduleItem = {
  id: number;
  time: string;
  activity: string;
  emoji: string;
};

const DEFAULT_SCHEDULES: ScheduleItem[] = [
  { id: 1, time: '08:00', activity: '기상 · 세면', emoji: '🌅' },
  { id: 2, time: '09:00', activity: '아침 식사', emoji: '🍚' },
  { id: 3, time: '10:30', activity: '여가 시간', emoji: '📖' },
  { id: 4, time: '12:00', activity: '점심 식사', emoji: '🍱' },
  { id: 5, time: '14:00', activity: '산책', emoji: '🚶' },
  { id: 6, time: '18:00', activity: '저녁 식사', emoji: '🍽️' },
  { id: 7, time: '21:00', activity: '취침 준비', emoji: '🛁' },
];

const EMOJIS = ['🌅', '🍚', '🍱', '🍽️', '🚶', '📖', '🎵', '🧸', '🏋️', '🛁', '💊', '🎨', '🧩', '🛒', '🚌'];

let nextId = DEFAULT_SCHEDULES.length + 1;

export default function ScheduleSetupScreen({ navigation, route }: Props) {
  const { name } = route.params;
  const [schedules, setSchedules] = useState<ScheduleItem[]>(DEFAULT_SCHEDULES);
  const [adding, setAdding] = useState(false);
  const [newTime, setNewTime] = useState('');
  const [newActivity, setNewActivity] = useState('');
  const [newEmoji, setNewEmoji] = useState('📌');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const addSchedule = () => {
    if (!newTime.trim() || !newActivity.trim()) {
      Alert.alert('입력 확인', '시간과 활동 내용을 모두 입력해주세요.');
      return;
    }
    const item: ScheduleItem = {
      id: nextId++,
      time: newTime.trim(),
      activity: newActivity.trim(),
      emoji: newEmoji,
    };
    const updated = [...schedules, item].sort((a, b) => a.time.localeCompare(b.time));
    setSchedules(updated);
    setNewTime('');
    setNewActivity('');
    setNewEmoji('📌');
    setAdding(false);
  };

  const removeSchedule = (id: number) => {
    setSchedules(schedules.filter((s) => s.id !== id));
  };

  const handleComplete = () => {
    navigation.navigate('Welcome', { name, role: 'guardian' });
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
              <View style={[styles.stepDot, styles.stepDotDone]} />
              <View style={[styles.stepLine, styles.stepLineDone]} />
              <View style={[styles.stepDot, styles.stepDotActive]} />
            </View>
          </View>

          {/* 타이틀 */}
          <View style={styles.titleArea}>
            <Text style={styles.emoji}>📅</Text>
            <Text style={styles.title}>{name}의{'\n'}일과를 설정해요</Text>
            <Text style={styles.subtitle}>기본 스케줄을 추가하거나 수정해주세요</Text>
          </View>

          {/* 스케줄 목록 */}
          <View style={styles.scheduleCard}>
            {schedules.map((item, index) => (
              <View key={item.id} style={[styles.scheduleRow, index === schedules.length - 1 && styles.scheduleRowLast]}>
                <Text style={styles.scheduleEmoji}>{item.emoji}</Text>
                <Text style={styles.scheduleTime}>{item.time}</Text>
                <Text style={styles.scheduleActivity}>{item.activity}</Text>
                <TouchableOpacity onPress={() => removeSchedule(item.id)} style={styles.removeBtn}>
                  <Text style={styles.removeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            {/* 추가 폼 */}
            {adding ? (
              <View style={styles.addForm}>
                {/* 이모지 선택 */}
                <TouchableOpacity
                  style={styles.emojiSelector}
                  onPress={() => setShowEmojiPicker(!showEmojiPicker)}
                >
                  <Text style={styles.emojiSelectorText}>{newEmoji}</Text>
                </TouchableOpacity>
                {showEmojiPicker && (
                  <View style={styles.emojiPicker}>
                    {EMOJIS.map((e) => (
                      <TouchableOpacity
                        key={e}
                        onPress={() => { setNewEmoji(e); setShowEmojiPicker(false); }}
                        style={styles.emojiOption}
                      >
                        <Text style={styles.emojiOptionText}>{e}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <View style={styles.addInputRow}>
                  <TextInput
                    style={[styles.addInput, styles.timeInput]}
                    placeholder="00:00"
                    placeholderTextColor="#bbb"
                    value={newTime}
                    onChangeText={setNewTime}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                  <TextInput
                    style={[styles.addInput, { flex: 1 }]}
                    placeholder="활동 이름"
                    placeholderTextColor="#bbb"
                    value={newActivity}
                    onChangeText={setNewActivity}
                    returnKeyType="done"
                    onSubmitEditing={addSchedule}
                  />
                </View>
                <View style={styles.addActionRow}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => { setAdding(false); setShowEmojiPicker(false); }}
                  >
                    <Text style={styles.cancelBtnText}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={addSchedule}>
                    <Text style={styles.confirmBtnText}>추가</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.addRowBtn} onPress={() => setAdding(true)}>
                <Text style={styles.addRowBtnText}>+ 일과 추가</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 완료 버튼 */}
          <TouchableOpacity
            style={styles.completeBtn}
            onPress={handleComplete}
            activeOpacity={0.85}
          >
            <Text style={styles.completeBtnText}>설정 완료 ✓</Text>
          </TouchableOpacity>
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

  scheduleCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },

  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  scheduleRowLast: { borderBottomWidth: 0 },
  scheduleEmoji: { fontSize: 20, width: 28 },
  scheduleTime: {
    fontSize: 13, fontWeight: '700', color: '#7c93d0', width: 48,
  },
  scheduleActivity: { flex: 1, fontSize: 14, color: colors.text },
  removeBtn: { padding: 4 },
  removeBtnText: { fontSize: 14, color: '#ccc', fontWeight: '700' },

  addForm: {
    padding: 14,
    gap: 10,
    backgroundColor: '#f8faff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  emojiSelector: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryBg,
    borderRadius: 12,
    padding: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  emojiSelectorText: { fontSize: 24 },
  emojiPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emojiOption: { padding: 4 },
  emojiOptionText: { fontSize: 22 },
  addInputRow: { flexDirection: 'row', gap: 8 },
  addInput: {
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  timeInput: { width: 72 },
  addActionRow: { flexDirection: 'row', gap: 8 },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#e8eef8',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  confirmBtn: {
    flex: 2,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  confirmBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },

  addRowBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  addRowBtnText: { fontSize: 14, fontWeight: '700', color: colors.primaryLight },

  completeBtn: {
    backgroundColor: colors.guardian,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    elevation: 4,
    shadowColor: colors.guardian,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  completeBtnText: { color: colors.white, fontWeight: '800', fontSize: 16 },
});
