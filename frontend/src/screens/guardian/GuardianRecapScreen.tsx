/**
 * 보호자 — 하루 Recap (취침 1시간 전 알림 → 진입)
 * 초록 배경에서 말풍선이 순차로 등장하며 하루를 돌아봄 (스포티파이 Wrapped 느낌)
 * 1) 하루 평가 → 2) 오늘 달성/적합도 → 3) 주간 통계 → 4) 내일 스케줄 제안 + 적용
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Easing, Alert, Dimensions, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppFrame from '../../components/AppFrame';
import { SchedIcon } from '../../components/SchedIcon';
import TimePickerField from '../../components/TimePickerField';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { api } from '../../api/client';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'GuardianRecap'> };

const noEmoji = (t: string) => t.replace(/\p{Extended_Pictographic}/gu, '').replace(/️/g, '').trim();
const AI_CARD_W = Math.round(Dimensions.get('window').width * 0.72);
const norm = (t: string) => t.replace(/[^\w가-힣]/gu, '').toLowerCase();
const fmt = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(m).padStart(2, '0')}`;
};
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
// 밤 취침(낮잠 제외) — 끝을 '기상까지'로 표시
const isBedtime = (t: string) => /취침|수면|자기|잠자기|잠자|잠들/.test(t || '') && !(t || '').includes('낮잠');
const MOOD: Record<string, { emoji: string; label: string; msg: string }> = {
  good: { emoji: '😊', label: '좋았어요', msg: '오늘 기분 좋게 하루를 보냈어요 😊' },
  soso: { emoji: '😐', label: '그저 그래요', msg: '오늘은 그저 그런 하루였어요. 내일은 조금 더 가볍게 시작해봐요.' },
  bad:  { emoji: '😢', label: '힘들었어요', msg: '오늘은 많이 힘들어했어요. 따뜻하게 다독여주세요.' },
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
  const [decided, setDecided] = useState<Record<number, 'accepted' | 'rejected'>>({}); // 추천별 수락/거절
  const [editIdx, setEditIdx] = useState<number | null>(null); // 수정 중인 추천 index
  const [editEnd, setEditEnd] = useState('');        // shorten: 새 종료시각
  const [editRestStart, setEditRestStart] = useState(''); // rest: 휴식 시작
  const [editRestEnd, setEditRestEnd] = useState('');     // rest: 휴식 끝
  const scrollRef = useRef<ScrollView>(null);

  // 적용 후 내일 미리보기를 갱신하기 위해 대시보드만 다시 불러옴 (suggestions는 유지)
  const reloadTomorrow = async () => {
    try {
      const uid = await AsyncStorage.getItem('user_id');
      if (!uid) return;
      const d = await api.get(`/guardian/user/${uid}/dashboard`);
      setData(d.data);
    } catch {}
  };

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

  // 추천 1건 적용 (override로 수정값 반영 가능). 성공 시 그 카드를 '수락'으로 표시.
  const applyOne = async (i: number, ov?: { new_end_time?: string; rest_start?: string; rest_end?: string }) => {
    const s = suggestions[i];
    if (!s) return;
    try {
      if (s.type === 'shorten') {
        await api.post('/ai/apply-shorten', { schedule_ids: s.schedule_ids, new_end_time: ov?.new_end_time ?? s.action.new_end_time });
      } else if (s.type === 'rest') {
        await api.post('/ai/apply-rest', {
          user_id: s.action.user_id, rest_start: ov?.rest_start ?? s.action.rest_start,
          rest_end: ov?.rest_end ?? s.action.rest_end, days_of_week: s.action.days_of_week,
        });
      } else if (s.type === 'reduce') {
        await api.post('/ai/apply-reduce', { schedule_ids: s.schedule_ids });
      }
      setDecided(d => ({ ...d, [i]: 'accepted' }));
      reloadTomorrow();   // 내일 미리보기 즉시 갱신
    } catch {
      Alert.alert('오류', '적용에 실패했어요.');
    }
  };
  const rejectOne = (i: number) => setDecided(d => ({ ...d, [i]: 'rejected' }));

  // 수정 모달 열기 — 추천값을 기본으로 채워줌
  const openEditSugg = (i: number) => {
    const s = suggestions[i];
    setEditEnd(s.action.new_end_time ?? '');
    setEditRestStart(s.action.rest_start ?? '');
    setEditRestEnd(s.action.rest_end ?? '');
    setEditIdx(i);
  };
  const confirmEditSugg = async () => {
    if (editIdx == null) return;
    const i = editIdx; setEditIdx(null);
    await applyOne(i, { new_end_time: editEnd, rest_start: editRestStart, rest_end: editRestEnd });
  };

  // 남은(미결정) 추천 모두 수락
  const applyAll = async () => {
    for (let i = 0; i < suggestions.length; i++) {
      if (!decided[i]) await applyOne(i);
    }
    setApplied(true);
    Alert.alert('적용 완료', '내일 스케줄에 반영했어요.');
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
    // 거절 = 실시간 거부(refused_logs) + 전환 거절. 단순 미달성은 '힘들어한 일과' 아님
    const ref = (s.refused_logs || 0) + (s.refused_transitions || 0);
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
  const reduceIds = new Set<number>(suggestions.filter(s => s.type === 'reduce').flatMap(s => s.schedule_ids || []));
  const restIds = new Set<number>(suggestions.filter(s => s.type === 'rest').flatMap(s => s.schedule_ids || []));
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
                  const ok = it.status === 'achieved' && !it.early_stop;
                  const missed = it.status === 'missed' || it.early_stop; // 명시적 미달성/중도포기만 빨강
                  // pending(아직 기록 없음)은 실패가 아니라 '대기'(회색) — 빨간 미완료로 칠하지 않음
                  const label = ok ? '완료' : missed ? '미완료' : '대기';
                  const color = ok ? '#2D9D63' : missed ? '#D14343' : '#94A3B8';
                  return (
                    <View key={it.schedule_id} style={styles.todayRow}>
                      <Text style={styles.todayTime}>{it.time}</Text>
                      <Text style={[styles.todayName, missed && { color: '#C2496B' }]} numberOfLines={1}>{noEmoji(it.title)}</Text>
                      <Text style={[styles.todayStat, { color }]}>{label}</Text>
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
                    const bedtime = isBedtime(s.title);
                    const instant = /기상|일어나|복용|투약|출근|등교|등원|퇴근|하교|하원|세면|양치/.test(s.title || '');
                    const validEnd = s.end && toMin(s.end) > toMin(s.time) && !instant;   // 순간 일과·깨진 종료시각은 범위 숨김
                    const willReduce = reduceIds.has(s.id);
                    const willRest = restIds.has(s.id);
                    return (
                      <View key={s.id} style={[styles.schedBlock, willReduce && { opacity: 0.5 }]}>
                        <View style={styles.schedRow}>
                          <Text style={styles.schedTime}>{s.time}{bedtime ? '~기상' : (validEnd ? `~${s.end}` : '')}</Text>
                          <SchedIcon title={s.title} size={36} radius={9} />
                          <Text style={styles.schedName} numberOfLines={1}>{noEmoji(s.title)}</Text>
                          {sg ? <Text style={styles.schedCut}>{cut > 0 ? `${cut}분 단축` : `${-cut}분 늘림`}</Text>
                            : willReduce ? <Text style={[styles.schedCut, { color: '#D64545' }]}>내일 빼기</Text>
                            : willRest ? <Text style={[styles.schedCut, { color: '#5B73C7' }]}>앞에 휴식</Text> : null}
                        </View>
                        {sg && !applied && (
                          <Text style={styles.schedChangeLine}>
                            <Text style={styles.schedNewTime}>종료 {s.end} → {newEnd}</Text>
                          </Text>
                        )}
                        {sg && applied && (
                          <Text style={styles.schedDone}>✓ 종료 {newEnd}로 {cut > 0 ? '단축' : '조정'}됨</Text>
                        )}
                      </View>
                    );
                  })}

                  {/* AI의 추천 — 여러 개면 옆으로 슬라이드 */}
                  {suggestions.length > 0 && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      snapToInterval={AI_CARD_W + 10}
                      decelerationRate="fast"
                      contentContainerStyle={{ gap: 10, paddingVertical: 2 }}
                      style={{ marginTop: 6, alignSelf: 'stretch' }}
                    >
                      {suggestions.map((s, i) => {
                        const nm = noEmoji(s.title || '');
                        const act = s.type === 'shorten' ? ((s.new_min ?? 0) < (s.planned_min ?? 0) ? '시간 단축' : '시간 늘리기')
                          : s.type === 'rest' ? '앞 휴식 추가' : s.type === 'reduce' ? '빼기' : '조정';
                        const dec = decided[i];
                        const canEdit = s.type === 'shorten' || s.type === 'rest'; // reduce는 수정값 없음
                        return (
                          <View key={`ai${i}`} style={[styles.aiCard, { width: AI_CARD_W }]}>
                            <View style={styles.aiCardTop}>
                              <Text style={styles.aiCardHead} numberOfLines={1}>
                                ✨ AI의 추천 <Text style={styles.aiCardTitle}>· {nm} {act} 제안</Text>
                              </Text>
                              {suggestions.length > 1 && <Text style={styles.aiCardCount}>{i + 1}/{suggestions.length}</Text>}
                            </View>
                            <Text style={styles.aiCardMsg}>{s.message}</Text>
                            {dec === 'accepted' ? (
                              <Text style={styles.suggAccepted}>✓ 반영했어요</Text>
                            ) : dec === 'rejected' ? (
                              <Text style={styles.suggRejected}>거절함</Text>
                            ) : (
                              <View style={styles.suggBtnRow}>
                                <TouchableOpacity style={[styles.suggBtn, styles.suggReject]} onPress={() => rejectOne(i)}>
                                  <Text style={styles.suggRejectText}>거절</Text>
                                </TouchableOpacity>
                                {canEdit && (
                                  <TouchableOpacity style={[styles.suggBtn, styles.suggEdit]} onPress={() => openEditSugg(i)}>
                                    <Text style={styles.suggEditText}>수정</Text>
                                  </TouchableOpacity>
                                )}
                                <TouchableOpacity style={[styles.suggBtn, styles.suggAccept]} onPress={() => applyOne(i)}>
                                  <Text style={styles.suggAcceptText}>수락</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </ScrollView>
                  )}
                  {hasApplicable && suggestions.some((_, i) => !decided[i]) && (
                    <TouchableOpacity style={styles.applyBtn} activeOpacity={0.85} onPress={applyAll}>
                      <Text style={styles.applyBtnText}>남은 추천 모두 수락</Text>
                    </TouchableOpacity>
                  )}
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

      {/* 추천 수정 모달 */}
      <Modal visible={editIdx != null} transparent animationType="fade">
        <View style={styles.editOverlay}>
          <View style={styles.editCard}>
            <Text style={styles.editTitle}>추천 수정</Text>
            {editIdx != null && suggestions[editIdx]?.type === 'shorten' && (
              <>
                <Text style={styles.editLabel}>종료 시각</Text>
                <TimePickerField value={editEnd} onChange={setEditEnd} />
              </>
            )}
            {editIdx != null && suggestions[editIdx]?.type === 'rest' && (
              <View style={styles.editTimeRow}>
                <View><Text style={styles.editLabel}>휴식 시작</Text><TimePickerField value={editRestStart} onChange={setEditRestStart} /></View>
                <View><Text style={styles.editLabel}>휴식 끝</Text><TimePickerField value={editRestEnd} onChange={setEditRestEnd} /></View>
              </View>
            )}
            <View style={styles.editBtns}>
              <TouchableOpacity style={styles.editCancel} onPress={() => setEditIdx(null)}><Text style={styles.editCancelText}>취소</Text></TouchableOpacity>
              <TouchableOpacity style={styles.editConfirm} onPress={confirmEditSugg}><Text style={styles.editConfirmText}>이대로 적용</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  aiCard: { backgroundColor: '#F4F7FF', borderRadius: 16, padding: 14, gap: 8, borderWidth: 1, borderColor: '#E3E9FB' },
  aiCardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiCardHead: { flex: 1, fontSize: 14, fontWeight: '900', color: '#5B73C7' },
  aiCardTitle: { fontWeight: '800', color: '#3B4659' },
  aiCardCount: { fontSize: 12, fontWeight: '800', color: '#9AA7CE' },
  aiCardMsg: { fontSize: 13.5, fontWeight: '600', color: '#475569', lineHeight: 20, marginTop: 2 },
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

  // 추천 카드 — 거절/수정/수락
  suggBtnRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  suggBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  suggReject: { backgroundColor: '#F1F5F9' },
  suggRejectText: { color: '#64748B', fontWeight: '800', fontSize: 13 },
  suggEdit: { backgroundColor: '#FEF3E2' },
  suggEditText: { color: '#C97A2B', fontWeight: '800', fontSize: 13 },
  suggAccept: { backgroundColor: colors.primary },
  suggAcceptText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  suggAccepted: { color: '#16A34A', fontWeight: '800', fontSize: 13, marginTop: 10 },
  suggRejected: { color: '#94A3B8', fontWeight: '800', fontSize: 13, marginTop: 10 },
  // 수정 모달
  editOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 28 },
  editCard: { backgroundColor: '#fff', borderRadius: 18, padding: 20 },
  editTitle: { fontSize: 18, fontWeight: '900', color: '#1E293B', marginBottom: 14, textAlign: 'center' },
  editLabel: { fontSize: 13, fontWeight: '700', color: '#64748B', marginBottom: 6, marginTop: 8 },
  editTimeRow: { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  editBtns: { flexDirection: 'row', gap: 10, marginTop: 18 },
  editCancel: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center' },
  editCancelText: { color: '#64748B', fontWeight: '800', fontSize: 15 },
  editConfirm: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center' },
  editConfirmText: { color: '#fff', fontWeight: '900', fontSize: 15 },

  footer: { paddingHorizontal: 22, paddingBottom: 14, paddingTop: 6 },
  nextBtn: {
    backgroundColor: colors.primary, borderRadius: 18, paddingVertical: 17, alignItems: 'center',
    shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  nextBtnText: { color: '#fff', fontWeight: '900', fontSize: 17 },
});
