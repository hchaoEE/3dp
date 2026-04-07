/**
 * DEF (Design Exchange Format) file parser
 * Parses DIEAREA, COMPONENTS (macros), and PINS (bonding layer) from DEF files
 */

export interface DefDieArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DefMacro {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  orientation: string;
}

export interface DefPin {
  id: string;
  name: string;
  layer: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DefData {
  dieArea: DefDieArea;
  macros: DefMacro[];
  bondingPins: DefPin[];
  unitsPerMicron: number;
}

// Default macro regex to identify macros (exclude standard cells)
const DEFAULT_MACRO_REGEX = /^(fd_ip_|^mem_|^l1[di]|sram|gf180mcu_fd_ip_)/i;

// Orientations where width/height should be swapped
const SWAP_WH_ORIENTATIONS = new Set(['E', 'W', 'FE', 'FW']);

/**
 * Parse UNITS DISTANCE MICRONS from DEF header
 */
function parseUnitsMicrons(content: string): number {
  const match = content.match(/UNITS\s+DISTANCE\s+MICRONS\s+(\d+)\s*;/i);
  return match ? parseInt(match[1], 10) : 1000;
}

/**
 * Parse DIEAREA from DEF
 */
function parseDieArea(content: string): DefDieArea | null {
  const match = content.match(/DIEAREA\s*\(\s*(-?\d+)\s+(-?\d+)\s*\)\s*\(\s*(-?\d+)\s+(-?\d+)\s*\)\s*;/i);
  if (!match) return null;

  const x1 = parseInt(match[1], 10);
  const y1 = parseInt(match[2], 10);
  const x2 = parseInt(match[3], 10);
  const y2 = parseInt(match[4], 10);

  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

/**
 * Extract section content between start and end markers
 */
function extractSection(content: string, startMarker: string, endMarker: string): string {
  const startIdx = content.indexOf(startMarker);
  if (startIdx === -1) return '';

  const endIdx = content.indexOf(endMarker, startIdx);
  if (endIdx === -1) return '';

  return content.substring(startIdx, endIdx + endMarker.length);
}

/**
 * Parse COMPONENTS section to extract macros
 */
function parseComponents(
  content: string,
  unitsPerMicron: number,
  macroRegex: RegExp = DEFAULT_MACRO_REGEX
): DefMacro[] {
  const section = extractSection(content, 'COMPONENTS', 'END COMPONENTS');
  if (!section) return [];

  const macros: DefMacro[] = [];

  // Match component lines with PLACED or FIXED
  // Format: - inst_name cell_type ... + PLACED|FIXED ( x y ) orient ;
  const componentRegex = /^\s*-\s+(\S+)\s+(\S+)\s+.*?\+\s*(?:PLACED|FIXED)\s+\(\s*(-?\d+)\s+(-?\d+)\s*\)\s+(\S+)\s*;/gm;

  let match;
  while ((match = componentRegex.exec(section)) !== null) {
    const instName = match[1];
    const cellType = match[2];
    const x = parseInt(match[3], 10);
    const y = parseInt(match[4], 10);
    const orientation = match[5];

    // Filter: only include macros (exclude standard cells)
    if (!macroRegex.test(cellType)) continue;

    // Estimate macro size from LEF (simplified: use default sizes)
    // In real implementation, LEF parsing would provide exact sizes
    const { width, height } = estimateMacroSize(cellType);

    macros.push({
      id: instName,
      name: cellType,
      x: x / unitsPerMicron,
      y: y / unitsPerMicron,
      width,
      height,
      orientation,
    });
  }

  return macros;
}

/**
 * Estimate macro size based on cell type
 * This is a simplified implementation - real sizes should come from LEF
 */
function estimateMacroSize(cellType: string): { width: number; height: number } {
  // SRAM sizes (approximate, in microns)
  if (cellType.includes('sram256x8')) {
    return { width: 150, height: 200 };
  }
  if (cellType.includes('sram128x8')) {
    return { width: 100, height: 150 };
  }
  if (cellType.includes('sram64x8')) {
    return { width: 80, height: 100 };
  }
  if (cellType.includes('sram')) {
    return { width: 120, height: 160 };
  }

  // IP block sizes
  if (cellType.includes('fd_ip_')) {
    return { width: 100, height: 100 };
  }

  // Default size for unknown macros
  return { width: 50, height: 50 };
}

/**
 * Parse PINS section to extract bonding layer pins
 */
function parseBondingPins(content: string, unitsPerMicron: number): DefPin[] {
  const section = extractSection(content, 'PINS', 'END PINS');
  if (!section) return [];

  const pins: DefPin[] = [];

  // Split into individual pin definitions
  const pinRegex = /^\s*-\s+(\S+)\s+\+\s+NET/gim;
  const pinMatches = [...section.matchAll(pinRegex)];

  for (let i = 0; i < pinMatches.length; i++) {
    const startIdx = pinMatches[i].index!;
    const endIdx = i < pinMatches.length - 1 ? pinMatches[i + 1].index! : section.length;
    const pinText = section.substring(startIdx, endIdx);

    const pinName = pinMatches[i][1];

    // Check if this pin has Bonding_layer
    const layerMatch = pinText.match(/\+\s+LAYER\s+(\S+)\s+\(\s*(-?\d+)\s+(-?\d+)\s*\)\s*\(\s*(-?\d+)\s+(-?\d+)\s*\)/);
    if (!layerMatch) continue;

    const layer = layerMatch[1];
    if (layer !== 'Bonding_layer') continue;

    const dx1 = parseInt(layerMatch[2], 10);
    const dy1 = parseInt(layerMatch[3], 10);
    const dx2 = parseInt(layerMatch[4], 10);
    const dy2 = parseInt(layerMatch[5], 10);

    // Get pin position
    const posMatch = pinText.match(/\+\s*(?:FIXED|PLACED)\s+\(\s*(-?\d+)\s+(-?\d+)\s*\)/);
    if (!posMatch) continue;

    const px = parseInt(posMatch[1], 10);
    const py = parseInt(posMatch[2], 10);

    pins.push({
      id: pinName,
      name: pinName,
      layer,
      x: (px + dx1) / unitsPerMicron,
      y: (py + dy1) / unitsPerMicron,
      width: Math.abs(dx2 - dx1) / unitsPerMicron,
      height: Math.abs(dy2 - dy1) / unitsPerMicron,
    });
  }

  return pins;
}

/**
 * Parse DEF file content
 */
export function parseDef(content: string, macroRegex?: RegExp): DefData {
  const unitsPerMicron = parseUnitsMicrons(content);
  const dieArea = parseDieArea(content);

  if (!dieArea) {
    throw new Error('Failed to parse DIEAREA from DEF file');
  }

  // Convert die area to microns
  const dieAreaMicrons: DefDieArea = {
    x: dieArea.x / unitsPerMicron,
    y: dieArea.y / unitsPerMicron,
    width: dieArea.width / unitsPerMicron,
    height: dieArea.height / unitsPerMicron,
  };

  const macros = parseComponents(content, unitsPerMicron, macroRegex);
  const bondingPins = parseBondingPins(content, unitsPerMicron);

  return {
    dieArea: dieAreaMicrons,
    macros,
    bondingPins,
    unitsPerMicron,
  };
}

/**
 * Parse DEF file from URL
 */
export async function parseDefFromUrl(url: string, macroRegex?: RegExp): Promise<DefData> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch DEF file: ${response.statusText}`);
  }
  const content = await response.text();
  return parseDef(content, macroRegex);
}

/**
 * Parse DEF file from File object
 */
export async function parseDefFromFile(file: File, macroRegex?: RegExp): Promise<DefData> {
  const content = await file.text();
  return parseDef(content, macroRegex);
}

export { DEFAULT_MACRO_REGEX };
