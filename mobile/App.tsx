import React, { useCallback, useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator, Alert, FlatList, Image, SafeAreaView, StyleSheet, Text,
  Platform, TextInput, TouchableOpacity, View,
} from 'react-native';

// Browser -> localhost. Android emulator -> host machine. For a physical phone use your PC's LAN IP.
const API = Platform.OS === 'web' ? 'http://localhost:3000' : 'http://10.0.2.2:3000';

// Alert.alert does nothing on web, so fall back to window.alert there.
const alertMsg = (title: string, msg?: string) =>
  Platform.OS === 'web' ? window.alert(msg ? `${title}: ${msg}` : title) : Alert.alert(title, msg);

type Loan = { id: number; friendName: string; amount: number; dueDate: string; repaidAt: string | null; receiptPath: string | null };
type Summary = { totalLent: number; totalRepaid: number; outstanding: number; overdue: number };

async function api(path: string, token: string | null, method = 'GET', body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Request failed, check your input');
  return data;
}

async function uploadReceipt(token: string, loanId: number, a: ImagePicker.ImagePickerAsset) {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(a.uri)).blob();
    form.append('file', blob, 'receipt.jpg');
  } else {
    form.append('file', { uri: a.uri, name: 'receipt.jpg', type: a.mimeType ?? 'image/jpeg' } as any);
  }
  // Don't set Content-Type manually: fetch adds the multipart boundary.
  const res = await fetch(`${API}/loans/${loanId}/receipt`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  if (!res.ok) throw new Error('Receipt upload failed');
}

function Thumb({ id, token }: { id: number; token: string }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let url: string | undefined;
    fetch(`${API}/loans/${id}/receipt`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((b) => { url = URL.createObjectURL(b); setUri(url); })
      .catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [id, token]);
  if (Platform.OS === 'web') return uri ? <Image source={{ uri }} style={s.thumb} /> : <View style={s.thumb} />;
  return <Image source={{ uri: `${API}/loans/${id}/receipt`, headers: { Authorization: `Bearer ${token}` } }} style={s.thumb} />;
}

function Login({ onToken }: { onToken: (t: string) => void }) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (!sent) {
        await api('/auth/request-otp', null, 'POST', { phone });
        setSent(true);
      } else {
        const { token } = await api('/auth/verify-otp', null, 'POST', { phone, otp });
        onToken(token);
      }
    } catch (e: any) {
      alertMsg('Error', e.message);
    }
    setBusy(false);
  };

  return (
    <View style={s.center}>
      <Text style={s.title}>MiniLedger</Text>
      <TextInput style={s.input} placeholder="Phone (10+ digits)" keyboardType="phone-pad"
        value={phone} onChangeText={setPhone} editable={!sent} />
      {sent && (
        <TextInput style={s.input} placeholder="6-digit OTP (see server log)" keyboardType="number-pad"
          maxLength={6} value={otp} onChangeText={setOtp} />
      )}
      <TouchableOpacity style={s.btn} disabled={busy} onPress={submit}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{sent ? 'Verify OTP' : 'Send OTP'}</Text>}
      </TouchableOpacity>
    </View>
  );
}

function AddForm({ token, onAdded }: { token: string; onAdded: () => void }) {
  const [friendName, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDue] = useState('');
  const [receipt, setReceipt] = useState<ImagePicker.ImagePickerAsset | null>(null);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return alertMsg('Permission needed', 'Allow photo access to attach a receipt.');
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
    if (!r.canceled) setReceipt(r.assets[0]);
  };

  const submit = async () => {
    let loan: Loan;
    try {
      loan = await api('/loans', token, 'POST', { friendName, amount: Number(amount), dueDate });
    } catch (e: any) {
      return alertMsg('Error', e.message);
    }
    if (receipt) {
      try { await uploadReceipt(token, loan.id, receipt); }
      catch { alertMsg('Entry saved', 'But the receipt could not be uploaded.'); }
    }
    setName(''); setAmount(''); setDue(''); setReceipt(null);
    onAdded();
  };

  return (
    <View style={s.form}>
      <TextInput style={s.input} placeholder="Friend name" value={friendName} onChangeText={setName} />
      <TextInput style={s.input} placeholder="Amount (₹)" keyboardType="number-pad" value={amount} onChangeText={setAmount} />
      <TextInput style={s.input} placeholder="Due date (YYYY-MM-DD)" value={dueDate} onChangeText={setDue} />
      <TouchableOpacity style={s.outlineBtn} onPress={pick}>
        <Text style={s.outlineText}>{receipt ? 'Receipt attached ✓ (tap to change)' : 'Attach receipt photo (optional)'}</Text>
      </TouchableOpacity>
      {receipt && <Image source={{ uri: receipt.uri }} style={s.preview} />}
      <TouchableOpacity style={s.btn} onPress={submit}><Text style={s.btnText}>Add entry</Text></TouchableOpacity>
    </View>
  );
}

