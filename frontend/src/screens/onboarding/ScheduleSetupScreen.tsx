/**
 * 온보딩 3 · 보호자 전용
 * 시간표 형식 스케줄 설정 — 드래그(30분 단위)로 일과 추가
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
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const H_PADDING = 16;
const TIME_COL_W = 40;
const GRID_W = SCREEN_WIDTH - H_PADDING * 2;
const DAY_COL_W = (GRID_W - TIME_COL_W) / 7;
const SLOT_H = 32;       // pixels per 30-min slot
const START_HOUR = 6;    // 06:00
const END_HOUR = 22;     // 22:00
const TOTAL_SLOTS = (END_HOUR - START_HOUR) * 2; // 32

const DAYS = ['월', '화', '수', '목', '금', '토', '일'];

const BLOCK_COLORS = [
  '#6B9BF2', '#4CAF7D', '#FF8A65', '#AB77E8',
  '#FFB74D', '#E57373', '#26C6DA', '#AED581',
];

const EMOJIS = ['📖', '🍚', '🍱', '🍽️', '🚶', '🎵', '🧸', '💊', '🎨', '🧩', '🛁', '💤'];

// ── 타입 ──────────────────────────────────────────────────────────────────────
type Block = {
  id: string;
  day: number;        // 0=월 … 6=일
  startSlot: number;  // 0 = 06:00
  endSlot: number;    // exclusive
  activity: string;
  emoji: string;
  color: string;
};

type DragState = { day: number; startSlot: number; endSlot: number };

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────
let uid = 0;
const newId = () => String(uid++);

function slotToTime(slot: number) {
  const mins = START_HOUR * 60 + slot * 30;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────
export default function ScheduleSetupScreen({ navigation, route }: Props) {
  const { userName, age, gender, likes, dislikes } = route.params;

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [dragDisplay, setDragDisplay] = useState<DragState | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [pendingDrag, setPendingDrag] = useState<DragState | null>(null);
  const [activityName, setActivityName] = useState('');
  const [activityEmoji, setActivityEmoji] = useState('📖');
  const [activityColor, setActivityColor] = useState(BLOCK_COLORS[0]);

  // ref로 드래그 상태 추적 (PanResponder 클로저 문제 방지)
  const dragRef = useRef<DragState | null>(null);
  const blockCount = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const day = Math.floor((locationX - TIME_COL_W) / DAY_COL_W);
        const slot = clamp(Math.floor(locationY / SLOT_H), 0, TOTAL_SLOTS - 1);
        if (day < 0 || day >= 7) return;
        setScrollEnabled(false);
        const d: DragState = { day, startSlot: slot, endSlot: slot };
        dragRef.current = d;
        setDragDisplay({ ...d });
      },

      onPanResponderMove: (evt) => {
        if (!dragRef.current) return;
        const slot = clamp(Math.floor(evt.nativeEvent.locationY / SLOT_H), 0, TOTAL_SLOTS - 1);
        const endSlot = Math.max(dragRef.current.startSlot, slot);
        dragRef.current = { ...dragRef.current, endSlot };
        setDragDisplay({ ...dragRef.current });
      },

      onPanResponderRelease: () => {
        setScrollEnabled(true);
        if (dragRef.current) {
          const drag = { ...dragRef.current };
          setPendingDrag(drag);
          setModalVisible(true);
          setActivityColor(BLOCK_COLORS[blockCount.current % BLOCK_COLORS.length]);
        }
        dragRef.current = null;
        setDragDisplay(null);
      },

      onPanResponderTerminate: () => {
        setScrollEnabled(true);
        dragRef.current = null;
        setDragDisplay(null);
      },
    })
  ).current;

  const addBlock = () => {
    if (!pendingDrag || !activityName.trim()) return;
    const block: Block = {
      id: newId(),
      day: pendingDrag.day,
      startSlot: pendingDrag.startSlot,
      endSlot: pendingDrag.endSlot + 1,
      activity: activityName.trim(),
      emoji: activityEmoji,
      color: activityColor,
    };
    blockCount.current += 1;
    setBlocks(prev => [...prev, block]);
    closeModal();
  };

  const closeModal = () => {
    setModalVisible(false);
    setPendingDrag(null);
    setActivityName('');
    setActivityEmoji('📖');
  };

  const removeBlock = (id: string) => setBlocks(prev => prev.filter(b => b.id !== id));

  const handleComplete = () => {
    const schedules = blocks.map(b => ({
      day: b.day,
      startSlot: b.startSlot,
      endSlot: b.endSlot,
      activity: b.activity,
      emoji: b.emoji,
      color: b.color,
    }));
    navigation.navigate('AccountSetup', { userName, age, gender, likes, dislikes, schedules });
  };

  // 시간 레이블 (1시간마다)
  const timeLabels = Array.from({ length: TOTAL_SLOTS / 2 + 1 }, (_, i) => (
    <View key={i} style={[styles.timeLabel, { top: i * 2 * SLOT_H - 7 }]}>
      <Text style={styles.timeLabelText}>{slotToTime(i * 2)}</Text>
    </View>
  ));

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.stepRow}>
          {[0, 1, 2, 3].map((i) => (
            <React.Fragment key={i}>
              <View style={[styles.stepDot, i < 2 ? styles.stepDotDone : i === 2 ? styles.stepDotActive : undefined]} />
              {i < 3 && <View style={[styles.stepLine, i < 2 && styles.stepLineDone]} />}
            </React.Fragment>
          ))}
        </View>
      </View>

      {/* 타이틀 */}
      <View style={styles.titleArea}>
        <Text style={styles.title}>📅 {userName}의 일과 설정</Text>
        <Text style={styles.subtitle}>시간대를 드래그해서 일과를 추가하세요 (30분 단위)</Text>
      </View>

      {/* 시간표 */}
      <ScrollView
        style={styles.scroll}
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* 요일 헤더 */}
        <View style={styles.dayHeaderRow}>
          <View style={{ width: TIME_COL_W }} />
          {DAYS.map((d, i) => (
            <View key={i} style={[styles.dayCell, { width: DAY_COL_W }]}>
              <Text style={[styles.dayText, i >= 5 && styles.dayTextWeekend]}>{d}</Text>
            </View>
          ))}
        </View>

        {/* 그리드 */}
        <View
          style={[styles.grid, { height: TOTAL_SLOTS * SLOT_H }]}
          {...panResponder.panHandlers}
        >
          {/* 시간 레이블 */}
          <View style={[styles.timeCol, { width: TIME_COL_W }]}>
            {timeLabels}
          </View>

          {/* 가로 구분선 */}
          {Array.from({ length: TOTAL_SLOTS + 1 }, (_, i) => (
            <View
              key={`h${i}`}
              style={[
                styles.hLine,
                { top: i * SLOT_H, left: TIME_COL_W },
                i % 2 === 0 ? styles.hLineHour : styles.hLineHalf,
              ]}
            />
          ))}

          {/* 세로 구분선 */}
          {Array.from({ length: 8 }, (_, i) => (
            <View
              key={`v${i}`}
              style={[styles.vLine, { left: TIME_COL_W + i * DAY_COL_W }]}
            />
          ))}

          {/* 저장된 블록 */}
          {blocks.map(b => (
            <TouchableOpacity
              key={b.id}
              activeOpacity={0.7}
              onPress={() => removeBlock(b.id)}
              style={[
                styles.block,
                {
                  left: TIME_COL_W + b.day * DAY_COL_W + 1,
                  top: b.startSlot * SLOT_H + 1,
                  width: DAY_COL_W - 2,
                  height: (b.endSlot - b.startSlot) * SLOT_H - 2,
                  backgroundColor: b.color,
                },
              ]}
            >
              <Text style={styles.blockEmoji}>{b.emoji}</Text>
              <Text style={styles.blockText} numberOfLines={3}>{b.activity}</Text>
            </TouchableOpacity>
          ))}

          {/* 드래그 중 미리보기 */}
          {dragDisplay && (
            <View
              pointerEvents="none"
              style={[
                styles.block,
                styles.dragBlock,
                {
                  left: TIME_COL_W + dragDisplay.day * DAY_COL_W + 1,
                  top: dragDisplay.startSlot * SLOT_H + 1,
                  width: DAY_COL_W - 2,
                  height: (dragDisplay.endSlot - dragDisplay.startSlot + 1) * SLOT_H - 2,
                },
              ]}
            />
          )}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* 하단 버튼 */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.nextBtn} onPress={handleComplete} activeOpacity={0.85}>
          <Text style={styles.nextBtnText}>다음 →</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>블록을 탭하면 삭제돼요</Text>
      </View>

      {/* 일과 입력 모달 */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={closeModal} activeOpacity={1} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>일과 추가</Text>

            {/* 선택된 시간대 표시 */}
            {pendingDrag && (
              <View style={styles.modalTimeBadge}>
                <Text style={styles.modalTimeText}>
                  {DAYS[pendingDrag.day]}요일{'  '}
                  {slotToTime(pendingDrag.startSlot)} – {slotToTime(pendingDrag.endSlot + 1)}
                </Text>
              </View>
            )}

            {/* 이모지 */}
            <Text style={styles.modalLabel}>이모지</Text>
            <View style={styles.emojiRow}>
              {EMOJIS.map(e => (
                <TouchableOpacity
                  key={e}
                  style={[styles.emojiBtn, activityEmoji === e && styles.emojiBtnSelected]}
                  onPress={() => setActivityEmoji(e)}
                >
                  <Text style={styles.emojiBtnText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 색상 */}
            <Text style={styles.modalLabel}>색상</Text>
            <View style={styles.colorRow}>
              {BLOCK_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorDot, { backgroundColor: c }, activityColor === c && styles.colorDotActive]}
                  onPress={() => setActivityColor(c)}
                />
              ))}
            </View>

            {/* 이름 입력 */}
            <Text style={styles.modalLabel}>일과 이름</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="예: 아침 식사, 산책..."
              placeholderTextColor="#bbb"
              value={activityName}
              onChangeText={setActivityName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={addBlock}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
                <Text style={styles.cancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addBtn, !activityName.trim() && styles.addBtnDisabled]}
                onPress={addBlock}
                disabled={!activityName.trim()}
              >
                <Text style={styles.addBtnText}>추가</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7ff' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 22, color: colors.primary },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d0daf0' },
  stepDotActive: { backgroundColor: colors.primary },
  stepDotDone: { backgroundColor: colors.primaryLight },
  stepLine: { width: 20, height: 2, backgroundColor: '#d0daf0' },
  stepLineDone: { backgroundColor: colors.primaryLight },

  titleArea: { paddingHorizontal: 20, paddingBottom: 10, gap: 3 },
  title: { fontSize: 17, fontWeight: '800', color: colors.primary },
  subtitle: { fontSize: 12, color: '#888' },

  scroll: { flex: 1, paddingHorizontal: H_PADDING },

  // 요일 헤더
  dayHeaderRow: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#e8eef8',
  },
  dayCell: { alignItems: 'center' },
  dayText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  dayTextWeekend: { color: colors.alertLight },

  // 그리드
  grid: { position: 'relative', backgroundColor: colors.white, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },

  timeCol: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  timeLabel: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  timeLabelText: { fontSize: 9, color: '#aaa', fontWeight: '600' },

  hLine: { position: 'absolute', right: 0, height: 1 },
  hLineHour: { backgroundColor: '#d8e0f0' },
  hLineHalf: { backgroundColor: '#eef1f9' },

  vLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: '#e8eef8' },

  block: {
    position: 'absolute', borderRadius: 4, padding: 3,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  blockEmoji: { fontSize: 10 },
  blockText: { fontSize: 9, color: '#fff', fontWeight: '700', textAlign: 'center', lineHeight: 12 },

  dragBlock: { backgroundColor: 'rgba(107,155,242,0.35)', borderWidth: 1.5, borderColor: colors.primary },

  // 하단 버튼
  footer: {
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 12, gap: 6,
    borderTopWidth: 1, borderTopColor: '#e8eef8', backgroundColor: '#f4f7ff',
  },
  nextBtn: {
    backgroundColor: colors.guardian, borderRadius: 16, paddingVertical: 14,
    alignItems: 'center', elevation: 4,
    shadowColor: colors.guardian, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  nextBtnText: { color: colors.white, fontWeight: '800', fontSize: 16 },
  hint: { textAlign: 'center', fontSize: 11, color: '#bbb' },

  // 모달
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.primary },
  modalTimeBadge: {
    backgroundColor: colors.primaryBg, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start',
  },
  modalTimeText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  modalLabel: { fontSize: 12, fontWeight: '700', color: '#777', marginBottom: -6 },

  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  emojiBtn: { padding: 6, borderRadius: 8, backgroundColor: '#f0f3f9' },
  emojiBtnSelected: { backgroundColor: colors.primary },
  emojiBtnText: { fontSize: 20 },

  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorDot: { width: 28, height: 28, borderRadius: 14 },
  colorDotActive: { borderWidth: 3, borderColor: '#333' },

  modalInput: {
    backgroundColor: '#f4f7ff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: colors.text,
    borderWidth: 1.5, borderColor: colors.border,
  },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, backgroundColor: colors.primaryBg, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  addBtn: {
    flex: 2, backgroundColor: colors.primary, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  addBtnDisabled: { backgroundColor: '#c5d0e8' },
  addBtnText: { fontSize: 14, fontWeight: '800', color: colors.white },
});
