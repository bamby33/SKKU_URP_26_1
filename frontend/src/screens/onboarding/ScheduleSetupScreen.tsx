/**
 * 온보딩 · 보호자 전용
 * AI 생성 시간표 확인 및 수정 (요일별 리스트 뷰)
 * - 요일 선택 → 그 날 일과를 시간순 카드로 표시
 * - 카드 탭하여 수정/삭제, 버튼으로 추가 (여러 요일 동시 추가 가능)
 */
import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Modal, Alert, Dimensions, PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import TimePickerField from '../../components/TimePickerField';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ScheduleSetup'>;
  route: RouteProp<RootStackParamList, 'ScheduleSetup'>;
};

const START_H = 6;
const TOTAL   = 32; // 06:00 ~ 22:00
const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

// 주간 전체 보기 그리드 치수
const { width: SW } = Dimensions.get('window');
const PAD     = 12;
const TIME_W  = 30;
const GRID_W  = SW - PAD * 2;
const DAY_COL = (GRID_W - TIME_W) / 7;
const SLOT_H  = 20;

const PALETTE = [
  { emoji: '🚶',  label: '산책',      color: '#6B9BF2' },
  { emoji: '📖',  label: '독서·여가', color: '#5BB7C0' },
  { emoji: '🎵',  label: '음악 감상', color: '#26C6DA' },
  { emoji: '🧸',  label: '놀이 시간', color: '#FF8A65' },
  { emoji: '🎨',  label: '그림',      color: '#AB77E8' },
  { emoji: '🏋️', label: '운동',      color: '#AED581' },
  { emoji: '🛁',  label: '씻기·세면', color: '#5BB7C0' },
  { emoji: '🍚',  label: '식사',      color: '#4CAF7D' },
  { emoji: '➕',  label: '직접 입력', color: '#6B9BF2' },
];

