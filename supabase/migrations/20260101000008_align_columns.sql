-- ============================================================
-- Rhythm · Миграция 0008: выравнивание колонок БД по кодовой модели.
--
-- Код (src/lib/types.ts) = продуктовая истина. Сверка с миграциями
-- 0002–0006 выявила ровно два реальных расхождения. Исправляем их
-- ДОБАВЛЕНИЕМ недостающих колонок (nullable, без дефолтов-ловушек);
-- ничего не удаляем, не переименовываем, не меняем типов.
--
--   1) user_profiles.custom_color  ←  User.customColor { slot, hex }
--      Точечный кастомный цвет поверх палитры (Этап 2, Timeline Themes).
--   2) suggestions.expires_at      ←  Suggestion.expiresAt (epoch ms)
--      TTL подсказки (жизненный цикл created→…→expired, спека §6).
--
-- Обе таблицы уже защищены RLS (политики созданы в 0002 / 0003) —
-- новые колонки наследуют их автоматически, правок политик не нужно.
-- ============================================================

alter table public.user_profiles
  add column if not exists custom_color jsonb;

alter table public.suggestions
  add column if not exists expires_at bigint;
