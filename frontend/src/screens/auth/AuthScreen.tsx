/**
 * 가장 초기 화면
 * 로그인 / 회원가입 선택 — 로그인 누르면 나/보호자 버튼이 바로 펼쳐짐
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing,
  LayoutAnimation, UIManager, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Auth'>;
};

export default function AuthScreen({ navigation }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const [showRoles, setShowRoles] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, []);

  const revealRoles = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowRoles((v) => !v);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.inner, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

        {/* 로고 영역 */}
        <View style={styles.logoArea}>
          <Text style={styles.appName}>Routy</Text>
          <Text style={styles.appDesc}>나의 하루를{'\n'}함께 만들어가요</Text>
        </View>

        {/* 버튼 영역 */}
        <View style={styles.btnArea}>
          <TouchableOpacity
            style={styles.signupBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('PersonInfo')}
          >
            <Text style={styles.signupBtnText}>회원가입</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.loginBtn, showRoles && styles.loginBtnActive]}
            activeOpacity={0.85}
            onPress={revealRoles}
          >
            <Text style={styles.loginBtnText}>로그인</Text>
          </TouchableOpacity>

          {showRoles && (
            <View style={styles.roleRow}>
              <TouchableOpacity
                style={styles.roleCard}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('PINLogin')}
              >
                <Text style={styles.roleTitle}>나</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleCard, styles.roleCardGuardian]}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('Login', { role: 'guardian' })}
              >
                <Text style={[styles.roleTitle, styles.roleTitleGuardian]}>보호자</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Text style={styles.footer}>Routy · 함께 만드는 하루 v0.1</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 40,
    paddingBottom: 28,
    justifyContent: 'space-between',
  },

  logoArea: { alignItems: 'center', flex: 1, justifyContent: 'center', gap: 14 },
  appName: { fontSize: 72, fontWeight: '900', color: colors.primary, letterSpacing: -1 },
  appDesc: { fontSize: 15, color: colors.primary, opacity: 0.6, textAlign: 'center', lineHeight: 23 },

  btnArea: { gap: 14, marginBottom: 16 },

  signupBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 20,
    alignItems: 'center',
    elevation: 6,
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    gap: 3,
  },
  signupBtnText: { color: colors.white, fontSize: 18, fontWeight: '800' },

  loginBtn: {
    backgroundColor: '#F5F7FA',
    borderRadius: 20,
    paddingVertical: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary + '33',
    gap: 3,
  },
  loginBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  loginBtnText: { color: colors.primary, fontSize: 18, fontWeight: '800' },

  // 인라인 역할 선택
  roleRow: { flexDirection: 'row', gap: 12, marginTop: 2 },
  roleCard: {
    flex: 1,
    backgroundColor: colors.white, borderRadius: 18, paddingVertical: 22, alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: colors.border,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  roleCardGuardian: { borderColor: colors.guardian + '55' },
  roleEmoji: { fontSize: 40 },
  roleTitle: { fontSize: 17, fontWeight: '900', color: colors.primary },
  roleTitleGuardian: { color: colors.guardian },

  footer: { textAlign: 'center', fontSize: 11, color: colors.primary, opacity: 0.35 },
});
