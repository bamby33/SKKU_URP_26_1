/**
 * 온보딩 3 · 보호자 전용 · 2단계 스케줄 설정
 * Phase 1: 주기적 일과 텍스트 입력
 * Phase 2: 시간표 확인 + 블록 드래그로 일과 추가
 */
import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Modal, PanResponder, Dimensions,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ScheduleSetup'>;
  route: RouteProp<RootStackParamList, 'ScheduleSetup'>;
};

// ── 상수 ──────────────────────────────────────────────────────────────────────
const { width: SW } = Dimensions.get('window');
const PAD = 16;
const TIME_W = 44;
const GRID_W = SW - PAD * 2;
const WD_COL = (GRID_W - TIME_W) / 5;
const WE_COL = (GRID_W - TIME_W) / 2;
const SLOT_H = 28;
const START_H = 6;
const TOTAL = 32; // 06:00 ~ 22:00

const DAY_LABELS     = ['월', '화', '수', '목', '금', '토', '일'];
const WEEKDAY_LABELS = ['월', '화', '수', '목', '금'];
const WEEKEND_LABELS = ['토', '일'];

const QUICK_NAMES = [
  { label: '회사·직장', emoji: '🏢', color: '#6B9BF2' },
  { label: '시설 방문', emoji: '🏥', color: '#FF8A65' },
  { label: '학교·교육', emoji: '🎓', color: '#AB77E8' },
  { label: '치료·재활', emoji: '🩺', color: '#E57373' },
  { label: '종교 활동', emoji: '⛪', color: '#26C6DA' },
];

const DEFAULTS = [
  { s: 2,  e: 3,  emoji: '🌅', name: '기상·세면', color: '#FFB74D' },
  { s: 4,  e: 6,  emoji: '🍚', name: '아침 식사', color: '#4CAF7D' },
  { s: 12, e: 14, emoji: '🍱', name: '점심 식사', color: '#4CAF7D' },
  { s: 24, e: 26, emoji: '🍽️', name: '저녁 식사', color: '#4CAF7D' },
  { s: 30, e: 32, emoji: '💤', name: '취침 준비', color: '#AB77E8' },
];

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

