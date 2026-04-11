/**
 * 로그인 화면
 * 보호자: 아이디/비밀번호 | 당사자: 얼굴인식(생체인식)
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
};

type Tab = 'user' | 'guardian';

export default function LoginScreen({ navigation }: Props) {
  const [tab, setTab] = useState<Tab>('user');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleUserLogin = () => {
    navigation.navigate('PINLogin');
  };

  // ── 보호자: 아이디/비밀번호 로그인 ──────────────────────────────────────────
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

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* 헤더 */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backText}>← 뒤로</Text>
            </TouchableOpacity>
          </View>

          {/* 타이틀 */}
          <View style={styles.titleArea}>
            <Text style={styles.titleEmoji}>👋</Text>
            <Text style={styles.title}>다시 만나요!</Text>
          </View>

          {/* 탭 */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, tab === 'user' && styles.tabActive]}
              onPress={() => setTab('user')}
            >
              <Text style={[styles.tabText, tab === 'user' && styles.tabTextActive]}>
                😊 당사자
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tab === 'guardian' && styles.tabActiveGuardian]}
              onPress={() => setTab('guardian')}
            >
              <Text style={[styles.tabText, tab === 'guardian' && styles.tabTextActive]}>
                👨‍👩‍👧 보호자
              </Text>
            </TouchableOpacity>
          </View>

          {/* 당사자 탭 */}
          {tab === 'user' && (
            <View style={styles.biometricArea}>
              <View style={styles.biometricCard}>
                <Text style={styles.biometricEmoji}>🎯</Text>
                <Text style={styles.biometricTitle}>좋아하는 걸로 로그인</Text>
                <Text style={styles.biometricDesc}>
                  보호자가 설정한{'\n'}취향 문제 3개를 맞추면 로그인돼요
                </Text>
                <TouchableOpacity
                  style={styles.biometricBtn}
                  onPress={handleUserLogin}
                  activeOpacity={0.85}
                >
                  <Text style={styles.biometricBtnIcon}>🍗</Text>
                  <Text style={styles.biometricBtnText}>취향 선택으로 로그인</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.biometricHint}>
                처음 사용하신다면 보호자가 먼저 회원가입을 해주세요
              </Text>
            </View>
          )}

          {/* 보호자 탭 */}
          {tab === 'guardian' && (
            <View style={styles.guardianArea}>
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
                style={[
                  styles.loginBtn,
                  (!username.trim() || !password) && styles.loginBtnDisabled,
                ]}
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

          {/* 회원가입 링크 */}
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
  container: { flex: 1, backgroundColor: '#f4f7ff' },

  header: { paddingHorizontal: 20, paddingTop: 12 },
  backBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.primaryBg,
    borderRadius: 20,
  },
  backText: { fontSize: 15, color: colors.primary, fontWeight: '800' },

  content: { padding: 24, gap: 24 },

  titleArea: { alignItems: 'center', gap: 8 },
  titleEmoji: { fontSize: 52 },
  title: { fontSize: 28, fontWeight: '900', color: colors.primary },

  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#e4eaf8',
    borderRadius: 16,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 13,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.primary },
  tabActiveGuardian: { backgroundColor: colors.guardian },
  tabText: { fontSize: 14, fontWeight: '700', color: '#888' },
  tabTextActive: { color: colors.white },

  // 당사자 영역
  biometricArea: { gap: 14, alignItems: 'center' },
  biometricCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 12,
    width: '100%',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  biometricEmoji: { fontSize: 64 },
  biometricTitle: { fontSize: 18, fontWeight: '800', color: colors.primary },
  biometricDesc: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 20 },
  biometricBtn: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    elevation: 4,
    shadowColor: colors.primary,
    shadowOpacity: 0.32,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  biometricBtnIcon: { fontSize: 20 },
  biometricBtnText: { color: colors.white, fontWeight: '800', fontSize: 15 },
  biometricHint: { fontSize: 12, color: '#aaa', textAlign: 'center' },

  // 보호자 영역
  guardianArea: { gap: 18 },
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
  pwWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: {
    width: 50, height: 52, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white, borderRadius: 14,
    borderWidth: 2, borderColor: colors.border,
  },
  loginBtn: {
    backgroundColor: colors.guardian,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    elevation: 4,
    shadowColor: colors.guardian,
    shadowOpacity: 0.32,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  loginBtnDisabled: { backgroundColor: '#c5d0e8', elevation: 0, shadowOpacity: 0 },
  loginBtnText: { color: colors.white, fontWeight: '800', fontSize: 17 },

  signupLink: { alignItems: 'center' },
  signupLinkText: { fontSize: 13, color: '#aaa' },
  signupLinkBold: { fontWeight: '800', color: colors.primary },
});
