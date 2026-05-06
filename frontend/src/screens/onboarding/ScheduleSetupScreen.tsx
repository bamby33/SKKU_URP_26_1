/**
 * 온보딩 4 · 보호자 전용
 * AI 생성 시간표 확인 및 수정
 * Phase 1(반복 일과 입력) 제거 → 항상 시간표 뷰로 시작
 */
import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Modal, PanResponder, Dimensions, Alert,
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
const PAD    = 16;
const TIME_W = 44;
const GRID_W = SW - PAD * 2;
const WD_COL = (GRID_W - TIME_W) / 5;
const WE_COL = (GRID_W - TIME_W) / 2;
const SLOT_H = 28;
const START_H = 6;
const TOTAL   = 32; // 06:00 ~ 22:00

const DAY_LABELS     = ['월', '화', '수', '목', '금', '토', '일'];
const WEEKDAY_LABELS = ['월', '화', '수', '목', '금'];
const WEEKEND_LABELS = ['토', '일'];

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

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────
export default function ScheduleSetupScreen({ navigation, route }: Props) {
  const { userName, age, gender, disabilityType, disabilityLevel, occupation, likes, dislikes, problemNotes, themeColor } = route.params;

  const initBlocks: Block[] = (route.params.schedules ?? []).map(s => ({
    id: nid(), day: s.day, startSlot: s.startSlot, endSlot: s.endSlot,
    name: s.activity, emoji: s.emoji, color: s.color,
  }));

  const [tab,      setTab]      = useState<'weekday' | 'weekend'>('weekday');
  const [blocks,   setBlocks]   = useState<Block[]>(initBlocks);
  const [floating, setFloating] = useState<{ item: PaletteItem; x: number; y: number } | null>(null);

  // 그리드 측정
  const rootRef      = useRef<View>(null);
  const rootOff      = useRef({ x: 0, y: 0 });
  const gridRef      = useRef<View>(null);
  const gridBounds   = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const scrollOffset = useRef(0);

  // 드롭 모달
  const [dropModal,      setDropModal]      = useState<{ item: PaletteItem } | null>(null);
  const [dropDays,       setDropDays]       = useState<boolean[]>(Array(7).fill(false));
  const [dropStart,      setDropStart]      = useState('09:00');
  const [dropEnd,        setDropEnd]        = useState('10:00');
  const [dropCustomName, setDropCustomName] = useState('');

  // 블록 수정/삭제 모달
  const [blockModal,  setBlockModal]  = useState<Block | null>(null);
  const [editName,    setEditName]    = useState('');
  const [editStart,   setEditStart]   = useState('');
  const [editEnd,     setEditEnd]     = useState('');

  // ── 블록 탭 핸들러 ───────────────────────────────────────────────────────────
  const handleBlockPress = (block: Block) => {
    setBlockModal(block);
    setEditName(block.name);
    setEditStart(toTime(block.startSlot));
    setEditEnd(toTime(block.endSlot));
  };

  const deleteBlock = () => {
    if (!blockModal) return;
    setBlocks(p => p.filter(b => b.id !== blockModal.id));
    setBlockModal(null);
  };

  const confirmEdit = () => {
    if (!blockModal) return;
    const ss = toSlot(editStart);
    const es = toSlot(editEnd);
    if (ss >= es) { Alert.alert('시간 오류', '종료 시간이 시작 시간보다 늦어야 해요.'); return; }
    if (!editName.trim()) { Alert.alert('이름 필요', '일과 이름을 입력해주세요.'); return; }
    setBlocks(p => p.map(b =>
      b.id === blockModal.id
        ? { ...b, name: editName.trim(), startSlot: ss, endSlot: es }
        : b
    ));
    setBlockModal(null);
  };

  // ── 드롭 핸들러 ──────────────────────────────────────────────────────────────
  const handleDrop = (item: PaletteItem, pageX: number, pageY: number) => {
    const b = gridBounds.current;
    if (pageX < b.x || pageX > b.x + b.width || pageY < b.y || pageY > b.y + b.height) return;

    const colW    = tab === 'weekday' ? WD_COL : WE_COL;
    const relX    = pageX - b.x - TIME_W;
    const relY    = pageY - b.y + scrollOffset.current;
    const colIdx  = clamp(Math.floor(relX / colW), 0, tab === 'weekday' ? 4 : 1);
    const slotIdx = clamp(Math.floor(relY / SLOT_H), 0, TOTAL - 2);
    const day     = tab === 'weekday' ? colIdx : colIdx + 5;

    const initDays = Array(7).fill(false);
    initDays[day] = true;
    setDropDays(initDays);
    setDropStart(toTime(slotIdx));
    setDropEnd(toTime(Math.min(slotIdx + 2, TOTAL)));
    setDropCustomName(item.label === '직접 입력' ? '' : item.label);
    setDropModal({ item });
  };

  // 겹치는 블록 제거 후 새 블록 추가
  const confirmDrop = () => {
    if (!dropModal) return;
    const ss = toSlot(dropStart);
    const es = toSlot(dropEnd);
    if (ss >= es) { Alert.alert('시간 오류', '종료 시간이 시작 시간보다 늦어야 해요.'); return; }
    const name = dropModal.item.label === '직접 입력' ? dropCustomName.trim() : dropModal.item.label;
    if (!name) { Alert.alert('이름 필요', '일과 이름을 입력해주세요.'); return; }
    if (!dropDays.some(Boolean)) { Alert.alert('요일 선택', '요일을 하나 이상 선택해주세요.'); return; }

    const selectedDays = dropDays.map((on, i) => on ? i : -1).filter(i => i >= 0);

    setBlocks(prev => {
      // 선택한 요일에서 겹치는 블록 제거
      const filtered = prev.filter(b =>
        !(selectedDays.includes(b.day) && b.startSlot < es && b.endSlot > ss)
      );
      // 새 블록 추가
      const newBlocks = selectedDays.map(day => ({
        id: nid(), day,
        startSlot: ss, endSlot: es,
        name, emoji: dropModal.item.emoji, color: dropModal.item.color,
      }));
      return [...filtered, ...newBlocks];
    });
    setDropModal(null);
  };

  // ── PanResponders ─────────────────────────────────────────────────────────
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
        <View style={styles.gridRow}>
          <View style={{ width: TIME_W }} />
          {dayLabels.map((d, i) => (
            <View key={i} style={[styles.dayHeader, { width: colW }]}>
              <Text style={styles.dayHeaderText}>{d}</Text>
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
              <TouchableOpacity
                key={block.id}
                activeOpacity={0.75}
                onPress={() => handleBlockPress(block)}
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
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  // ── 완료 ──────────────────────────────────────────────────────────────────
  const handleComplete = () => {
    navigation.navigate('AccountSetup', {
      userName, age, gender, likes, dislikes, problemNotes, themeColor,
      disabilityType, disabilityLevel, occupation,
      dailyLife: (route.params as any).dailyLife ?? '',
      schedules: blocks.map(b => ({
        day: b.day, startSlot: b.startSlot, endSlot: b.endSlot,
        activity: b.name, emoji: b.emoji, color: b.color,
      })),
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  시간표 확인 화면
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
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← 뒤로</Text>
          </TouchableOpacity>
          <Text style={styles.previewTitle}>시간표 확인 📅</Text>
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

        {/* 안내 */}
        <View style={styles.hintBar}>
          <Text style={styles.hintText}>블록을 탭하면 수정·삭제 / 아이콘을 드래그해서 추가</Text>
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
              {dropDays.filter(Boolean).length === 0
                ? '요일을 선택해주세요'
                : `${dropDays.map((on, i) => on ? DAY_LABELS[i] : '').filter(Boolean).join('·')}요일에 추가`}
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

            <Text style={styles.modalLabel}>요일 선택 (여러 요일 가능)</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {DAY_LABELS.map((d, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.modalDayBtn, dropDays[i] && styles.modalDayBtnActive]}
                  onPress={() => setDropDays(p => { const n = [...p]; n[i] = !n[i]; return n; })}
                >
                  <Text style={[styles.modalDayText, dropDays[i] && { color: '#fff' }]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>

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

      {/* 블록 수정/삭제 모달 */}
      <Modal visible={!!blockModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {blockModal?.emoji} {blockModal?.name}
            </Text>
            <Text style={styles.modalSub}>
              {blockModal ? `${toTime(blockModal.startSlot)} ~ ${toTime(blockModal.endSlot)}` : ''}
              {'  ·  '}
              {blockModal ? DAY_LABELS[blockModal.day] + '요일' : ''}
            </Text>

            <Text style={styles.modalLabel}>일과 이름</Text>
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="일과 이름"
              placeholderTextColor="#bbb"
            />

            <Text style={styles.modalLabel}>시간</Text>
            <View style={styles.modalTimeRow}>
              <TextInput
                style={styles.modalTimeInput}
                value={editStart}
                onChangeText={setEditStart}
                placeholder="09:00"
                placeholderTextColor="#bbb"
                keyboardType="numbers-and-punctuation"
              />
              <Text style={styles.timeSep}>~</Text>
              <TextInput
                style={styles.modalTimeInput}
                value={editEnd}
                onChangeText={setEditEnd}
                placeholder="10:00"
                placeholderTextColor="#bbb"
                keyboardType="numbers-and-punctuation"
              />
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={deleteBlock} style={styles.modalDeleteBtn}>
                <Text style={styles.modalDeleteText}>🗑️ 삭제</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setBlockModal(null)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmEdit} style={styles.modalConfirmBtn}>
                <Text style={styles.modalConfirmText}>수정</Text>
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
  container: { flex: 1, backgroundColor: '#F4FAF7' },

  backBtn:  { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.primaryBg, borderRadius: 20 },
  backText: { fontSize: 14, color: colors.primary, fontWeight: '800' },
  timeSep:  { fontSize: 16, color: '#999', marginHorizontal: 6 },

  previewHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  previewTitle: { fontSize: 16, fontWeight: '800', color: colors.primary },
  doneBtn:      { backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 8 },
  doneBtnText:  { color: '#fff', fontWeight: '800', fontSize: 14 },

  tabRow:       { flexDirection: 'row', backgroundColor: '#E4F2EA', padding: 6, gap: 6 },
  tabBtn:       { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  tabBtnActive: { backgroundColor: colors.primary },
  tabText:      { fontSize: 13, fontWeight: '700', color: '#888' },
  tabTextActive:{ color: '#fff' },

  hintBar:  { backgroundColor: '#FFFDE7', paddingVertical: 6, paddingHorizontal: 16 },
  hintText: { fontSize: 11, color: '#888', textAlign: 'center' },

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

  palette:       { backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  paletteLabel:  { fontSize: 11, color: '#aaa', fontWeight: '600', textAlign: 'center', marginBottom: 6 },
  paletteGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  paletteItem:   { width: (SW - 24 - 48) / 9, minWidth: 54, maxWidth: 70, aspectRatio: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  paletteEmoji:  { fontSize: 20 },
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
  modalTitle:    { fontSize: 18, fontWeight: '900', color: colors.primary, marginBottom: 4 },
  modalSub:      { fontSize: 13, color: '#888', marginBottom: 16 },
  modalLabel:    { fontSize: 12, fontWeight: '700', color: '#666', marginBottom: 8 },
  modalInput:    {
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
  modalBtns:       { flexDirection: 'row', gap: 8 },
  modalDeleteBtn:  { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: '#FFEBEE', alignItems: 'center' },
  modalDeleteText: { fontSize: 14, fontWeight: '700', color: colors.alertLight },
  modalCancelBtn:  { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: '#E8F5EE', alignItems: 'center' },
  modalCancelText: { fontSize: 14, fontWeight: '700', color: '#888' },
  modalConfirmBtn: {
    flex: 2, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center',
    elevation: 4, shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  modalConfirmText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
