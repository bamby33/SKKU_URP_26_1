/**
 * 온보딩 3 · 보호자 전용
 * 기본 시간 설정 → 입력값으로 시간표 직접 생성 (AI 미사용)
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Modal, Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, ScheduleParam } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import TimePickerField from '../../components/TimePickerField';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'BasicSchedule'>;
  route: RouteProp<RootStackParamList, 'BasicSchedule'>;
};

// ── 시간 피커 ──────────────────────────────────────────────────────────────────
const HOURS = Array.from({ length: 17 }, (_, i) => String(i + 6).padStart(2, '0')); // 06~22
const MINUTES = ['00', '30'];

type TimePickerProps = {
  value: string;
  onChange: (v: string) => void;
  label: string;
  emoji: string;
};

function TimeField({ value, onChange, label, emoji }: TimePickerProps) {
  const [visible, setVisible] = useState(false);
  const [selHour, setSelHour] = useState(value.split(':')[0]);
  const [selMin, setSelMin] = useState(value.split(':')[1]);

  const open = () => {
    setSelHour(value.split(':')[0]);
    setSelMin(value.split(':')[1]);
    setVisible(true);
  };

  const confirm = () => {
    onChange(`${selHour}:${selMin}`);
    setVisible(false);
  };

  return (
    <>
      <TouchableOpacity style={styles.timeField} onPress={open} activeOpacity={0.8}>
        <Text style={styles.timeFieldLabel}>{label}</Text>
        <View style={styles.timeFieldValue}>
          <Text style={styles.timeFieldValueText}>{value}</Text>
        </View>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>{label}</Text>
            <Text style={styles.pickerSelected}>{selHour}:{selMin}</Text>

            {/* 시 선택 */}
            <Text style={styles.pickerSectionLabel}>시</Text>
            <View style={styles.hourGrid}>
              {HOURS.map(h => (
                <TouchableOpacity
                  key={h}
                  style={[styles.hourBtn, selHour === h && styles.hourBtnActive]}
                  onPress={() => setSelHour(h)}
                >
                  <Text style={[styles.hourBtnText, selHour === h && styles.hourBtnTextActive]}>
                    {h}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 분 선택 */}
            <Text style={styles.pickerSectionLabel}>분</Text>
            <View style={styles.minRow}>
              {MINUTES.map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.minBtn, selMin === m && styles.minBtnActive]}
                  onPress={() => setSelMin(m)}
                >
                  <Text style={[styles.minBtnText, selMin === m && styles.minBtnTextActive]}>
                    {m}분
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.pickerBtns}>
              <TouchableOpacity style={styles.pickerCancelBtn} onPress={() => setVisible(false)}>
                <Text style={styles.pickerCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickerConfirmBtn} onPress={confirm}>
                <Text style={styles.pickerConfirmText}>확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ── 타입 ────────────────────────────────────────────────────────────────────────
type FixedItem = { name: string; time: string; endTime: string; days: number[] };

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const FIXED_SUGGESTIONS = ['복지관', '학교/기관', '병원', '치료', '운동'];

