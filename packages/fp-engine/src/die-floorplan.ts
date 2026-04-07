import type {
  ModuleSpec,
  DieSpec,
  ModuleAssignment,
  FloorplanResult,
  DieFloorplan,
  ModulePlacement,
} from '@chip3d/sdk';

/**
 * Simple row-based floorplanner: packs modules left-to-right, top-to-bottom
 * within each die. Sorted by area (largest first) for better packing.
 */
export function floorplanDie(
  assignments: ModuleAssignment[],
  modules: ModuleSpec[],
  dies: DieSpec[],
): FloorplanResult {
  const moduleMap = new Map(modules.map((m) => [m.id, m]));
  const dieFloorplans: DieFloorplan[] = [];

  for (const die of dies) {
    const dieModules = assignments
      .filter((a) => a.dieId === die.id)
      .map((a) => moduleMap.get(a.moduleId))
      .filter((m): m is ModuleSpec => !!m)
      .sort((a, b) => b.area - a.area);

    const placements = packModules(dieModules, die);
    dieFloorplans.push({ dieId: die.id, modules: placements });
  }

  return { dies: dieFloorplans };
}

function packModules(modules: ModuleSpec[], die: DieSpec): ModulePlacement[] {
  const placements: ModulePlacement[] = [];
  let curX = 0;
  let curY = 0;
  let rowHeight = 0;

  for (const mod of modules) {
    let w = mod.width;
    let h = mod.height;

    if (curX + w > die.width) {
      curX = 0;
      curY += rowHeight;
      rowHeight = 0;
    }

    if (curX + w > die.width && w > die.width) {
      const oldW = w;
      w = die.width;
      h = Math.ceil(mod.area / w);
    }

    if (curY + h > die.height) {
      curY = die.height - h;
      if (curY < 0) curY = 0;
    }

    placements.push({
      moduleId: mod.id,
      x: curX,
      y: curY,
      width: w,
      height: h,
      orientation: 'N',
    });

    curX += w;
    rowHeight = Math.max(rowHeight, h);
  }

  return placements;
}
