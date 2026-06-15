/**
 * 당사자 4자리 숫자 PIN 로그인 (Face ID 실패 시 폴백)
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { api } from '../../api/client';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PINLogin'>;
};

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

export default function PINLoginScreen({ navigation }: Props) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleKey = async (key: string) => {
    if (loading) return;
    if (key === '⌫') { setPin((prev) => prev.slice(0, -1)); return; }
    if (key === '') return;
    if (pin.length >= 4) return;

    const next = pin + key;
    setPin(next);

    if (next.length === 4) {
      setLoading(true);
      try {
        // 항상 PIN만으로 사용자 탐색 (PIN 고유 → 정확히 식별, 기기 잔존 user_id 무시)
        const res = await api.post('/users/pin-login', { pin: next });
        await AsyncStorage.multiSet([
          ['user_id', String(res.data.user_id)],
          ['role', 'user'], // 당사자 역할 — 보호자 푸시 억제 기준
        ]);
        navigation.reset({ index: 0, routes: [{ name: 'Schedule' }] });
      } catch (e: any) {
        Vibration.vibrate(300);
        const msg = e?.response?.data?.detail ?? 'PIN이 올바르지 않아요.';
        Alert.alert('로그인 실패', msg, [
          { text: '다시 시도', onPress: () => setPin('') },
        ]);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← 뒤로</Text>
        </TouchableOpacity>
        <Text style={styles.brand}>Routy</Text>
        <View style={{ width: 56 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>PIN 번호를 입력해주세요</Text>

        {/* PIN 도트 */}
        <View style={styles.dotRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.dot, pin.length > i && styles.dotFilled]} />
          ))}
        </View>

        {loading && <ActivityIndicator color={colors.primary} />}

        {/* 숫자 키패드 */}
        <View style={styles.keypad}>
          {KEYS.map((key, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.key, key === '' && styles.keyEmpty]}
              onPress={() => handleKey(key)}
              disabled={key === '' || loading}
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12 },
  brand: { fontSize: 22, fontWeight: '900', color: colors.primary, letterSpacing: -0.5 },
  backBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: colors.primaryBg, borderRadius: 20,
  },
  backText: { fontSize: 15, color: colors.primary, fontWeight: '800' },

  content: { flex: 1, alignItems: 'center', paddingHorizontal: 32, paddingTop: 40, gap: 24 },
  title: { fontSize: 24, fontWeight: '900', color: '#1E293B', textAlign: 'center' },

  dotRow: { flexDirection: 'row', gap: 20, marginVertical: 8 },
  dot: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#dde', borderWidth: 2, borderColor: colors.border,
  },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },

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
