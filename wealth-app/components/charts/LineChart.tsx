// components/charts/LineChart.tsx — SVG line chart using react-native-svg
import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Line, Text as SvgText, Rect } from 'react-native-svg';
import { colors, spacing } from '../../lib/theme';

interface Dataset {
  values: number[];
  color: string;
  label: string;
  dashed?: boolean;
  fillOpacity?: number;
}

interface LineChartProps {
  datasets: Dataset[];
  labels: string[];
  height?: number;
  yFormat?: (v: number) => string;
  showGrid?: boolean;
}

export default function LineChart({ datasets, labels, height = 200, yFormat, showGrid = true }: LineChartProps) {
  const width = Dimensions.get('window').width - 64;
  const paddingLeft = 48;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 24;
  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  const allValues = datasets.flatMap(d => d.values).filter(v => v != null && !isNaN(v));
  if (!allValues.length) return null;
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 1;

  const fmt = yFormat || ((v: number) => {
    if (Math.abs(v) >= 1_000_000) return `£${(v / 1e6).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `£${(v / 1e3).toFixed(0)}K`;
    return `£${v.toFixed(0)}`;
  });

  const toX = (i: number) => paddingLeft + (i / Math.max(labels.length - 1, 1)) * chartW;
  const toY = (v: number) => paddingTop + chartH - ((v - minVal) / range) * chartH;

  const buildPath = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ');

  const buildAreaPath = (values: number[]) => {
    const line = buildPath(values);
    const lastI = values.length - 1;
    return `${line} L ${toX(lastI).toFixed(1)} ${toY(minVal).toFixed(1)} L ${toX(0).toFixed(1)} ${toY(minVal).toFixed(1)} Z`;
  };

  const gridLines = 4;
  const gridStep = range / gridLines;

  return (
    <View>
      <Svg width={width} height={height}>
        {showGrid && Array.from({ length: gridLines + 1 }).map((_, i) => {
          const val = minVal + gridStep * i;
          const y = toY(val);
          return (
            <React.Fragment key={i}>
              <Line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke={colors.border} strokeWidth={0.5} />
              <SvgText x={paddingLeft - 4} y={y + 3} fontSize={9} fill={colors.text3} textAnchor="end">
                {fmt(val)}
              </SvgText>
            </React.Fragment>
          );
        })}
        {datasets.map((ds, di) => (
          <React.Fragment key={di}>
            {ds.fillOpacity && (
              <Path d={buildAreaPath(ds.values)} fill={ds.color} opacity={ds.fillOpacity} />
            )}
            <Path
              d={buildPath(ds.values)}
              fill="none"
              stroke={ds.color}
              strokeWidth={2}
              strokeDasharray={ds.dashed ? '6,4' : undefined}
            />
          </React.Fragment>
        ))}
        {labels.filter((_, i) => i % Math.ceil(labels.length / 6) === 0 || i === labels.length - 1).map((l, i, arr) => {
          const origIndex = labels.indexOf(l);
          return (
            <SvgText
              key={i}
              x={toX(origIndex)}
              y={height - 4}
              fontSize={9}
              fill={colors.text3}
              textAnchor="middle"
            >
              {l}
            </SvgText>
          );
        })}
      </Svg>
      {datasets.length > 1 && (
        <View style={styles.legend}>
          {datasets.map((ds, i) => (
            <View key={i} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: ds.color }]} />
              <Text style={styles.legendText}>{ds.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: colors.text2 },
});
