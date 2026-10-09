import { useRef, useState } from 'react';
import { Alert, Button, FlatList, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

type Item = {
  data: string;
  scannedAt: string;
};

// TODO: analyze the decoded DataMatrix content.
function analyzeCode(data: string) {}

function toCsv(items: Item[]) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = items.map((item) => [item.data, item.scannedAt].map(escape).join(','));
  return ['data,scannedAt', ...rows].join('\n');
}

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [items, setItems] = useState<Item[]>([]);
  const lastScanned = useRef<string | null>(null);

  if (!permission) return <View />;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text>Camera access is needed to scan codes.</Text>
        <Button title="Grant permission" onPress={requestPermission} />
      </View>
    );
  }

  // The camera reports the same code many times per second, so skip repeats.
  function onScanned({ data }: BarcodeScanningResult) {
    if (data === lastScanned.current) return;
    lastScanned.current = data;
    analyzeCode(data);
    setItems((prev) => [...prev, { data, scannedAt: new Date().toISOString() }]);
  }

  async function exportCsv() {
    const file = new File(Paths.document, `scans-${Date.now()}.csv`);
    file.write(toCsv(items));
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' });
  }

  function clear() {
    Alert.alert('Clear list?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          setItems([]);
          lastScanned.current = null;
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.camera}>
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: ['datamatrix'] }}
          onBarcodeScanned={onScanned}
        />
        {/* One view with a huge semi-transparent border dims everything around a
            clear square; separate dim views would leave visible seams between them. */}
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.dim}>
            <View style={styles.target} />
          </View>
        </View>
      </View>
      <View style={styles.buttons}>
        <Button title="Export CSV" onPress={exportCsv} disabled={items.length === 0} />
        <Button title="Clear" onPress={clear} disabled={items.length === 0} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(_, index) => String(index)}
        renderItem={({ item }) => <Text style={styles.item}>{item.data}</Text>}
        ListEmptyComponent={<Text style={styles.item}>No codes scanned yet.</Text>}
      />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 40, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  camera: { height: 300 },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dim: {
    width: 200 + 2 * 1000,
    height: 200 + 2 * 1000,
    borderWidth: 1000,
    borderColor: 'rgba(0, 0, 0, 0.5)',
  },
  target: { flex: 1, borderWidth: 2, borderColor: '#fff' },
  buttons: { flexDirection: 'row', justifyContent: 'space-around', padding: 8 },
  item: { padding: 12, borderBottomWidth: 1, borderColor: '#eee' },
});
