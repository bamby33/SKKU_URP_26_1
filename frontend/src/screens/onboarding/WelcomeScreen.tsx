/**
 * 온보딩 완료 · AI 인사 화면
 * 회원가입 API + PIN 설정 API 호출 후 보호자 메인으로 이동
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { api } from '../../api/client';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Welcome'>;
  route: RouteProp<RootStackParamList, 'Welcome'>;
};

export default function WelcomeScreen({ navigation, route }: Props) {
  const {
    userName, guardianName, guardianPhone,
    username, password, pins, schedules,
  } = route.params;

  const slotToTime = (slot: number) => {
    const mins = 6 * 60 + slot * 30;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const bounceAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const bubbleFade = useRef(new Animated.Value(0)).current;
  const bubbleSlide = useRef(new Animated.Value(16)).current;
  const btnFade = useRef(new Animated.Value(0)).current;

  const [dots, setDots] = useState('');
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -12, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(bubbleFade, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(bubbleSlide, { toValue: 0, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.delay(600),
      Animated.timing(btnFade, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    setRegistering(true);
    try {
      // 1. 사용자 + 보호자 회원가입
      const res = await api.post('/users/', {
        name: userName,
        disability_type: 'intellectual',
        disability_level: 'mild',
        guardian: {
          name: guardianName,
          phone: guardianPhone,
          username,
          password,
        },
      });
      const userId = res.data.id;
      await AsyncStorage.setItem('user_id', String(userId));
      await AsyncStorage.setItem('role', 'guardian');

      // 2. PIN 설정
      await api.post(`/users/${userId}/pins`, pins);

      // 3. 스케줄 저장
      for (const s of schedules) {
        await api.post('/schedules/', {
          user_id: userId,
          title: `${s.emoji} ${s.activity}`,
          scheduled_time: slotToTime(s.startSlot),
          days_of_week: String(s.day),
        });
      }

      navigation.reset({ index: 0, routes: [{ name: 'GuardianReport' }] });
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? '회원가입 중 오류가 발생했어요.';
      Alert.alert('오류', msg);
    } finally {
      setRegistering(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.inner, { opacity: fadeAnim }]}>

        {/* 뒤로가기 */}
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← 뒤로</Text>
        </TouchableOpacity>

        <View style={styles.robotArea}>
          <Animated.Text style={[styles.robotEmoji, { transform: [{ translateY: bounceAnim }] }]}>
            🤖
          </Animated.Text>
        </View>

        <Animated.View style={[
          styles.bubbleWrap,
          { opacity: bubbleFade, transform: [{ translateY: bubbleSlide }] },
        ]}>
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>
              안녕하세요, <Text style={styles.nameHighlight}>{guardianName}</Text>님! 👋
            </Text>
          </View>
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>
              <Text style={styles.nameHighlight}>{userName}</Text>의 일과를{'\n'}AI가 함께 관리할게요 📅
            </Text>
          </View>
          <View style={[styles.bubble, styles.bubbleTyping]}>
            <Text style={[styles.bubbleText, { color: colors.guardian }]}>
              보호자 대시보드를 준비할게요{dots}
            </Text>
          </View>
        </Animated.View>

        <Animated.View style={[styles.btnWrap, { opacity: btnFade }]}>
          <TouchableOpacity
            style={styles.startBtn}
            onPress={handleStart}
            disabled={registering}
            activeOpacity={0.85}
          >
            {registering
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.startBtnText}>대시보드 보기 →</Text>
            }
          </TouchableOpacity>
        </Animated.View>

      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#d6f0d8' },
  inner: {
    flex: 1, paddingHorizontal: 28, paddingTop: 16, paddingBottom: 32,
    justifyContent: 'space-between',
  },
  backBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(6,95,70,0.1)',
    borderRadius: 20,
  },
  backText: { fontSize: 15, color: colors.guardian, fontWeight: '800' },
  robotArea: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  robotEmoji: { fontSize: 100, lineHeight: 110 },

  bubbleWrap: { gap: 12, marginBottom: 12 },
  bubble: {
    backgroundColor: colors.white, borderRadius: 20, borderBottomLeftRadius: 4,
    paddingHorizontal: 18, paddingVertical: 14,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.07,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    alignSelf: 'flex-start', maxWidth: '85%',
  },
  bubbleTyping: { backgroundColor: '#e8f5e9' },
  bubbleText: { fontSize: 16, color: colors.primary, fontWeight: '700', lineHeight: 24 },
  nameHighlight: { fontSize: 18, fontWeight: '900', color: colors.primaryLight },

  btnWrap: { marginTop: 8 },
  startBtn: {
    backgroundColor: colors.guardian, borderRadius: 18, paddingVertical: 18,
    alignItems: 'center', elevation: 6,
    shadowColor: colors.guardian, shadowOpacity: 0.35,
    shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  startBtnText: { color: colors.white, fontWeight: '800', fontSize: 17 },
});
