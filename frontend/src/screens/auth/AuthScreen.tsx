/**
 * 가장 초기 화면
 * 로그인 / 회원가입 선택
 */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Auth'>;
};

export default function AuthScreen({ navigation }: Props) {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -12, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.inner, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

        {/* 로고 영역 */}
        <View style={styles.logoArea}>
          <Animated.Text style={[styles.robotEmoji, { transform: [{ translateY: bounceAnim }] }]}>
            🤖
          </Animated.Text>
          <Text style={styles.appName}>AI 돌봄 도우미</Text>
          <Text style={styles.appDesc}>발달장애인의 일상을{'\n'}함께 돌봐드려요</Text>
        </View>

        {/* 버튼 영역 */}
        <View style={styles.btnArea}>
          <TouchableOpacity
            style={styles.signupBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('PersonInfo')}
          >
            <Text style={styles.signupBtnText}>회원가입</Text>
            <Text style={styles.signupBtnSub}>처음 이용하시나요?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.loginBtnText}>로그인</Text>
            <Text style={styles.loginBtnSub}>이미 계정이 있으신가요?</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>발달장애인 돌봄 AI 에이전트 v0.1</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#dce8ff' },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 40,
    paddingBottom: 28,
    justifyContent: 'space-between',
  },

  logoArea: { alignItems: 'center', flex: 1, justifyContent: 'center', gap: 14 },
  robotEmoji: { fontSize: 90, lineHeight: 100 },
  appName: { fontSize: 28, fontWeight: '900', color: colors.primary, letterSpacing: -0.5 },
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
  signupBtnSub: { color: 'rgba(255,255,255,0.65)', fontSize: 12 },

  loginBtn: {
    backgroundColor: colors.white,
    borderRadius: 20,
    paddingVertical: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    gap: 3,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  loginBtnText: { color: colors.primary, fontSize: 18, fontWeight: '800' },
  loginBtnSub: { color: colors.primary, opacity: 0.5, fontSize: 12 },

  footer: { textAlign: 'center', fontSize: 11, color: colors.primary, opacity: 0.35 },
});
