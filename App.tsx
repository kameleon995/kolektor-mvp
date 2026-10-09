import { useRef, useState } from 'react';
import { Alert, Button, FlatList, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Properties encoded in the item's DataMatrix code.
type Item = {
  materialIndex: string;
  series: string;
  manufacturer: string;
  productionDate: string;
  serialNumber: string;
  netMass: string;
};

// GS1 application identifiers used by the label generator.
const AI_FIELDS: Record<string, keyof Item> = {
  '241': 'materialIndex',
  '10': 'series',
  '251': 'manufacturer',
  '11': 'productionDate', // yymmdd
  '21': 'serialNumber', // series/scale/number
  '96': 'netMass',
};

// Parses a GS1 DataMatrix like "(241)ABC123<GS>(10)S12345<GS>(251)Inzynier_SA<GS>
// (11)261009(21)S12345/1/001<GS>(96)123.4". Each value runs until the next GS
// (after variable-length values) or the next bracketed identifier.
function analyzeCode(data: string): Item {
  const fields: Item = {
    materialIndex: '',
    series: '',
    manufacturer: '',
    productionDate: '',
    serialNumber: '',
    netMass: '',
  };
  for (const [, ai, value] of data.matchAll(/\((\d+)\)([^(\x1d]*)/g)) {
    const field = AI_FIELDS[ai];
    if (field) fields[field] = value;
  }

  const date = fields.productionDate;
  if (/^\d{6}$/.test(date)) {
    fields.productionDate = `20${date.slice(0, 2)}-${date.slice(2, 4)}-${date.slice(4, 6)}`;
  }

  return fields;
}

const CSV_COLUMNS: (keyof Item)[] = [
  'serialNumber',
  'materialIndex',
  'series',
  'manufacturer',
  'productionDate',
  'netMass',
];

function toCsv(items: Item[]) {
  // Quote only values that would otherwise break the CSV.
  const escape = (value: string) =>
    /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const rows = items.map((item, index) =>
    [String(index + 1), ...CSV_COLUMNS.map((column) => escape(item[column]))].join(';'),
  );
  return [['no', ...CSV_COLUMNS].join(';'), ...rows].join('\n');
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
    const item = analyzeCode(data);
    setItems((prev) => [...prev, item]);
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
        renderItem={({ item }) => (
          <Text style={styles.item}>
            {`${item.materialIndex} · ${item.serialNumber} · ${item.netMass}`}
          </Text>
        )}
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
