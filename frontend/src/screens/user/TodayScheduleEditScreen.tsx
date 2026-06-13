/**
 * 오늘 일과 수정 화면
 * - 당사자: 즉시 저장
 * - 보호자: 변경 요청 → 당사자 수락 후 반영
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Modal, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { api } from '../../api/client';
import { SchedIcon } from '../../components/SchedIcon';

const stripLeadEmoji = (t: string) => t.replace(/^[^\w가-힣]+/u, '').trim() || t;

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'TodayScheduleEdit'>;
};

type Schedule = {
  id: number;           // 신규 항목은 음수 임시 ID
  title: string;
  scheduled_time: string;
  days_of_week: string;
};

const PALETTE = [
  { emoji: '🌅', label: '기상·세면',  color: '#FFB74D' },
  { emoji: '🍚', label: '아침 식사',  color: '#4CAF7D' },
  { emoji: '🍱', label: '점심 식사',  color: '#4CAF7D' },
  { emoji: '🍽️', label: '저녁 식사', color: '#4CAF7D' },
  { emoji: '💤', label: '취침 준비',  color: '#AB77E8' },
  { emoji: '🚶', label: '산책',       color: '#6B9BF2' },
  { emoji: '📖', label: '독서·여가', color: '#5BB7C0' },
  { emoji: '💊', label: '약 복용',    color: '#E57373' },
  { emoji: '🎵', label: '음악 감상',  color: '#26C6DA' },
  { emoji: '🏋️', label: '운동',      color: '#AED581' },
];

const todayDow = () => (new Date().getDay() + 6) % 7;

function formatTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? '오전' : '오후';
  return `${ampm} ${h % 12 || 12}:${String(m).padStart(2, '0')}`;
}

let tmpId = -1;
const newTmpId = () => tmpId--;

export default function TodayScheduleEditScreen({ navigation }: Props) {
  const [schedules,    setSchedules]    = useState<Schedule[]>([]);
  const [originalIds,  setOriginalIds]  = useState<number[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [isGuardian,   setIsGuardian]   = useState(false);
  const [showAdd,      setShowAdd]      = useState(false);

  const [newTime,  setNewTime]  = useState('09:00');
  const [newTitle, setNewTitle] = useState('');
  const [newEmoji, setNewEmoji] = useState('📋');

  const dow = todayDow();

  useEffect(() => {
    AsyncStorage.getItem('role').then(role => setIsGuardian(role === 'guardian'));
  }, []);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) return;
      const res = await api.get(`/schedules/user/${userId}`);
      const all: Schedule[] = res.data;
      const today = all
        .filter(s => s.days_of_week.split(',').map(Number).includes(dow))
        .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
      setSchedules(today);
      setOriginalIds(today.map(s => s.id));
    } finally {
      setLoading(false);
    }
  }, [dow]);

  useFocusEffect(useCallback(() => { fetchSchedules(); }, [fetchSchedules]));

  /* ── 삭제 ── */
  const handleDelete = (id: number, title: string) => {
    Alert.alert('삭제', `'${title}' 일과를 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: async () => {
          if (isGuardian) {
            // 보호자: 로컬에서만 제거
            setSchedules(p => p.filter(s => s.id !== id));
          } else {
            // 당사자: 즉시 API 삭제
            try {
              await api.delete(`/schedules/${id}`);
              setSchedules(p => p.filter(s => s.id !== id));
            } catch {
              Alert.alert('오류', '삭제에 실패했어요.');
            }
          }
        },
      },
    ]);
  };

  /* ── 추가 ── */
  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    if (isGuardian) {
      // 보호자: 로컬에만 추가
      setSchedules(p => [...p, {
        id: newTmpId(),
        title: `${newEmoji} ${newTitle.trim()}`,
        scheduled_time: newTime,
        days_of_week: String(dow),
      }].sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time)));
      setShowAdd(false);
      setNewTitle('');
      setNewTime('09:00');
      setNewEmoji('📋');
    } else {
      // 당사자: 즉시 API 저장
      setSaving(true);
      try {
        const userId = await AsyncStorage.getItem('user_id');
        if (!userId) return;
        await api.post('/schedules/', {
          user_id: Number(userId),
          title: `${newEmoji} ${newTitle.trim()}`,
          scheduled_time: newTime,
          days_of_week: String(dow),
        });
        setShowAdd(false);
        setNewTitle('');
        setNewTime('09:00');
        setNewEmoji('📋');
        fetchSchedules();
      } catch {
        Alert.alert('오류', '추가에 실패했어요.');
      } finally {
        setSaving(false);
      }
    }
  };

  /* ── 보호자: 변경 요청 전송 ── */
  const handleGuardianSubmit = async () => {
    const toDelete = originalIds.filter(id => !schedules.find(s => s.id === id));
    const toAdd = schedules
      .filter(s => s.id < 0)
      .map(s => ({ title: s.title, scheduled_time: s.scheduled_time, days_of_week: s.days_of_week }));

    if (toDelete.length === 0 && toAdd.length === 0) {
      Alert.alert('변경 없음', '변경된 내용이 없어요.');
      return;
    }

    Alert.alert(
      '일과 변경 요청',
      `삭제 ${toDelete.length}개 · 추가 ${toAdd.length}개\n당사자에게 수락 요청을 보낼까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '요청 보내기',
          onPress: async () => {
            setSaving(true);
            try {
              const userId = await AsyncStorage.getItem('user_id');
              if (!userId) return;
              await api.post(`/schedule-requests/user/${userId}`, {
                change_type: 'today',
                schedules_to_delete: toDelete,
                schedules_to_add: toAdd,
              });
              Alert.alert('전송 완료', '당사자에게 일과 변경 요청을 보냈어요.', [
                { text: '확인', onPress: () => navigation.goBack() },
              ]);
            } catch {
              Alert.alert('오류', '요청 전송에 실패했어요.');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← 뒤로</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>오늘 일과 수정</Text>
        {isGuardian ? (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
            <Text style={styles.addBtnText}>+ 추가</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
            <Text style={styles.addBtnText}>+ 추가</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 보호자 안내 배너 */}
      {isGuardian && (
        <View style={styles.guardianBanner}>
          <Text style={styles.guardianBannerText}>
            보호자 모드 · 수정 내용은 당사자 수락 후 반영돼요
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {schedules.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>오늘 등록된 일과가 없어요.{'\n'}+ 추가로 새 일과를 넣어보세요!</Text>
            </View>
          ) : (
            schedules.map(s => (
              <View key={s.id} style={[styles.row, s.id < 0 && styles.rowNew]}>
                <View style={styles.rowLeft}>
                  <Text style={styles.rowTime}>{formatTime(s.scheduled_time)}</Text>
                  <SchedIcon title={s.title} emoji={(s.title.match(/^\p{Extended_Pictographic}/u)?.[0]) || '📋'} size={26} />
                  <Text style={styles.rowTitle}>{stripLeadEmoji(s.title)}</Text>
                </View>
                {s.id < 0 && <View style={styles.newBadge}><Text style={styles.newBadgeText}>추가 예정</Text></View>}
                <TouchableOpacity style={styles.delBtn} onPress={() => handleDelete(s.id, s.title)}>
                  <Text style={styles.delText}>삭제</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* 보호자 요청 전송 버튼 */}
      {isGuardian && !loading && (
        <View style={styles.submitWrap}>
          <TouchableOpacity
            style={[styles.submitBtn, saving && { opacity: 0.6 }]}
            onPress={handleGuardianSubmit}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitText}>당사자에게 변경 요청 보내기</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* 추가 모달 */}
      <Modal visible={showAdd} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>새 일과 추가</Text>

            <Text style={styles.modalLabel}>일과 선택</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {PALETTE.map((p, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.paletteBtn, newTitle === p.label && { backgroundColor: p.color + '33', borderColor: p.color }]}
                    onPress={() => { setNewTitle(p.label); setNewEmoji(p.emoji); }}
                  >
                    <Text style={styles.paletteEmoji}>{p.emoji}</Text>
                    <Text style={styles.paletteLabel}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.modalLabel}>직접 입력</Text>
            <TextInput
              style={styles.input}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="일과 이름"
              placeholderTextColor="#bbb"
            />

            <Text style={[styles.modalLabel, { marginTop: 12 }]}>시작 시간</Text>
            <TextInput
              style={styles.input}
              value={newTime}
              onChangeText={setNewTime}
              placeholder="09:00"
              placeholderTextColor="#bbb"
              keyboardType="numbers-and-punctuation"
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdd(false)}>
                <Text style={styles.cancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, (!newTitle.trim() || saving) && { opacity: 0.5 }]}
                onPress={handleAdd}
                disabled={!newTitle.trim() || saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>추가하기</Text>}
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
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn:     { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.primaryBg, borderRadius: 16 },
  backText:    { fontSize: 14, color: colors.primary, fontWeight: '800' },
  headerTitle: { fontSize: 16, fontWeight: '900', color: colors.primary },
  addBtn:      { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.primary, borderRadius: 16 },
  addBtnText:  { fontSize: 13, color: '#fff', fontWeight: '800' },

  guardianBanner: {
    backgroundColor: '#FFF7ED', paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#FED7AA',
  },
  guardianBannerText: { fontSize: 11, color: '#92400E', fontWeight: '600', textAlign: 'center' },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  content: { padding: 16, gap: 10, paddingBottom: 100 },

  emptyWrap: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 22 },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.white, borderRadius: 16, padding: 16,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  rowNew: { borderWidth: 1.5, borderColor: '#FED7AA', backgroundColor: '#FFFBEB' },
  rowLeft:  { flex: 1 },
  rowTime:  { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginBottom: 4 },
  rowTitle: { fontSize: 15, fontWeight: '800', color: colors.primary },
  newBadge: { backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 },
  newBadgeText: { fontSize: 10, fontWeight: '700', color: '#92400E' },
  delBtn:   { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#FEE2E2', borderRadius: 10 },
  delText:  { fontSize: 12, fontWeight: '700', color: '#DC2626' },

  submitWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  submitBtn: {
    backgroundColor: colors.guardian ?? '#2D6A4F', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  submitText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 36,
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: colors.primary, marginBottom: 16 },
  modalLabel: { fontSize: 12, fontWeight: '700', color: '#888', marginBottom: 8 },

  paletteBtn: {
    alignItems: 'center', padding: 8, borderRadius: 12, borderWidth: 1.5,
    borderColor: 'transparent', backgroundColor: '#F4FAF7', minWidth: 60,
  },
  paletteEmoji: { fontSize: 22 },
  paletteLabel: { fontSize: 10, fontWeight: '600', color: '#555', marginTop: 3, textAlign: 'center' },

  input: {
    backgroundColor: '#F4FAF7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: colors.text, borderWidth: 1.5, borderColor: colors.border,
  },

  modalBtns:   { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn:   { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#E8F5EE', alignItems: 'center' },
  cancelText:  { fontSize: 15, fontWeight: '700', color: '#888' },
  confirmBtn:  { flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center' },
  confirmText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
