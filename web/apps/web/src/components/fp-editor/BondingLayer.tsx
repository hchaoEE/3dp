'use client';

import { useRef } from 'react';
import * as THREE from 'three';
import { useFpStore } from '@/store/fp-store';
import { Html } from '@react-three/drei';
import type { DefData, DefPin, DieSpec } from '@chip3d/sdk';
import { SCALE, getBondingInterfaceY } from './DieLayer';

interface BondingLayerProps {
  defData: DefData;
  die: DieSpec;
}

export function BondingLayer({ defData, die }: BondingLayerProps) {
  const { visibleLayers, selectedModuleId, selectModule, hoveredModuleId, hoverModule } = useFpStore();

  if (!visibleLayers.hb) return null;

  const bondingY = getBondingInterfaceY();

  return (
    <group>
      {/* Bonding pins from DEF */}
      {defData.bondingPins.map((pin, idx) => (
        <BondingPin
          key={pin.id}
          pin={pin}
          die={die}
          index={idx}
          isSelected={selectedModuleId === pin.id}
          isHovered={hoveredModuleId === pin.id}
          onSelect={() => selectModule(pin.id)}
          onHover={(id) => hoverModule(id)}
        />
      ))}

      {/* Bonding layer info */}
      {visibleLayers.labels && defData.bondingPins.length > 0 && (
        <Html position={[0, bondingY + 0.5, 0]} center>
          <div className="bg-gray-900/80 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none">
            Bonding Layer: {defData.bondingPins.length} pins
          </div>
        </Html>
      )}
    </group>
  );
}

interface BondingPinProps {
  pin: DefPin;
  die: DieSpec;
  index: number;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}

function BondingPin({
  pin,
  die,
  index,
  isSelected,
  isHovered,
  onSelect,
  onHover,
}: BondingPinProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const w = pin.width * SCALE;
  const h = pin.height * SCALE;
  const pinH = 0.05;
  const x = pin.x * SCALE + w / 2;
  const z = pin.y * SCALE + h / 2;
  const y = getBondingInterfaceY();

  // Color based on index
  const hue = (index * 137.5) % 360;
  const color = `hsl(${hue}, 70%, 50%)`;

  return (
    <group>
      {/* Pin rectangle */}
      <mesh
        ref={meshRef}
        position={[x, y, z]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(pin.id);
        }}
        onPointerOut={() => onHover(null)}
      >
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={isSelected ? 0.9 : isHovered ? 0.7 : 0.5}
          side={THREE.DoubleSide}
          emissive={isSelected ? '#ffffff' : '#000000'}
          emissiveIntensity={isSelected ? 0.3 : 0}
        />
      </mesh>

      {/* Pin border */}
      <lineSegments position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(w, h)]} />
        <lineBasicMaterial color={color} linewidth={1} />
      </lineSegments>

      {/* Pin label */}
      {(isHovered || isSelected) && (
        <Html position={[x, y + 0.2, z]} center>
          <div className="bg-gray-900/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none">
            <div className="font-bold">{pin.name}</div>
            <div>Layer: {pin.layer}</div>
            <div>Size: {pin.width.toFixed(1)} x {pin.height.toFixed(1)} µm</div>
            <div>Pos: ({pin.x.toFixed(0)}, {pin.y.toFixed(0)})</div>
          </div>
        </Html>
      )}
    </group>
  );
}

export default BondingLayer;
