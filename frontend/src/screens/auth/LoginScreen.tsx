/**
 * 로그인 화면
 * - 당사자 → PIN 로그인
 * - 보호자 → 아이디/비밀번호 로그인 (Face ID 제거됨)
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { api } from '../../api/client';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Login'>;
  route: { params?: { role?: 'guardian' } };
};

type Step = 'select' | 'guardian';

export default function LoginScreen({ navigation, route }: Props) {
  const cameAsGuardian = route?.params?.role === 'guardian';
  const [step, setStep] = useState<Step>(cameAsGuardian ? 'guardian' : 'select');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGuardianLogin = async () => {
    if (!username.trim() || !password) return;
    setLoading(true);
    try {
      const res = await api.post('/users/login/guardian', {
        username: username.trim(),
        password,
      });
      await AsyncStorage.setItem('user_id', String(res.data.user_id));
      await AsyncStorage.setItem('role', 'guardian');
      navigation.reset({ index: 0, routes: [{ name: 'GuardianReport' }] });
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? '아이디 또는 비밀번호를 확인해주세요.';
      Alert.alert('로그인 실패', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 'guardian' && !cameAsGuardian) setStep('select');
    else navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          <View style={styles.header}>
            <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
              <Text style={styles.backText}>← 뒤로</Text>
            </TouchableOpacity>
          </View>

          {/* 역할 선택 */}
          {step === 'select' && (
            <View style={styles.roleArea}>
              <Text style={styles.selectTitle}>누구로 로그인할까요?</Text>
              <View style={styles.roleRow}>
                <TouchableOpacity
                  style={styles.roleCard}
                  onPress={() => navigation.navigate('PINLogin')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.roleEmoji}>😊</Text>
                  <Text style={styles.roleTitle}>나</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.roleCard, styles.roleCardGuardian]}
                  onPress={() => setStep('guardian')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.roleEmoji}>👪</Text>
                  <Text style={[styles.roleTitle, styles.roleTitleGuardian]}>보호자</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 보호자 — 아이디/비밀번호 */}
          {step === 'guardian' && (
            <View style={styles.guardianArea}>
              <Text style={styles.brand}>Routy</Text>
              <Text style={styles.fallbackTitle}>보호자 로그인</Text>
              <Text style={styles.fallbackDesc}>아이디와 비밀번호를 입력해주세요</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>아이디</Text>
                <TextInput
                  style={styles.input}
                  placeholder="아이디를 입력해주세요"
                  placeholderTextColor="#bbb"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>비밀번호</Text>
                <TextInput
                  style={styles.input}
                  placeholder="비밀번호를 입력해주세요"
                  placeholderTextColor="#bbb"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={handleGuardianLogin}
                />
              </View>

              <TouchableOpacity
                style={[styles.loginBtn, (!username.trim() || !password) && styles.loginBtnDisabled]}
                onPress={handleGuardianLogin}
                disabled={!username.trim() || !password || loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.loginBtnText}>로그인</Text>
                }
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity onPress={() => navigation.navigate('PersonInfo')} style={styles.signupLink}>
            <Text style={styles.signupLinkText}>
              아직 계정이 없으신가요?{'  '}
              <Text style={styles.signupLinkBold}>회원가입</Text>
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FB' },
  header: { paddingHorizontal: 20, paddingTop: 12 },
  backBtn: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: colors.primaryBg, borderRadius: 20,
  },
  backText: { fontSize: 15, color: colors.primary, fontWeight: '800' },
  content: { padding: 24, gap: 28 },

  // 역할 선택
  roleArea: { gap: 16 },
  selectTitle: { fontSize: 20, fontWeight: '900', color: colors.primary, textAlign: 'center', marginBottom: 4 },
  roleRow: { flexDirection: 'row', gap: 14 },
  roleCard: {
    flex: 1,
    backgroundColor: colors.white, borderRadius: 24, paddingVertical: 32, paddingHorizontal: 12,
    alignItems: 'center', gap: 12,
    borderWidth: 2, borderColor: colors.border,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  roleCardGuardian: { borderColor: colors.guardian + '44' },
  roleEmoji: { fontSize: 52 },
  roleTitle: { fontSize: 20, fontWeight: '900', color: colors.primary },
  roleTitleGuardian: { color: colors.guardian },
  roleDesc: { fontSize: 13, color: '#aaa' },

  brand: { fontSize: 40, fontWeight: '900', color: colors.guardian, textAlign: 'center', letterSpacing: -0.5, marginBottom: 6 },
  fallbackTitle: { fontSize: 20, fontWeight: '900', color: colors.guardian, textAlign: 'center' },
  fallbackDesc: { fontSize: 13, color: '#888', textAlign: 'center' },

  guardianArea: { gap: 18 },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.primary },
  input: {
    backgroundColor: colors.white, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: colors.text,
    borderWidth: 2, borderColor: colors.border,
  },
  pwWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: {
    width: 50, height: 52, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white, borderRadius: 14,
    borderWidth: 2, borderColor: colors.border,
  },
  loginBtn: {
    backgroundColor: colors.guardian, borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', elevation: 4,
    shadowColor: colors.guardian, shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  loginBtnDisabled: { backgroundColor: '#A8D8C0', elevation: 0, shadowOpacity: 0 },
  loginBtnText: { color: colors.white, fontWeight: '800', fontSize: 17 },

  signupLink: { alignItems: 'center' },
  signupLinkText: { fontSize: 13, color: '#aaa' },
  signupLinkBold: { fontWeight: '800', color: colors.primary },
});
