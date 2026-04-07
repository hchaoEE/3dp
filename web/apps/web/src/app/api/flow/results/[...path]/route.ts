import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

// Base path to flow results
const FLOW_RESULTS_BASE = '/data/user/huchao/repo/3dp/flow/results';

/**
 * API route to serve DEF files from flow results
 * Path: /api/flow/results/[...path]
 * Example: /api/flow/results/180_180/bottom_die/withoutcluster/2_1_floorplan.def
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
): Promise<NextResponse> {
  try {
    const pathSegments = params.path;
    const filePath = join(FLOW_RESULTS_BASE, ...pathSegments);

    // Security check: ensure path is within results directory
    if (!filePath.startsWith(FLOW_RESULTS_BASE)) {
      return NextResponse.json(
        { error: 'Invalid path' },
        { status: 403 }
      );
    }

    // Check if file exists
    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Read file content
    const content = await readFile(filePath, 'utf-8');

    // Return with appropriate content type
    const ext = filePath.split('.').pop()?.toLowerCase();
    let contentType = 'text/plain';

    switch (ext) {
      case 'def':
        contentType = 'text/plain';
        break;
      case 'json':
        contentType = 'application/json';
        break;
      case 'v':
      case 'sv':
        contentType = 'text/plain';
        break;
      case 'log':
        contentType = 'text/plain';
        break;
    }

    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Error serving flow result:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * HEAD request to check if file exists
 */
export async function HEAD(
  request: NextRequest,
  { params }: { params: { path: string[] } }
): Promise<NextResponse> {
  try {
    const pathSegments = params.path;
    const filePath = join(FLOW_RESULTS_BASE, ...pathSegments);

    // Security check
    if (!filePath.startsWith(FLOW_RESULTS_BASE)) {
      return new NextResponse(null, { status: 403 });
    }

    // Check existence
    if (!existsSync(filePath)) {
      return new NextResponse(null, { status: 404 });
    }

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    return new NextResponse(null, { status: 500 });
  }
}
