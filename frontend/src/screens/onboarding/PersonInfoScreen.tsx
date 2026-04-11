/**
 * 온보딩 1 · 공통
 * 당사자 기본 정보 입력 (이름 / 나이 / 성별)
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PersonInfo'>;
};

const GENDERS = [
  { key: 'male', label: '남성', emoji: '👦' },
  { key: 'female', label: '여성', emoji: '👧' },
];

export default function PersonInfoScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<string | null>(null);

  const canNext = name.trim().length > 0 && age.trim().length > 0 && gender !== null;

  const handleNext = () => {
    navigation.navigate('Preferences', {
      userName: name.trim(),
      age: age.trim(),
      gender: gender!,
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
              <View style={[styles.stepDot, styles.stepDotActive]} />
              <View style={styles.stepLine} />
              <View style={styles.stepDot} />
              <View style={styles.stepLine} />
              <View style={styles.stepDot} />
              <View style={styles.stepLine} />
              <View style={styles.stepDot} />
            </View>
          </View>

          {/* 타이틀 */}
          <View style={styles.titleArea}>
            <Text style={styles.emoji}>📋</Text>
            <Text style={styles.title}>당사자 정보를{'\n'}알려주세요</Text>
            <Text style={styles.subtitle}>보호하시는 분의 정보를 입력해주세요</Text>
          </View>

          {/* 이름 */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>이름</Text>
            <TextInput
              style={styles.input}
              placeholder="이름을 입력해주세요"
              placeholderTextColor="#bbb"
              value={name}
              onChangeText={setName}
              returnKeyType="next"
            />
          </View>

          {/* 나이 */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>나이</Text>
            <View style={styles.ageRow}>
              <TextInput
                style={[styles.input, styles.ageInput]}
                placeholder="나이"
                placeholderTextColor="#bbb"
                value={age}
                onChangeText={(v) => setAge(v.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
                maxLength={3}
              />
              <Text style={styles.ageSuffix}>세</Text>
            </View>
          </View>

          {/* 성별 */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>성별</Text>
            <View style={styles.genderRow}>
              {GENDERS.map((g) => (
                <TouchableOpacity
                  key={g.key}
                  style={[styles.genderBtn, gender === g.key && styles.genderBtnSelected]}
                  onPress={() => setGender(g.key)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.genderEmoji}>{g.emoji}</Text>
                  <Text style={[styles.genderLabel, gender === g.key && styles.genderLabelSelected]}>
                    {g.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 다음 버튼 */}
          <TouchableOpacity
            style={[styles.nextBtn, !canNext && styles.nextBtnDisabled]}
            onPress={handleNext}
            disabled={!canNext}
            activeOpacity={0.85}
          >
            <Text style={styles.nextBtnText}>다음 →</Text>
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
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.primaryBg,
    borderRadius: 20,
  },
  backText: { fontSize: 15, color: colors.primary, fontWeight: '800' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#d0daf0',
  },
  stepDotActive: { backgroundColor: colors.primary },
  stepLine: { width: 24, height: 2, backgroundColor: '#d0daf0' },

  content: { padding: 24, gap: 22 },

  titleArea: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  emoji: { fontSize: 52 },
  title: {
    fontSize: 24, fontWeight: '900', color: colors.primary,
    textAlign: 'center', lineHeight: 32,
  },
  subtitle: { fontSize: 13, color: '#888', textAlign: 'center' },

  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.primary },
  input: {
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
  },
  ageRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ageInput: { flex: 1 },
  ageSuffix: { fontSize: 16, fontWeight: '700', color: colors.primary },

  genderRow: { flexDirection: 'row', gap: 10 },
  genderBtn: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
    borderWidth: 2,
    borderColor: colors.border,
  },
  genderBtnSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  genderEmoji: { fontSize: 26 },
  genderLabel: { fontSize: 13, fontWeight: '700', color: colors.primary },
  genderLabelSelected: { color: colors.white },

  nextBtn: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    elevation: 4,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  nextBtnDisabled: { backgroundColor: '#c5d0e8', elevation: 0, shadowOpacity: 0 },
  nextBtnText: { color: colors.white, fontWeight: '800', fontSize: 16 },
});
