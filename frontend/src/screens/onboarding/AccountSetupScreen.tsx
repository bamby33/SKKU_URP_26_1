/**
 * 온보딩 4 · 보호자 전용
 * 보호자 이름/전화번호 + 아이디/비밀번호 설정
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
  navigation: NativeStackNavigationProp<RootStackParamList, 'AccountSetup'>;
  route: RouteProp<RootStackParamList, 'AccountSetup'>;
};

export default function AccountSetupScreen({ navigation, route }: Props) {
  const params = route.params;

  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);

  const passwordMatch = password === passwordConfirm;
  const canNext =
    guardianName.trim().length > 0 &&
    guardianPhone.trim().length >= 10 &&
    username.trim().length >= 4 &&
    password.length >= 6 &&
    passwordMatch;

  const handleNext = () => {
    navigation.navigate('PINSetup', {
      ...params,
      guardianName: guardianName.trim(),
      guardianPhone: guardianPhone.trim(),
      username: username.trim(),
      password,
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* 헤더 */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backText}>←</Text>
            </TouchableOpacity>
            <View style={styles.stepRow}>
              {[0, 1, 2, 3].map((i) => (
                <React.Fragment key={i}>
                  <View style={[styles.stepDot, i < 3 ? styles.stepDotDone : styles.stepDotActive]} />
                  {i < 3 && <View style={[styles.stepLine, styles.stepLineDone]} />}
                </React.Fragment>
              ))}
            </View>
          </View>

          {/* 타이틀 */}
          <View style={styles.titleArea}>
            <Text style={styles.emoji}>🔐</Text>
            <Text style={styles.title}>보호자 정보를{'\n'}입력해주세요</Text>
            <Text style={styles.subtitle}>로그인에 사용됩니다</Text>
          </View>

          {/* 보호자 이름 */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>보호자 이름</Text>
            <TextInput
              style={styles.input}
              placeholder="이름을 입력해주세요"
              placeholderTextColor="#bbb"
              value={guardianName}
              onChangeText={setGuardianName}
              returnKeyType="next"
            />
          </View>

          {/* 보호자 전화번호 */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>전화번호</Text>
            <TextInput
              style={styles.input}
              placeholder="010-0000-0000"
              placeholderTextColor="#bbb"
              value={guardianPhone}
              onChangeText={(t) => setGuardianPhone(t.replace(/[^0-9-]/g, ''))}
              keyboardType="phone-pad"
              returnKeyType="next"
            />
          </View>

          <View style={styles.divider} />

          {/* 아이디 */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>아이디</Text>
            <TextInput
              style={styles.input}
              placeholder="영문·숫자 4자 이상"
              placeholderTextColor="#bbb"
              value={username}
              onChangeText={(t) => setUsername(t.replace(/[^a-zA-Z0-9_]/g, ''))}
              autoCapitalize="none"
              returnKeyType="next"
            />
            {username.length > 0 && username.length < 4 && (
              <Text style={styles.errorText}>4자 이상 입력해주세요</Text>
            )}
          </View>

          {/* 비밀번호 */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>비밀번호</Text>
            <View style={styles.pwWrap}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="6자 이상"
                placeholderTextColor="#bbb"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPw}
                returnKeyType="next"
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPw(!showPw)}>
                <Text style={styles.eyeIcon}>{showPw ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 비밀번호 확인 */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>비밀번호 확인</Text>
            <TextInput
              style={[styles.input, passwordConfirm.length > 0 && !passwordMatch && styles.inputError]}
              placeholder="비밀번호를 다시 입력해주세요"
              placeholderTextColor="#bbb"
              value={passwordConfirm}
              onChangeText={setPasswordConfirm}
              secureTextEntry={!showPw}
              returnKeyType="done"
            />
            {passwordConfirm.length > 0 && !passwordMatch && (
              <Text style={styles.errorText}>비밀번호가 일치하지 않아요</Text>
            )}
            {passwordConfirm.length > 0 && passwordMatch && (
              <Text style={styles.successText}>✓ 일치해요</Text>
            )}
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 22, color: colors.primary },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d0daf0' },
  stepDotActive: { backgroundColor: colors.primary },
  stepDotDone: { backgroundColor: colors.primaryLight },
  stepLine: { width: 20, height: 2, backgroundColor: '#d0daf0' },
  stepLineDone: { backgroundColor: colors.primaryLight },

  content: { padding: 24, gap: 20 },
  titleArea: { alignItems: 'center', gap: 8, paddingVertical: 4 },
  emoji: { fontSize: 52 },
  title: { fontSize: 24, fontWeight: '900', color: colors.primary, textAlign: 'center', lineHeight: 32 },
  subtitle: { fontSize: 13, color: '#888' },

  divider: { height: 1, backgroundColor: '#e8eef8', marginVertical: 4 },

  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.primary },
  input: {
    backgroundColor: colors.white, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: colors.text,
    borderWidth: 2, borderColor: colors.border,
  },
  inputError: { borderColor: colors.alertLight },
  pwWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: {
    width: 48, height: 52, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white, borderRadius: 14,
    borderWidth: 2, borderColor: colors.border,
  },
  eyeIcon: { fontSize: 18 },
  errorText: { fontSize: 12, color: colors.alertLight },
  successText: { fontSize: 12, color: colors.success },

  nextBtn: {
    backgroundColor: colors.guardian, borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', marginTop: 8, elevation: 4,
    shadowColor: colors.guardian, shadowOpacity: 0.3, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  nextBtnDisabled: { backgroundColor: '#c5d0e8', elevation: 0, shadowOpacity: 0 },
  nextBtnText: { color: colors.white, fontWeight: '800', fontSize: 16 },
});
