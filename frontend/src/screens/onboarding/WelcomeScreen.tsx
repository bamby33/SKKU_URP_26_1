/**
 * 온보딩 · AI 인사 화면
 * 기본정보 입력 후 이름 불러주며 따뜻하게 시작
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Welcome'>;
  route: RouteProp<RootStackParamList, 'Welcome'>;
};

export default function WelcomeScreen({ navigation, route }: Props) {
  const { name, role } = route.params;

  const bounceAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const bubbleFade = useRef(new Animated.Value(0)).current;
  const bubbleSlide = useRef(new Animated.Value(16)).current;
  const btnFade = useRef(new Animated.Value(0)).current;

  const [dots, setDots] = useState('');

  // 로봇 바운스
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -12, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // 순차 등장 애니메이션
  useEffect(() => {
    Animated.sequence([
      // 1. 배경 페이드인
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      // 2. 말풍선 슬라이드업
      Animated.parallel([
        Animated.timing(bubbleFade, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(bubbleSlide, { toValue: 0, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      // 3. 버튼 페이드인
      Animated.delay(600),
      Animated.timing(btnFade, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  // 타이핑 점 애니메이션
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const handleStart = () => {
    if (role === 'guardian') {
      navigation.navigate('GuardianReport');
    } else {
      navigation.navigate('Schedule');
    }
  };

  const isGuardian = role === 'guardian';

  return (
    <SafeAreaView style={[styles.container, isGuardian && styles.containerGuardian]}>
      <Animated.View style={[styles.inner, { opacity: fadeAnim }]}>

        {/* 로봇 */}
        <View style={styles.robotArea}>
          <Animated.Text style={[styles.robotEmoji, { transform: [{ translateY: bounceAnim }] }]}>
            🤖
          </Animated.Text>
        </View>

        {/* 말풍선 */}
        <Animated.View style={[
          styles.bubbleWrap,
          { opacity: bubbleFade, transform: [{ translateY: bubbleSlide }] },
        ]}>
          {/* 첫 번째 말풍선 */}
          <View style={[styles.bubble, isGuardian && styles.bubbleGuardian]}>
            <Text style={[styles.bubbleText, isGuardian && styles.bubbleTextGuardian]}>
              안녕하세요, <Text style={styles.nameHighlight}>{name}</Text>님! 👋
            </Text>
          </View>

          {/* 두 번째 말풍선 */}
          <View style={[styles.bubble, styles.bubbleDelay, isGuardian && styles.bubbleGuardian]}>
            <Text style={[styles.bubbleText, isGuardian && styles.bubbleTextGuardian]}>
              {isGuardian
                ? `${name} 님의 일과를\nAI가 함께 관리할게요 📅`
                : `오늘 하루도 AI가\n옆에 있을게요 💙`}
            </Text>
          </View>

          {/* 세 번째 말풍선 — 타이핑 중 */}
          <View style={[styles.bubble, styles.bubbleTyping, isGuardian && styles.bubbleGuardian]}>
            <Text style={[styles.bubbleText, isGuardian && styles.bubbleTextGuardian]}>
              {isGuardian
                ? `보호자 대시보드를 준비할게요${dots}`
                : `오늘 일과를 불러오고 있어요${dots}`}
            </Text>
          </View>
        </Animated.View>

        {/* 시작 버튼 */}
        <Animated.View style={[styles.btnWrap, { opacity: btnFade }]}>
          <TouchableOpacity
            style={[styles.startBtn, isGuardian && styles.startBtnGuardian]}
            onPress={handleStart}
            activeOpacity={0.85}
          >
            <Text style={styles.startBtnText}>
              {isGuardian ? '대시보드 보기 →' : '오늘 일과 보기 →'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#dce8ff',
  },
  containerGuardian: {
    backgroundColor: '#d6f0d8',
  },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 40,
    paddingBottom: 32,
    justifyContent: 'space-between',
  },

  robotArea: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  robotEmoji: {
    fontSize: 100,
    lineHeight: 110,
  },

  bubbleWrap: {
    gap: 12,
    marginBottom: 12,
  },
  bubble: {
    backgroundColor: colors.white,
    borderRadius: 20,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 18,
    paddingVertical: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  bubbleGuardian: {
    // 보호자용은 동일 스타일 (색상 차이 없이 배경으로 구분)
  },
  bubbleDelay: {
    alignSelf: 'flex-start',
  },
  bubbleTyping: {
    backgroundColor: colors.primaryBg,
  },
  bubbleText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '700',
    lineHeight: 24,
  },
  bubbleTextGuardian: {
    color: colors.guardian,
  },
  nameHighlight: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.primaryLight,
  },

  btnWrap: {
    marginTop: 8,
  },
  startBtn: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    elevation: 6,
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  startBtnGuardian: {
    backgroundColor: colors.guardian,
    shadowColor: colors.guardian,
  },
  startBtnText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 17,
  },
});
