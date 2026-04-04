'use client';

import { useRef } from 'react';
import * as THREE from 'three';
import { useFpStore } from '@/store/fp-store';
import type { DieSpec } from '@chip3d/sdk';

const DIE_COLORS = ['#4a90d9', '#50c878', '#e6a832', '#d94a4a', '#9b59b6'];
const TIER_SPACING = 1.5;
const SCALE = 0.01;

interface Props {
  die: DieSpec;
  index: number;
}

export function DieLayer({ die, index }: Props) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { hoveredDieId, hoverDie, visibleLayers } = useFpStore();

  if (!visibleLayers.dies) return null;

  const w = die.width * SCALE;
  const h = die.height * SCALE;
  const d = 0.3;
  const y = die.tier * TIER_SPACING;
  const color = DIE_COLORS[index % DIE_COLORS.length];
  const isHovered = hoveredDieId === die.id;

  return (
    <mesh
      ref={meshRef}
      position={[w / 2, y, h / 2]}
      onPointerOver={(e) => { e.stopPropagation(); hoverDie(die.id); }}
      onPointerOut={() => hoverDie(null)}
    >
      <boxGeometry args={[w, d, h]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={isHovered ? 0.5 : 0.25}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export { SCALE, TIER_SPACING };
