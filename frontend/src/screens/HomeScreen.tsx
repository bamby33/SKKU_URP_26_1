/**
 * 초기 진입 화면
 * 사용자(발달장애인) / 보호자 선택
 */
import React, { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { colors } from '../theme/colors';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

export default function HomeScreen({ navigation }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 페이드 + 슬라이드 인
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 700,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    // 로봇 이모지 바운스
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: -10,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View
        style={[
          styles.inner,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* 상단 로고 영역 */}
        <View style={styles.logoArea}>
          <Animated.Text
            style={[styles.robotEmoji, { transform: [{ translateY: bounceAnim }] }]}
          >
            🤖
          </Animated.Text>
          <Text style={styles.appName}>AI 돌봄 도우미</Text>
          <Text style={styles.appDesc}>
            발달장애인의 일상을{'\n'}함께 돌봐드려요
          </Text>
        </View>

        {/* 선택 영역 */}
        <View style={styles.cardArea}>
          <Text style={styles.selectLabel}>누구로 시작할까요?</Text>

          {/* 사용자 카드 */}
          <TouchableOpacity
            style={styles.cardUser}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('PersonInfo', { role: 'user' })}
          >
            <Text style={styles.cardEmoji}>😊</Text>
            <View style={styles.cardTextArea}>
              <Text style={styles.cardTitle}>나예요</Text>
              <Text style={styles.cardSubtitle}>스케줄 확인 · AI와 대화</Text>
            </View>
            <Text style={styles.cardArrow}>→</Text>
          </TouchableOpacity>

          {/* 보호자 카드 */}
          <TouchableOpacity
            style={styles.cardGuardian}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('PersonInfo', { role: 'guardian' })}
          >
            <Text style={styles.cardEmoji}>👨‍👩‍👧</Text>
            <View style={styles.cardTextArea}>
              <Text style={[styles.cardTitle, { color: colors.guardian }]}>보호자예요</Text>
              <Text style={styles.cardSubtitle}>일과 리포트 · 스케줄 관리</Text>
            </View>
            <Text style={[styles.cardArrow, { color: colors.guardian }]}>→</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>발달장애인 돌봄 AI 에이전트 v0.1</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#dce8ff',
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },

  logoArea: {
    alignItems: 'center',
    gap: 12,
    flex: 1,
    justifyContent: 'center',
  },
  robotEmoji: {
    fontSize: 80,
    lineHeight: 90,
  },
  appName: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: -0.5,
  },
  appDesc: {
    fontSize: 15,
    color: colors.primary,
    opacity: 0.6,
    textAlign: 'center',
    lineHeight: 22,
  },

  cardArea: {
    gap: 14,
    marginBottom: 16,
  },
  selectLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    opacity: 0.5,
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: 0.3,
  },

  cardUser: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    elevation: 6,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  cardGuardian: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    borderWidth: 2,
    borderColor: colors.guardian,
  },
  cardEmoji: {
    fontSize: 36,
  },
  cardTextArea: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
  },
  cardSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  cardArrow: {
    fontSize: 20,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
  },

  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.primary,
    opacity: 0.35,
  },
});
