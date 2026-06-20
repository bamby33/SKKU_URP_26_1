/**
 * 일과 수정 (당사자/보호자 공용)
 * 회원가입 ScheduleSetup과 동일 UI(요일별 리스트 + 주간 전체 보기 토글 + 드래그)
 * - DB에서 불러와 편집 → 저장 시 기존 일과 삭제 후 재생성 (즉시 반영)
 * - 보호자가 저장하면 당사자에게 알림 생성
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Modal, Alert,
  Dimensions, PanResponder, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppFrame from '../../components/AppFrame';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { api } from '../../api/client';
import TimePickerField from '../../components/TimePickerField';
import { SchedIcon } from '../../components/SchedIcon';
import { scheduleColor } from '../../utils/scheduleImage';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ScheduleEdit'>;
};

const START_H = 6;
const TOTAL   = 36; // 06:00 ~ 24:00 (취침을 밤 늦게도 둘 수 있게 — 끝 시간은 안 받고 다음날 기상까지 자동)
const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const todayIdx = () => (new Date().getDay() + 6) % 7;
// 밤 취침(낮잠 제외) — 끝 시간을 받지 않고 '기상까지' 자동 처리
const isBedtime = (name: string) => /취침|수면|자기|잠자기|잠자|잠들/.test(name || '') && !(name || '').includes('낮잠');
// 순간(점) 일과 — 끝 시간 없이 그 시각에 하는 일과 (기상·약복용·세면·양치·출퇴근·등하교)
const isInstant = (name: string) => /기상|일어나|복용|투약|출근|등교|등원|퇴근|하교|하원|세면|양치|씻/.test(name || '');

// 주간 전체 보기 그리드 치수
const { width: SW } = Dimensions.get('window');
const PAD     = 12;
const TIME_W  = 30;
const GRID_W  = SW - PAD * 2;
const DAY_COL = (GRID_W - TIME_W) / 7;
// 추가 모달 좌측 이미지 정사각 크기 = (시트내부폭 - 칸간격) / 2 - 타일패딩
const PICK_IMG = Math.floor(((SW - 48 - 14) / 2) - 16);
const SLOT_H  = 20;

// 이미지가 있는 활동만 후보로 (scheduleImage 매칭 가능). '직접 입력'만 예외(이모티콘 폴백)
const PALETTE = [
  { emoji: '🌅',  label: '기상',      color: '#FFB74D' },
  { emoji: '🍚',  label: '식사',      color: '#4CAF7D' },
  { emoji: '🛁',  label: '씻기·세면', color: '#5BB7C0' },
  { emoji: '🛀',  label: '목욕',      color: '#4FC3F7' },
  { emoji: '🏃',  label: '운동',      color: '#AED581' },
  { emoji: '🚶',  label: '산책',      color: '#6B9BF2' },
  { emoji: '📖',  label: '독서·여가', color: '#5BB7C0' },
  { emoji: '💊',  label: '약 복용',   color: '#E57373' },
  { emoji: '🏥',  label: '병원',      color: '#F06292' },
  { emoji: '🏫',  label: '복지관',    color: '#9575CD' },
  { emoji: '🎒',  label: '등교·외출', color: '#7986CB' },
  { emoji: '😴',  label: '취침',      color: '#AB77E8' },
  { emoji: '📝',  label: '직접 입력', color: '#6B9BF2' },
];
type PaletteItem = (typeof PALETTE)[number];

const EMOJI_COLOR_MAP: Record<string, string> = {
  '🌅': '#FFB74D', '🍚': '#4CAF7D', '🍞': '#4CAF7D', '🍱': '#26C6DA', '🍽️': '#FF8A65', '🍴': '#26C6DA', '🍜': '#FF8A65',
  '💤': '#AB77E8', '😴': '#AED581', '🚶': '#6B9BF2', '📖': '#5BB7C0', '📚': '#5BB7C0', '💊': '#E57373',
  '🎵': '#26C6DA', '🏋️': '#AED581', '🧸': '#FF8A65', '🎨': '#AB77E8', '🛁': '#5BB7C0', '🛋️': '#AB77E8',
  '🏢': '#6B9BF2', '🏥': '#FF8A65', '🎓': '#AB77E8', '📺': '#6B9BF2', '🕒': '#5BB7C0', '📋': '#4CAF7D',
};

type Block = {
  id: string;
  day: number;
  startSlot: number;   // 그리드 Y 위치용(30분 격자 스냅)
  endSlot: number;
  startTime: string;   // 실제 저장/표시용 정확한 시각 "HH:MM"
  endTime: string;
  name: string;
  emoji: string;
  color: string;
};
type ApiSchedule = {
  id: number;
  title: string;
  scheduled_time: string;
  end_time?: string | null;
  color?: string | null;
  days_of_week: string;
};

let uid = 0;
const nid = () => String(uid++);

const toSlot = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return (h - START_H) * 2 + Math.round(m / 30);
};
const toTime = (slot: number): string => {
  const mins = START_H * 60 + slot * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const toMin = (t: string): number => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const minToTime = (mins: number): string => {
  const c = clamp(mins, 0, 23 * 60 + 59);
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
};

const parseTitle = (t: string): { emoji: string; name: string } => {
  const parts = t.trim().split(/\s+/);
  if (parts.length >= 2 && /\p{Extended_Pictographic}/u.test(parts[0])) {
    return { emoji: parts[0], name: parts.slice(1).join(' ') };
  }
  return { emoji: '📋', name: t.trim() };
};

function schedulesToBlocks(schedules: ApiSchedule[]): Block[] {
  const out: Block[] = [];
  for (const s of schedules) {
    const { emoji, name } = parseTitle(s.title);
    // 같은 일과는 항상 같은 색(scheduleColor). 취침은 하루 끝까지, 순간 일과는 작은 블록.
    const bed = isBedtime(name);
    const color = scheduleColor(s.title);
    const ss = clamp(toSlot(s.scheduled_time), 0, TOTAL - 1);
    const es = bed ? TOTAL : isInstant(name) ? Math.min(ss + 1, TOTAL) : (s.end_time ? clamp(toSlot(s.end_time), ss + 1, TOTAL) : Math.min(ss + 2, TOTAL));
    const startTime = s.scheduled_time;
    const endTime = s.end_time || toTime(es);
    for (const d of s.days_of_week.split(',')) {
      const day = parseInt(d.trim(), 10);
      if (Number.isNaN(day)) continue;
      out.push({ id: nid(), day, startSlot: ss, endSlot: es, startTime, endTime, name, emoji, color });
    }
  }
  return out;
}

export default function ScheduleEditScreen({ navigation }: Props) {
  const [blocks, setBlocks]           = useState<Block[]>([]);
  const [selectedDay, setSelectedDay] = useState(todayIdx());
  const [viewMode, setViewMode]       = useState<'list' | 'week'>('list');
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [isGuardian, setIsGuardian]   = useState(false);

  const userIdRef     = useRef<number | null>(null);
  const existingIdsRef = useRef<number[]>([]);

  // 주간 그리드 드래그
  const [floating, setFloating] = useState<{ item: PaletteItem; x: number; y: number } | null>(null);
  const rootRef      = useRef<View>(null);
  const rootOff      = useRef({ x: 0, y: 0 });
  const gridRef      = useRef<View>(null);
  const gridBounds   = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const scrollOffset = useRef(0);

  // 추가/수정 모달
  const [showAdd,   setShowAdd]   = useState(false);
  const [addStep,   setAddStep]   = useState<'pick' | 'detail'>('pick');
  const [addItem,   setAddItem]   = useState<PaletteItem>(PALETTE[0]);
  const [addName,   setAddName]   = useState('');
  const [addStart,  setAddStart]  = useState('09:00');
  const [addEnd,    setAddEnd]    = useState('10:00');
  const [addDays,   setAddDays]   = useState<boolean[]>(Array(7).fill(false));
  const [editBlock, setEditBlock] = useState<Block | null>(null);
  const [editName,  setEditName]  = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd,   setEditEnd]   = useState('');

  // ── DB 로드 (포커스마다 재요청 → AI 적용·다른 화면 변경이 실시간 반영) ──
  const load = useCallback(async () => {
    try {
      const pairs = await AsyncStorage.multiGet(['user_id', 'role']);
      const uidStr = pairs[0][1];
      setIsGuardian(pairs[1][1] === 'guardian');
      if (!uidStr) { setLoading(false); return; }
      const id = Number(uidStr);
      userIdRef.current = id;
      const res = await api.get(`/schedules/user/${id}`);
      const all: ApiSchedule[] = res.data;
      existingIdsRef.current = all.map(s => s.id);
      setBlocks(schedulesToBlocks(all));
    } catch {
      Alert.alert('오류', '일과를 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const dayBlocks = blocks
    .filter(b => b.day === selectedDay)
    .sort((a, b) => a.startSlot - b.startSlot);

  // ── 추가 ──
  const openAdd = () => {
    const initDays = Array(7).fill(false);
    initDays[selectedDay] = true;
    setAddDays(initDays);
    setAddItem(PALETTE[0]);
    setAddName(PALETTE[0].label);
    setAddStart('09:00');
    setAddEnd('10:00');
    setAddStep('pick');
    setShowAdd(true);
  };
  const pickPalette = (item: PaletteItem) => {
    setAddItem(item);
    setAddName(item.label === '직접 입력' ? '' : item.label);
    setAddStep('detail');   // 활동 선택 → 상세 입력 페이지로
  };
  const confirmAdd = () => {
    const name = addName.trim();
    if (!name) { Alert.alert('이름 필요', '일과 이름을 입력해주세요.'); return; }
    const bedtime = isBedtime(name);
    const instant = isInstant(name);
    if (!bedtime && !instant && toMin(addStart) >= toMin(addEnd)) { Alert.alert('시간 오류', '종료 시간이 시작 시간보다 늦어야 해요.'); return; }
    // 취침은 하루 끝(기상까지)까지, 순간 일과는 그 시각 점(작은 블록) — 둘 다 끝 시간 안 받음
    const endT = bedtime ? minToTime(START_H * 60 + TOTAL * 30) : instant ? minToTime(toMin(addStart) + 30) : addEnd;
    const ss = toSlot(addStart);
    const es = Math.max(ss + 1, toSlot(endT));
    const days = addDays.map((on, i) => on ? i : -1).filter(i => i >= 0);
    if (!days.length) { Alert.alert('요일 선택', '요일을 하나 이상 선택해주세요.'); return; }
    // 취침은 하루에 하나만 — 같은 요일의 기존 취침은 제거(시각 안 겹쳐도). 그 외엔 시간 겹치는 것만 제거.
    const filtered = blocks.filter(b => bedtime
      ? !(days.includes(b.day) && isBedtime(b.name))
      : !(days.includes(b.day) && toMin(b.startTime) < toMin(endT) && toMin(b.endTime) > toMin(addStart)));
    const created = days.map(day => ({
      id: nid(), day, startSlot: ss, endSlot: es, startTime: addStart, endTime: endT, name, emoji: addItem.emoji, color: scheduleColor(name),
    }));
    const next = [...filtered, ...created];
    setBlocks(next);
    setShowAdd(false);
    doSave(next); // 바로 저장
  };

  // ── 드래그 드롭 ──
  const handleDrop = (item: PaletteItem, pageX: number, pageY: number) => {
    const b = gridBounds.current;
    if (pageX < b.x || pageX > b.x + b.width || pageY < b.y || pageY > b.y + b.height) return;
    const relX    = pageX - b.x - TIME_W;
    const relY    = pageY - b.y + scrollOffset.current;
    const colIdx  = clamp(Math.floor(relX / DAY_COL), 0, 6);
    const slotIdx = clamp(Math.floor(relY / SLOT_H), 0, TOTAL - 2);
    const initDays = Array(7).fill(false);
    initDays[colIdx] = true;
    setAddDays(initDays);
    setAddItem(item);
    setAddName(item.label === '직접 입력' ? '' : item.label);
    setAddStart(toTime(slotIdx));
    setAddEnd(toTime(Math.min(slotIdx + 2, TOTAL)));
    setShowAdd(true);
  };
  const palettePRs = useRef(
    PALETTE.map(item =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder:  () => true,
        onPanResponderGrant: (e) => setFloating({ item, x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }),
        onPanResponderMove:  (e) => setFloating({ item, x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }),
        onPanResponderRelease: (e) => { const { pageX, pageY } = e.nativeEvent; setFloating(null); handleDrop(item, pageX, pageY); },
        onPanResponderTerminate: () => setFloating(null),
      })
    )
  ).current;

  // ── 수정/삭제 ──
  const openEdit = (b: Block) => { setEditBlock(b); setEditName(b.name); setEditStart(b.startTime); setEditEnd(b.endTime); };
  const confirmEdit = () => {
    if (!editBlock) return;
    const bedtime = isBedtime(editName);
    const instant = isInstant(editName);
    if (!editName.trim()) { Alert.alert('이름 필요', '일과 이름을 입력해주세요.'); return; }
    if (!bedtime && !instant && toMin(editStart) >= toMin(editEnd)) { Alert.alert('시간 오류', '종료 시간이 시작 시간보다 늦어야 해요.'); return; }
    // 취침=하루 끝까지, 순간 일과=그 시각 점 — 둘 다 끝 시간 안 받음
    const endT = bedtime ? minToTime(START_H * 60 + TOTAL * 30) : instant ? minToTime(toMin(editStart) + 30) : editEnd;
    const ss = toSlot(editStart);
    const es = Math.max(ss + 1, toSlot(endT));
    const next = blocks.map(b => b.id === editBlock.id
      ? { ...b, name: editName.trim(), startSlot: ss, endSlot: es, startTime: editStart, endTime: endT } : b);
    setBlocks(next);
    setEditBlock(null);
    doSave(next); // 바로 저장
  };
  const deleteBlock = () => {
    if (!editBlock) return;
    const next = blocks.filter(b => b.id !== editBlock.id);
    setBlocks(next);
    setEditBlock(null);
    doSave(next); // 바로 저장
  };
  const toggleAddDay = (i: number) => setAddDays(p => { const n = [...p]; n[i] = !n[i]; return n; });
  const setAddDayPreset = (idxs: number[]) => setAddDays(Array.from({ length: 7 }, (_, i) => idxs.includes(i)));

  // ── 즉시 저장 — 추가/수정/삭제 때마다 자동 호출 ──
  // 블록을 (제목·시작·종료·색) 기준으로 묶어 요일을 합친 뒤 replace 호출.
  // 백엔드가 (제목,시작시각)로 기존 일과를 재사용 → ID·로그 보존(홈 진행상태·히트맵 유지).
  const notifiedRef = useRef(false);
  const doSave = async (target: Block[]) => {
    const id = userIdRef.current;
    if (!id) return;
    setSaving(true);
    try {
      const groups = new Map<string, { title: string; scheduled_time: string; end_time: string; color: string; days: Set<number> }>();
      for (const b of target) {
        const title = `${b.emoji} ${b.name}`;
        const key = `${title}|${b.startTime}|${b.endTime}|${b.color}`;
        if (!groups.has(key)) groups.set(key, { title, scheduled_time: b.startTime, end_time: b.endTime, color: b.color, days: new Set() });
        groups.get(key)!.days.add(b.day);
      }
      const schedules = [...groups.values()].map(g => ({
        title: g.title, scheduled_time: g.scheduled_time, end_time: g.end_time,
        color: g.color, days_of_week: [...g.days].sort((a, b) => a - b).join(','),
      }));
      await api.post(`/schedules/user/${id}/replace`, { schedules });
      if (isGuardian && !notifiedRef.current) {
        notifiedRef.current = true;
        await api.post('/notifications/', { user_id: id, message: '보호자가 일과를 수정했어요. 확인해보세요.' }).catch(() => {});
      }
    } catch {
      Alert.alert('오류', '저장에 실패했어요. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  // ── 주간 전체 보기 그리드 ──
  const renderWeekGrid = () => (
    <ScrollView
      contentContainerStyle={{ padding: PAD }}
      showsVerticalScrollIndicator={false}
      scrollEnabled={floating === null}
      onScroll={e => { scrollOffset.current = e.nativeEvent.contentOffset.y; }}
      scrollEventThrottle={16}
    >
      <View ref={gridRef} onLayout={() => { gridRef.current?.measure((_, __, w, h, px, py) => { gridBounds.current = { x: px, y: py, width: w, height: h }; }); }}>
        <View style={styles.gridRow}>
          <View style={{ width: TIME_W }} />
          {DAY_LABELS.map((d, i) => (
            <View key={i} style={[styles.gDayHeader, { width: DAY_COL }, i >= 5 && styles.gDayHeaderWeekend]}>
              <Text style={[styles.gDayHeaderText, i >= 5 && styles.gDayHeaderTextWeekend]}>{d}</Text>
            </View>
          ))}
        </View>
        <View style={{ position: 'relative' }}>
          {Array.from({ length: TOTAL }).map((_, slot) => {
            const mins = START_H * 60 + slot * 30;
            const isHour = mins % 60 === 0;
            return (
              <View key={slot} style={[styles.gridRow, { height: SLOT_H }]}>
                <View style={[styles.gTimeCell, { width: TIME_W }]}>
                  {isHour && <Text style={styles.gTimeLabel}>{String(Math.floor(mins / 60)).padStart(2, '0')}</Text>}
                </View>
                {DAY_LABELS.map((_, ci) => (
                  <View key={ci} style={[styles.gSlotCell, { width: DAY_COL, height: SLOT_H }, isHour && styles.gSlotHour]} />
                ))}
              </View>
            );
          })}
          {blocks.map(b => {
            const bh = (b.endSlot - b.startSlot) * SLOT_H - 1;
            return (
              <TouchableOpacity key={b.id} activeOpacity={0.75} onPress={() => openEdit(b)}
                style={[styles.gBlock, { top: b.startSlot * SLOT_H, left: TIME_W + b.day * DAY_COL + 1, width: DAY_COL - 2, height: bh, backgroundColor: b.color }]}>
                <Text style={styles.gBlockName} numberOfLines={bh >= 30 ? 2 : 1} adjustsFontSizeToFit minimumFontScale={0.8}>{b.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );

  if (loading) {
    return <SafeAreaView style={styles.container}><ActivityIndicator style={{ flex: 1 }} size="large" color={colors.primary} /></SafeAreaView>;
  }

  return (
   <AppFrame navigation={navigation} active="edit">
    <View style={styles.container}>
      <View ref={rootRef} style={{ flex: 1 }} onLayout={() => { rootRef.current?.measure((_, __, _w, _h, px, py) => { rootOff.current = { x: px, y: py }; }); }}>
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← 뒤로</Text>
          </TouchableOpacity>
          <Text style={styles.title}>일과 수정</Text>
          <View style={styles.headerRightSpace}>
            {saving ? <ActivityIndicator color={colors.primary} size="small" /> : null}
          </View>
        </View>

        {isGuardian && (
          <View style={styles.guardianBanner}>
            <Text style={styles.guardianBannerText}>보호자 모드 · 변경하면 자동 저장되고 당사자에게 알림이 가요</Text>
          </View>
        )}

        {/* 보기 전환 토글 */}
        <View style={styles.viewToggle}>
          <TouchableOpacity style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnOn]} onPress={() => setViewMode('list')}>
            <Text style={[styles.toggleText, viewMode === 'list' && styles.toggleTextOn]}>요일별 보기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, viewMode === 'week' && styles.toggleBtnOn]} onPress={() => setViewMode('week')}>
            <Text style={[styles.toggleText, viewMode === 'week' && styles.toggleTextOn]}>주간 전체 보기</Text>
          </TouchableOpacity>
        </View>

        {viewMode === 'week' ? (
          <>
            <View style={styles.hintBar}><Text style={styles.hintText}>블록을 탭하면 수정·삭제할 수 있어요</Text></View>
            {renderWeekGrid()}
          </>
        ) : (
          <>
            <View style={styles.daySelector}>
              {DAY_LABELS.map((d, i) => {
                const on = selectedDay === i;
                const weekend = i >= 5;
                return (
                  <TouchableOpacity key={i} style={[styles.dayChip, on && styles.dayChipOn, on && weekend && styles.dayChipOnWeekend]} onPress={() => setSelectedDay(i)} activeOpacity={0.8}>
                    <Text style={[styles.dayChipText, weekend && styles.dayChipTextWeekend, on && styles.dayChipTextOn]}>{d}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.hintBar}><Text style={styles.hintText}>카드를 탭하면 수정·삭제할 수 있어요</Text></View>
            <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
              {dayBlocks.length === 0 ? (
                <View style={styles.emptyWrap}><Text style={styles.emptyText}>{DAY_LABELS[selectedDay]}요일 일과가 없어요.{'\n'}아래 버튼으로 추가해보세요.</Text></View>
              ) : (
                dayBlocks.map(b => (
                  <TouchableOpacity key={b.id} style={[styles.card, { borderLeftColor: b.color }]} activeOpacity={0.7} onPress={() => openEdit(b)}>
                    <SchedIcon title={b.name} emoji={b.emoji} size={88} radius={16} />
                    <View style={styles.cardBody}>
                      <Text style={styles.cardName} numberOfLines={1}>{b.name}</Text>
                      <Text style={styles.cardTime}>{isBedtime(b.name) ? `${b.startTime} ~ 기상까지` : isInstant(b.name) ? b.startTime : `${b.startTime} ~ ${b.endTime}`}</Text>
                    </View>
                    <Text style={styles.cardEdit}>수정 ›</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </>
        )}

        <View style={styles.addBtnWrap}>
          <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.85}>
            <Text style={styles.addBtnText}>+ 일과 추가</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 추가 모달 */}
      <Modal visible={showAdd} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {addStep === 'pick' ? (
              <>
                {/* 1단계: 활동 이미지 가로 스크롤 선택 */}
                <Text style={styles.modalTitle}>어떤 일과를 추가할까요?</Text>
                <Text style={styles.modalSubtle}>활동을 선택하면 다음에서 시간·요일을 정해요</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickScroll}>
                  {PALETTE.map((p, i) => (
                    <TouchableOpacity key={i} style={styles.pickCard} activeOpacity={0.8} onPress={() => pickPalette(p)}>
                      <SchedIcon title={p.label === '직접 입력' ? '' : p.label} emoji={p.emoji} size={132} radius={20} />
                      <Text style={styles.pickCardLabel} numberOfLines={1}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <View style={styles.modalBtns}>
                  <TouchableOpacity onPress={() => setShowAdd(false)} style={[styles.cancelBtn, { flex: 1 }]}><Text style={styles.cancelText}>취소</Text></TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                {/* 2단계: 이름 · 시간 · 요일 */}
                <View style={styles.detailHead}>
                  <TouchableOpacity onPress={() => setAddStep('pick')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Text style={styles.detailBack}>‹ 활동 변경</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.detailSel}>
                  <SchedIcon title={addItem.label === '직접 입력' ? '' : addItem.label} emoji={addItem.emoji} size={64} radius={14} />
                  <Text style={styles.detailSelName}>{addItem.label === '직접 입력' ? '직접 입력' : addItem.label}</Text>
                </View>
                <Text style={styles.modalLabel}>일과 이름</Text>
                <TextInput style={styles.modalInput} value={addName} onChangeText={setAddName} placeholder="일과 이름을 입력해주세요" placeholderTextColor="#bbb" />
                <Text style={styles.modalLabel}>{isBedtime(addName) ? '취침 시각' : isInstant(addName) ? '시각' : '시간'}</Text>
                <View style={styles.timeRow}>
                  <TimePickerField value={addStart} onChange={(v) => { setAddStart(v); if (toMin(v) >= toMin(addEnd)) setAddEnd(minToTime(toMin(v) + 60)); }} />
                  {isBedtime(addName) ? (
                    <Text style={[styles.timeSep, { color: '#94A3B8' }]}>~ 기상까지(자동)</Text>
                  ) : isInstant(addName) ? (
                    <Text style={[styles.timeSep, { color: '#94A3B8' }]}>에 하기</Text>
                  ) : (
                    <>
                      <Text style={styles.timeSep}>~</Text>
                      <TimePickerField value={addEnd} onChange={setAddEnd} />
                    </>
                  )}
                </View>
                <Text style={styles.modalLabel}>요일 선택</Text>
                <View style={styles.dayRow}>
                  {DAY_LABELS.map((d, i) => (
                    <TouchableOpacity key={i} style={[styles.modalDayBtn, addDays[i] && styles.modalDayBtnOn]} onPress={() => toggleAddDay(i)}>
                      <Text style={[styles.modalDayText, addDays[i] && { color: '#fff' }]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.presetRow}>
                  <TouchableOpacity style={styles.presetBtn} onPress={() => setAddDayPreset([0,1,2,3,4])}><Text style={styles.presetText}>주중</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.presetBtn} onPress={() => setAddDayPreset([5,6])}><Text style={styles.presetText}>주말</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.presetBtn} onPress={() => setAddDayPreset([0,1,2,3,4,5,6])}><Text style={styles.presetText}>매일</Text></TouchableOpacity>
                </View>
                <View style={styles.modalBtns}>
                  <TouchableOpacity onPress={() => setShowAdd(false)} style={styles.cancelBtn}><Text style={styles.cancelText}>취소</Text></TouchableOpacity>
                  <TouchableOpacity onPress={confirmAdd} style={styles.confirmBtn}><Text style={styles.confirmText}>추가하기</Text></TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* 수정/삭제 모달 */}
      <Modal visible={!!editBlock} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center' }}>
              <SchedIcon title={editBlock?.name} emoji={editBlock?.emoji} size={28} />
              <Text style={styles.modalTitle}>{editBlock?.name}</Text>
            </View>
            <Text style={styles.modalLabel}>일과 이름</Text>
            <TextInput style={styles.modalInput} value={editName} onChangeText={setEditName} placeholder="일과 이름" placeholderTextColor="#bbb" />
            <Text style={styles.modalLabel}>{isBedtime(editName) ? '취침 시각' : isInstant(editName) ? '시각' : '시간'}</Text>
            <View style={styles.timeRow}>
              <TimePickerField value={editStart} onChange={(v) => { setEditStart(v); if (toMin(v) >= toMin(editEnd)) setEditEnd(minToTime(toMin(v) + 60)); }} />
              {isBedtime(editName) ? (
                <Text style={[styles.timeSep, { color: '#94A3B8' }]}>~ 기상까지(자동)</Text>
              ) : isInstant(editName) ? (
                <Text style={[styles.timeSep, { color: '#94A3B8' }]}>에 하기</Text>
              ) : (
                <>
                  <Text style={styles.timeSep}>~</Text>
                  <TimePickerField value={editEnd} onChange={setEditEnd} />
                </>
              )}
            </View>
            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={deleteBlock} style={styles.deleteBtn}><Text style={styles.deleteText}>삭제</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setEditBlock(null)} style={styles.cancelBtn}><Text style={styles.cancelText}>취소</Text></TouchableOpacity>
              <TouchableOpacity onPress={confirmEdit} style={styles.confirmBtn}><Text style={styles.confirmText}>수정</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
   </AppFrame>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn:  { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#F1F5F9', borderRadius: 20 },
  backText: { fontSize: 14, color: '#475569', fontWeight: '800' },
  title:    { fontSize: 18, fontWeight: '900', color: '#1E293B' },
  doneBtn:     { backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.primary, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 8, minWidth: 56, alignItems: 'center' },
  doneBtnText: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  headerRightSpace: { minWidth: 56, alignItems: 'flex-end', justifyContent: 'center' },

  guardianBanner: { backgroundColor: '#FFF7ED', paddingHorizontal: 16, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#FED7AA' },
  guardianBannerText: { fontSize: 11, color: '#92400E', fontWeight: '600', textAlign: 'center' },

  viewToggle: { flexDirection: 'row', gap: 6, padding: 6, margin: 12, marginBottom: 0, backgroundColor: '#F1F5F9', borderRadius: 14 },
  toggleBtn:   { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  toggleBtnOn: { backgroundColor: colors.primary },
  toggleText:   { fontSize: 13, fontWeight: '800', color: '#94A3B8' },
  toggleTextOn: { color: '#fff' },

  gridRow: { flexDirection: 'row' },
  gDayHeader: { alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  gDayHeaderWeekend: { backgroundColor: '#FFF3E0', borderRadius: 6 },
  gDayHeaderText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  gDayHeaderTextWeekend: { color: '#E07B39' },
  gTimeCell: { justifyContent: 'flex-start', alignItems: 'center', paddingTop: 1 },
  gTimeLabel: { fontSize: 10, color: '#999', fontWeight: '600' },
  gSlotCell: { borderLeftWidth: 0.5, borderBottomWidth: 0.5, borderColor: '#ececec' },
  gSlotHour: { borderBottomColor: '#c8c8c8' },
  gBlock: { position: 'absolute', borderRadius: 7, paddingHorizontal: 3, paddingVertical: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  gBlockEmoji: { fontSize: 13 },
  gBlockName: { fontSize: 11, lineHeight: 13, color: '#fff', fontWeight: '800', textAlign: 'center' },

  daySelector: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  dayChip: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: '#F1F5F9' },
  dayChipOn:        { backgroundColor: colors.primary },
  dayChipOnWeekend: { backgroundColor: '#E07B39' },
  dayChipText:        { fontSize: 14, fontWeight: '800', color: '#475569' },
  dayChipTextWeekend: { color: '#E07B39' },
  dayChipTextOn:      { color: '#fff' },

  hintBar:  { backgroundColor: '#FFFDE7', paddingVertical: 6, paddingHorizontal: 16 },
  hintText: { fontSize: 12, color: '#888', textAlign: 'center' },

  listContent: { padding: 16, gap: 10, paddingBottom: 20 },
  emptyWrap: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 22 },

  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.white, borderRadius: 18, padding: 12, borderLeftWidth: 5, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  cardBody:  { flex: 1, gap: 2 },
  cardEmoji: { fontSize: 26 },
  cardName:  { fontSize: 18, fontWeight: '900', color: '#1E293B' },
  cardTime:  { fontSize: 14, color: '#94A3B8', fontWeight: '700', marginTop: 4 },
  cardEdit:  { fontSize: 13, color: '#94A3B8', fontWeight: '700' },

  addBtnWrap: { padding: 16, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
  addBtn: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  addBtnText: { color: colors.primary, fontWeight: '800', fontSize: 16 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36, maxHeight: '90%' },
  addRow:    { flexDirection: 'row', gap: 14, height: 380, marginBottom: 8 },
  addPicker: { flex: 1 },
  addForm:   { flex: 1, justifyContent: 'space-between', paddingVertical: 2 },
  fGroup:    {},
  pickTile:  { alignItems: 'center', gap: 6, padding: 8, borderRadius: 18, borderWidth: 2, borderColor: 'transparent', backgroundColor: '#F8FAFC' },
  pickLabel: { fontSize: 13, fontWeight: '700', color: '#555', textAlign: 'center' },
  // 2단계 추가 마법사
  modalSubtle: { fontSize: 13, color: '#94A3B8', fontWeight: '600', marginTop: -8, marginBottom: 14 },
  pickScroll:  { gap: 14, paddingVertical: 6, paddingRight: 12 },
  pickCard:    { width: 148, alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 22, backgroundColor: '#F8FAFC' },
  pickCardLabel: { fontSize: 16, fontWeight: '800', color: '#334155' },
  detailHead:  { marginBottom: 10 },
  detailBack:  { fontSize: 15, fontWeight: '700', color: colors.primary },
  detailSel:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  detailSelName: { fontSize: 20, fontWeight: '900', color: '#1E293B' },
  modalCard: { backgroundColor: colors.white, borderRadius: 24, padding: 24, margin: 24, alignSelf: 'center', width: '88%' },
  modalTitle: { fontSize: 18, fontWeight: '900', color: colors.primary, marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: '800', color: '#475569', marginTop: 4, marginBottom: 8 },
  modalInput: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, borderWidth: 1.5, borderColor: '#E2E8F0', marginBottom: 16 },

  palItem: { alignItems: 'center', padding: 8, borderRadius: 12, borderWidth: 1.5, borderColor: 'transparent', backgroundColor: '#F1F5F9', minWidth: 64 },
  palEmoji: { fontSize: 24 },
  palLabel: { fontSize: 10, fontWeight: '600', color: '#555', marginTop: 3, textAlign: 'center' },

  palette: { backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 12 },
  paletteHint: { fontSize: 11, color: '#aaa', fontWeight: '600', textAlign: 'center', marginBottom: 6 },
  paletteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  palDragItem: { width: (SW - 20 - 48) / 9, minWidth: 50, maxWidth: 68, aspectRatio: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  floatingBlock: { position: 'absolute', width: 60, height: 60, borderRadius: 14, alignItems: 'center', justifyContent: 'center', elevation: 10, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  floatingEmoji: { fontSize: 26 },

  timeRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  timeCol:  { gap: 6 },
  timeInput: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, fontWeight: '700', color: colors.text, borderWidth: 1.5, borderColor: colors.border, textAlign: 'center' },
  timeSep: { fontSize: 16, color: '#999', marginHorizontal: 8, alignSelf: 'center' },

  dayRow: { flexDirection: 'row', gap: 5 },
  modalDayBtn: { flex: 1, height: 40, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  modalDayBtnOn: { backgroundColor: colors.primary },
  modalDayText:  { fontSize: 13, fontWeight: '700', color: '#1E293B' },

  presetRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  presetBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E2E8F0' },
  presetText: { fontSize: 12, fontWeight: '700', color: '#1E293B' },

  modalBtns:   { flexDirection: 'row', gap: 8, marginTop: 4 },
  deleteBtn:   { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#FEE2E2', alignItems: 'center' },
  deleteText:  { fontSize: 14, fontWeight: '700', color: '#DC2626' },
  cancelBtn:   { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center' },
  cancelText:  { fontSize: 14, fontWeight: '700', color: '#888' },
  confirmBtn:  { flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center' },
  confirmText: { fontSize: 14, fontWeight: '800', color: colors.primary },
});
