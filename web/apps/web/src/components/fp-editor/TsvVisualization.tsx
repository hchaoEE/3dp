'use client';

import { useFpStore } from '@/store/fp-store';
import { SCALE, getDieY, DIE_THICKNESS } from './DieLayer';
import { Html } from '@react-three/drei';
import type { TsvArray, DieSpec } from '@chip3d/sdk';

interface Props {
  tsvArray: TsvArray;
  dies: DieSpec[];
}

export function TsvVisualization({ tsvArray, dies }: Props) {
  const { selectedTsvId, selectTsv, visibleLayers } = useFpStore();

  if (!visibleLayers.tsv) return null;

  const fromDie = dies.find((d) => d.id === tsvArray.fromDie);
  const toDie = dies.find((d) => d.id === tsvArray.toDie);
  if (!fromDie || !toDie) return null;

  const isSelected = selectedTsvId === tsvArray.id;

  const x = tsvArray.region.x * SCALE + (tsvArray.region.width * SCALE) / 2;
  const z = tsvArray.region.y * SCALE + (tsvArray.region.height * SCALE) / 2;

  const fromY = getDieY(fromDie);
  const toY = getDieY(toDie);
  const yBottom = Math.min(fromY, toY) - DIE_THICKNESS / 2;
  const yTop = Math.max(fromY, toY) + DIE_THICKNESS / 2;
  const height = yTop - yBottom;
  const yCenter = (yTop + yBottom) / 2;

  const pillarCount = Math.min(tsvArray.count, 20);
  const cols = Math.max(1, Math.ceil(Math.sqrt(pillarCount)));
  const rows = Math.ceil(pillarCount / cols);
  const spacingX = tsvArray.region.width * SCALE / (cols + 1);
  const spacingZ = tsvArray.region.height * SCALE / (rows + 1);

  const pillars = [];
  let idx = 0;
  for (let r = 0; r < rows && idx < pillarCount; r++) {
    for (let c = 0; c < cols && idx < pillarCount; c++) {
      const px = tsvArray.region.x * SCALE + spacingX * (c + 1);
      const pz = tsvArray.region.y * SCALE + spacingZ * (r + 1);
      pillars.push(
        <mesh key={idx} position={[px, yCenter, pz]}>
          <cylinderGeometry args={[0.03, 0.03, height, 6]} />
          <meshStandardMaterial
            color={isSelected ? '#ffcc00' : '#ff6600'}
            transparent
            opacity={0.8}
          />
        </mesh>,
      );
      idx++;
    }
  }

  return (
    <group onClick={(e) => { e.stopPropagation(); selectTsv(tsvArray.id); }}>
      {pillars}
      {isSelected && (
        <Html position={[x, yTop + 0.3, z]} center>
          <div className="bg-orange-900/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none">
            <div className="font-bold">TSV: {tsvArray.id}</div>
            <div>Count: {tsvArray.count}</div>
            <div>{tsvArray.fromDie} ↔ {tsvArray.toDie}</div>
          </div>
        </Html>
      )}
    </group>
  );
}
