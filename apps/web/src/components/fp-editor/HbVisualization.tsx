'use client';

import { useFpStore } from '@/store/fp-store';
import { SCALE, getBondingInterfaceY } from './DieLayer';
import { Html } from '@react-three/drei';
import type { HbArray, DieSpec } from '@chip3d/sdk';

interface Props {
  hbArray: HbArray;
  dies: DieSpec[];
}

export function HbVisualization({ hbArray, dies }: Props) {
  const { selectedHbId, selectHb, visibleLayers } = useFpStore();

  if (!visibleLayers.hb) return null;

  const fromDie = dies.find((d) => d.id === hbArray.fromDie);
  const toDie = dies.find((d) => d.id === hbArray.toDie);
  if (!fromDie || !toDie) return null;

  const isSelected = selectedHbId === hbArray.id;

  const regionW = hbArray.region.width * SCALE;
  const regionH = hbArray.region.height * SCALE;
  const x = hbArray.region.x * SCALE + regionW / 2;
  const z = hbArray.region.y * SCALE + regionH / 2;
  const yBetween = getBondingInterfaceY();

  const padCount = Math.min(hbArray.channelCount, 50);
  const cols = Math.max(1, Math.ceil(Math.sqrt(padCount)));
  const rows = Math.ceil(padCount / cols);
  const spacingX = regionW / (cols + 1);
  const spacingZ = regionH / (rows + 1);

  const pads = [];
  let idx = 0;
  for (let r = 0; r < rows && idx < padCount; r++) {
    for (let c = 0; c < cols && idx < padCount; c++) {
      const px = hbArray.region.x * SCALE + spacingX * (c + 1);
      const pz = hbArray.region.y * SCALE + spacingZ * (r + 1);
      pads.push(
        <mesh key={idx} position={[px, yBetween, pz]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshStandardMaterial
            color={isSelected ? '#00ffcc' : '#00aaff'}
            transparent
            opacity={0.85}
          />
        </mesh>,
      );
      idx++;
    }
  }

  return (
    <group onClick={(e) => { e.stopPropagation(); selectHb(hbArray.id); }}>
      <mesh position={[x, yBetween, z]}>
        <boxGeometry args={[regionW, 0.05, regionH]} />
        <meshStandardMaterial
          color={isSelected ? '#00ffcc' : '#0088cc'}
          transparent
          opacity={0.25}
        />
      </mesh>
      {pads}
      {isSelected && (
        <Html position={[x, yBetween + 0.5, z]} center>
          <div className="bg-cyan-900/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none">
            <div className="font-bold">HB: {hbArray.id}</div>
            <div>Channels: {hbArray.channelCount} | Pitch: {hbArray.pitch}µm</div>
            <div>F2F bonding: {hbArray.fromDie} ↔ {hbArray.toDie}</div>
          </div>
        </Html>
      )}
    </group>
  );
}
