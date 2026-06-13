/**
 * 보호자 — 오늘 일과 (현재 일과 카드 탭 시 진입)
 * 오늘 전체 일과를 완료/미완료/대기 상태와 함께 표시
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { api } from '../../api/client';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'GuardianToday'> };

const noEmoji = (t: string) => t.replace(/\p{Extended_Pictographic}/gu, '').replace(/️/g, '').trim();
const formatTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(m).padStart(2, '0')}`;
};
const statusLabel = (s: string) => (s === 'achieved' ? '완료' : s === 'missed' ? '미완료' : '대기');
const statusBg = (s: string) => (s === 'achieved' ? '#D1FAE5' : s === 'missed' ? '#FEE2E2' : '#F1F5F9');
const statusColor = (s: string) => (s === 'achieved' ? '#065F46' : s === 'missed' ? '#991B1B' : '#64748B');

export default function GuardianTodayScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<{ schedule_id: number; title: string; time: string; status: string }[]>([]);
  const [rate, setRate] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const uid = await AsyncStorage.getItem('user_id');
        if (!uid) return;
        const res = await api.get(`/guardian/user/${uid}/dashboard`);
        setItems(res.data.today_items ?? []);
        setRate(res.data.live_rate ?? 0);
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 56 }}>
          <Text style={styles.back}>← 닫기</Text>
        </TouchableOpacity>
        <Text style={styles.title}>오늘 일과</Text>
        <View style={{ width: 56 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.guardian} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.rateCard}>
            <Text style={styles.rateLabel}>오늘 달성률</Text>
            <Text style={styles.rateValue}>{rate}%</Text>
          </View>
          {items.length ? (
            <View style={styles.card}>
              {items.map((item, i) => (
                <View key={item.schedule_id} style={[styles.row, i === items.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={styles.rowTime}>{formatTime(item.time)}</Text>
                  <Text style={styles.rowLabel} numberOfLines={1}>{noEmoji(item.title)}</Text>
                  <View style={[styles.badge, { backgroundColor: statusBg(item.status) }]}>
                    <Text style={[styles.badgeText, { color: statusColor(item.status) }]}>{statusLabel(item.status)}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyCard}><Text style={styles.emptyText}>오늘 등록된 일과가 없어요.</Text></View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 14, paddingBottom: 8,
  },
  back: { fontSize: 15, fontWeight: '800', color: colors.guardian },
  title: { fontSize: 18, fontWeight: '900', color: '#1E293B' },
  body: { padding: 16, gap: 12, paddingBottom: 40 },
  rateCard: {
    backgroundColor: colors.white, borderRadius: 16, padding: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  rateLabel: { fontSize: 14, fontWeight: '800', color: colors.primary },
  rateValue: { fontSize: 24, fontWeight: '900', color: colors.guardian },
  card: {
    backgroundColor: colors.white, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 4,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  rowTime: { color: colors.guardian, fontWeight: '800', fontSize: 13, width: 76 },
  rowLabel: { flex: 1, fontSize: 15, color: '#334155', fontWeight: '600' },
  badge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  emptyCard: { backgroundColor: colors.white, borderRadius: 18, padding: 20, alignItems: 'center' },
  emptyText: { color: '#94A3B8', fontSize: 13 },
});
