/**
 * 온보딩 1 · 공통
 * 당사자 기본 정보 입력 (이름 / 나이 / 직업 / 장애 유형 / 독립 수행 능력)
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

const DISABILITY_TYPES = [
  { key: 'intellectual', label: '지적 장애' },
  { key: 'autism',       label: '자폐 장애' },
];

const DISABILITY_LEVELS = [
  { key: 'mild',     label: '혼자 할 수 있어요',     sub: '대부분 일과를 스스로 수행' },
  { key: 'moderate', label: '도움이 조금 필요해요',   sub: '일부 상황에서 지원 필요' },
  { key: 'severe',   label: '도움이 많이 필요해요',   sub: '대부분 상황에서 지원 필요' },
];

export default function PersonInfoScreen({ navigation }: Props) {
  const [name,            setName]            = useState('');
  const [age,             setAge]             = useState('');
  const [occupation,      setOccupation]      = useState('');
  const [disabilityType,  setDisabilityType]  = useState<string | null>(null);
  const [disabilityLevel, setDisabilityLevel] = useState<string | null>(null);

  const canNext = name.trim().length > 0 && age.trim().length > 0
    && disabilityType !== null && disabilityLevel !== null;

  const handleNext = () => {
    navigation.navigate('Preferences', {
      userName: name.trim(),
      age: age.trim(),
      gender: '',
      disabilityType: disabilityType!,
      disabilityLevel: disabilityLevel!,
      occupation: occupation.trim(),
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

          {/* 직업 */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>직업 / 하는 일 <Text style={styles.optional}>(선택)</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="예) 복지관 다니기, 직업 훈련, 학교 등"
              placeholderTextColor="#bbb"
              value={occupation}
              onChangeText={setOccupation}
              returnKeyType="next"
            />
          </View>

          {/* 장애 유형 */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>장애 유형</Text>
            <View style={styles.disabilityRow}>
              {DISABILITY_TYPES.map((d) => (
                <TouchableOpacity
                  key={d.key}
                  style={[styles.disabilityBtn, disabilityType === d.key && styles.disabilityBtnSelected]}
                  onPress={() => setDisabilityType(d.key)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.disabilityLabel, disabilityType === d.key && styles.disabilityLabelSelected]}>
                    {d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 독립 수행 능력 */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>독립 수행 능력</Text>
            <View style={styles.levelCol}>
              {DISABILITY_LEVELS.map((l) => (
                <TouchableOpacity
                  key={l.key}
                  style={[styles.levelBtn, disabilityLevel === l.key && styles.levelBtnSelected]}
                  onPress={() => setDisabilityLevel(l.key)}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.levelLabel, disabilityLevel === l.key && styles.levelLabelSelected]}>
                      {l.label}
                    </Text>
                    <Text style={[styles.levelSub, disabilityLevel === l.key && styles.levelSubSelected]}>
                      {l.sub}
                    </Text>
                  </View>
                  {disabilityLevel === l.key && (
                    <Text style={styles.levelCheck}>확인</Text>
                  )}
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
    backgroundColor: colors.primaryBg,
    borderRadius: 20,
  },
  backText: { fontSize: 15, color: colors.primary, fontWeight: '800' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d0daf0' },
  stepDotActive: { backgroundColor: colors.primary },
  stepLine: { width: 24, height: 2, backgroundColor: '#d0daf0' },

  content: { padding: 24, gap: 22 },

  titleArea: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  title: {
    fontSize: 24, fontWeight: '900', color: colors.primary,
    textAlign: 'center', lineHeight: 32,
  },
  subtitle: { fontSize: 13, color: '#888', textAlign: 'center' },

  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.primary },
  optional: { fontSize: 11, fontWeight: '500', color: '#aaa' },
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

  disabilityRow: { flexDirection: 'row', gap: 10 },
  disabilityBtn: {
    flex: 1, backgroundColor: colors.white, borderRadius: 16,
    paddingVertical: 16, paddingHorizontal: 12, alignItems: 'center',
    borderWidth: 2, borderColor: colors.border,
  },
  disabilityBtnSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  disabilityLabel: { fontSize: 14, fontWeight: '800', color: colors.primary },
  disabilityLabelSelected: { color: colors.white },

  levelCol: { gap: 8 },
  levelBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.white, borderRadius: 14,
    padding: 14, borderWidth: 2, borderColor: colors.border,
  },
  levelBtnSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  levelLabel: { fontSize: 14, fontWeight: '800', color: colors.primary },
  levelLabelSelected: { color: colors.white },
  levelSub: { fontSize: 11, color: '#999', marginTop: 2 },
  levelSubSelected: { color: 'rgba(255,255,255,0.8)' },
  levelCheck: { fontSize: 12, color: colors.white, fontWeight: '700' },

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
  nextBtnDisabled: { backgroundColor: '#A8D8C0', elevation: 0, shadowOpacity: 0 },
  nextBtnText: { color: colors.white, fontWeight: '800', fontSize: 16 },
});
