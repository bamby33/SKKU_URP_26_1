/**
 * 온보딩 4 · 보호자 전용
 * 보호자 이름/전화번호 + 아이디/비밀번호 설정
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { api } from '../../api/client';

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
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (username.trim().length < 4) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/users/check-username/${username.trim()}`);
        setUsernameStatus(res.data.available ? 'available' : 'taken');
      } catch {
        setUsernameStatus('idle');
      }
    }, 800);
  }, [username]);

  const passwordMatch = password === passwordConfirm;
  const canNext =
    guardianName.trim().length > 0 &&
    guardianPhone.trim().length >= 10 &&
    username.trim().length >= 4 &&
    password.length >= 6 &&
    passwordMatch &&
    usernameStatus !== 'taken';

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

          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backText}>← 뒤로</Text>
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

          <View style={styles.titleArea}>
            <Text style={styles.title}>보호자 정보를 입력해주세요</Text>
            <Text style={styles.subtitle}>로그인에 사용됩니다</Text>
          </View>

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

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>아이디</Text>
            <TextInput
              style={[
                styles.input,
                usernameStatus === 'taken' && styles.inputError,
                usernameStatus === 'available' && styles.inputSuccess,
              ]}
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
            {usernameStatus === 'checking' && (
              <Text style={styles.checkingText}>확인 중...</Text>
            )}
            {usernameStatus === 'taken' && (
              <Text style={styles.errorText}>이미 사용 중인 아이디예요</Text>
            )}
            {usernameStatus === 'available' && (
              <Text style={styles.successText}>✓ 사용 가능한 아이디예요</Text>
            )}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>비밀번호</Text>
            <TextInput
              style={styles.input}
              placeholder="6자 이상"
              placeholderTextColor="#bbb"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={true}
              returnKeyType="next"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>비밀번호 확인</Text>
            <TextInput
              style={[styles.input, passwordConfirm.length > 0 && !passwordMatch && styles.inputError]}
              placeholder="비밀번호를 다시 입력해주세요"
              placeholderTextColor="#bbb"
              value={passwordConfirm}
              onChangeText={setPasswordConfirm}
              secureTextEntry={true}
              returnKeyType="done"
            />
            {passwordConfirm.length > 0 && !passwordMatch && (
              <Text style={styles.errorText}>비밀번호가 일치하지 않아요</Text>
            )}
            {passwordConfirm.length > 0 && passwordMatch && (
              <Text style={styles.successText}>✓ 일치해요</Text>
            )}
          </View>

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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
  },
  backBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14,
  },
  backText: { fontSize: 15, color: colors.primary, fontWeight: '800' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d0daf0' },
  stepDotActive: { backgroundColor: colors.primary },
  stepDotDone: { backgroundColor: colors.primaryLight },
  stepLine: { width: 20, height: 2, backgroundColor: '#d0daf0' },
  stepLineDone: { backgroundColor: colors.primaryLight },

  content: { padding: 24, gap: 20 },
  titleArea: { alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  title: { fontSize: 24, fontWeight: '900', color: '#1E293B', lineHeight: 32 },
  subtitle: { fontSize: 13, color: '#888' },

  divider: { height: 1, backgroundColor: '#e8eef8', marginVertical: 4 },

  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#334155' },
  input: {
    backgroundColor: colors.white, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: colors.text,
    borderWidth: 2, borderColor: colors.border,
  },
  inputError: { borderColor: colors.alertLight },
  inputSuccess: { borderColor: colors.success },
  checkingText: { fontSize: 12, color: '#aaa' },
  errorText: { fontSize: 12, color: colors.alertLight },
  successText: { fontSize: 12, color: colors.success },

  nextBtn: {
    backgroundColor: '#fff', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 8, borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  nextBtnDisabled: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' },
  nextBtnText: { color: colors.primary, fontWeight: '800', fontSize: 16 },
});
