import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Who the sync writes as in gameTest's database, as agreed with brisk-anvil
export const syncActor = 'crumbbot';
export const communityLabel = 'community';
export const triageLabel = 'needs-triage';

export interface Bead {
  id: string;
  title: string;
  status: string;
  external_ref?: string | null;
  close_reason?: string | null;
}

export interface NewBead {
  type: 'feature' | 'bug';
  priority: number;
  title: string;
  description: string;
  externalRef: string;
}

/**
 * The bd commands the sync needs, run in the gameTest repo so bd resolves gameTest's database.
 * Per the agreement with brisk-anvil: create beads, and close community beads on decline; never
 * edit or reopen anything else
 */
export function createBeads(bdPath: string, gameTestPath: string) {
  // Drop any BEADS_DIR override so bd resolves the database from the working directory
  const { BEADS_DIR: _ignored, ...env } = process.env;
  const bd = async (args: string[]) => (await execFileAsync(bdPath, args, {
    cwd: gameTestPath,
    env: { ...env, BEADS_ACTOR: syncActor },
  })).stdout;

  return {
    // Every community bead, open or closed (bd list stops at 50 unless told otherwise)
    async listCommunity(): Promise<Bead[]> {
      return JSON.parse(await bd(['list', '--all', '--limit', '0', '--label', communityLabel, '--json']) || '[]') as Bead[];
    },

    async create({ type, priority, title, description, externalRef }: NewBead): Promise<string> {
      const id = (await bd([
        'create', '--silent',
        '--type', type,
        '--priority', String(priority),
        '--labels', `${communityLabel},${triageLabel}`,
        '--external-ref', externalRef,
        '--description', description,
        title,
      ])).trim();

      if (!id) {
        throw new Error(`bd create returned no id for "${title}"`);
      }

      return id;
    },

    async close(id: string, reason: string): Promise<void> {
      await bd(['close', id, '--reason', reason]);
    },
  };
}

export type Beads = ReturnType<typeof createBeads>;
