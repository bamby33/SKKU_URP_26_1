/**
 * 온보딩 3 · 보호자 전용
 * 기본 시간 설정 → AI 맞춤 시간표 생성
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
import { api } from '../../api/client';

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
type FixedItem = { name: string; time: string; days: number[] };

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const FIXED_SUGGESTIONS = ['복지관', '학교/기관', '병원', '치료', '운동'];

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────
export default function BasicScheduleScreen({ navigation, route }: Props) {
  const params = route.params;

  const [wakeTime,       setWakeTime]       = useState('07:00');
  const [sleepTime,      setSleepTime]      = useState('22:00');
  const [breakfastTime,  setBreakfastTime]  = useState('08:00');
  const [lunchTime,      setLunchTime]      = useState('12:00');
  const [dinnerTime,     setDinnerTime]     = useState('18:00');
  const [washTimes,      setWashTimes]      = useState<string[]>(['08:00', '20:00']);
  const [addingWash,     setAddingWash]     = useState(false);
  const [washPickerVal,  setWashPickerVal]  = useState('21:00');
  const [loading,        setLoading]        = useState(false);

  const addWashTime = () => {
    if (!washTimes.includes(washPickerVal)) {
      setWashTimes(p => [...p, washPickerVal].sort());
    }
    setAddingWash(false);
  };

  // 고정 일과
  const [fixedItems,     setFixedItems]     = useState<FixedItem[]>([]);
  const [addingFixed,    setAddingFixed]    = useState(false);
  const [fixedName,      setFixedName]      = useState('');
  const [fixedTime,      setFixedTime]      = useState('09:00');
  const [fixedDays,      setFixedDays]      = useState<number[]>([]); // 빈 배열 = 매일

  const addFixedItem = () => {
    if (!fixedName.trim()) return;
    setFixedItems(prev => [...prev, { name: fixedName.trim(), time: fixedTime, days: fixedDays }]);
    setFixedName('');
    setFixedTime('09:00');
    setFixedDays([]);
    setAddingFixed(false);
  };

  const toggleFixedDay = (d: number) => {
    setFixedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await api.post('/ai/suggest-schedule-onboarding', {
        name:             params.userName,
        age:              params.age,
        disability_type:  params.disabilityType,
        disability_level: params.disabilityLevel,
        occupation:       params.occupation,
        likes:            params.likes,
        dislikes:         params.dislikes,
        daily_life:       params.dailyLife,
        problem_notes:    params.problemNotes,
        wake_time:        wakeTime,
        sleep_time:       sleepTime,
        breakfast_time:   breakfastTime,
        lunch_time:       lunchTime,
        dinner_time:      dinnerTime,
        wash_times:       washTimes,
        fixed_schedules:  fixedItems,
      });

      const schedules: ScheduleParam[] = (res.data.blocks as any[]).map(b => ({
        day:       b.day,
        startSlot: b.startSlot,
        endSlot:   b.endSlot,
        startTime: b.scheduled_time ?? undefined,
        endTime:   b.end_time ?? undefined,
        activity:  b.name,
        emoji:     b.emoji,
        color:     b.color,
      }));

      navigation.navigate('ScheduleSetup', { ...params, schedules });
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? 'AI 시간표 생성 중 오류가 발생했어요.';
      Alert.alert('오류', msg);
    } finally {
      setLoading(false);
    }
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
          <Text style={styles.title}>기본 시간을{'\n'}설정해주세요</Text>
          <Text style={styles.subtitle}>AI가 맞춤 시간표를 만들어드려요</Text>
        </View>

        {/* 기본 루틴 섹션 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>하루 기본 루틴</Text>
          <TimeField value={wakeTime}      onChange={setWakeTime}      label="기상 시간"  emoji="🌅" />
          <TimeField value={breakfastTime} onChange={setBreakfastTime} label="아침 식사"  emoji="🍳" />
          <TimeField value={lunchTime}     onChange={setLunchTime}     label="점심 식사"  emoji="🍱" />
          <TimeField value={dinnerTime}    onChange={setDinnerTime}    label="저녁 식사"  emoji="🍽️" />
          <TimeField value={sleepTime}     onChange={setSleepTime}     label="취침 시간"  emoji="🌙" />
        </View>

        {/* 씻기·세면 섹션 (여러 번 가능) */}
        <View style={styles.section}>
          <View style={styles.medHeader}>
            <Text style={styles.sectionTitle}>씻기·세면 시간</Text>
            <Text style={styles.medOptional}>여러 번 가능</Text>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {washTimes.map((t, i) => (
              <View key={i} style={styles.washChip}>
                <Text style={styles.washChipText}>{t}</Text>
                <TouchableOpacity onPress={() => setWashTimes(p => p.filter((_, j) => j !== i))}>
                  <Text style={styles.medChipDel}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {addingWash ? (
            <View style={styles.medAddRow}>
              <TimeField value={washPickerVal} onChange={setWashPickerVal} label="씻기 시간" emoji="🛁" />
              <View style={styles.medAddBtns}>
                <TouchableOpacity style={styles.medCancelBtn} onPress={() => setAddingWash(false)}>
                  <Text style={styles.medCancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.medConfirmBtn, { backgroundColor: colors.primary }]} onPress={addWashTime}>
                  <Text style={styles.medConfirmText}>추가</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.medAddBtn} onPress={() => setAddingWash(true)}>
              <Text style={styles.medAddBtnText}>+ 씻기 시간 추가</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 고정 일과 섹션 */}
        <View style={styles.section}>
          <View style={styles.medHeader}>
            <Text style={styles.sectionTitle}>고정 일과</Text>
            <Text style={styles.medOptional}>매일 반드시 있는 것</Text>
          </View>
          <Text style={styles.fixedHint}>
            복지관·학교·병원처럼 절대 빠지면 안 되는 일과를 추가하세요.{'\n'}AI가 스케줄을 조정할 때 이 항목은 건드리지 않아요.
          </Text>

          {fixedItems.map((item, i) => (
            <View key={i} style={styles.fixedChip}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fixedChipName}>{item.name}</Text>
                <Text style={styles.fixedChipSub}>
                  {item.time} · {item.days.length === 0 ? '매일' : item.days.map(d => DAY_LABELS[d]).join('/')}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setFixedItems(prev => prev.filter((_, j) => j !== i))}>
                <Text style={styles.medChipDel}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          {addingFixed ? (
            <View style={styles.fixedAddBox}>
              {/* 빠른 선택 */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {FIXED_SUGGESTIONS.map(s => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.fixedSugChip, fixedName === s && styles.fixedSugChipOn]}
                      onPress={() => setFixedName(s)}
                    >
                      <Text style={[styles.fixedSugText, fixedName === s && styles.fixedSugTextOn]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* 이름 직접 입력 */}
              <TextInput
                style={styles.fixedNameInput}
                placeholder="일과 이름 직접 입력..."
                placeholderTextColor="#bbb"
                value={fixedName}
                onChangeText={setFixedName}
              />

              {/* 시간 선택 */}
              <TimeField value={fixedTime} onChange={setFixedTime} label="시작 시간" emoji="🕐" />

              {/* 요일 선택 */}
              <Text style={styles.fixedDayLabel}>요일 선택 (미선택 = 매일)</Text>
              <View style={styles.fixedDayRow}>
                {DAY_LABELS.map((d, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.dayBtn, fixedDays.includes(i) && styles.dayBtnOn]}
                    onPress={() => toggleFixedDay(i)}
                  >
                    <Text style={[styles.dayBtnText, fixedDays.includes(i) && styles.dayBtnTextOn]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.medAddBtns}>
                <TouchableOpacity style={styles.medCancelBtn} onPress={() => setAddingFixed(false)}>
                  <Text style={styles.medCancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.medConfirmBtn, { backgroundColor: colors.primary }]}
                  onPress={addFixedItem}
                  disabled={!fixedName.trim()}
                >
                  <Text style={styles.medConfirmText}>추가</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.medAddBtn} onPress={() => setAddingFixed(true)}>
              <Text style={styles.medAddBtnText}>+ 고정 일과 추가</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* AI 생성 버튼 */}
        <TouchableOpacity
          style={[styles.generateBtn, loading && styles.generateBtnLoading]}
          onPress={handleGenerate}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.generateBtnText}>AI가 시간표를 만들고 있어요...</Text>
            </View>
          ) : (
            <Text style={styles.generateBtnText}>AI 맞춤 시간표 생성하기</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
          <Text style={styles.skipText}>건너뛰고 직접 설정할게요</Text>
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
    backgroundColor: colors.primaryBg, borderRadius: 20,
  },
  backText: { fontSize: 15, color: colors.primary, fontWeight: '800' },
  stepRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepDot:  { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d0daf0' },
  stepDotActive: { backgroundColor: colors.primary },
  stepDotDone:   { backgroundColor: colors.primaryLight },
  stepLine:      { width: 20, height: 2, backgroundColor: '#d0daf0' },
  stepLineDone:  { backgroundColor: colors.primaryLight },

  titleArea: { alignItems: 'center', gap: 8, paddingVertical: 4 },
  emoji:     { fontSize: 52 },
  title:     { fontSize: 24, fontWeight: '900', color: colors.primary, textAlign: 'center', lineHeight: 32 },
  subtitle:  { fontSize: 13, color: '#888' },

  section: {
    backgroundColor: colors.white, borderRadius: 18, padding: 16, gap: 10,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.primary, marginBottom: 4 },

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
    backgroundColor: '#E8F5FA', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1.5, borderColor: '#A9D9E6',
  },
  washChipText: { fontSize: 14, fontWeight: '700', color: '#2A7A8C' },
  medAddRow:   { gap: 8 },
  medAddBtns:  { flexDirection: 'row', gap: 8 },
  medCancelBtn:{ flex: 1, paddingVertical: 11, borderRadius: 12, backgroundColor: '#eee', alignItems: 'center' },
  medCancelText:{ fontSize: 14, fontWeight: '700', color: '#888' },
  medConfirmBtn:{ flex: 2, paddingVertical: 11, borderRadius: 12, backgroundColor: colors.alertLight, alignItems: 'center' },
  medConfirmText:{ fontSize: 14, fontWeight: '800', color: '#fff' },
  medAddBtn: {
    paddingVertical: 12, borderRadius: 12,
    borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center',
  },
  medAddBtnText: { fontSize: 14, fontWeight: '700', color: '#aaa' },

  // 고정 일과
  fixedHint: { fontSize: 12, color: '#888', lineHeight: 18 },
  fixedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F0F4FF', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1.5, borderColor: '#C7D2F5',
  },
  fixedChipIcon: { fontSize: 16 },
  fixedChipName: { fontSize: 14, fontWeight: '700', color: colors.primary },
  fixedChipSub:  { fontSize: 12, color: '#888', marginTop: 2 },
  fixedAddBox: { gap: 10 },
  fixedNameInput: {
    backgroundColor: '#F4FAF7', borderRadius: 12,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: colors.text,
  },
  fixedDayLabel: { fontSize: 12, fontWeight: '700', color: '#888' },
  fixedDayRow: { flexDirection: 'row', gap: 6 },
  dayBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F4FAF7', borderWidth: 1.5, borderColor: colors.border,
  },
  dayBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  dayBtnTextOn: { color: '#fff' },
  fixedSugChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#F4FAF7', borderWidth: 1.5, borderColor: colors.border,
  },
  fixedSugChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  fixedSugText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  fixedSugTextOn: { color: '#fff' },

  // Bottom buttons
  generateBtn: {
    backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center',
    elevation: 4, shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  generateBtnLoading: { backgroundColor: colors.primaryLight },
  generateBtnText:    { color: '#fff', fontWeight: '800', fontSize: 16 },
  loadingRow:         { flexDirection: 'row', alignItems: 'center', gap: 10 },

  skipBtn:  { alignItems: 'center', paddingVertical: 8 },
  skipText: { fontSize: 13, color: '#aaa', fontWeight: '600' },
});
