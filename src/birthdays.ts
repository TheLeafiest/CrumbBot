import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SendableChannels } from 'discord.js';
import { scheduledJobs, scheduleJob } from 'node-schedule';
import { dataDir } from './config.js';

// Stored shape of birthdays.json, keyed by user id. Kept as-is so existing files still load
export interface BirthdayEntry {
  user: {
    id: string;
    globalName: string | null;
  };
  day: number;
  month: number;
}

type Birthdays = Record<string, BirthdayEntry>;

const birthdaysPath = join(dataDir, 'birthdays.json');
let birthdayChannel: SendableChannels | null = null;

export function readBirthdays(): Birthdays {
  if (!existsSync(birthdaysPath)) {
    return {};
  }

  return JSON.parse(readFileSync(birthdaysPath, 'utf8')) as Birthdays;
}

export function writeBirthdays(data: Birthdays): void {
  writeFileSync(birthdaysPath, JSON.stringify(data));
}

const jobName = (userId: string) => `birthday_${userId}`;

export function cancelBirthday(userId: string): void {
  scheduledJobs[jobName(userId)]?.cancel();
}

/**
 * Schedule (or reschedule) a user's birthday message for 8:00 AM on their birthday
 */
export function scheduleBirthday({ user, day, month }: BirthdayEntry): void {
  cancelBirthday(user.id);

  scheduleJob(jobName(user.id), `00 00 8 ${day} ${month} *`, async () => {
    try {
      await birthdayChannel?.send(`Happy Birthday ${user.globalName}! :birthday:`);
    } catch (error) {
      console.error(`Failed to send birthday message for user ${user.id}:`, error);
    }
  });
}

/**
 * Schedule every birthday in birthdays.json, posting to the given channel
 */
export function startBirthdays(channel: SendableChannels | null): void {
  birthdayChannel = channel;

  try {
    Object.values(readBirthdays()).forEach(scheduleBirthday);
  } catch (error) {
    console.error('Failed to schedule birthdays:', error);
  }
}
