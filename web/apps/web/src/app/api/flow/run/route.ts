import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { join } from 'path';

const FLOW_HOME = '/data/user/huchao/repo/3dp/flow';

interface FlowRunRequest {
  mode?: 'parallel' | 'sequential';
  die?: 'bottom' | 'top' | 'both';
  timeout?: number;
}

/**
 * API route to execute flow/run.py
 * POST /api/flow/run
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: FlowRunRequest = await request.json();
    const { mode = 'parallel', die = 'both', timeout = 600 } = body;

    // Build command arguments
    const args: string[] = [];
    if (mode) args.push(`--mode=${mode}`);
    if (die) args.push(`--die=${die}`);
    if (timeout) args.push(`--timeout=${timeout}`);

    // Execute flow/run.py
    const runPath = join(FLOW_HOME, 'run.py');

    return new Promise((resolve) => {
      const process = spawn('python3', [runPath, ...args], {
        cwd: FLOW_HOME,
        env: {
          ...processEnv,
          PYTHONUNBUFFERED: '1',
        },
      });

      let output = '';
      let errorOutput = '';

      process.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
      });

      process.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
      });

      process.on('close', (code) => {
        const success = code === 0;
        resolve(
          NextResponse.json({
            success,
            exitCode: code,
            output: output + (errorOutput ? `\nErrors:\n${errorOutput}` : ''),
          })
        );
      });

      process.on('error', (err) => {
        resolve(
          NextResponse.json(
            {
              success: false,
              exitCode: -1,
              output: `Failed to start flow: ${err.message}`,
            },
            { status: 500 }
          )
        );
      });

      // Timeout handling
      setTimeout(() => {
        process.kill('SIGTERM');
        resolve(
          NextResponse.json(
            {
              success: false,
              exitCode: -1,
              output: 'Flow execution timed out',
            },
            { status: 408 }
          )
        );
      }, timeout * 1000);
    });
  } catch (error) {
    console.error('Flow execution error:', error);
    return NextResponse.json(
      {
        success: false,
        exitCode: -1,
        output: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Get current process environment
const processEnv = process.env;
