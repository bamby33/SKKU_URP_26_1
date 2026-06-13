/**
 * 보호자 — 하루 Recap (취침 1시간 전 알림 → 진입)
 * 초록 배경에서 말풍선이 순차로 등장하며 하루를 돌아봄 (스포티파이 Wrapped 느낌)
 * 1) 하루 평가 → 2) 오늘 달성/적합도 → 3) 주간 통계 → 4) 내일 스케줄 제안 + 적용
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Easing, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppFrame from '../../components/AppFrame';
import { SchedIcon } from '../../components/SchedIcon';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { api } from '../../api/client';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'GuardianRecap'> };

const noEmoji = (t: string) => t.replace(/\p{Extended_Pictographic}/gu, '').replace(/️/g, '').trim();
const norm = (t: string) => t.replace(/[^\w가-힣]/gu, '').toLowerCase();
const fmt = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(m).padStart(2, '0')}`;
};
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const MOOD: Record<string, { emoji: string; label: string; msg: string }> = {
  good: { emoji: '😊', label: '좋았어요', msg: '기분 좋은 하루였네요!' },
  soso: { emoji: '😐', label: '그저 그래요', msg: '그런 날도 있죠. 오늘도 충분히 잘했어요.' },
  bad:  { emoji: '😢', label: '힘들었어요', msg: '힘든 하루였구나. 애쓴 만큼 충분해요.' },
};

type Sugg = { type: string; title: string; schedule_ids: number[]; message: string; applicable: boolean; action: { new_end_time?: string; user_id?: number; rest_start?: string; rest_end?: string; days_of_week?: string }; planned_min?: number; new_min?: number };

// 부드럽게 등장하는 블록
function Block({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 450, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

export default function GuardianRecapScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<Sugg[]>([]);
  const [step, setStep] = useState(0);   // 보여줄 단계 수 (0=인사만)
  const [applied, setApplied] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    (async () => {
      try {
        const uid = await AsyncStorage.getItem('user_id');
        if (!uid) return;
        const d = await api.get(`/guardian/user/${uid}/dashboard`);
        setData(d.data);
        try {
          const s = await api.get(`/ai/next-day-suggestions/${uid}`);
          setSuggestions(s.data.suggestions ?? []);
        } catch {}
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  const next = () => {
    setStep(s => s + 1);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  };

  const applyAll = async () => {
    const shortens = suggestions.filter(s => s.type === 'shorten' && s.action.new_end_time);
    const rests = suggestions.filter(s => s.type === 'rest' && s.applicable && s.action.rest_start);
    try {
      for (const s of shortens) {
        await api.post('/ai/apply-shorten', { schedule_ids: s.schedule_ids, new_end_time: s.action.new_end_time });
      }
      for (const s of rests) {
        await api.post('/ai/apply-rest', {
          user_id: s.action.user_id, rest_start: s.action.rest_start,
          rest_end: s.action.rest_end, days_of_week: s.action.days_of_week,
        });
      }
      setApplied(true);
      Alert.alert('적용 완료', '내일 스케줄에 반영했어요.');
    } catch {
      Alert.alert('오류', '적용에 실패했어요.');
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.root}><ActivityIndicator color="#fff" style={{ marginTop: 60 }} /></SafeAreaView>;
  }

  const name = data?.user_name || '아이';
  const mood = data?.self_assessment ? MOOD[data.self_assessment] : null;
  const items: any[] = data?.today_items ?? [];
  const done = items.filter(i => i.status === 'achieved');
  // 오늘 힘들어한 일과
  const todayRefused = items.filter(i => i.status === 'missed');
  const todayGaveup = items.filter(i => i.status === 'achieved' && i.early_stop);
  const todayOver = items.filter(i => i.status === 'achieved' && !i.early_stop && i.duration && i.end && i.duration > (toMin(i.end) - toMin(i.time)));
  const todayHard = todayRefused.length + todayGaveup.length + todayOver.length;
  const behaviorCount = data?.behavior_count ?? 0;
  const storyOf = (it: any): string =>
    it.ai_summary ? it.ai_summary.split('\n').map((l: string) => l.trim()).filter(Boolean).join(' — ')
                  : (it.note ? `사유: ${it.note}` : '');
  const suit: any[] = data?.suitability ?? [];
  const catOf = (s: any): 'accepted' | 'refused' | 'gaveup' | null => {
    const acc = s.completed_full || 0;
    const give = s.early_stop || 0;
    const ref = (s.missed || 0) + (s.refused_transitions || 0);
    if (acc === 0 && give === 0 && ref === 0) return null;
    if (acc >= give && acc >= ref) return 'accepted';
    if (give >= ref) return 'gaveup';
    return 'refused';
  };
  const overtime = suit.filter(s => (s.over || 0) > 0);             // 예상보다 오래 걸림
  const overIds = new Set(overtime.map(s => s.schedule_id));
  const accepted = suit.filter(s => catOf(s) === 'accepted' && !overIds.has(s.schedule_id));
  const gaveup = suit.filter(s => catOf(s) === 'gaveup');           // 중도포기
  const refused = suit.filter(s => catOf(s) === 'refused');         // 거절/못함

  // 순위(랭킹) — 유튜브 Recap 느낌, 각 TOP 3
  const topGood = [...accepted].sort((a, b) => (b.completed_full || 0) - (a.completed_full || 0)).slice(0, 3);
  const topOver = [...overtime].sort((a, b) => (b.over || 0) - (a.over || 0)).slice(0, 3);
  const sc = (s: any) => (s.missed || 0) + (s.refused_transitions || 0) + (s.early_stop || 0);
  const struggled = [
    ...refused.map((s: any) => ({ ...s, kind: '거절·미수행' })),
    ...gaveup.map((s: any) => ({ ...s, kind: '중도포기' })),
  ].sort((a, b) => sc(b) - sc(a)).slice(0, 3);
  const tomorrow: any[] = data?.tomorrow_schedules ?? [];
  const suggById = new Map<number, Sugg>();
  suggestions.filter(s => s.type === 'shorten' && s.action.new_end_time)
    .forEach(s => (s.schedule_ids || []).forEach(id => suggById.set(id, s)));
  const changedTmr = tomorrow.filter(s => suggById.has(s.id));
  const unchangedTmr = tomorrow.filter(s => !suggById.has(s.id));
  const hasApplicable = changedTmr.length > 0
    || suggestions.some(s => s.type === 'rest' && s.applicable && s.action.rest_start);

  const isLast = step >= 4;

  return (
   <AppFrame navigation={navigation} active="recap" role="guardian">
    <View style={styles.root}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.close}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* 인사 */}
        <Block>
          <Text style={styles.bubble}>오늘 {name}님의 하루를{'\n'}함께 돌아볼까요? 🌙</Text>
        </Block>

        {/* 1. 하루 평가 */}
        {step >= 1 && (
          <Block>
            <Text style={styles.bubble}>오늘 {name}님의 기분은 어땠을까요?</Text>
            <View style={styles.card}>
              {mood ? (
                <>
                  <Text style={styles.moodEmoji}>{mood.emoji}</Text>
                  <Text style={styles.moodLabel}>{mood.label}</Text>
                  <Text style={styles.moodMsg}>{mood.msg}</Text>
                </>
              ) : (
                <Text style={styles.cardDim}>오늘 하루 평가 기록이 없어요.</Text>
              )}
            </View>
          </Block>
        )}

        {/* 2. 오늘 (완료/미완료 + 오늘 힘들어한) */}
        {step >= 2 && (
          <Block>
            <Text style={styles.bubble}>오늘 일과는 얼마나 했을까요?</Text>
            <View style={styles.card}>
              <Text style={styles.summaryLine}>
                <Text style={styles.summaryStrong}>{done.length}</Text> / {items.length} 완료
              </Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${items.length ? Math.round(done.length / items.length * 100) : 0}%` as any }]} />
              </View>
              <View style={{ alignSelf: 'stretch', marginTop: 14 }}>
                {items.map((it) => {
                  const ok = it.status === 'achieved';
                  return (
                    <View key={it.schedule_id} style={styles.todayRow}>
                      <Text style={styles.todayTime}>{it.time}</Text>
                      <Text style={[styles.todayName, !ok && { color: '#C2496B' }]} numberOfLines={1}>{noEmoji(it.title)}</Text>
                      <Text style={[styles.todayStat, { color: ok ? '#2D9D63' : '#D14343' }]}>{ok ? '완료' : '미완료'}</Text>
                    </View>
                  );
                })}
              </View>

              {todayHard > 0 && (
                <View style={styles.todayHardWrap}>
                  <Text style={styles.todayHardHead}>오늘 힘들어한 일과</Text>
                  {todayRefused.map((it) => (
                    <View key={`r${it.schedule_id}`}>
                      <Text style={styles.todayHardItem}>· {noEmoji(it.title)} <Text style={styles.todayHardKind}>(거절·미수행)</Text></Text>
                      {storyOf(it) ? <Text style={styles.catReason}>{storyOf(it)}</Text> : null}
                    </View>
                  ))}
                  {todayGaveup.map((it) => (
                    <View key={`g${it.schedule_id}`}>
                      <Text style={styles.todayHardItem}>· {noEmoji(it.title)} <Text style={styles.todayHardKind}>(중도포기)</Text></Text>
                      {storyOf(it) ? <Text style={styles.catReason}>{storyOf(it)}</Text> : null}
                    </View>
                  ))}
                  {todayOver.map((it) => {
                    const extra = it.duration - (toMin(it.end) - toMin(it.time));
                    return (
                      <Text key={`o${it.schedule_id}`} style={styles.todayHardItem}>· {noEmoji(it.title)} <Text style={styles.overMeta}>+{extra}분 더 걸림</Text></Text>
                    );
                  })}
                </View>
              )}
            </View>
            <Text style={styles.behLine}>
              {behaviorCount > 0 ? (
                <>오늘 하루 문제행동 <Text style={styles.behLineN}>{behaviorCount}</Text>번 있었어요</>
              ) : '오늘은 문제행동 없이 잘 보냈어요 🌷'}
            </Text>
          </Block>
        )}

        {/* 3. 최근 7일 요약 (한 카드) */}
        {step >= 3 && (
          <Block>
            <Text style={styles.bubble}>최근 일주일은 어땠을까요?</Text>
            <View style={styles.card}>
              <Text style={styles.caption}>최근 7일 기준</Text>
              {(topGood.length + topOver.length + struggled.length) === 0 ? (
                <Text style={styles.cardDim}>아직 데이터가 부족해요.</Text>
              ) : (
                <View style={{ alignSelf: 'stretch', gap: 16 }}>
                  {topGood.length > 0 && (
                    <View style={styles.catGroup}>
                      <Text style={styles.catHead}>잘 수행한 일과</Text>
                      {topGood.map((s, i) => (
                        <View key={s.schedule_id} style={styles.rankRow}>
                          <Text style={styles.rankNum}>{i + 1}</Text>
                          <Text style={styles.rankName} numberOfLines={1}>{noEmoji(s.title)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {topOver.length > 0 && (
                    <View style={styles.catGroup}>
                      <Text style={styles.catHead}>예상보다 오래 걸린 일과</Text>
                      {topOver.map((s, i) => (
                        <View key={s.schedule_id} style={styles.rankRow}>
                          <Text style={styles.rankNum}>{i + 1}</Text>
                          <Text style={styles.rankName} numberOfLines={1}>{noEmoji(s.title)}</Text>
                          <Text style={styles.overMeta}>평균 +{s.over_avg}분</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {struggled.length > 0 && (
                    <View style={styles.catGroup}>
                      <Text style={styles.catHead}>거절하거나 중도 포기한 일과</Text>
                      {struggled.map((s, i) => (
                        <View key={s.schedule_id} style={styles.rankRow}>
                          <Text style={styles.rankNum}>{i + 1}</Text>
                          <Text style={styles.rankName} numberOfLines={1}>{noEmoji(s.title)}</Text>
                          {s.needs_review && <Text style={styles.reviewBadge}>재검토 권고</Text>}
                          <Text style={styles.rankMeta}>{s.kind}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          </Block>
        )}

        {/* 4. AI 추천 내일 시간표 */}
        {step >= 4 && (
          <Block>
            <Text style={styles.bubble}>
              {suggestions.length > 0
                ? 'AI가 추천한 내일 시간표,\n어떠신가요?'
                : '내일 일과예요.\n오늘 기준으로 바꿀 건 없었어요 😊'}
            </Text>
            <View style={styles.card}>
              {tomorrow.length === 0 ? (
                <Text style={styles.cardDim}>내일 등록된 일과가 없어요.</Text>
              ) : (
                <View style={{ alignSelf: 'stretch' }}>
                  {tomorrow.map((s) => {
                    const sg = suggById.get(s.id);
                    const newEnd = sg?.action.new_end_time;
                    const cut = (sg && newEnd && s.end) ? toMin(s.end) - toMin(newEnd) : 0;
                    return (
                      <View key={s.id} style={styles.schedBlock}>
                        <View style={styles.schedRow}>
                          <Text style={styles.schedTime}>{s.time}{s.end ? `~${s.end}` : ''}</Text>
                          <SchedIcon title={s.title} emoji="📋" size={36} radius={9} />
                          <Text style={styles.schedName} numberOfLines={1}>{noEmoji(s.title)}</Text>
                          {sg ? <Text style={styles.schedCut}>{cut > 0 ? `${cut}분 단축` : `${-cut}분 늘림`}</Text> : null}
                        </View>
                        {sg && !applied && (
                          <Text style={styles.schedChangeLine}>
                            <Text style={styles.schedNewTime}>→ {s.time}~{newEnd}</Text>
                            {'  ·  '}{sg.message}
                          </Text>
                        )}
                        {sg && applied && (
                          <Text style={styles.schedDone}>✓ {s.time}~{newEnd}로 {cut > 0 ? '단축' : '조정'}됨</Text>
                        )}
                      </View>
                    );
                  })}

                  {/* AI 제안 — 휴식 삽입 / 일과 줄이기 (사유 포함) */}
                  {suggestions.filter(s => s.type === 'rest' || s.type === 'reduce').map((s, i) => (
                    <View key={`x${i}`} style={styles.aiSugg}>
                      <Text style={styles.aiSuggHead}>
                        ✨ {s.type === 'rest' ? '휴식 넣기' : '일과 줄이기'}{s.title ? ` · ${noEmoji(s.title)}` : ''}
                      </Text>
                      <Text style={styles.aiSuggMsg}>{s.message}</Text>
                    </View>
                  ))}
                  {hasApplicable && !applied && (
                    <TouchableOpacity style={styles.applyBtn} activeOpacity={0.85} onPress={applyAll}>
                      <Text style={styles.applyBtnText}>이대로 바꾸기</Text>
                    </TouchableOpacity>
                  )}
                  {applied && <Text style={styles.appliedNote}>✓ 내일 스케줄에 반영했어요</Text>}
                  <TouchableOpacity style={styles.editLink} activeOpacity={0.7} onPress={() => navigation.navigate('ScheduleEdit')}>
                    <Text style={styles.editLinkText}>내일 스케줄 직접 수정하기 ›</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </Block>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* 하단 버튼 */}
      <View style={styles.footer}>
        {!isLast ? (
          <TouchableOpacity style={styles.nextBtn} activeOpacity={0.85} onPress={next}>
            <Text style={styles.nextBtnText}>{step === 0 ? '시작하기' : '다음 ▸'}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.nextBtn} activeOpacity={0.85} onPress={() => navigation.goBack()}>
            <Text style={styles.nextBtnText}>마치기</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
   </AppFrame>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E8F5EE' },
  topBar: { paddingHorizontal: 20, paddingTop: 8, alignItems: 'flex-end' },
  close: { color: colors.primary, fontSize: 20, fontWeight: '700' },
  body: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 20, gap: 18 },

  bubble: {
    color: '#1E293B', fontSize: 22, fontWeight: '900', lineHeight: 30, marginBottom: 12,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 22, padding: 22, alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  cardDim: { fontSize: 15, color: '#8A95A5', fontWeight: '600', textAlign: 'center', lineHeight: 22 },
  caption: { alignSelf: 'flex-start', fontSize: 13, color: '#8A95A5', fontWeight: '700', marginBottom: 8 },

  // 오늘 달성
  summaryLine: { fontSize: 18, fontWeight: '800', color: '#334155' },
  summaryStrong: { fontSize: 22, fontWeight: '900', color: colors.primary },
  behLine: { fontSize: 17, fontWeight: '700', color: '#334155', marginTop: 14, lineHeight: 26 },
  behLineN: { fontSize: 24, fontWeight: '900', color: '#D14343' },
  progressTrack: { alignSelf: 'stretch', height: 10, backgroundColor: '#EEF2F7', borderRadius: 5, overflow: 'hidden', marginTop: 10 },
  progressFill: { height: 10, borderRadius: 5, backgroundColor: colors.primary },
  doneLine: { fontSize: 15, fontWeight: '700', color: '#334155' },
  notDoneLine: { fontSize: 13, fontWeight: '600', color: '#94A3B8', marginTop: 2 },
  todayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F4F6FA' },
  todayTime: { fontSize: 12, fontWeight: '800', color: '#94A3B8', width: 44 },
  todayName: { flex: 1, fontSize: 15, fontWeight: '700', color: '#334155' },
  todayStat: { fontSize: 12, fontWeight: '800' },
  overMeta: { fontSize: 13, fontWeight: '900', color: '#E07B39' },
  todayHardWrap: { alignSelf: 'stretch', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', gap: 4 },
  todayHardHead: { fontSize: 15, fontWeight: '800', color: '#64748B', marginBottom: 5 },
  todayHardItem: { fontSize: 16, fontWeight: '700', color: '#334155', lineHeight: 24 },
  todayHardKind: { fontSize: 14, fontWeight: '700', color: '#8A95A5' },

  // 내일 변경 카드
  changeCard: { alignSelf: 'stretch', backgroundColor: '#FFF7F0', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#F5D9C4', gap: 4 },
  changeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  changeName: { flex: 1, fontSize: 16, fontWeight: '900', color: '#334155' },
  changeCut: { fontSize: 13, fontWeight: '900', color: '#E07B39' },
  changeTimes: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  changeOld: { color: '#94A3B8', textDecorationLine: 'line-through' },
  changeNew: { color: '#E07B39', fontWeight: '900' },
  changeReason: { fontSize: 13, color: '#7C8BA0', fontWeight: '600', marginTop: 4 },
  unchangedNote: { fontSize: 13, color: '#94A3B8', fontWeight: '600', textAlign: 'center', marginVertical: 6 },

  // 내일 스케줄 목록
  schedBlock: { alignSelf: 'stretch', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  schedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  schedTime: { fontSize: 13, fontWeight: '800', color: '#64748B', width: 100 },
  schedName: { flex: 1, fontSize: 16, fontWeight: '800', color: '#334155' },
  schedCut: { fontSize: 13, fontWeight: '900', color: '#E07B39' },
  aiSugg: { backgroundColor: '#F4F7FF', borderRadius: 14, padding: 12, marginTop: 8, gap: 4 },
  aiSuggHead: { fontSize: 14, fontWeight: '900', color: '#5B73C7' },
  aiSuggMsg: { fontSize: 13, fontWeight: '600', color: '#475569', lineHeight: 19 },
  schedChangeLine: { fontSize: 13, fontWeight: '600', color: '#8A95A5', marginTop: 4, marginLeft: 110, lineHeight: 19 },
  schedNewTime: { fontSize: 13, fontWeight: '900', color: '#E07B39' },
  schedDone: { fontSize: 13, fontWeight: '900', color: '#16A34A', marginTop: 4, marginLeft: 110 },
  editLink: { alignSelf: 'center', marginTop: 16, paddingVertical: 6 },
  editLinkText: { fontSize: 15, fontWeight: '800', color: colors.primary },

  moodEmoji: { fontSize: 64 },
  moodLabel: { fontSize: 22, fontWeight: '900', color: colors.primary, marginTop: 4 },
  moodMsg: { fontSize: 14, color: '#64748B', fontWeight: '600', textAlign: 'center', marginTop: 4 },

  bigRate: { fontSize: 52, fontWeight: '900', color: colors.primary, lineHeight: 58 },

  listWrap: { alignSelf: 'stretch', marginTop: 12, gap: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemCheck: { color: colors.primary, fontWeight: '900', fontSize: 16, width: 16, textAlign: 'center' },
  itemDot: { color: '#CBD5E1', fontWeight: '900', fontSize: 18, width: 16, textAlign: 'center' },
  itemName: { flex: 1, fontSize: 16, fontWeight: '700', color: '#334155' },

  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch', paddingVertical: 7 },
  rankNum: { fontSize: 20, fontWeight: '900', color: colors.primary, width: 22, textAlign: 'center' },
  rankName: { flex: 1, fontSize: 16, fontWeight: '800', color: '#334155' },
  rankMeta: { fontSize: 14, fontWeight: '700', color: '#7C8BA0' },
  reviewBadge: {
    fontSize: 11, fontWeight: '800', color: '#D64545', overflow: 'hidden',
    backgroundColor: '#FDECEC', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },

  catGroup: { gap: 2 },
  catHead: { fontSize: 15, fontWeight: '800', color: '#64748B', marginBottom: 6 },
  catItem: { fontSize: 16, fontWeight: '800', color: '#334155', lineHeight: 23 },
  catReason: { fontSize: 14, color: '#7C8BA0', fontWeight: '600', marginLeft: 2, marginTop: 1 },

  // 내일 비교
  cmpHeadRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', marginBottom: 8 },
  cmpHead: { flex: 1, fontSize: 12, fontWeight: '800', color: '#94A3B8', textAlign: 'center' },
  cmpRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  cmpCol: { flex: 1, alignItems: 'center', gap: 2 },
  cmpName: { fontSize: 13, fontWeight: '800', color: '#334155', maxWidth: '100%' },
  cmpTime: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  cmpSame: { fontSize: 12, fontWeight: '700', color: '#CBD5E1' },
  cmpArrow: { width: 22, textAlign: 'center', fontSize: 15, fontWeight: '900', color: colors.primary },

  gradeRow: { flexDirection: 'row', gap: 18, marginTop: 14, marginBottom: 6 },
  gradeItem: { alignItems: 'center', gap: 3 },
  gradeNum: { fontSize: 17, fontWeight: '900', color: '#334155' },
  gradeLbl: { fontSize: 11, fontWeight: '700', color: '#94A3B8' },
  statLine: { alignSelf: 'stretch', fontSize: 13, color: '#475569', fontWeight: '600', marginTop: 8 },
  statBold: { fontWeight: '900', color: colors.primary },

  tmrRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  tmrTime: { fontSize: 12, fontWeight: '800', color: colors.primary, width: 70 },
  tmrName: { flex: 1, fontSize: 14, fontWeight: '700', color: '#334155' },
  tmrChange: { fontSize: 11, fontWeight: '800', color: '#E07B39' },
  tmrApplied: { fontSize: 11, fontWeight: '800', color: '#16A34A' },
  appliedNote: { color: '#16A34A', fontWeight: '800', fontSize: 14, marginTop: 14 },
  applyBtn: { alignSelf: 'stretch', backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  applyBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },

  footer: { paddingHorizontal: 22, paddingBottom: 14, paddingTop: 6 },
  nextBtn: {
    backgroundColor: colors.primary, borderRadius: 18, paddingVertical: 17, alignItems: 'center',
    shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  nextBtnText: { color: '#fff', fontWeight: '900', fontSize: 17 },
});
