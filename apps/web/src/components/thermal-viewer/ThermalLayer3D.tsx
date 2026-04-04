'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { useThermalStore } from '@/store/thermal-store';
import { temperatureToColor } from './colormap';
import type { ThermalLayerResult, DieSpec } from '@chip3d/sdk';

const TIER_SPACING = 1.5;
const SCALE = 0.01;

interface Props {
  layer: ThermalLayerResult;
  die: DieSpec;
}

export function ThermalLayer3D({ layer, die }: Props) {
  const { colorRange, visibleLayers } = useThermalStore();

  const geometry = useMemo(() => {
    const { gridNx, gridNy, temperatures } = layer;
    const cellW = die.width * SCALE / gridNx;
    const cellH = die.height * SCALE / gridNy;

    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    for (let iy = 0; iy < gridNy; iy++) {
      for (let ix = 0; ix < gridNx; ix++) {
        const temp = temperatures[iy * gridNx + ix];
        const [r, g, b] = temperatureToColor(temp, colorRange.min, colorRange.max);

        const px = ix * cellW;
        const pz = iy * cellH;

        const baseIdx = positions.length / 3;
        positions.push(px, 0, pz);
        positions.push(px + cellW, 0, pz);
        positions.push(px + cellW, 0, pz + cellH);
        positions.push(px, 0, pz + cellH);

        colors.push(r, g, b, r, g, b, r, g, b, r, g, b);

        indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
        indices.push(baseIdx, baseIdx + 2, baseIdx + 3);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }, [layer, die, colorRange]);

  if (!visibleLayers.temperature) return null;

  const y = die.tier * TIER_SPACING + 0.35;

  return (
    <mesh position={[0, y, 0]} geometry={geometry}>
      <meshBasicMaterial vertexColors side={THREE.DoubleSide} transparent opacity={0.85} />
    </mesh>
  );
}
