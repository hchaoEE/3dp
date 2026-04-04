'use client';

import { useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { useFpStore } from '@/store/fp-store';
import { Html } from '@react-three/drei';
import { SCALE, TIER_SPACING } from './DieLayer';
import type { ModulePlacement, DieSpec, ModuleSpec } from '@chip3d/sdk';

const MODULE_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#34495e', '#16a085', '#c0392b',
];

interface Props {
  placement: ModulePlacement;
  die: DieSpec;
  moduleSpec: ModuleSpec;
  colorIndex: number;
}

export function ModuleBlock({ placement, die, moduleSpec, colorIndex }: Props) {
  const meshRef = useRef<THREE.Mesh>(null);
  const {
    selectedModuleId, selectModule, hoveredModuleId, hoverModule,
    moveModulePosition, visibleLayers,
  } = useFpStore();

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; z: number } | null>(null);

  if (!visibleLayers.modules) return null;

  const w = placement.width * SCALE;
  const h = placement.height * SCALE;
  const blockH = 0.5;
  const x = placement.x * SCALE + w / 2;
  const y = die.tier * TIER_SPACING + 0.3;
  const z = placement.y * SCALE + h / 2;

  const isSelected = selectedModuleId === placement.moduleId;
  const isHovered = hoveredModuleId === placement.moduleId;
  const color = MODULE_COLORS[colorIndex % MODULE_COLORS.length];

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    selectModule(placement.moduleId);
  };

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setIsDragging(true);
    setDragStart({ x: e.point.x, z: e.point.z });
    (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!isDragging || !dragStart) return;
    e.stopPropagation();
    const dx = (e.point.x - dragStart.x) / SCALE;
    const dz = (e.point.z - dragStart.z) / SCALE;
    const newX = Math.max(0, Math.min(die.width - placement.width, placement.x + dx));
    const newY = Math.max(0, Math.min(die.height - placement.height, placement.y + dz));
    moveModulePosition(placement.moduleId, die.id, newX, newY);
    setDragStart({ x: e.point.x, z: e.point.z });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  return (
    <group>
      <mesh
        ref={meshRef}
        position={[x, y + blockH / 2, z]}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerOver={(e) => { e.stopPropagation(); hoverModule(placement.moduleId); }}
        onPointerOut={() => hoverModule(null)}
      >
        <boxGeometry args={[w, blockH, h]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={isSelected ? 1.0 : isHovered ? 0.85 : 0.7}
          emissive={isSelected ? '#ffffff' : '#000000'}
          emissiveIntensity={isSelected ? 0.15 : 0}
        />
      </mesh>
      {visibleLayers.labels && (isHovered || isSelected) && (
        <Html position={[x, y + blockH + 0.3, z]} center>
          <div className="bg-gray-900/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none">
            <div className="font-bold">{moduleSpec.name}</div>
            <div>Area: {moduleSpec.area.toFixed(0)}</div>
            <div>Power: {moduleSpec.power.toFixed(2)}W</div>
          </div>
        </Html>
      )}
    </group>
  );
}
