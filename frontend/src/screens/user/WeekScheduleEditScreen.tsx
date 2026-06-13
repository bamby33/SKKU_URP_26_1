/**
 * 일주일 일과 수정 화면
 * AI 추천 시간표 기반 편집 → 완료 시 DB 전체 재저장
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Modal, PanResponder, Dimensions,
  Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { api } from '../../api/client';
import { SchedIcon } from '../../components/SchedIcon';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'WeekScheduleEdit'>;
};

// ── 상수 ──────────────────────────────────────────────────────────────────────
const { width: SW } = Dimensions.get('window');
const PAD = 12;
const TIME_W = 34;
const GRID_W = SW - PAD * 2;
const DAY_COL = (GRID_W - TIME_W) / 7;
const SLOT_H = 22;
const START_H = 6;
const TOTAL = 32; // 06:00 ~ 22:00

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

const PALETTE = [
  { emoji: '🚶',  label: '산책',      color: '#6B9BF2' },
  { emoji: '📖',  label: '독서·여가', color: '#5BB7C0' },
  { emoji: '🎵',  label: '음악 감상', color: '#26C6DA' },
  { emoji: '🧸',  label: '놀이 시간', color: '#FF8A65' },
  { emoji: '💊',  label: '약 복용',   color: '#E57373' },
  { emoji: '🎨',  label: '그림',      color: '#AB77E8' },
  { emoji: '🏋️', label: '운동',      color: '#AED581' },
  { emoji: '🛁',  label: '목욕·세면', color: '#FFB74D' },
  { emoji: '➕',  label: '직접 입력', color: '#aaa'    },
];

const EMOJI_COLOR_MAP: Record<string, string> = {
  '🌅': '#FFB74D', '🍚': '#4CAF7D', '🍱': '#4CAF7D', '🍽️': '#4CAF7D',
  '💤': '#AB77E8', '🚶': '#6B9BF2', '📖': '#5BB7C0', '💊': '#E57373',
  '🎵': '#26C6DA', '🏋️': '#AED581', '🧸': '#FF8A65', '🎨': '#AB77E8',
  '🛁': '#FFB74D', '🏢': '#6B9BF2', '🏥': '#FF8A65', '🎓': '#AB77E8',
  '🩺': '#E57373', '⛪': '#26C6DA', '📋': '#4CAF7D',
};

type Block = {
  id: string;
  day: number;
  startSlot: number;
  endSlot: number;
  name: string;
  emoji: string;
  color: string;
};

type ApiSchedule = {
  id: number;
  title: string;
  scheduled_time: string;
  days_of_week: string;
};

type PaletteItem = (typeof PALETTE)[number];

let uid = 0;
const nid = () => `w${uid++}`;

const toSlot = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return (h - START_H) * 2 + Math.round(m / 30);
};
const toTime = (slot: number): string => {
  const mins = START_H * 60 + slot * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function parseTitle(title: string): { emoji: string; name: string } {
  const parts = title.split(' ');
  if (parts.length >= 2) return { emoji: parts[0], name: parts.slice(1).join(' ') };
  return { emoji: '📋', name: title };
}

function schedulesToBlocks(schedules: ApiSchedule[]): Block[] {
  const blocks: Block[] = [];
  for (const s of schedules) {
    const { emoji, name } = parseTitle(s.title);
    const color = EMOJI_COLOR_MAP[emoji] ?? '#4CAF7D';
    const startSlot = toSlot(s.scheduled_time);
    const endSlot = Math.min(startSlot + 2, TOTAL);
    for (const dayStr of s.days_of_week.split(',')) {
      const day = parseInt(dayStr.trim(), 10);
      if (isNaN(day)) continue;
      blocks.push({ id: nid(), day, startSlot, endSlot, name, emoji, color });
    }
  }
  return blocks;
}

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────
export default function WeekScheduleEditScreen({ navigation }: Props) {
  const [blocks,      setBlocks]      = useState<Block[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [isGuardian,  setIsGuardian]  = useState(false);
  const [storedUserId, setStoredUserId] = useState<string | null>(null);
  const [floating,    setFloating]    = useState<{ item: PaletteItem; x: number; y: number } | null>(null);

  const existingIdsRef = useRef<number[]>([]);

  useEffect(() => {
    AsyncStorage.multiGet(['role', 'user_id']).then(pairs => {
      setIsGuardian(pairs[0][1] === 'guardian');
      setStoredUserId(pairs[1][1]);
    });
  }, []);

  const rootRef      = useRef<View>(null);
  const rootOff      = useRef({ x: 0, y: 0 });
  const gridRef      = useRef<View>(null);
  const gridBounds   = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const scrollOffset = useRef(0);

  const [dropModal,      setDropModal]      = useState<{ item: PaletteItem } | null>(null);
  const [dropDay,        setDropDay]        = useState(0);
  const [dropStart,      setDropStart]      = useState('09:00');
  const [dropEnd,        setDropEnd]        = useState('10:00');
  const [dropCustomName, setDropCustomName] = useState('');

  // ── 기존 스케줄 로드 ────────────────────────────────────────────────────────
  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) return;
      const res = await api.get(`/schedules/user/${userId}`);
      const all: ApiSchedule[] = res.data;
      existingIdsRef.current = all.map(s => s.id);
      setBlocks(schedulesToBlocks(all));
    } catch {
      Alert.alert('오류', '일과를 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchSchedules(); }, [fetchSchedules]));

  // ── 블록 삭제 (탭) ──────────────────────────────────────────────────────────
  const handleBlockPress = (block: Block) => {
    Alert.alert(
      '일과 삭제',
      `'${block.emoji} ${block.name}' 블록을 삭제할까요?`,
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => setBlocks(p => p.filter(b => b.id !== block.id)) },
      ],
    );
  };

  // ── 드롭 처리 ──────────────────────────────────────────────────────────────
  const handleDrop = (item: PaletteItem, pageX: number, pageY: number) => {
    const b = gridBounds.current;
    if (pageX < b.x || pageX > b.x + b.width || pageY < b.y || pageY > b.y + b.height) return;
    const relX    = pageX - b.x - TIME_W;
    const relY    = pageY - b.y + scrollOffset.current;
    const colIdx  = clamp(Math.floor(relX / DAY_COL), 0, 6);
    const slotIdx = clamp(Math.floor(relY / SLOT_H), 0, TOTAL - 2);
    const day     = colIdx;
    setDropDay(day);
    setDropStart(toTime(slotIdx));
    setDropEnd(toTime(Math.min(slotIdx + 2, TOTAL)));
    setDropCustomName(item.label === '직접 입력' ? '' : item.label);
    setDropModal({ item });
  };

  const confirmDrop = () => {
    if (!dropModal) return;
    const ss = toSlot(dropStart);
    const es = toSlot(dropEnd);
    if (ss >= es) return;
    const name = dropModal.item.label === '직접 입력' ? dropCustomName.trim() : dropModal.item.label;
    if (!name) return;
    setBlocks(p => [...p, {
      id: nid(), day: dropDay,
      startSlot: ss, endSlot: es,
      name, emoji: dropModal.item.emoji, color: dropModal.item.color,
    }]);
    setDropModal(null);
  };

  // ── PanResponders ──────────────────────────────────────────────────────────
  const palettePRs = useRef(
    PALETTE.map(item =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder:  () => true,
        onPanResponderGrant: (evt) => {
          setFloating({ item, x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY });
        },
        onPanResponderMove: (evt) => {
          setFloating({ item, x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY });
        },
        onPanResponderRelease: (evt) => {
          setFloating(null);
          handleDrop(item, evt.nativeEvent.pageX, evt.nativeEvent.pageY);
        },
        onPanResponderTerminate: () => setFloating(null),
      })
    )
  ).current;

  // ── 완료 저장 ──────────────────────────────────────────────────────────────
  const doSave = async () => {
    setSaving(true);
    try {
      const userId = storedUserId ?? await AsyncStorage.getItem('user_id');
      if (!userId) return;
      for (const id of existingIdsRef.current) {
        await api.delete(`/schedules/${id}`);
      }
      for (const block of blocks) {
        await api.post('/schedules/', {
          user_id: Number(userId),
          title: `${block.emoji} ${block.name}`,
          scheduled_time: toTime(block.startSlot),
          days_of_week: String(block.day),
        });
      }
      if (isGuardian) {
        await api.post('/notifications/', {
          user_id: Number(userId),
          message: '보호자가 일주일 일과를 수정했어요. 확인해보세요.',
        });
      }
      Alert.alert('완료', '일과가 저장됐어요!', [
        { text: '확인', onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert('오류', '저장에 실패했어요. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = () => {
    Alert.alert('일과 저장', '현재 시간표로 일과를 저장할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '저장', onPress: doSave },
    ]);
  };

  // ── 시간표 렌더링 ──────────────────────────────────────────────────────────
  const renderTimetable = () => {
    return (
      <View
        ref={gridRef}
        onLayout={() => {
          gridRef.current?.measure((_, __, w, h, px, py) => {
            gridBounds.current = { x: px, y: py, width: w, height: h };
          });
        }}
      >
        <View style={styles.gridRow}>
          <View style={{ width: TIME_W }} />
          {DAY_LABELS.map((d, i) => (
            <View key={i} style={[styles.dayHeader, { width: DAY_COL }, i >= 5 && styles.dayHeaderWeekend]}>
              <Text style={[styles.dayHeaderText, i >= 5 && styles.dayHeaderTextWeekend]}>{d}</Text>
            </View>
          ))}
        </View>

        <View style={{ position: 'relative' }}>
          {Array.from({ length: TOTAL }).map((_, slot) => {
            const mins   = START_H * 60 + slot * 30;
            const h      = Math.floor(mins / 60);
            const isHour = mins % 60 === 0;
            return (
              <View key={slot} style={[styles.gridRow, { height: SLOT_H }]}>
                <View style={[styles.timeCell, { width: TIME_W }]}>
                  {isHour && <Text style={styles.timeLabel}>{String(h).padStart(2, '0')}</Text>}
                </View>
                {DAY_LABELS.map((_, ci) => (
                  <View key={ci} style={[styles.slotCell, { width: DAY_COL, height: SLOT_H }, isHour && styles.slotHour]} />
                ))}
              </View>
            );
          })}

          {blocks.map(block => {
            const h = (block.endSlot - block.startSlot) * SLOT_H;
            const iconSz = Math.min(DAY_COL - 6, Math.max(16, h - 6));
            return (
              <TouchableOpacity
                key={block.id}
                activeOpacity={0.75}
                onPress={() => handleBlockPress(block)}
                style={[styles.block, {
                  position: 'absolute',
                  top:    block.startSlot * SLOT_H,
                  left:   TIME_W + block.day * DAY_COL + 1,
                  width:  DAY_COL - 2,
                  height: h - 1,
                  backgroundColor: block.color + 'DD',
                }]}
              >
                <SchedIcon title={block.name} emoji={block.emoji} size={iconSz} emojiStyle={styles.blockEmoji} />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  // ── 로딩 ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={styles.container}>
      <View
        ref={rootRef}
        style={{ flex: 1 }}
        onLayout={() => {
          rootRef.current?.measure((_, __, _w, _h, px, py) => {
            rootOff.current = { x: px, y: py };
          });
        }}
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← 뒤로</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>일주일 일과 수정</Text>
          <TouchableOpacity
            style={[styles.doneBtn, saving && { opacity: 0.6 }]}
            onPress={handleComplete}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.doneBtnText}>완료</Text>
            }
          </TouchableOpacity>
        </View>

        {/* 보호자 안내 배너 */}
        {isGuardian && (
          <View style={styles.guardianBanner}>
            <Text style={styles.guardianBannerText}>
              보호자 모드 · 저장 시 당사자에게 알림이 전송돼요
            </Text>
          </View>
        )}

        {/* 안내 */}
        <View style={styles.hintRow}>
          <Text style={styles.hintText}>블록을 탭하면 삭제 · 팔레트에서 드래그해서 추가</Text>
        </View>

        {/* 시간표 */}
        <ScrollView
          style={{ flex: 1 }}
          scrollEnabled={floating === null}
          onScroll={e => { scrollOffset.current = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
          contentContainerStyle={{ padding: PAD }}
        >
          {renderTimetable()}
        </ScrollView>

        {/* 팔레트 */}
        <View style={styles.palette}>
          <Text style={styles.paletteLabel}>꾹 눌러서 시간표에 드래그 ↑</Text>
          <View style={styles.paletteGrid}>
            {PALETTE.map((item, i) => (
              <View
                key={i}
                {...palettePRs[i].panHandlers}
                style={[styles.paletteItem, { backgroundColor: item.color + '22' }]}
              >
                <Text style={styles.paletteEmoji}>{item.emoji}</Text>
                <Text style={styles.paletteItemText}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 플로팅 블록 */}
        {floating && (
          <View
            pointerEvents="none"
            style={[styles.floatingBlock, {
              left: floating.x - rootOff.current.x - 34,
              top:  floating.y - rootOff.current.y - 34,
            }]}
          >
            <SchedIcon title={floating.item.label} emoji={floating.item.emoji} size={28} emojiStyle={styles.floatingEmoji} />
            <Text style={styles.floatingLabel}>{floating.item.label}</Text>
          </View>
        )}
      </View>

      {/* 드롭 모달 */}
      <Modal visible={!!dropModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {DAY_LABELS[dropDay]}요일에 추가할까요?
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center' }}>
              <SchedIcon title={dropModal?.item.label} emoji={dropModal?.item.emoji} size={24} />
              <Text style={styles.modalSub}>
                {dropModal?.item.label !== '직접 입력' ? dropModal?.item.label : '새 일과'}
              </Text>
            </View>

            {dropModal?.item.label === '직접 입력' && (
              <TextInput
                style={styles.modalInput}
                value={dropCustomName}
                onChangeText={setDropCustomName}
                placeholder="일과 이름을 입력해주세요"
                placeholderTextColor="#bbb"
              />
            )}

            <Text style={styles.modalLabel}>요일 변경</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {DAY_LABELS.map((d, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.modalDayBtn, dropDay === i && styles.modalDayBtnActive]}
                    onPress={() => setDropDay(i)}
                  >
                    <Text style={[styles.modalDayText, dropDay === i && { color: '#fff' }]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.modalLabel}>시간</Text>
            <View style={styles.modalTimeRow}>
              <TextInput
                style={styles.modalTimeInput}
                value={dropStart}
                onChangeText={setDropStart}
                placeholder="09:00"
                placeholderTextColor="#bbb"
                keyboardType="numbers-and-punctuation"
              />
              <Text style={styles.timeSep}>~</Text>
              <TextInput
                style={styles.modalTimeInput}
                value={dropEnd}
                onChangeText={setDropEnd}
                placeholder="10:00"
                placeholderTextColor="#bbb"
                keyboardType="numbers-and-punctuation"
              />
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={() => setDropModal(null)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmDrop} style={styles.modalConfirmBtn}>
                <Text style={styles.modalConfirmText}>추가하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── 스타일 ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F4FAF7' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // AI 로딩 오버레이
  aiOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  aiCard: {
    backgroundColor: '#fff', borderRadius: 24, padding: 28, alignItems: 'center', width: '100%',
    elevation: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 6 },
  },
  aiCardEmoji: { fontSize: 40, marginBottom: 12 },
  aiCardTitle: { fontSize: 17, fontWeight: '900', color: colors.primary, marginBottom: 6 },
  aiCardSub:   { fontSize: 13, color: '#888', textAlign: 'center' },

  // AI 추천 배너
  aiBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 12, marginTop: 10, marginBottom: 4,
    backgroundColor: '#F0FBF4', borderRadius: 16, padding: 14,
    borderWidth: 1.5, borderColor: colors.primary + '55',
  },
  aiBannerEmoji: { fontSize: 22 },
  aiBannerTitle: { fontSize: 13, fontWeight: '800', color: colors.primary },
  aiBannerSub:   { fontSize: 11, color: '#888', marginTop: 2 },
  aiBannerArrow: { fontSize: 16, color: colors.primary, fontWeight: '800' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn:     { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.primaryBg, borderRadius: 16 },
  backText:    { fontSize: 14, color: colors.primary, fontWeight: '800' },
  headerTitle: { fontSize: 16, fontWeight: '900', color: colors.primary },
  doneBtn:     { backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 8 },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  tabRow:        { flexDirection: 'row', backgroundColor: '#E4F2EA', padding: 6, gap: 6, marginTop: 6 },
  tabBtn:        { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  tabBtnActive:  { backgroundColor: colors.primary },
  tabText:       { fontSize: 13, fontWeight: '700', color: '#888' },
  tabTextActive: { color: '#fff' },

  guardianBanner: {
    backgroundColor: '#FFF7ED', paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#FED7AA',
  },
  guardianBannerText: { fontSize: 11, color: '#92400E', fontWeight: '600', textAlign: 'center' },

  hintRow:  { paddingHorizontal: 16, paddingVertical: 5 },
  hintText: { fontSize: 10, color: '#aaa', textAlign: 'center', fontWeight: '600' },

  timeSep: { fontSize: 16, color: '#999', marginHorizontal: 6 },

  gridRow:       { flexDirection: 'row' },
  dayHeader:     { alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  dayHeaderWeekend: { backgroundColor: '#FFF3E0', borderRadius: 6 },
  dayHeaderText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  dayHeaderTextWeekend: { color: '#E07B39' },
  timeCell:      { justifyContent: 'flex-start', paddingTop: 1, alignItems: 'center' },
  timeLabel:     { fontSize: 10, color: '#999', fontWeight: '600' },
  slotCell:      { borderLeftWidth: 0.5, borderBottomWidth: 0.5, borderColor: '#ececec' },
  slotHour:      { borderBottomColor: '#c8c8c8' },
  block:         { borderRadius: 4, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  blockEmoji:    { fontSize: 13 },

  palette:         { backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  paletteLabel:    { fontSize: 11, color: '#aaa', fontWeight: '600', textAlign: 'center', marginBottom: 6 },
  paletteGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  paletteItem:     { width: (SW - 24 - 48) / 9, minWidth: 54, maxWidth: 70, aspectRatio: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  paletteEmoji:    { fontSize: 20 },
  paletteItemText: { fontSize: 8, color: '#555', fontWeight: '600', marginTop: 2, textAlign: 'center' },

  floatingBlock: {
    position: 'absolute', width: 68, height: 68, borderRadius: 16,
    backgroundColor: colors.primary + 'EE', alignItems: 'center', justifyContent: 'center',
    elevation: 10, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  floatingEmoji: { fontSize: 26 },
  floatingLabel: { fontSize: 9, color: '#fff', fontWeight: '700', marginTop: 2, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard:    {
    backgroundColor: colors.white, borderRadius: 24, padding: 24, width: '100%',
    elevation: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 6 },
  },
  modalTitle:      { fontSize: 18, fontWeight: '900', color: colors.primary, marginBottom: 4 },
  modalSub:        { fontSize: 14, color: '#888', marginBottom: 16 },
  modalLabel:      { fontSize: 12, fontWeight: '700', color: '#666', marginBottom: 8 },
  modalInput:      {
    backgroundColor: '#F4FAF7', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colors.text,
    borderWidth: 1.5, borderColor: colors.border, marginBottom: 14,
  },
  modalDayBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E8F5EE', alignItems: 'center', justifyContent: 'center' },
  modalDayBtnActive: { backgroundColor: colors.primary },
  modalDayText:      { fontSize: 13, fontWeight: '700', color: '#888' },
  modalTimeRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  modalTimeInput:    {
    flex: 1, backgroundColor: '#F4FAF7', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, fontWeight: '700', color: colors.text,
    borderWidth: 1.5, borderColor: colors.border, textAlign: 'center',
  },
  modalBtns:        { flexDirection: 'row', gap: 10 },
  modalCancelBtn:   { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: '#E8F5EE', alignItems: 'center' },
  modalCancelText:  { fontSize: 15, fontWeight: '700', color: '#888' },
  modalConfirmBtn:  {
    flex: 2, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center',
    elevation: 4, shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  modalConfirmText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
