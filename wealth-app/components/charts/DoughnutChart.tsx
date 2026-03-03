// components/charts/DoughnutChart.tsx — SVG doughnut chart using react-native-svg
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, spacing } from '../../lib/theme';

interface Segment {
  value: number;
  color: string;
  label: string;
}

interface DoughnutChartProps {
  segments: Segment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string;
  centerColor?: string;
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx: number, cy: number, r: number, degrees: number) {
  const rad = ((degrees - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export default function DoughnutChart({
  segments, size = 180, strokeWidth = 24, centerLabel, centerValue, centerColor,
}: DoughnutChartProps) {
  const total = segments.reduce((s, seg) => s + Math.max(seg.value, 0), 0);
  if (total <= 0) return null;

  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;

  let currentAngle = 0;
  const arcs = segments
    .filter(s => s.value > 0)
    .map(seg => {
      const sweep = (seg.value / total) * 359.99;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sweep;
      currentAngle = endAngle;
      return { ...seg, startAngle, endAngle };
    });

  return (
    <View style={styles.container}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {arcs.map((arc, i) => (
            <Path
              key={i}
              d={describeArc(cx, cy, r, arc.startAngle, arc.endAngle)}
              fill="none"
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          ))}
        </Svg>
        {(centerLabel || centerValue) && (
          <View style={[styles.center, { width: size, height: size }]}>
            {centerValue && (
              <Text style={[styles.centerValue, centerColor ? { color: centerColor } : {}]}>
                {centerValue}
              </Text>
            )}
            {centerLabel && <Text style={styles.centerLabel}>{centerLabel}</Text>}
          </View>
        )}
      </View>
      <View style={styles.legend}>
        {segments.filter(s => s.value > 0).map((seg, i) => (
          <View key={i} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: seg.color }]} />
            <Text style={styles.legendText}>{seg.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.md },
  center: { position: 'absolute', justifyContent: 'center', alignItems: 'center' },
  centerValue: { fontSize: 22, fontWeight: '700', color: colors.text },
  centerLabel: { fontSize: 10, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: colors.text2 },
});
