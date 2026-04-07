'use client';

import { useFpStore } from '@/store/fp-store';
import { SCALE, TIER_SPACING } from './DieLayer';
import { Html } from '@react-three/drei';
import type { Violation, DieSpec } from '@chip3d/sdk';

interface Props {
  violations: Violation[];
  dies: DieSpec[];
}

export function ViolationOverlay({ violations, dies }: Props) {
  const { visibleLayers } = useFpStore();

  if (!visibleLayers.violations) return null;

  return (
    <group>
      {violations.map((v, i) => (
        <ViolationMarker key={i} violation={v} dies={dies} />
      ))}
    </group>
  );
}

function ViolationMarker({ violation, dies }: { violation: Violation; dies: DieSpec[] }) {
  const die = dies.find((d) => d.id === violation.dieId);
  if (!violation.location || !die) return null;

  const loc = violation.location;
  const x = loc.x * SCALE + (loc.width * SCALE) / 2;
  const z = loc.y * SCALE + (loc.height * SCALE) / 2;
  const y = die.tier * TIER_SPACING + 1.0;

  const color = violation.severity === 'error' ? '#ff0000' : '#ffaa00';

  return (
    <group position={[x, y, z]}>
      <mesh>
        <boxGeometry args={[loc.width * SCALE, 0.1, loc.height * SCALE]} />
        <meshStandardMaterial color={color} transparent opacity={0.4} />
      </mesh>
      <Html center>
        <div
          className="text-xs px-1 rounded pointer-events-none"
          style={{ backgroundColor: color, color: '#fff' }}
        >
          {violation.type}
        </div>
      </Html>
    </group>
  );
}
