'use client';

import { useRef } from 'react';
import * as THREE from 'three';
import { useFpStore } from '@/store/fp-store';
import { Html } from '@react-three/drei';
import type { DieSpec } from '@chip3d/sdk';

const DIE_COLORS = ['#4a90d9', '#50c878', '#e6a832', '#d94a4a', '#9b59b6'];
const TIER_SPACING = 2.0;
const SCALE = 0.01;
const DIE_THICKNESS = 0.3;
const BONDING_GAP = 0.15;

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
  const y = getDieY(die);
  const color = DIE_COLORS[index % DIE_COLORS.length];
  const isHovered = hoveredDieId === die.id;

  return (
    <group>
      <mesh
        ref={meshRef}
        position={[w / 2, y, h / 2]}
        onPointerOver={(e) => { e.stopPropagation(); hoverDie(die.id); }}
        onPointerOut={() => hoverDie(null)}
      >
        <boxGeometry args={[w, DIE_THICKNESS, h]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={isHovered ? 0.5 : 0.25}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Face direction indicator */}
      {visibleLayers.labels && (
        <Html position={[w + 0.3, y, h / 2]} center>
          <div className="text-[10px] text-gray-400 whitespace-nowrap pointer-events-none">
            {die.name} {die.faceDirection === 'down' ? '(flipped ↓)' : '(↑)'}
          </div>
        </Html>
      )}
      {/* Bonding interface plane (between F2F dies) */}
      {die.tier === 0 && (
        <mesh position={[w / 2, getBondingInterfaceY(), h / 2]}>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial
            color="#ffcc00"
            transparent
            opacity={0.08}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}

/** Compute the Y position of a die's center */
export function getDieY(die: DieSpec): number {
  if (die.faceDirection === 'down') {
    return BONDING_GAP + DIE_THICKNESS / 2 + die.tier * TIER_SPACING;
  }
  return die.tier * TIER_SPACING;
}

/** Y position of the bonding interface (between the two active faces) */
export function getBondingInterfaceY(): number {
  return BONDING_GAP / 2 + DIE_THICKNESS / 2;
}

/**
 * Compute Y position for modules on a die.
 * F2F: bottom die modules face up (above die), top die modules face down (below die surface).
 */
export function getModuleY(die: DieSpec, blockH: number): number {
  const dieY = getDieY(die);
  if (die.faceDirection === 'down') {
    return dieY - DIE_THICKNESS / 2 - blockH / 2;
  }
  return dieY + DIE_THICKNESS / 2 + blockH / 2;
}

export { SCALE, TIER_SPACING, DIE_THICKNESS, BONDING_GAP };
