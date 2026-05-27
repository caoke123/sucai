import { Pool, PoolClient } from 'pg'
import type { DbConfig } from '@shared/types'

let pool: Pool | null = null

// 根据配置创建或更新连接池
export function createPool(config: DbConfig): Pool {
  if (pool) {
    pool.end().catch(() => {})
  }
  pool = new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  })

  // 拦截空闲连接意外断开导致的崩溃
  pool.on('error', (err) => {
    console.error('[PG Pool] Idle connection error (handled):', err)
  })

  return pool
}

// 获取当前连接池（没有则抛出错误）
export function getPool(): Pool {
  if (!pool) {
    throw new Error('数据库未连接，请先配置并测试连接')
  }
  return pool
}

// 获取一个 Client（用于事务）
export async function getClient(): Promise<PoolClient> {
  return getPool().connect()
}

// 使用临时连接池测试数据库连通性（不影响持久化池）
export async function testConnection(config: DbConfig): Promise<{ success: boolean; error?: string }> {
  const tempPool = new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    max: 1,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 5000,
  })

  tempPool.on('error', (err) => {
    console.error('[PG Temp Pool] Unexpected error (handled):', err)
  })

  try {
    const client = await tempPool.connect()
    try {
      await client.query('SELECT 1')
      return { success: true }
    } finally {
      client.release()
    }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  } finally {
    tempPool.end().catch(() => {})
  }
}

// 关闭连接池
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
