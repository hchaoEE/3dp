'use client';

import { useRef } from 'react';
import * as THREE from 'three';
import { useFpStore } from '@/store/fp-store';
import { Html } from '@react-three/drei';
import type { DefData, DefMacro, DieSpec } from '@chip3d/sdk';
import { SCALE, getModuleY } from './DieLayer';

const MACRO_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#34495e', '#16a085', '#c0392b',
];

interface DefLayerProps {
  defData: DefData;
  die: DieSpec;
  dieIndex: number;
}

export function DefLayer({ defData, die, dieIndex }: DefLayerProps) {
  const { visibleLayers, selectedModuleId, selectModule, hoveredModuleId, hoverModule } = useFpStore();

  if (!visibleLayers.dies) return null;

  const dieWidth = defData.dieArea.width * SCALE;
  const dieHeight = defData.dieArea.height * SCALE;
  const dieY = getDieY(die);

  return (
    <group>
      {/* Die outline from DEF */}
      {visibleLayers.dies && (
        <mesh position={[dieWidth / 2, dieY, dieHeight / 2]}>
          <boxGeometry args={[dieWidth, 0.05, dieHeight]} />
          <meshStandardMaterial
            color="#4a90d9"
            transparent
            opacity={0.15}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Die border line */}
      {visibleLayers.dies && (
        <lineSegments position={[dieWidth / 2, dieY, dieHeight / 2]}>
          <edgesGeometry args={[new THREE.BoxGeometry(dieWidth, 0.05, dieHeight)]} />
          <lineBasicMaterial color="#4a90d9" linewidth={2} />
        </lineSegments>
      )}

      {/* Macros from DEF */}
      {visibleLayers.modules && defData.macros.map((macro, idx) => (
        <DefMacroBlock
          key={macro.id}
          macro={macro}
          die={die}
          colorIndex={idx}
          isSelected={selectedModuleId === macro.id}
          isHovered={hoveredModuleId === macro.id}
          onSelect={() => selectModule(macro.id)}
          onHover={(id) => hoverModule(id)}
        />
      ))}

      {/* Die label */}
      {visibleLayers.labels && (
        <Html position={[dieWidth + 0.5, dieY, dieHeight / 2]} center>
          <div className="text-[10px] text-gray-400 whitespace-nowrap pointer-events-none">
            {die.name} (DEF)
            <br />
            {defData.dieArea.width.toFixed(0)} x {defData.dieArea.height.toFixed(0)} µm
          </div>
        </Html>
      )}
    </group>
  );
}

interface DefMacroBlockProps {
  macro: DefMacro;
  die: DieSpec;
  colorIndex: number;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}

function DefMacroBlock({
  macro,
  die,
  colorIndex,
  isSelected,
  isHovered,
  onSelect,
  onHover,
}: DefMacroBlockProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const w = macro.width * SCALE;
  const h = macro.height * SCALE;
  const blockH = 0.3;
  const x = macro.x * SCALE + w / 2;
  const y = getModuleY(die, blockH);
  const z = macro.y * SCALE + h / 2;

  const color = MACRO_COLORS[colorIndex % MACRO_COLORS.length];
  const labelY = die.faceDirection === 'down' ? y - blockH / 2 - 0.2 : y + blockH / 2 + 0.2;

  return (
    <group>
      <mesh
        ref={meshRef}
        position={[x, y, z]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(macro.id);
        }}
        onPointerOut={() => onHover(null)}
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

      {/* Macro border */}
      <lineSegments position={[x, y, z]}>
        <edgesGeometry args={[new THREE.BoxGeometry(w, blockH, h)]} />
        <lineBasicMaterial color={color} linewidth={1} />
      </lineSegments>

      {/* Label */}
      {(isHovered || isSelected) && (
        <Html position={[x, labelY, z]} center>
          <div className="bg-gray-900/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none">
            <div className="font-bold">{macro.name}</div>
            <div>{macro.width.toFixed(1)} x {macro.height.toFixed(1)} µm</div>
            <div>Pos: ({macro.x.toFixed(0)}, {macro.y.toFixed(0)})</div>
          </div>
        </Html>
      )}
    </group>
  );
}

/** Compute the Y position of a die's center */
function getDieY(die: DieSpec): number {
  const TIER_SPACING = 2.0;
  const DIE_THICKNESS = 0.3;
  const BONDING_GAP = 0.15;

  if (die.faceDirection === 'down') {
    return BONDING_GAP + DIE_THICKNESS / 2 + die.tier * TIER_SPACING;
  }
  return die.tier * TIER_SPACING;
}

export default DefLayer;