// 시간표 직접 생성용 (AI 없이) — 그리드 06:00~24:00, 30분 슬롯
const GRID_START_H = 6;
const GRID_TOTAL = 36;
const toMinB = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toSlotB = (t: string) => Math.max(0, Math.min(GRID_TOTAL, Math.round((toMinB(t) - GRID_START_H * 60) / 30)));
const minToTimeB = (mins: number) => { const c = Math.max(0, Math.min(23 * 60 + 59, mins)); return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`; };

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────
export default function BasicScheduleScreen({ navigation, route }: Props) {
  const params = route.params;

  const [wakeTime,       setWakeTime]       = useState('07:00');
  const [sleepTime,      setSleepTime]      = useState('22:00');
  const [breakfastTime,  setBreakfastTime]  = useState('08:00');
  const [lunchTime,      setLunchTime]      = useState('12:00');
  const [dinnerTime,     setDinnerTime]     = useState('18:00');
  // 세면(세수·양치 — 순간 일과) / 씻기(샤워·목욕 — 지속 일과) 분리
  const [faceTimes,      setFaceTimes]      = useState<string[]>(['08:00']);
  const [addingFace,     setAddingFace]     = useState(false);
  const [facePickerVal,  setFacePickerVal]  = useState('08:00');
  const [bathTimes,      setBathTimes]      = useState<string[]>(['20:00']);
  const [addingBath,     setAddingBath]     = useState(false);
  const [bathPickerVal,  setBathPickerVal]  = useState('20:00');

  const addFaceTime = () => {
    if (!faceTimes.includes(facePickerVal)) setFaceTimes(p => [...p, facePickerVal].sort());
    setAddingFace(false);
  };
  const addBathTime = () => {
    if (!bathTimes.includes(bathPickerVal)) setBathTimes(p => [...p, bathPickerVal].sort());
    setAddingBath(false);
  };

  // 고정 일과(복지관·병원 등)는 다음 페이지(시간표 확인)의 '일과 추가'에서 입력한다.

  const getRoutineError = (time: string, label: string): string => {
    if (label === '취침') {
      if (toMinB(time) <= toMinB(wakeTime)) return '취침 시간은 기상 시간 이후여야 합니다.';
      return '';
    }
    if (label !== '기상') {
      if (toMinB(time) < toMinB(wakeTime)) return '일과 시간은 기상 시간 이후여야 합니다.';
      if (toMinB(time) >= toMinB(sleepTime)) return '일과 시간은 취침 시간 이전이어야 합니다.';
    }
    return '';
  };

  // AI 없이 — 입력한 기본 시간으로 시간표를 그대로 생성 (고정 일과는 다음 편집 화면에서 추가)
  const handleGenerate = () => {
    const routineRows: [string, string, string][] = [
      ['아침 식사', breakfastTime, ''],
      ['점심 식사', lunchTime, ''],
      ['저녁 식사', dinnerTime, ''],
      ['취침', sleepTime, ''],
    ];
    for (const [label, time] of routineRows) {
      if (getRoutineError(time, label)) {
        Alert.alert('시간 오류', getRoutineError(time, label));
        return;
      }
    }
    const badFace = faceTimes.find(t => toMinB(t) < toMinB(wakeTime) || toMinB(t) >= toMinB(sleepTime));
    if (badFace) { Alert.alert('시간 오류', `세면 시간 ${badFace}은(는) 기상 시간 이후, 취침 시간 이전이어야 합니다.`); return; }
    const badBath = bathTimes.find(t => toMinB(t) < toMinB(wakeTime) || toMinB(t) >= toMinB(sleepTime));
    if (badBath) { Alert.alert('시간 오류', `씻기 시간 ${badBath}은(는) 기상 시간 이후, 취침 시간 이전이어야 합니다.`); return; }

    const ALL = [0, 1, 2, 3, 4, 5, 6];
    const out: ScheduleParam[] = [];
    const push = (day: number, time: string, endTime: string, name: string, emoji: string) => {
      out.push({ day, startSlot: toSlotB(time), endSlot: toSlotB(endTime), startTime: time, endTime, activity: name, emoji, color: '' });
    };
    // 매일 일과 (요일별 1개씩)
    const dur = (t: string) => minToTimeB(toMinB(t) + 30);          // 식사·씻기 30분
    for (const day of ALL) {
      push(day, wakeTime,      minToTimeB(toMinB(wakeTime) + 30),      '기상',      '🌅'); // 순간(끝은 명목)
      push(day, breakfastTime, dur(breakfastTime),                    '아침 식사', '🍚');
      push(day, lunchTime,     dur(lunchTime),                        '점심 식사', '🍱');
      push(day, dinnerTime,    dur(dinnerTime),                       '저녁 식사', '🍽️');
      push(day, sleepTime,     '23:59',                               '취침',      '😴'); // 취침=기상까지(명목 23:59)
      faceTimes.forEach(t => push(day, t, minToTimeB(toMinB(t) + 30), '세면',      '🧼')); // 순간
      bathTimes.forEach(t => push(day, t, dur(t),                     '씻기',      '🛁')); // 지속
    }
    navigation.navigate('ScheduleSetup', { ...params, schedules: out });
  };

  const handleSkip = () => {
    navigation.navigate('ScheduleSetup', { ...params, schedules: [] });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← 뒤로</Text>
          </TouchableOpacity>
          <View style={styles.stepRow}>
            {[0, 1, 2, 3].map((i) => (
              <React.Fragment key={i}>
                <View style={[styles.stepDot, i < 2 ? styles.stepDotDone : i === 2 ? styles.stepDotActive : {}]} />
                {i < 3 && <View style={[styles.stepLine, i < 2 && styles.stepLineDone]} />}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* 타이틀 */}
        <View style={styles.titleArea}>
          <Text style={styles.title}>기본 시간을 설정해주세요</Text>
          <Text style={styles.subtitle}>입력한 시간으로 시간표를 만들어요</Text>
        </View>

        {/* 기본 루틴 섹션 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>하루 기본 루틴</Text>
          {([
            ['🌅', '기상',      wakeTime,      setWakeTime],
            ['🍳', '아침 식사', breakfastTime, setBreakfastTime],
            ['🍱', '점심 식사', lunchTime,     setLunchTime],
            ['🍽️', '저녁 식사', dinnerTime,    setDinnerTime],
            ['🌙', '취침',      sleepTime,     setSleepTime],
          ] as [string, string, string, (v: string) => void][]).map(([em, lb, val, set]) => (
            <View key={lb}>
              <View style={styles.timeRow}>
                <Text style={styles.timeRowLabel}>{em}  {lb}</Text>
                <View style={styles.timeRowPicker}><TimePickerField value={val} onChange={set} /></View>
              </View>
              {getRoutineError(val, lb) !== '' && (
                <Text style={styles.timeErrorText}>{getRoutineError(val, lb)}</Text>
              )}
            </View>
          ))}
        </View>

        {/* 세면 섹션 (세수·양치 — 여러 번 가능) */}
        <View style={styles.section}>
          <View style={styles.medHeader}>
            <Text style={styles.sectionTitle}>세면 시간 (세수·양치)</Text>
            <Text style={styles.medOptional}>여러 번 가능</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {faceTimes.map((t, i) => (
              <View key={i} style={styles.washChip}>
                <Text style={styles.washChipText}>{t}</Text>
                <TouchableOpacity onPress={() => setFaceTimes(p => p.filter((_, j) => j !== i))}>
                  <Text style={styles.medChipDel}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
          {addingFace ? (
            <View style={styles.medAddRow}>
              <View style={{ flex: 1 }}><TimePickerField value={facePickerVal} onChange={setFacePickerVal} /></View>
              <View style={styles.medAddBtns}>
                <TouchableOpacity style={styles.medCancelBtn} onPress={() => setAddingFace(false)}>
                  <Text style={styles.medCancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.medConfirmBtn, { backgroundColor: colors.primary }]} onPress={addFaceTime}>
                  <Text style={styles.medConfirmText}>추가</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.medAddBtn} onPress={() => setAddingFace(true)}>
              <Text style={styles.medAddBtnText}>+ 세면 시간 추가</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 씻기 섹션 (샤워·목욕 — 여러 번 가능) */}
        <View style={styles.section}>
          <View style={styles.medHeader}>
            <Text style={styles.sectionTitle}>씻기 시간 (샤워·목욕)</Text>
            <Text style={styles.medOptional}>여러 번 가능</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {bathTimes.map((t, i) => (
              <View key={i} style={styles.washChip}>
                <Text style={styles.washChipText}>{t}</Text>
                <TouchableOpacity onPress={() => setBathTimes(p => p.filter((_, j) => j !== i))}>
                  <Text style={styles.medChipDel}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
          {addingBath ? (
            <View style={styles.medAddRow}>
              <View style={{ flex: 1 }}><TimePickerField value={bathPickerVal} onChange={setBathPickerVal} /></View>
              <View style={styles.medAddBtns}>
                <TouchableOpacity style={styles.medCancelBtn} onPress={() => setAddingBath(false)}>
                  <Text style={styles.medCancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.medConfirmBtn, { backgroundColor: colors.primary }]} onPress={addBathTime}>
                  <Text style={styles.medConfirmText}>추가</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.medAddBtn} onPress={() => setAddingBath(true)}>
              <Text style={styles.medAddBtnText}>+ 씻기 시간 추가</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 다음 — 입력한 시간으로 시간표 만들기 */}
        <TouchableOpacity
          style={styles.generateBtn}
          onPress={handleGenerate}
          activeOpacity={0.85}
        >
          <Text style={styles.generateBtnText}>이 시간으로 시간표 만들기</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
          <Text style={styles.skipText}>비우고 직접 만들게요</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content:   { padding: 24, gap: 20 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14,
  },
  backText: { fontSize: 15, color: colors.primary, fontWeight: '800' },
  stepRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepDot:  { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d0daf0' },
  stepDotActive: { backgroundColor: colors.primary },
  stepDotDone:   { backgroundColor: colors.primaryLight },
  stepLine:      { width: 20, height: 2, backgroundColor: '#d0daf0' },
  stepLineDone:  { backgroundColor: colors.primaryLight },

  titleArea: { alignItems: 'flex-start', gap: 6, paddingVertical: 4, paddingHorizontal: 2 },
  emoji:     { fontSize: 52 },
  title:     { fontSize: 22, fontWeight: '900', color: '#1E293B', lineHeight: 30 },
  subtitle:  { fontSize: 13, color: '#94A3B8' },

  section: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10,
    borderWidth: 1, borderColor: '#EEF1F5',
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1E293B', marginBottom: 6 },

  // 하루 기본 루틴 행 (라벨 + 모던 피커)
  timeRow:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timeRowLabel:  { flex: 1, fontSize: 15, fontWeight: '700', color: '#334155' },
  timeRowPicker: { width: 132 },

  // TimeField
  timeField: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F4FAF7', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1.5, borderColor: colors.border,
  },
  timeFieldEmoji: { fontSize: 20 },
  timeFieldLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  timeFieldValue: {
    backgroundColor: colors.primary, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  timeFieldValueText: { fontSize: 16, fontWeight: '900', color: '#fff' },

  // Picker Modal
  pickerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  pickerCard: {
    backgroundColor: colors.white, borderRadius: 24, padding: 24, width: '100%',
    elevation: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 6 },
  },
  pickerTitle:       { fontSize: 17, fontWeight: '800', color: colors.primary, marginBottom: 4 },
  pickerSelected:    { fontSize: 36, fontWeight: '900', color: colors.primary, textAlign: 'center', marginBottom: 16 },
  pickerSectionLabel:{ fontSize: 12, fontWeight: '700', color: '#888', marginBottom: 8 },

  hourGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  hourBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#F4FAF7', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.border,
  },
  hourBtnActive:     { backgroundColor: colors.primary, borderColor: colors.primary },
  hourBtnText:       { fontSize: 14, fontWeight: '700', color: '#666' },
  hourBtnTextActive: { color: '#fff' },

  minRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  minBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#F4FAF7', alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.border,
  },
  minBtnActive:     { backgroundColor: colors.primary, borderColor: colors.primary },
  minBtnText:       { fontSize: 15, fontWeight: '700', color: '#666' },
  minBtnTextActive: { color: '#fff' },

  pickerBtns:      { flexDirection: 'row', gap: 10 },
  pickerCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: '#E8F5EE', alignItems: 'center' },
  pickerCancelText:{ fontSize: 15, fontWeight: '700', color: '#888' },
  pickerConfirmBtn:{ flex: 2, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center' },
  pickerConfirmText:{ fontSize: 15, fontWeight: '800', color: '#fff' },

  // Medication
  medHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  medOptional:{ fontSize: 12, color: '#aaa', fontWeight: '600', backgroundColor: '#eee', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  medChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFF0F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1.5, borderColor: '#F5C0C0',
  },
  medChipText: { fontSize: 14, fontWeight: '700', color: colors.alertLight },
  medChipDel:  { fontSize: 16, color: '#bbb' },
  washChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  washChipText: { fontSize: 14, fontWeight: '700', color: '#334155' },
  medAddRow:   { gap: 10, flexDirection: 'row', alignItems: 'center' },
  medAddBtns:  { flexDirection: 'row', gap: 8 },
  medCancelBtn:{ paddingVertical: 11, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center' },
  medCancelText:{ fontSize: 14, fontWeight: '700', color: '#64748B' },
  medConfirmBtn:{ paddingVertical: 11, paddingHorizontal: 18, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' },
  medConfirmText:{ fontSize: 14, fontWeight: '800', color: '#fff' },
  medAddBtn: {
    paddingVertical: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E2E8F0', borderStyle: 'dashed', alignItems: 'center',
  },
  medAddBtnText: { fontSize: 14, fontWeight: '700', color: '#94A3B8' },

  // 고정 일과
  fixedHint: { fontSize: 12, color: '#94A3B8', lineHeight: 18 },
  timeErrorText: { fontSize: 12, color: '#E57373', fontWeight: '600', marginTop: 2 },
  fixedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F1F5F9', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  fixedChipIcon: { fontSize: 16 },
  fixedChipName: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  fixedChipSub:  { fontSize: 12, color: '#64748B', marginTop: 2 },
  fixedTimeRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fixedTimeSep:  { fontSize: 14, color: '#94A3B8', fontWeight: '700' },
  fixedAddBox: { gap: 10 },
  fixedNameInput: {
    backgroundColor: '#F8FAFC', borderRadius: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: '#1E293B',
  },
  fixedDayLabel: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  fixedDayRow: { flexDirection: 'row', gap: 6 },
  dayBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
  },
  dayBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayBtnText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  dayBtnTextOn: { color: '#fff' },
  fixedSugChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
  },
  fixedSugChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  fixedSugText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  fixedSugTextOn: { color: '#fff' },

  // Bottom buttons
  generateBtn: {
    backgroundColor: '#fff', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4, borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  generateBtnLoading: { backgroundColor: '#F8FAFC' },
  generateBtnText:    { color: colors.primary, fontWeight: '800', fontSize: 16 },
  loadingRow:         { flexDirection: 'row', alignItems: 'center', gap: 10 },

  skipBtn:  { alignItems: 'center', paddingVertical: 10 },
  skipText: { fontSize: 13, color: '#94A3B8', fontWeight: '600' },
});
