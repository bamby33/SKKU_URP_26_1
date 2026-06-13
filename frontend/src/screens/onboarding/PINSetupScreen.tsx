/**
 * 온보딩 5 · 보호자 전용
 * 당사자 4자리 숫자 PIN 설정
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PINSetup'>;
  route: RouteProp<RootStackParamList, 'PINSetup'>;
};

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

export default function PINSetupScreen({ navigation, route }: Props) {
  const params = route.params;
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState('');

  const current = step === 'enter' ? pin : confirmPin;
  const setter = step === 'enter' ? setPin : setConfirmPin;

  const handleKey = (key: string) => {
    if (key === '⌫') {
      setter((prev) => prev.slice(0, -1));
      setError('');
      return;
    }
    if (key === '') return;
    if (current.length >= 4) return;

    const next = current + key;
    setter(next);

    if (next.length === 4) {
      if (step === 'enter') {
        setTimeout(() => setStep('confirm'), 300);
      } else {
        if (next === pin) {
          navigation.navigate('Welcome', { ...params, pin });
        } else {
          Vibration.vibrate(300);
          setError('PIN이 일치하지 않아요. 다시 입력해주세요.');
          setConfirmPin('');
        }
      }
    }
  };

  const handleBack = () => {
    if (step === 'confirm') {
      setStep('enter');
      setPin('');
      setConfirmPin('');
      setError('');
    } else {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Text style={styles.backText}>← 뒤로</Text>
        </TouchableOpacity>
        <View style={styles.stepRow}>
          {[0, 1, 2, 3, 4].map((i) => (
            <React.Fragment key={i}>
              <View style={[styles.stepDot, i < 4 ? styles.stepDotDone : styles.stepDotActive]} />
              {i < 4 && <View style={[styles.stepLine, styles.stepLineDone]} />}
            </React.Fragment>
          ))}
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>
          {step === 'enter' ? '당사자 PIN을\n설정해주세요' : 'PIN을\n한 번 더 입력해주세요'}
        </Text>
        <Text style={styles.subtitle}>
          {step === 'enter'
            ? '당사자가 Face ID 실패 시 사용할 4자리 숫자예요'
            : '확인을 위해 다시 입력해주세요'}
        </Text>

        {/* PIN 도트 */}
        <View style={styles.dotRow}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[styles.dot, current.length > i && styles.dotFilled]}
            />
          ))}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* 숫자 키패드 */}
        <View style={styles.keypad}>
          {KEYS.map((key, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.key, key === '' && styles.keyEmpty]}
              onPress={() => handleKey(key)}
              disabled={key === ''}
              activeOpacity={0.7}
            >
              <Text style={[styles.keyText, key === '⌫' && styles.keyDelete]}>{key}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
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
    backgroundColor: colors.primaryBg, borderRadius: 20,
  },
  backText: { fontSize: 15, color: colors.primary, fontWeight: '800' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d0daf0' },
  stepDotActive: { backgroundColor: colors.primary },
  stepDotDone: { backgroundColor: colors.primaryLight },
  stepLine: { width: 20, height: 2, backgroundColor: '#d0daf0' },
  stepLineDone: { backgroundColor: colors.primaryLight },

  content: { flex: 1, alignItems: 'center', paddingHorizontal: 32, paddingTop: 20, gap: 20 },
  emoji: { fontSize: 64 },
  title: { fontSize: 26, fontWeight: '900', color: colors.primary, textAlign: 'center', lineHeight: 36 },
  subtitle: { fontSize: 13, color: '#888', textAlign: 'center' },

  dotRow: { flexDirection: 'row', gap: 20, marginVertical: 8 },
  dot: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#dde', borderWidth: 2, borderColor: colors.border,
  },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },

  errorText: { fontSize: 13, color: '#e05', textAlign: 'center' },

  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', gap: 12, marginTop: 8 },
  key: {
    width: '30%', aspectRatio: 1.4,
    backgroundColor: colors.white, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06,
    shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    borderWidth: 1.5, borderColor: colors.border,
  },
  keyEmpty: { backgroundColor: 'transparent', elevation: 0, borderColor: 'transparent', shadowOpacity: 0 },
  keyText: { fontSize: 24, fontWeight: '700', color: colors.primary },
  keyDelete: { fontSize: 20 },
});
