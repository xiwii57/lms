// Logging helper - records to LogHistory table
import { db } from './db'

export async function logAction(
  userId: string | null,
  action: string,
  detail: string,
  level: 'INFO' | 'WARN' | 'ERROR' = 'INFO'
) {
  try {
    await db.logHistory.create({
      data: { userId, action, detail, level },
    })
  } catch (e) {
    console.error('Failed to log action:', e)
  }
}