type Block = {
  id: string;
  day: number;
  startSlot: number;  // 그리드 위치용
  endSlot: number;
  startTime: string;  // 실제 저장/표시용 정확한 시각
  endTime: string;
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
const toMin = (t: string): number => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const minToTime = (mins: number): string => {
  const c = clamp(mins, 0, 23 * 60 + 59);
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
};

export default function ScheduleSetupScreen({ navigation, route }: Props) {
  const { userName, age, gender, disabilityType, disabilityLevel, occupation, likes, dislikes, problemNotes, themeColor } = route.params;

  const initBlocks: Block[] = (route.params.schedules ?? []).map(s => ({
    id: nid(), day: s.day, startSlot: s.startSlot, endSlot: s.endSlot,
    startTime: s.startTime ?? toTime(s.startSlot), endTime: s.endTime ?? toTime(s.endSlot),
    name: s.activity, emoji: s.emoji, color: s.color,
  }));

  const [blocks, setBlocks]         = useState<Block[]>(initBlocks);
  const [selectedDay, setSelectedDay] = useState(0);
  const [viewMode, setViewMode]     = useState<'list' | 'week'>('list');

  // 주간 그리드 드래그
  const [floating, setFloating] = useState<{ item: PaletteItem; x: number; y: number } | null>(null);
  const rootRef      = useRef<View>(null);
  const rootOff      = useRef({ x: 0, y: 0 });
  const gridRef      = useRef<View>(null);
  const gridBounds   = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const scrollOffset = useRef(0);

  // 추가 모달
  const [showAdd,   setShowAdd]   = useState(false);
  const [addItem,   setAddItem]   = useState<PaletteItem>(PALETTE[0]);
  const [addName,   setAddName]   = useState('');
  const [addStart,  setAddStart]  = useState('09:00');
  const [addEnd,    setAddEnd]    = useState('10:00');
  const [addDays,   setAddDays]   = useState<boolean[]>(Array(7).fill(false));

  // 수정 모달
  const [editBlock, setEditBlock] = useState<Block | null>(null);
  const [editName,  setEditName]  = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd,   setEditEnd]   = useState('');

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
    setShowAdd(true);
  };

  const pickPalette = (item: PaletteItem) => {
    setAddItem(item);
    setAddName(item.label === '직접 입력' ? '' : item.label);
  };

  const confirmAdd = () => {
    if (toMin(addStart) >= toMin(addEnd)) { Alert.alert('시간 오류', '종료 시간이 시작 시간보다 늦어야 해요.'); return; }
    const ss = toSlot(addStart);
    const es = Math.max(ss + 1, toSlot(addEnd));
    const name = addName.trim();
    if (!name) { Alert.alert('이름 필요', '일과 이름을 입력해주세요.'); return; }
    const days = addDays.map((on, i) => on ? i : -1).filter(i => i >= 0);
    if (!days.length) { Alert.alert('요일 선택', '요일을 하나 이상 선택해주세요.'); return; }

    setBlocks(prev => {
      // 선택 요일에서 겹치는 블록 제거 후 추가 (정확한 시각 기준)
      const filtered = prev.filter(b => !(days.includes(b.day) && toMin(b.startTime) < toMin(addEnd) && toMin(b.endTime) > toMin(addStart)));
      const created = days.map(day => ({
        id: nid(), day, startSlot: ss, endSlot: es, startTime: addStart, endTime: addEnd,
        name, emoji: addItem.emoji, color: addItem.color,
      }));
      return [...filtered, ...created];
    });
    setShowAdd(false);
  };

  // ── 드래그 드롭 → 추가 모달 미리 채우기 ──
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
        onPanResponderRelease: (e) => {
          const { pageX, pageY } = e.nativeEvent;
          setFloating(null);
          handleDrop(item, pageX, pageY);
        },
        onPanResponderTerminate: () => setFloating(null),
      })
    )
  ).current;

  // ── 수정/삭제 ──
  const openEdit = (b: Block) => {
    setEditBlock(b);
    setEditName(b.name);
    setEditStart(b.startTime);
    setEditEnd(b.endTime);
  };

  const confirmEdit = () => {
    if (!editBlock) return;
    if (toMin(editStart) >= toMin(editEnd)) { Alert.alert('시간 오류', '종료 시간이 시작 시간보다 늦어야 해요.'); return; }
    if (!editName.trim()) { Alert.alert('이름 필요', '일과 이름을 입력해주세요.'); return; }
    const ss = toSlot(editStart);
    const es = Math.max(ss + 1, toSlot(editEnd));
    setBlocks(p => p.map(b => b.id === editBlock.id
      ? { ...b, name: editName.trim(), startSlot: ss, endSlot: es, startTime: editStart, endTime: editEnd }
      : b));
    setEditBlock(null);
  };

  const deleteBlock = () => {
    if (!editBlock) return;
    setBlocks(p => p.filter(b => b.id !== editBlock.id));
    setEditBlock(null);
  };

  const toggleAddDay = (i: number) =>
    setAddDays(p => { const n = [...p]; n[i] = !n[i]; return n; });
  const setAddDayPreset = (idxs: number[]) =>
    setAddDays(Array.from({ length: 7 }, (_, i) => idxs.includes(i)));

  // ── 완료 ──
  const handleComplete = () => {
    navigation.navigate('AccountSetup', {
      userName, age, gender, likes, dislikes, problemNotes, themeColor,
      disabilityType, disabilityLevel, occupation,
      dailyLife: (route.params as any).dailyLife ?? '',
      schedules: blocks.map(b => ({
        day: b.day, startSlot: b.startSlot, endSlot: b.endSlot,
        startTime: b.startTime, endTime: b.endTime,
        activity: b.name, emoji: b.emoji, color: b.color,
      })),
    });
  };

  // ── 주간 전체 보기 그리드 (드래그로 추가 가능) ──
  const renderWeekGrid = () => (
    <ScrollView
      contentContainerStyle={{ padding: PAD }}
      showsVerticalScrollIndicator={false}
      scrollEnabled={floating === null}
      onScroll={e => { scrollOffset.current = e.nativeEvent.contentOffset.y; }}
      scrollEventThrottle={16}
    >
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
          <View key={i} style={[styles.gDayHeader, { width: DAY_COL }, i >= 5 && styles.gDayHeaderWeekend]}>
            <Text style={[styles.gDayHeaderText, i >= 5 && styles.gDayHeaderTextWeekend]}>{d}</Text>
          </View>
        ))}
      </View>

      <View style={{ position: 'relative' }}>
        {Array.from({ length: TOTAL }).map((_, slot) => {
          const mins   = START_H * 60 + slot * 30;
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
            <TouchableOpacity
              key={b.id}
              activeOpacity={0.75}
              onPress={() => openEdit(b)}
              style={[styles.gBlock, {
                top:    b.startSlot * SLOT_H,
                left:   TIME_W + b.day * DAY_COL + 1,
                width:  DAY_COL - 2,
                height: bh,
                backgroundColor: b.color + 'DD',
              }]}
            >
              <Text style={styles.gBlockEmoji}>{b.emoji}</Text>
              {bh >= 34 && <Text style={styles.gBlockName} numberOfLines={2}>{b.name}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
      </View>
    </ScrollView>
  );

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
        <Text style={styles.title}>시간표 확인</Text>
        <TouchableOpacity onPress={handleComplete} style={styles.doneBtn}>
          <Text style={styles.doneBtnText}>다음 →</Text>
        </TouchableOpacity>
      </View>

      {/* 보기 전환 토글 */}
      <View style={styles.viewToggle}>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnOn]}
          onPress={() => setViewMode('list')}
        >
          <Text style={[styles.toggleText, viewMode === 'list' && styles.toggleTextOn]}>요일별 보기</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'week' && styles.toggleBtnOn]}
          onPress={() => setViewMode('week')}
        >
          <Text style={[styles.toggleText, viewMode === 'week' && styles.toggleTextOn]}>주간 전체 보기</Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'week' ? (
        <>
          <View style={styles.hintBar}>
            <Text style={styles.hintText}>블록을 탭하면 수정·삭제할 수 있어요</Text>
          </View>
          {renderWeekGrid()}
        </>
      ) : (
        <>
          {/* 요일 선택 */}
          <View style={styles.daySelector}>
            {DAY_LABELS.map((d, i) => {
              const on = selectedDay === i;
              const weekend = i >= 5;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.dayChip, on && styles.dayChipOn, on && weekend && styles.dayChipOnWeekend]}
                  onPress={() => setSelectedDay(i)}
                  activeOpacity={0.8}
                >
                  <Text style={[
                    styles.dayChipText,
                    weekend && styles.dayChipTextWeekend,
                    on && styles.dayChipTextOn,
                  ]}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.hintBar}>
            <Text style={styles.hintText}>카드를 탭하면 수정·삭제할 수 있어요</Text>
          </View>

          {/* 일과 리스트 */}
          <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            {dayBlocks.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>{DAY_LABELS[selectedDay]}요일 일과가 없어요.{'\n'}아래 버튼으로 추가해보세요.</Text>
              </View>
            ) : (
              dayBlocks.map(b => (
                <TouchableOpacity key={b.id} style={styles.card} activeOpacity={0.7} onPress={() => openEdit(b)}>
                  <View style={[styles.cardBar, { backgroundColor: b.color }]} />
                  <Text style={styles.cardEmoji}>{b.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName} numberOfLines={1}>{b.name}</Text>
                    <Text style={styles.cardTime}>{b.startTime} ~ {b.endTime}</Text>
                  </View>
                  <Text style={styles.cardEdit}>수정</Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </>
      )}

      {/* 하단: 주간모드=드래그 팔레트 / 리스트모드=추가 버튼 */}
      {viewMode === 'week' ? (
        <View style={styles.palette}>
          <Text style={styles.paletteHint}>꾹 눌러서 시간표에 드래그 ↑  ·  블록 탭하면 수정</Text>
          <View style={styles.paletteGrid}>
            {PALETTE.map((item, i) => (
              <View
                key={i}
                {...palettePRs[i].panHandlers}
                style={[styles.palDragItem, { backgroundColor: item.color + '22' }]}
              >
                <Text style={styles.palEmoji}>{item.emoji}</Text>
                <Text style={styles.palLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.addBtnWrap}>
          <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.85}>
            <Text style={styles.addBtnText}>+ 일과 추가</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 드래그 중 플로팅 블록 */}
      {floating && (
        <View
          pointerEvents="none"
          style={[styles.floatingBlock, {
            left: floating.x - rootOff.current.x - 30,
            top:  floating.y - rootOff.current.y - 30,
            backgroundColor: floating.item.color + 'EE',
          }]}
        >
          <Text style={styles.floatingEmoji}>{floating.item.emoji}</Text>
        </View>
      )}
      </View>

      {/* 추가 모달 */}
      <Modal visible={showAdd} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>일과 추가</Text>

            <Text style={styles.modalLabel}>활동 선택</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {PALETTE.map((p, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.palItem, addItem.label === p.label && { backgroundColor: p.color + '33', borderColor: p.color }]}
                    onPress={() => pickPalette(p)}
                  >
                    <Text style={styles.palEmoji}>{p.emoji}</Text>
                    <Text style={styles.palLabel}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.modalLabel}>일과 이름</Text>
            <TextInput
              style={styles.modalInput}
              value={addName}
              onChangeText={setAddName}
              placeholder="일과 이름을 입력해주세요"
              placeholderTextColor="#bbb"
            />

            <Text style={styles.modalLabel}>시간</Text>
            <View style={styles.timeRow}>
              <TimePickerField value={addStart} onChange={(v) => { setAddStart(v); if (toMin(v) >= toMin(addEnd)) setAddEnd(minToTime(toMin(v) + 60)); }} />
              <Text style={styles.timeSep}>~</Text>
              <TimePickerField value={addEnd} onChange={setAddEnd} />
            </View>

            <Text style={styles.modalLabel}>요일 선택</Text>
            <View style={styles.dayRow}>
              {DAY_LABELS.map((d, i) => (
                <TouchableOpacity key={i}
                  style={[styles.modalDayBtn, addDays[i] && styles.modalDayBtnOn]}
                  onPress={() => toggleAddDay(i)}>
                  <Text style={[styles.modalDayText, addDays[i] && { color: '#fff' }]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.presetRow}>
              <TouchableOpacity style={styles.presetBtn} onPress={() => setAddDayPreset([0,1,2,3,4])}>
                <Text style={styles.presetText}>주중</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetBtn} onPress={() => setAddDayPreset([5,6])}>
                <Text style={styles.presetText}>주말</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetBtn} onPress={() => setAddDayPreset([0,1,2,3,4,5,6])}>
                <Text style={styles.presetText}>매일</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={() => setShowAdd(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmAdd} style={styles.confirmBtn}>
                <Text style={styles.confirmText}>추가하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 수정/삭제 모달 */}
      <Modal visible={!!editBlock} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editBlock?.emoji} {editBlock?.name}</Text>

            <Text style={styles.modalLabel}>일과 이름</Text>
            <TextInput style={styles.modalInput} value={editName} onChangeText={setEditName}
              placeholder="일과 이름" placeholderTextColor="#bbb" />

            <Text style={styles.modalLabel}>시간</Text>
            <View style={styles.timeRow}>
              <TimePickerField value={editStart} onChange={(v) => { setEditStart(v); if (toMin(v) >= toMin(editEnd)) setEditEnd(minToTime(toMin(v) + 60)); }} />
              <Text style={styles.timeSep}>~</Text>
              <TimePickerField value={editEnd} onChange={setEditEnd} />
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={deleteBlock} style={styles.deleteBtn}>
                <Text style={styles.deleteText}>삭제</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditBlock(null)} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmEdit} style={styles.confirmBtn}>
                <Text style={styles.confirmText}>수정</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn:  { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.primaryBg, borderRadius: 20 },
  backText: { fontSize: 14, color: colors.primary, fontWeight: '800' },
  title:    { fontSize: 16, fontWeight: '900', color: colors.primary },
  doneBtn:     { backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 8 },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  viewToggle: {
    flexDirection: 'row', gap: 6, padding: 6, margin: 12, marginBottom: 0,
    backgroundColor: '#E4F2EA', borderRadius: 14,
  },
  toggleBtn:   { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  toggleBtnOn: { backgroundColor: colors.primary },
  toggleText:   { fontSize: 13, fontWeight: '800', color: '#7A9C8A' },
  toggleTextOn: { color: '#fff' },

  // 주간 그리드
  gridRow: { flexDirection: 'row' },
  gDayHeader: { alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  gDayHeaderWeekend: { backgroundColor: '#FFF3E0', borderRadius: 6 },
  gDayHeaderText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  gDayHeaderTextWeekend: { color: '#E07B39' },
  gTimeCell: { justifyContent: 'flex-start', alignItems: 'center', paddingTop: 1 },
  gTimeLabel: { fontSize: 10, color: '#999', fontWeight: '600' },
  gSlotCell: { borderLeftWidth: 0.5, borderBottomWidth: 0.5, borderColor: '#ececec' },
  gSlotHour: { borderBottomColor: '#c8c8c8' },
  gBlock: {
    position: 'absolute', borderRadius: 4, paddingHorizontal: 1,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  gBlockEmoji: { fontSize: 13 },
  gBlockName: { fontSize: 8, lineHeight: 9, color: '#fff', fontWeight: '700', textAlign: 'center', marginTop: 1 },

  daySelector: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  dayChip: {
    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
    backgroundColor: '#EDF3EF',
  },
  dayChipOn:        { backgroundColor: colors.primary },
  dayChipOnWeekend: { backgroundColor: '#E07B39' },
  dayChipText:        { fontSize: 14, fontWeight: '800', color: colors.primary },
  dayChipTextWeekend: { color: '#E07B39' },
  dayChipTextOn:      { color: '#fff' },

  hintBar:  { backgroundColor: '#FFFDE7', paddingVertical: 6, paddingHorizontal: 16 },
  hintText: { fontSize: 12, color: '#888', textAlign: 'center' },

  listContent: { padding: 16, gap: 10, paddingBottom: 20 },
  emptyWrap: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 22 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.white, borderRadius: 16, padding: 14, paddingLeft: 18,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    overflow: 'hidden',
  },
  cardBar:   { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6 },
  cardEmoji: { fontSize: 26 },
  cardName:  { fontSize: 16, fontWeight: '800', color: colors.primary },
  cardTime:  { fontSize: 13, color: '#888', fontWeight: '600', marginTop: 3 },
  cardEdit:  { fontSize: 13, color: colors.primary, fontWeight: '700' },

  addBtnWrap: {
    padding: 16, backgroundColor: colors.white,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  addBtn: {
    backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center',
    elevation: 4, shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 36,
  },
  modalCard: {
    backgroundColor: colors.white, borderRadius: 24, padding: 24, margin: 24,
    alignSelf: 'center', width: '88%',
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: colors.primary, marginBottom: 16 },
  modalLabel: { fontSize: 12, fontWeight: '700', color: '#666', marginBottom: 8 },
  modalInput: {
    backgroundColor: '#F4FAF7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: colors.text, borderWidth: 1.5, borderColor: colors.border, marginBottom: 14,
  },

  palItem: {
    alignItems: 'center', padding: 8, borderRadius: 12, borderWidth: 1.5,
    borderColor: 'transparent', backgroundColor: '#F4FAF7', minWidth: 64,
  },
  palEmoji: { fontSize: 24 },
  palLabel: { fontSize: 10, fontWeight: '600', color: '#555', marginTop: 3, textAlign: 'center' },

  // 주간 모드 드래그 팔레트
  palette: {
    backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border,
    paddingHorizontal: 10, paddingTop: 8, paddingBottom: 12,
  },
  paletteHint: { fontSize: 11, color: '#aaa', fontWeight: '600', textAlign: 'center', marginBottom: 6 },
  paletteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  palDragItem: {
    width: (SW - 20 - 48) / 9, minWidth: 50, maxWidth: 68, aspectRatio: 1,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
  },
  floatingBlock: {
    position: 'absolute', width: 60, height: 60, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    elevation: 10, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  floatingEmoji: { fontSize: 26 },

  timeRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  timeInput: {
    flex: 1, backgroundColor: '#F4FAF7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 16, fontWeight: '700', color: colors.text, borderWidth: 1.5, borderColor: colors.border, textAlign: 'center',
  },
  timeSep: { fontSize: 16, color: '#999', marginHorizontal: 8 },

  dayRow: { flexDirection: 'row', gap: 5, marginBottom: 10 },
  modalDayBtn: {
    flex: 1, height: 40, borderRadius: 10, backgroundColor: '#EDF3EF',
    alignItems: 'center', justifyContent: 'center',
  },
  modalDayBtnOn: { backgroundColor: colors.primary },
  modalDayText:  { fontSize: 13, fontWeight: '700', color: colors.primary },

  presetRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  presetBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16,
    backgroundColor: '#EDF3EF', borderWidth: 1.5, borderColor: colors.border,
  },
  presetText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  modalBtns:   { flexDirection: 'row', gap: 8, marginTop: 4 },
  deleteBtn:   { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#FEE2E2', alignItems: 'center' },
  deleteText:  { fontSize: 14, fontWeight: '700', color: '#DC2626' },
  cancelBtn:   { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#E8F5EE', alignItems: 'center' },
  cancelText:  { fontSize: 14, fontWeight: '700', color: '#888' },
  confirmBtn:  { flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center' },
  confirmText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
