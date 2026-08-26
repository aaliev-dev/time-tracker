/**
 * Tag repository — ручные теги приложений и доменов (app_tags table).
 *
 * Ответственность:
 * - getAllAppTags / setAppTag / deleteAppTag
 */
import type Database from 'better-sqlite3'
import type { AppTag, TagTargetType, TagType } from '../../shared/types'
import { rowToAppTag, type RawAppTagRow } from './helpers'

export class TagRepository {
  constructor(private db: Database.Database) {}

  /**
   * Возвращает все ручные теги приложений и доменов.
   */
  getAllAppTags(): AppTag[] {
    const rows = this.db
      .prepare('SELECT * FROM app_tags ORDER BY updated_at DESC')
      .all() as RawAppTagRow[]
    return rows.map(rowToAppTag)
  }

  /**
   * Устанавливает тег для приложения или домена (upsert).
   * Если тег уже существует для (target_type, target_key) — обновляет.
   */
  setAppTag(targetType: TagTargetType, targetKey: string, tag: TagType): AppTag {
    this.db
      .prepare(`
        INSERT INTO app_tags (target_type, target_key, tag, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(target_type, target_key) DO UPDATE SET tag = excluded.tag, updated_at = datetime('now')
      `)
      .run(targetType, targetKey, tag)

    const row = this.db
      .prepare('SELECT * FROM app_tags WHERE target_type = ? AND target_key = ?')
      .get(targetType, targetKey) as RawAppTagRow
    return rowToAppTag(row)
  }

  /**
   * Удаляет тег для приложения или домена.
   */
  deleteAppTag(targetType: TagTargetType, targetKey: string): void {
    this.db
      .prepare('DELETE FROM app_tags WHERE target_type = ? AND target_key = ?')
      .run(targetType, targetKey)
  }
}
