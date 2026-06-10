/**
 * 하루 마무리 (당사자)
 * - 완료한 일과만 보여줌 (달성률·미완료 숨김 → 부정적 자기인식 방지)
 * - "오늘 하루 어땠나요?" 3개 이모지 자기평가 (동등 배치)
 * - 선택 시 공감 메시지 + 내일 일과 미리보기
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import * as Speech from 'expo-speech';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { getSchedules, api } from '../../api/client';
import { cleanForSpeech } from '../../utils/text';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'DailySummary'> };

const parseTitle = (t: string): { emoji: string; name: string } => {
  const parts = t.trim().split(/\s+/);
  if (parts.length >= 2 && /\p{Extended_Pictographic}/u.test(parts[0])) {
    return { emoji: parts[0], name: parts.slice(1).join(' ') };
  }
  return { emoji: '📋', name: t.trim() };
};
const todayIdx = () => (new Date().getDay() + 6) % 7;

type Mood = 'good' | 'soso' | 'bad';
const MOODS: { key: Mood; emoji: string; label: string }[] = [
  { key: 'good', emoji: '😊', label: '좋았어요' },
  { key: 'soso', emoji: '😐', label: '그저 그래요' },
  { key: 'bad',  emoji: '😢', label: '힘들었어요' },
];
const EMPATHY: Record<Mood, string> = {
  good: '기분 좋은 하루였네요! 내일도 함께해요 😊',
  soso: '그런 날도 있어요. 오늘도 충분히 잘했어요 🌤️',
  bad:  '힘든 하루였구나. 오늘 애쓴 거 정말 잘했어요. 푹 쉬어요 💙',
};

export default function DailySummaryScreen({ navigation }: Props) {
  const [theme, setTheme]       = useState(colors.primary);
  const [loading, setLoading]   = useState(true);
  const [doneTitles, setDone]   = useState<string[]>([]);
  const [tomorrow, setTomorrow] = useState<{ id: number; title: string; scheduled_time: string }[]>([]);
  const [mood, setMood]         = useState<Mood | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const col = await AsyncStorage.getItem('theme_color');
        if (col) setTheme(col);
        const stored = await AsyncStorage.getItem('user_id');
        if (!stored) return;
        const id = Number(stored);

        const rep = await api.get(`/schedules/user/${id}/today-report`);
        const items = rep.data.items ?? [];
        setDone(items.filter((it: any) => it.status === 'achieved').map((it: any) => it.title));

        const sres = await getSchedules(id);
        const tIdx = (todayIdx() + 1) % 7;
        const tList = (sres.data as any[])
          .filter(s => s.days_of_week.split(',').map(Number).includes(tIdx))
          .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
        setTomorrow(tList);
      } catch (e) { console.warn(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const pickMood = async (m: Mood) => {
    setMood(m);
    Speech.speak(cleanForSpeech(EMPATHY[m]), { language: 'ko-KR' });
    try {
      const stored = await AsyncStorage.getItem('user_id');
      if (stored) await api.post(`/schedules/user/${Number(stored)}/self-assessment`, { value: m });
    } catch {}
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: theme }]}>← 닫기</Text>
        </TouchableOpacity>
        <Text style={[styles.brand, { color: theme }]}>오늘 하루 마무리</Text>
        <View style={{ width: 56 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={theme} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

          {/* 완료한 일과 (긍정 only) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>오늘 이만큼 했어요! 🎉</Text>
            {doneTitles.length === 0 ? (
              <Text style={styles.emptyDone}>오늘도 하루를 보냈어요. 수고했어요 😊</Text>
            ) : (
              <View style={{ gap: 10, marginTop: 6 }}>
                {doneTitles.map((t, i) => {
                  const { emoji, name } = parseTitle(t);
                  return (
                    <View key={i} style={styles.doneRow}>
                      <Text style={styles.doneEmoji}>{emoji}</Text>
                      <Text style={styles.doneName}>{name}</Text>
                      <Text style={[styles.doneCheck, { color: theme }]}>✓</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* 자기평가 3이모지 */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>오늘 하루 어땠나요?</Text>
            <View style={styles.moodRow}>
              {MOODS.map(mo => {
                const active = mood === mo.key;
                return (
                  <TouchableOpacity
                    key={mo.key}
                    style={[styles.moodBtn, active && { backgroundColor: theme + '1A', borderColor: theme }]}
                    activeOpacity={0.85}
                    onPress={() => pickMood(mo.key)}
                  >
                    <Text style={styles.moodEmoji}>{mo.emoji}</Text>
                    <Text style={[styles.moodLabel, active && { color: theme, fontWeight: '800' }]}>{mo.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {mood && <Text style={[styles.empathy, { color: theme }]}>{EMPATHY[mood]}</Text>}
          </View>

          {/* 내일 미리보기 */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>내일 일과 미리보기 🌅</Text>
            {tomorrow.length === 0 ? (
              <Text style={styles.emptyDone}>내일 등록된 일과가 없어요</Text>
            ) : (
              <View style={{ gap: 8, marginTop: 6 }}>
                {tomorrow.map(s => {
                  const { emoji, name } = parseTitle(s.title);
                  return (
                    <View key={s.id} style={styles.tmrRow}>
                      <Text style={styles.tmrTime}>{s.scheduled_time}</Text>
                      <Text style={styles.tmrEmoji}>{emoji}</Text>
                      <Text style={styles.tmrName} numberOfLines={1}>{name}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <TouchableOpacity style={[styles.doneBtn, { backgroundColor: theme }]} activeOpacity={0.85}
            onPress={() => navigation.goBack()}>
            <Text style={styles.doneBtnText}>잘 자요 🌙</Text>
          </TouchableOpacity>

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
  backBtn: { width: 56 },
  backText: { fontSize: 15, fontWeight: '800' },
  brand: { fontSize: 18, fontWeight: '900' },

  body: { padding: 18, gap: 14, paddingBottom: 40 },
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 18,
    shadowColor: '#0A1F6B', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  cardTitle: { fontSize: 17, fontWeight: '900', color: '#1E293B' },

  emptyDone: { fontSize: 14, color: '#94A3B8', fontWeight: '600', marginTop: 8 },
  doneRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F8FAFF', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
  },
  doneEmoji: { fontSize: 26 },
  doneName: { flex: 1, fontSize: 17, fontWeight: '800', color: '#334155' },
  doneCheck: { fontSize: 20, fontWeight: '900' },

  moodRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  moodBtn: {
    flex: 1, alignItems: 'center', gap: 8, paddingVertical: 18, borderRadius: 18,
    backgroundColor: '#F8FAFF', borderWidth: 2, borderColor: '#EEF1F8',
  },
  moodEmoji: { fontSize: 44 },
  moodLabel: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  empathy: { fontSize: 15, fontWeight: '700', textAlign: 'center', marginTop: 16, lineHeight: 22 },

  tmrRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F8FAFF', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
  },
  tmrTime: { fontSize: 14, fontWeight: '800', color: '#94A3B8', width: 48 },
  tmrEmoji: { fontSize: 22 },
  tmrName: { flex: 1, fontSize: 16, fontWeight: '700', color: '#334155' },

  doneBtn: { borderRadius: 18, paddingVertical: 18, alignItems: 'center', marginTop: 4 },
  doneBtnText: { color: '#fff', fontWeight: '900', fontSize: 18 },
});
