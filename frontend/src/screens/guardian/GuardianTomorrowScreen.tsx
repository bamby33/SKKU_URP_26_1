/**
 * 보호자 — 내일 준비 (대시보드에서 분리)
 * 내일 스케줄 미리보기 + 특이사항 입력 → AI 스케줄 업데이트
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { api } from '../../api/client';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'GuardianTomorrow'> };

const noEmoji = (t: string) => t.replace(/\p{Extended_Pictographic}/gu, '').replace(/️/g, '').trim();
const formatTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? '오전' : '오후';
  return `${ampm} ${h % 12 || 12}:${String(m).padStart(2, '0')}`;
};

type Suggestion = {
  type: string; title: string; schedule_ids: number[];
  message: string; applicable: boolean; action: { new_end_time?: string };
};
const SUGG_ICON: Record<string, string> = {
  shorten: '⏱', rest: '🔁', review: '🔴', reduce: '➖', add_easy: '➕',
};

export default function GuardianTomorrowScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [tomorrow, setTomorrow] = useState<{ id: number; title: string; time: string }[]>([]);
  const [note, setNote] = useState('');
  const [updating, setUpdating] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [applied, setApplied] = useState<Set<number>>(new Set());

  const fetch = async () => {
    try {
      const uid = await AsyncStorage.getItem('user_id');
      if (!uid) return;
      const res = await api.get(`/guardian/user/${uid}/dashboard`);
      setTomorrow(res.data.tomorrow_schedules ?? []);
      try {
        const sg = await api.get(`/ai/next-day-suggestions/${uid}`);
        setSuggestions(sg.data.suggestions ?? []);
      } catch {}
    } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { fetch(); }, []);

  const applyShorten = async (s: Suggestion, idx: number) => {
    if (!s.action.new_end_time) return;
    try {
      await api.post('/ai/apply-shorten', { schedule_ids: s.schedule_ids, new_end_time: s.action.new_end_time });
      setApplied(prev => new Set(prev).add(idx));
      await fetch();
      Alert.alert('적용 완료', `'${s.title}' 시간을 줄였어요.`);
    } catch {
      Alert.alert('오류', '적용에 실패했어요. 다시 시도해주세요.');
    }
  };

  const handleUpdate = async () => {
    if (!note.trim()) { Alert.alert('입력 필요', '내일 특이사항을 입력해주세요.'); return; }
    setUpdating(true);
    try {
      const uid = await AsyncStorage.getItem('user_id');
      if (!uid) return;
      await api.post('/ai/update-tomorrow', { user_id: Number(uid), note: note.trim() });
      setNote('');
      await fetch();
      Alert.alert('완료', '내일 스케줄에 반영했어요.');
    } catch {
      Alert.alert('오류', 'AI 스케줄 업데이트에 실패했어요. 다시 시도해주세요.');
    } finally { setUpdating(false); }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 56 }}>
          <Text style={styles.back}>← 닫기</Text>
        </TouchableOpacity>
        <Text style={styles.title}>내일 일과</Text>
        <View style={{ width: 56 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.guardian} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {/* AI 다음날 제안 */}
          {suggestions.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>AI 제안 <Text style={styles.sectionSub}>(최근 일과 기반)</Text></Text>
              <View style={{ gap: 10 }}>
                {suggestions.map((s, i) => (
                  <View key={i} style={styles.suggCard}>
                    <Text style={styles.suggIcon}>{SUGG_ICON[s.type] ?? '💡'}</Text>
                    <View style={{ flex: 1, gap: 8 }}>
                      <Text style={styles.suggMsg}>{s.message}</Text>
                      {s.applicable && s.type === 'shorten' && (
                        applied.has(i) ? (
                          <Text style={styles.suggApplied}>✓ 적용됨</Text>
                        ) : (
                          <TouchableOpacity style={styles.suggApplyBtn} activeOpacity={0.85} onPress={() => applyShorten(s, i)}>
                            <Text style={styles.suggApplyText}>적용하기</Text>
                          </TouchableOpacity>
                        )
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          <Text style={styles.sectionTitle}>내일 스케줄</Text>
          {tomorrow.length ? (
            <View style={styles.card}>
              {tomorrow.map((item, i) => (
                <View key={item.id} style={[styles.row, i === tomorrow.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={styles.rowTime}>{formatTime(item.time)}</Text>
                  <Text style={styles.rowLabel}>{noEmoji(item.title)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyCard}><Text style={styles.emptyText}>내일 등록된 스케줄이 없어요.</Text></View>
          )}

          <View style={styles.noteCard}>
            <Text style={styles.noteLabel}>내일 특이사항</Text>
            <TextInput
              style={styles.noteInput}
              placeholder={'예) 내일 12시에 병원 예약이 있어요'}
              placeholderTextColor="#bbb"
              value={note}
              onChangeText={setNote}
              multiline numberOfLines={3} textAlignVertical="top"
            />
            <TouchableOpacity
              style={[styles.updateBtn, updating && { opacity: 0.6 }]}
              activeOpacity={0.85} onPress={handleUpdate} disabled={updating}
            >
              {updating ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.updateBtnText}>스케줄 업데이트하기</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F6FB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 14, paddingBottom: 8,
  },
  back: { fontSize: 15, fontWeight: '800', color: colors.guardian },
  title: { fontSize: 18, fontWeight: '900', color: colors.guardian },
  body: { padding: 16, gap: 12, paddingBottom: 40 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.primary },
  sectionSub: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  suggCard: {
    backgroundColor: colors.white, borderRadius: 16, padding: 14,
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderLeftWidth: 4, borderLeftColor: colors.guardian,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  suggIcon: { fontSize: 20 },
  suggMsg: { fontSize: 14, color: '#334155', fontWeight: '600', lineHeight: 21 },
  suggApplyBtn: { alignSelf: 'flex-start', backgroundColor: colors.guardian, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  suggApplyText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  suggApplied: { color: '#16A34A', fontWeight: '800', fontSize: 13 },
  card: {
    backgroundColor: colors.white, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 4,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  rowTime: { color: colors.guardian, fontWeight: '800', fontSize: 13, width: 76 },
  rowLabel: { flex: 1, fontSize: 15, color: '#334155', fontWeight: '600' },
  emptyCard: { backgroundColor: colors.white, borderRadius: 18, padding: 20, alignItems: 'center' },
  emptyText: { color: '#94A3B8', fontSize: 13 },
  noteCard: {
    backgroundColor: colors.white, borderRadius: 18, padding: 16, gap: 10, marginTop: 4,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  noteLabel: { fontSize: 13, fontWeight: '800', color: colors.primary },
  noteInput: {
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, minHeight: 70,
    fontSize: 14, color: '#334155', borderWidth: 1, borderColor: '#E2E8F0',
  },
  updateBtn: { backgroundColor: colors.guardian, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  updateBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
