// ==================== Upload Logger ====================

export function uploadLog(taskId: string, msg: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  const prefix = `[R2:${taskId}]`
  const ts = new Date().toISOString().slice(11, 19)
  const line = `${prefix} ${ts} ${msg}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}
