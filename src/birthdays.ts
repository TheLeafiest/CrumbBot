import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SendableChannels } from 'discord.js';
import { scheduledJobs, scheduleJob } from 'node-schedule';
import { dataDir } from './config.js';

// Stored shape of birthdays.json, keyed by user id. Kept as-is so existing files still load;
// globalName is still written but no longer read, since it goes stale and can be null
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

export const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * Whether day/month is a real calendar date. Feb 29 counts: those birthdays are celebrated on
 * Feb 28 in other years
 */
export function isValidBirthday(day: number, month: number): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month) || month < 1 || month > 12 || day < 1) {
    return false;
  }

  // Day 0 of the next month is the last day of this one; 2024 is a leap year, so Feb has 29
  return day <= new Date(2024, month, 0).getDate();
}

/**
 * The birthday message. The mention shows the member's current server name (it never goes
 * stale or null like a stored name), and allowedMentions keeps it from pinging them
 */
export function birthdayMessage(userId: string) {
  return {
    content: `Happy Birthday <@${userId}>! :birthday:`,
    allowedMentions: { parse: [] },
  };
}

const jobName = (userId: string) => `birthday_${userId}`;
const leapFallbackJobName = (userId: string) => `birthday_${userId}_feb28`;

export function cancelBirthday(userId: string): void {
  scheduledJobs[jobName(userId)]?.cancel();
  scheduledJobs[leapFallbackJobName(userId)]?.cancel();
}

/**
 * Schedule (or reschedule) a user's birthday message for 8:00 AM on their birthday
 */
export function scheduleBirthday({ user, day, month }: BirthdayEntry): void {
  cancelBirthday(user.id);

  const send = async () => {
    try {
      await birthdayChannel?.send(birthdayMessage(user.id));
    } catch (error) {
      console.error(`Failed to send birthday message for user ${user.id}:`, error);
    }
  };

  scheduleJob(jobName(user.id), `00 00 8 ${day} ${month} *`, send);

  if (day === 29 && month === 2) {
    // Feb 29 only exists in leap years, so celebrate on Feb 28 in the others
    scheduleJob(leapFallbackJobName(user.id), '00 00 8 28 2 *', async () => {
      if (!isLeapYear(new Date().getFullYear())) {
        await send();
      }
    });
  }
}

/**
 * Schedule every birthday in birthdays.json, posting to the given channel
 */
export function startBirthdays(channel: SendableChannels | null): void {
  birthdayChannel = channel;

  try {
    for (const entry of Object.values(readBirthdays())) {
      if (isValidBirthday(entry.day, entry.month)) {
        scheduleBirthday(entry);
      } else {
        console.error(`Skipping birthday for user ${entry.user.id}: ${entry.month}/${entry.day} is not a real date`);
      }
    }
  } catch (error) {
    console.error('Failed to schedule birthdays:', error);
  }
}
