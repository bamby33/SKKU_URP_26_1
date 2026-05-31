/**
 * 로그인 화면
 * 1) 당사자 / 보호자 선택
 * 2) 선택 즉시 Face ID 시도
 * 3) 실패 시 → 당사자: PIN 입력 / 보호자: 아이디·비번
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { api } from '../../api/client';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Login'>;
};

type Role = 'user' | 'guardian';
type Step = 'select' | 'greeting' | 'fallback';

export default function LoginScreen({ navigation }: Props) {
  const [role, setRole] = useState<Role | null>(null);
  const [step, setStep] = useState<Step>('select');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const tryFaceID = async (selectedRole: Role) => {
    setRole(selectedRole);
    setStep('greeting');

    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);

    if (!hasHardware || !isEnrolled) {
      setStep('fallback');
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: '얼굴 인식으로 로그인',
      cancelLabel: '취소',
    });

    if (result.success) {
      if (selectedRole === 'user') {
        await AsyncStorage.setItem('role', 'user');
        navigation.reset({ index: 0, routes: [{ name: 'Schedule' }] });
      } else {
        await AsyncStorage.setItem('role', 'guardian');
        navigation.reset({ index: 0, routes: [{ name: 'GuardianReport' }] });
      }
    } else {
      setStep('fallback');
    }
  };

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
    if (step === 'fallback') {
      setStep('select');
      setRole(null);
    } else {
      navigation.goBack();
    }
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

          {/* 인사 (당사자/보호자 탭 후 Face ID 시도 중) */}
          {step === 'greeting' && (
            <View style={styles.greetingArea}>
              <Text style={styles.greetingEmoji}>{role === 'user' ? '😊' : '👨‍👩‍👧'}</Text>
              <Text style={styles.greetingText}>안녕하세요!</Text>
            </View>
          )}

          {/* 역할 선택 */}
          {step === 'select' && (
            <View style={styles.roleArea}>
              <TouchableOpacity
                style={styles.roleCard}
                onPress={() => tryFaceID('user')}
                activeOpacity={0.85}
              >
                <Text style={styles.roleEmoji}>😊</Text>
                <Text style={styles.roleTitle}>당사자</Text>
                <Text style={styles.roleDesc}>Face ID로 로그인</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.roleCard, styles.roleCardGuardian]}
                onPress={() => tryFaceID('guardian')}
                activeOpacity={0.85}
              >
                <Text style={styles.roleEmoji}>👨‍👩‍👧</Text>
                <Text style={[styles.roleTitle, styles.roleTitleGuardian]}>보호자</Text>
                <Text style={styles.roleDesc}>Face ID로 로그인</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 폴백 — 당사자: PIN */}
          {step === 'fallback' && role === 'user' && (
            <View style={styles.fallbackArea}>
              <Text style={styles.fallbackTitle}>Face ID를 사용할 수 없어요</Text>
              <Text style={styles.fallbackDesc}>PIN 번호로 로그인해주세요</Text>
              <TouchableOpacity
                style={styles.pinBtn}
                onPress={() => navigation.navigate('PINLogin')}
                activeOpacity={0.85}
              >
                <Text style={styles.pinBtnText}>🔢  PIN 입력하기</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 폴백 — 보호자: 아이디/비밀번호 */}
          {step === 'fallback' && role === 'guardian' && (
            <View style={styles.guardianArea}>
              <Text style={styles.fallbackTitle}>Face ID를 사용할 수 없어요</Text>
              <Text style={styles.fallbackDesc}>아이디와 비밀번호로 로그인해주세요</Text>

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
                <View style={styles.pwWrap}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="비밀번호를 입력해주세요"
                    placeholderTextColor="#bbb"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPw}
                    returnKeyType="done"
                    onSubmitEditing={handleGuardianLogin}
                  />
                  <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPw(!showPw)}>
                    <Text>{showPw ? '🙈' : '👁️'}</Text>
                  </TouchableOpacity>
                </View>
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
  container: { flex: 1, backgroundColor: '#F4FAF7' },
  header: { paddingHorizontal: 20, paddingTop: 12 },
  backBtn: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: colors.primaryBg, borderRadius: 20,
  },
  backText: { fontSize: 15, color: colors.primary, fontWeight: '800' },
  content: { padding: 24, gap: 28 },

  titleArea: { alignItems: 'center', gap: 8 },
  titleEmoji: { fontSize: 52 },
  title: { fontSize: 28, fontWeight: '900', color: colors.primary },

  // 역할 선택
  roleArea: { gap: 16 },
  roleCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: colors.border,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  roleCardGuardian: { borderColor: colors.guardian + '44' },
  roleEmoji: { fontSize: 52 },
  roleTitle: { fontSize: 20, fontWeight: '900', color: colors.primary },
  roleTitleGuardian: { color: colors.guardian },
  roleDesc: { fontSize: 13, color: '#aaa' },

  // 폴백 공통
  fallbackArea: { alignItems: 'center', gap: 16 },
  fallbackTitle: { fontSize: 17, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  fallbackDesc: { fontSize: 13, color: '#888', textAlign: 'center' },

  // 당사자 PIN 버튼
  pinBtn: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 40,
    elevation: 4,
    shadowColor: colors.primary,
    shadowOpacity: 0.32,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  pinBtnText: { color: colors.white, fontWeight: '800', fontSize: 16 },

  // 보호자 폴백
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
    shadowColor: colors.guardian, shadowOpacity: 0.32,
    shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  loginBtnDisabled: { backgroundColor: '#A8D8C0', elevation: 0, shadowOpacity: 0 },
  loginBtnText: { color: colors.white, fontWeight: '800', fontSize: 17 },

  greetingArea: { alignItems: 'center', gap: 16, paddingVertical: 40 },
  greetingEmoji: { fontSize: 80 },
  greetingText: { fontSize: 32, fontWeight: '900', color: colors.primary },

  signupLink: { alignItems: 'center' },
  signupLinkText: { fontSize: 13, color: '#aaa' },
  signupLinkBold: { fontWeight: '800', color: colors.primary },
});