// ── 타입 ──────────────────────────────────────────────────────────────────────
type RecurItem = {
  id: string;
  days: boolean[];
  startTime: string;
  endTime: string;
  name: string;
  emoji: string;
  color: string;
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

type PaletteItem = (typeof PALETTE)[number];

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

function buildBlocks(recurItems: RecurItem[]): Block[] {
  const blocks: Block[] = [];
  for (let day = 0; day < 7; day++) {
    for (const d of DEFAULTS) {
      blocks.push({ id: nid(), day, startSlot: d.s, endSlot: d.e, name: d.name, emoji: d.emoji, color: d.color });
    }
  }
  for (const item of recurItems) {
    for (let day = 0; day < 7; day++) {
      if (item.days[day]) {
        blocks.push({
          id: nid(), day,
          startSlot: toSlot(item.startTime),
          endSlot: toSlot(item.endTime),
          name: item.name, emoji: item.emoji, color: item.color,
        });
      }
    }
  }
  return blocks;
}

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────
export default function ScheduleSetupScreen({ navigation, route }: Props) {
  const { userName, age, gender, disabilityType, likes, dislikes, themeColor } = route.params;

  const [phase, setPhase] = useState<'input' | 'preview'>('input');

  // ── Phase 1 ──
  const [recurItems, setRecurItems] = useState<RecurItem[]>([]);
  const [selDays,    setSelDays]    = useState<boolean[]>(Array(7).fill(false));
  const [startTime,  setStartTime]  = useState('09:00');
  const [endTime,    setEndTime]    = useState('17:00');
  const [actName,    setActName]    = useState('');
  const [actEmoji,   setActEmoji]   = useState('🏢');
  const [actColor,   setActColor]   = useState('#6B9BF2');

  // ── Phase 2 ──
  const [tab,    setTab]    = useState<'weekday' | 'weekend'>('weekday');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [floating, setFloating] = useState<{ item: PaletteItem; x: number; y: number } | null>(null);

  // 그리드 측정
  const rootRef      = useRef<View>(null);
  const rootOff      = useRef({ x: 0, y: 0 });
  const gridRef      = useRef<View>(null);
  const gridBounds   = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const scrollOffset = useRef(0);

  // 드롭 모달
  const [dropModal,      setDropModal]      = useState<{ item: PaletteItem } | null>(null);
  const [dropDay,        setDropDay]        = useState(0);
  const [dropStart,      setDropStart]      = useState('09:00');
  const [dropEnd,        setDropEnd]        = useState('10:00');
  const [dropCustomName, setDropCustomName] = useState('');

  // ── Phase 1 helpers ──────────────────────────────────────────────────────
  const toggleDay     = (i: number) => setSelDays(p => { const n = [...p]; n[i] = !n[i]; return n; });
  const selectWeekday = () => setSelDays([true,  true,  true,  true,  true,  false, false]);
  const selectWeekend = () => setSelDays([false, false, false, false, false, true,  true ]);
  const selectAll     = () => setSelDays(Array(7).fill(true));

  const addRecurItem = () => {
    if (!actName.trim() || !selDays.some(Boolean)) return;
    setRecurItems(p => [...p, {
      id: nid(), days: selDays, startTime, endTime,
      name: actName.trim(), emoji: actEmoji, color: actColor,
    }]);
    setSelDays(Array(7).fill(false));
    setActName('');
  };

  const goToPreview = () => {
    setBlocks(buildBlocks(recurItems));
    setPhase('preview');
  };

  // ── Drop handling ─────────────────────────────────────────────────────────
  const handleDrop = (item: PaletteItem, pageX: number, pageY: number) => {
    const b = gridBounds.current;
    if (pageX < b.x || pageX > b.x + b.width || pageY < b.y || pageY > b.y + b.height) return;

    const colW    = tab === 'weekday' ? WD_COL : WE_COL;
    const relX    = pageX - b.x - TIME_W;
    const relY    = pageY - b.y + scrollOffset.current;
    const colIdx  = clamp(Math.floor(relX / colW), 0, tab === 'weekday' ? 4 : 1);
    const slotIdx = clamp(Math.floor(relY / SLOT_H), 0, TOTAL - 2);
    const day     = tab === 'weekday' ? colIdx : colIdx + 5;

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

  // ── PanResponders (한 번만 생성) ──────────────────────────────────────────
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
          const { pageX, pageY } = evt.nativeEvent;
          setFloating(null);
          handleDrop(item, pageX, pageY);
        },
        onPanResponderTerminate: () => setFloating(null),
      })
    )
  ).current;

  // ── 시간표 렌더링 ──────────────────────────────────────────────────────────
  const renderTimetable = () => {
    const isWD         = tab === 'weekday';
    const dayLabels    = isWD ? WEEKDAY_LABELS : WEEKEND_LABELS;
    const colW         = isWD ? WD_COL : WE_COL;
    const activeBlocks = blocks.filter(b => isWD ? b.day < 5 : b.day >= 5);

    return (
      <View
        ref={gridRef}
        onLayout={() => {
          gridRef.current?.measure((_, __, w, h, px, py) => {
            gridBounds.current = { x: px, y: py, width: w, height: h };
          });
        }}
      >
        {/* 헤더 */}
        <View style={styles.gridRow}>
          <View style={{ width: TIME_W }} />
          {dayLabels.map((d, i) => (
            <View key={i} style={[styles.dayHeader, { width: colW }]}>
              <Text style={styles.dayHeaderText}>{d}</Text>
            </View>
          ))}
        </View>

        {/* 슬롯 + 블록 */}
        <View style={{ position: 'relative' }}>
          {Array.from({ length: TOTAL }).map((_, slot) => {
            const mins   = START_H * 60 + slot * 30;
            const h      = Math.floor(mins / 60);
            const isHour = mins % 60 === 0;
            return (
              <View key={slot} style={[styles.gridRow, { height: SLOT_H }]}>
                <View style={[styles.timeCell, { width: TIME_W }]}>
                  {isHour && <Text style={styles.timeLabel}>{`${String(h).padStart(2, '0')}:00`}</Text>}
                </View>
                {dayLabels.map((_, ci) => (
                  <View key={ci} style={[styles.slotCell, { width: colW, height: SLOT_H }, isHour && styles.slotHour]} />
                ))}
              </View>
            );
          })}

          {activeBlocks.map(block => {
            const colIdx = isWD ? block.day : block.day - 5;
            const h      = (block.endSlot - block.startSlot) * SLOT_H;
            return (
              <View
                key={block.id}
                style={[styles.block, {
                  position: 'absolute',
                  top:    block.startSlot * SLOT_H,
                  left:   TIME_W + colIdx * colW + 2,
                  width:  colW - 4,
                  height: h,
                  backgroundColor: block.color + 'DD',
                }]}
              >
                <Text style={styles.blockEmoji}>{block.emoji}</Text>
                {h >= 36 && <Text style={styles.blockName} numberOfLines={2}>{block.name}</Text>}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  // ── 완료 ──────────────────────────────────────────────────────────────────
  const handleComplete = () => {
    navigation.navigate('AccountSetup', {
      userName, age, gender, likes, dislikes, themeColor,
      disabilityType,
      schedules: blocks.map(b => ({
        day: b.day, startSlot: b.startSlot, endSlot: b.endSlot,
        activity: b.name, emoji: b.emoji, color: b.color,
      })),
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  Phase 1 — 주기적 일과 입력
  // ═══════════════════════════════════════════════════════════════════════════
  if (phase === 'input') {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.inputContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backText}>← 뒤로</Text>
            </TouchableOpacity>

            {/* 로봇 말풍선 */}
            <View style={styles.robotRow}>
              <Text style={styles.robotEmoji}>🤖</Text>
              <View style={styles.bubble}>
                <Text style={styles.bubbleTitle}>주기적으로 하는 일과가 있나요? 📅</Text>
                <Text style={styles.bubbleSub}>
                  예) 주중 9시~17시 회사{'\n'}토요일 10시~12시 시설 방문
                </Text>
              </View>
            </View>

            {/* 입력 카드 */}
            <View style={styles.formCard}>
              <Text style={styles.formLabel}>요일</Text>
              <View style={styles.shortcutRow}>
                {([['주중', selectWeekday], ['주말', selectWeekend], ['매일', selectAll]] as [string, () => void][]).map(([label, fn], i) => (
                  <TouchableOpacity key={i} style={styles.shortcutBtn} onPress={fn}>
                    <Text style={styles.shortcutText}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.dayToggleRow}>
                {DAY_LABELS.map((d, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.dayToggle, selDays[i] && styles.dayToggleOn]}
                    onPress={() => toggleDay(i)}
                  >
                    <Text style={[styles.dayToggleText, selDays[i] && styles.dayToggleTextOn]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.formLabel, { marginTop: 14 }]}>시간</Text>
              <View style={styles.timeRow}>
                <TextInput
                  style={styles.timeInput}
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="09:00"
                  placeholderTextColor="#bbb"
                  keyboardType="numbers-and-punctuation"
                />
                <Text style={styles.timeSep}>~</Text>
                <TextInput
                  style={styles.timeInput}
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="17:00"
                  placeholderTextColor="#bbb"
                  keyboardType="numbers-and-punctuation"
                />
              </View>

              <Text style={[styles.formLabel, { marginTop: 14 }]}>일과 이름</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                  {QUICK_NAMES.map((q, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.chip, actName === q.label && { backgroundColor: q.color }]}
                      onPress={() => { setActName(q.label); setActEmoji(q.emoji); setActColor(q.color); }}
                    >
                      <Text style={[styles.chipText, actName === q.label && { color: '#fff' }]}>
                        {q.emoji} {q.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <TextInput
                style={styles.nameInput}
                value={actName}
                onChangeText={setActName}
                placeholder="또는 직접 입력…"
                placeholderTextColor="#bbb"
              />

              <TouchableOpacity
                style={[styles.addBtn, (!actName.trim() || !selDays.some(Boolean)) && styles.addBtnDisabled]}
                onPress={addRecurItem}
                disabled={!actName.trim() || !selDays.some(Boolean)}
              >
                <Text style={styles.addBtnText}>+ 추가</Text>
              </TouchableOpacity>
            </View>

            {/* 추가된 항목 */}
            {recurItems.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={styles.recurListTitle}>추가된 일과</Text>
                {recurItems.map(item => (
                  <View key={item.id} style={[styles.recurChip, { borderLeftColor: item.color }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.recurChipName}>{item.emoji} {item.name}</Text>
                      <Text style={styles.recurChipMeta}>
                        {item.days.map((on, i) => on ? DAY_LABELS[i] : '').filter(Boolean).join('·')}
                        {'  '}{item.startTime} ~ {item.endTime}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setRecurItems(p => p.filter(x => x.id !== item.id))}>
                      <Text style={styles.recurChipDel}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* 하단 버튼 */}
            <View style={styles.bottomBtns}>
              <TouchableOpacity style={styles.skipBtn} onPress={goToPreview}>
                <Text style={styles.skipText}>건너뛰기</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.nextBtn} onPress={goToPreview}>
                <Text style={styles.nextText}>스케줄 확인할게요 →</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Phase 2 — 시간표 확인
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
        <View style={styles.previewHeader}>
          <TouchableOpacity onPress={() => setPhase('input')} style={styles.backBtn}>
            <Text style={styles.backText}>← 다시 입력</Text>
          </TouchableOpacity>
          <Text style={styles.previewTitle}>스케줄 확인 📅</Text>
          <TouchableOpacity onPress={handleComplete} style={styles.doneBtn}>
            <Text style={styles.doneBtnText}>다음 →</Text>
          </TouchableOpacity>
        </View>

        {/* 탭 */}
        <View style={styles.tabRow}>
          {(['weekday', 'weekend'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'weekday' ? '📅 주중 (월~금)' : '🌅 주말 (토~일)'}
              </Text>
            </TouchableOpacity>
          ))}
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
            <Text style={styles.floatingEmoji}>{floating.item.emoji}</Text>
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
            <Text style={styles.modalSub}>
              {dropModal?.item.emoji}{' '}
              {dropModal?.item.label !== '직접 입력' ? dropModal?.item.label : '새 일과'}
            </Text>

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
  container: { flex: 1, backgroundColor: '#f4f7ff' },

  // 공통
  backBtn:  { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.primaryBg, borderRadius: 20 },
  backText: { fontSize: 14, color: colors.primary, fontWeight: '800' },
  timeSep:  { fontSize: 16, color: '#999', marginHorizontal: 6 },

  // ─ Phase 1 ─
  inputContent: { padding: 20, gap: 16 },

  robotRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  robotEmoji: { fontSize: 40, marginTop: 4 },
  bubble: {
    flex: 1, backgroundColor: colors.white,
    borderRadius: 18, borderTopLeftRadius: 4, padding: 14,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  bubbleTitle: { fontSize: 15, fontWeight: '800', color: colors.primary, marginBottom: 4 },
  bubbleSub:   { fontSize: 12, color: '#888', lineHeight: 18 },

  formCard: {
    backgroundColor: colors.white, borderRadius: 20, padding: 18,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 2 },
  },
  formLabel: { fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 8 },

  shortcutRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  shortcutBtn: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.primaryBg, borderRadius: 12 },
  shortcutText:{ fontSize: 13, fontWeight: '700', color: colors.primary },

  dayToggleRow: { flexDirection: 'row', gap: 6 },
  dayToggle:    { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eef', alignItems: 'center', justifyContent: 'center' },
  dayToggleOn:  { backgroundColor: colors.primary },
  dayToggleText:    { fontSize: 13, fontWeight: '700', color: '#888' },
  dayToggleTextOn:  { color: '#fff' },

  timeRow:   { flexDirection: 'row', alignItems: 'center' },
  timeInput: {
    flex: 1, backgroundColor: '#f4f7ff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 16, fontWeight: '700', color: colors.text,
    borderWidth: 1.5, borderColor: colors.border, textAlign: 'center',
  },

  chip:     { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#eef', borderRadius: 20 },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.primary },

  nameInput: {
    backgroundColor: '#f4f7ff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colors.text,
    borderWidth: 1.5, borderColor: colors.border,
  },
  addBtn:         { marginTop: 14, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  addBtnDisabled: { backgroundColor: '#c5d0e8' },
  addBtnText:     { color: '#fff', fontWeight: '800', fontSize: 15 },

  recurListTitle: { fontSize: 13, fontWeight: '800', color: colors.primary },
  recurChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: 14, padding: 12, borderLeftWidth: 4,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 1 },
  },
  recurChipName: { fontSize: 14, fontWeight: '700', color: colors.text },
  recurChipMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  recurChipDel:  { fontSize: 16, color: '#bbb', paddingLeft: 12 },

  bottomBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  skipBtn:    { paddingHorizontal: 18, paddingVertical: 15, backgroundColor: '#e8eaf6', borderRadius: 16, alignItems: 'center' },
  skipText:   { fontSize: 14, fontWeight: '700', color: '#888' },
  nextBtn: {
    flex: 1, backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 15, alignItems: 'center',
    elevation: 4, shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  nextText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // ─ Phase 2 헤더/탭 ─
  previewHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  previewTitle: { fontSize: 16, fontWeight: '800', color: colors.primary },
  doneBtn:      { backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 8 },
  doneBtnText:  { color: '#fff', fontWeight: '800', fontSize: 14 },

  tabRow:       { flexDirection: 'row', backgroundColor: '#e4eaf8', padding: 6, gap: 6 },
  tabBtn:       { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  tabBtnActive: { backgroundColor: colors.primary },
  tabText:      { fontSize: 13, fontWeight: '700', color: '#888' },
  tabTextActive:{ color: '#fff' },

  // ─ 시간표 ─
  gridRow:    { flexDirection: 'row' },
  dayHeader:  { alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  dayHeaderText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  timeCell:   { justifyContent: 'flex-start', paddingTop: 2 },
  timeLabel:  { fontSize: 10, color: '#999', fontWeight: '600' },
  slotCell:   { borderLeftWidth: 0.5, borderBottomWidth: 0.5, borderColor: '#e0e0e0' },
  slotHour:   { borderBottomColor: '#bbb' },
  block:      { borderRadius: 6, padding: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  blockEmoji: { fontSize: 11 },
  blockName:  { fontSize: 9, color: '#fff', fontWeight: '700', textAlign: 'center' },

  // ─ 팔레트 ─
  palette:       { backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  paletteLabel:  { fontSize: 11, color: '#aaa', fontWeight: '600', textAlign: 'center', marginBottom: 6 },
  paletteGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  paletteItem:   { width: (SW - 24 - 48) / 9, minWidth: 54, maxWidth: 70, aspectRatio: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  paletteEmoji:  { fontSize: 20 },
  paletteItemText: { fontSize: 8, color: '#555', fontWeight: '600', marginTop: 2, textAlign: 'center' },

  // ─ 플로팅 ─
  floatingBlock: {
    position: 'absolute', width: 68, height: 68, borderRadius: 16,
    backgroundColor: colors.primary + 'EE', alignItems: 'center', justifyContent: 'center',
    elevation: 10, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  floatingEmoji: { fontSize: 26 },
  floatingLabel: { fontSize: 9, color: '#fff', fontWeight: '700', marginTop: 2, textAlign: 'center' },

  // ─ 모달 ─
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard:    {
    backgroundColor: colors.white, borderRadius: 24, padding: 24, width: '100%',
    elevation: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 6 },
  },
  modalTitle:    { fontSize: 18, fontWeight: '900', color: colors.primary, marginBottom: 4 },
  modalSub:      { fontSize: 14, color: '#888', marginBottom: 16 },
  modalLabel:    { fontSize: 12, fontWeight: '700', color: '#666', marginBottom: 8 },
  modalInput:    {
    backgroundColor: '#f4f7ff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colors.text,
    borderWidth: 1.5, borderColor: colors.border, marginBottom: 14,
  },
  modalDayBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eef', alignItems: 'center', justifyContent: 'center' },
  modalDayBtnActive: { backgroundColor: colors.primary },
  modalDayText:      { fontSize: 13, fontWeight: '700', color: '#888' },
  modalTimeRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  modalTimeInput:    {
    flex: 1, backgroundColor: '#f4f7ff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, fontWeight: '700', color: colors.text,
    borderWidth: 1.5, borderColor: colors.border, textAlign: 'center',
  },
  modalBtns:       { flexDirection: 'row', gap: 10 },
  modalCancelBtn:  { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: '#eef', alignItems: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '700', color: '#888' },
  modalConfirmBtn: {
    flex: 2, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center',
    elevation: 4, shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  modalConfirmText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
