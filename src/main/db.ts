// ==================== PostgreSQL 连接池配置 ====================
// 按 database_spec.md §7.1 规范实现

import 'dotenv/config'
import { Pool, PoolClient } from 'pg'
import os from 'os'
import type { DbConfig } from '@shared/types'

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'sorter',
  user: process.env.DB_USER || 'sorter_user',
  password: process.env.DB_PASSWORD || '',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

pool.on('error', (err) => {
  console.error('[PG Pool] Idle connection error (handled):', err)
})

export const MACHINE_NAME = os.hostname()

// 获取 Client（用于事务）
export async function getClient(): Promise<PoolClient> {
  return pool.connect()
}

// 兼容旧接口：根据配置创建或更新连接池
export function createPool(config: DbConfig): Pool {
  // 动态重建连接池（切换数据库配置时使用）
  const newPool = new Pool({
    host: config.host || process.env.DB_HOST || 'localhost',
    port: config.port || Number(process.env.DB_PORT) || 5432,
    user: config.user || process.env.DB_USER || 'sorter_user',
    password: config.password || process.env.DB_PASSWORD || '',
    database: config.database || process.env.DB_NAME || 'sorter',
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  })
  newPool.on('error', (err) => {
    console.error('[PG Pool] Idle connection error (handled):', err)
  })
  return newPool
}

// 兼容旧接口：获取当前连接池
export function getPool(): Pool {
  return pool
}

// 使用临时连接池测试数据库连通性
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
  await pool.end()
}