const Stat = ({ label, value, danger }: { label: string; value: number; danger?: boolean }) => (
  <View style={{ alignItems: 'center' }}>
    <Text style={[s.statVal, danger && { color: '#c62828' }]}>₹{value}</Text>
    <Text style={s.sub}>{label}</Text>
  </View>
);

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const [l, sm] = await Promise.all([api('/loans', token), api('/summary', token)]);
      setLoans(l); setSummary(sm);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (!token) return <SafeAreaView style={s.screen}><Login onToken={setToken} /></SafeAreaView>;

  const repay = async (id: number) => {
    try { await api(`/loans/${id}/repay`, token, 'POST'); load(); }
    catch (e: any) { alertMsg('Error', e.message); }
  };

  return (
    <SafeAreaView style={s.screen}>
      <FlatList
        data={loans}
        keyExtractor={(l) => String(l.id)}
        refreshing={loading}
        onRefresh={load}
        ListHeaderComponent={
          <View>
            {summary && (
              <View style={s.card}>
                <Stat label="Lent" value={summary.totalLent} />
                <Stat label="Repaid" value={summary.totalRepaid} />
                <Stat label="Overdue" value={summary.overdue} danger />
              </View>
            )}
            {error && <Text style={s.error}>{error} (pull down to retry)</Text>}
            <AddForm token={token} onAdded={load} />
          </View>
        }
        ListEmptyComponent={!loading ? <Text style={s.empty}>No entries yet</Text> : null}
        renderItem={({ item }) => {
          const overdue = !item.repaidAt && new Date(item.dueDate) < new Date();
          return (
            <View style={[s.row, overdue && s.rowOverdue]}>
              {item.receiptPath && <Thumb id={item.id} token={token} />}
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.friendName} · ₹{item.amount}</Text>
                <Text style={s.sub}>
                  {item.repaidAt ? 'Repaid' : `Due ${item.dueDate.slice(0, 10)}${overdue ? ' · OVERDUE' : ''}`}
                </Text>
              </View>
              {!item.repaidAt && (
                <TouchableOpacity style={s.smallBtn} onPress={() => repay(item.id)}>
                  <Text style={s.btnText}>Repaid</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: 30 },
  center: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 24, textAlign: 'center' },
  input: { backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#ddd' },
  btn: { backgroundColor: '#2e7d32', borderRadius: 8, padding: 14, alignItems: 'center' },
  smallBtn: { backgroundColor: '#2e7d32', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12 },
  outlineBtn: { borderWidth: 1, borderColor: '#2e7d32', borderRadius: 8, padding: 12, alignItems: 'center', marginBottom: 10 },
  outlineText: { color: '#2e7d32', fontWeight: '600' },
  preview: { width: 80, height: 80, borderRadius: 8, marginBottom: 10 },
  thumb: { width: 44, height: 44, borderRadius: 6, marginRight: 10, backgroundColor: '#eee' },
  btnText: { color: '#fff', fontWeight: '600' },
  card: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#fff', margin: 12, padding: 16, borderRadius: 12, elevation: 2 },
  statVal: { fontSize: 20, fontWeight: '700' },
  form: { marginHorizontal: 12, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 8, padding: 12, borderRadius: 8 },
  rowOverdue: { backgroundColor: '#ffebee', borderLeftWidth: 4, borderLeftColor: '#c62828' },
  name: { fontSize: 16, fontWeight: '600' },
  sub: { color: '#666', marginTop: 2 },
  error: { color: '#c62828', marginHorizontal: 12, marginBottom: 8 },
  empty: { textAlign: 'center', color: '#888', marginTop: 24 },
});
