# Активация Supabase (Фаза 1.5) — инструкция владельцу

## Текущий статус (1.5a)

- **Миграции** `supabase/migrations/2026010100000{1..6}_*.sql` — полная единая схема:
  30 таблиц, enums, `set_updated_at()`, RLS + политики «только свои строки» на каждой
  таблице (в той же миграции, что и создание), индексы, триггеры `updated_at`.
  Деплой — автоматически при merge в `main` (GitHub-интеграция читает `supabase/`).
- **Рантайм**: `src/lib/data/` — `DataProvider` с двумя реализациями
  (`localProvider` = демо/localStorage, `supabaseProvider` = реальный бэкенд).
  Переключение: есть `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` → Supabase,
  нет → LocalDemo (dev/CI без секретов, текущие тесты не ломаются).
- **1.5a end-to-end**: auth (email+пароль, OAuth-код-путь) и `mood_logs`
  полностью ходят в Supabase. Задачи/фокус/подсказки — пока локально (1.5b/1.5c).

## Что сделать в дашборде Supabase

### 1. Проверить e2e-пользователя (нужно для зелёных E2E с секретами)
- Authentication → Users → **Add user** → `e2e@rhythm.test`, пароль из секрета
  `E2E_PASSWORD`, **Auto Confirm User = ON** (иначе программный вход не пройдёт
  без подтверждения почты).
- Альтернатива: выключить «Confirm email» для проекта (Authentication → Providers
  → Email) — только для dev-проекта, не для production.

### 2. Секреты репозитория (Settings → Secrets and variables → Actions)
| Секрет | Значение |
|---|---|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | Project Settings → API → `anon public` |
| `E2E_EMAIL` | `e2e@rhythm.test` |
| `E2E_PASSWORD` | пароль e2e-пользователя |

`VITE_*` в отдельные секреты не нужны: CI мапит `SUPABASE_URL/ANON_KEY` в
`VITE_*` для сборки (см. `.github/workflows/ci.yml`).

### 3. Google Sign-In
1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services →
   Credentials → **Create OAuth client ID** (Web application).
2. **Authorized redirect URI** (обязательно):
   `https://<project-ref>.supabase.co/auth/v1/callback`
3. Supabase Dashboard → Authentication → Providers → **Google** → Enable →
   вставить Client ID и Client Secret → Save.
4. (Опционально) Authentication → URL Configuration → Site URL = адрес веба.

### 4. Apple Sign-In
1. Apple Developer → Certificates, IDs & Profiles → **Services ID**
   (identifier вида `com.rhythm.web`), включить **Sign In with Apple**,
   Return URL: `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Там же — **Key** с правом Sign In with Apple (скачать `.p8`, Team ID + Key ID).
3. Supabase Dashboard → Authentication → Providers → **Apple** → Enable →
   Services ID, Team ID, Key ID, приватный ключ `.p8` → Save.

> Код-путь в вебе готов (`data.signInWithOAuth('google' | 'apple')`):
> как только провайдер включён в дашборде, кнопки Google/Apple на экране входа
> начинают работать без изменений кода.

## Проверка RLS (критерий 5)

В SQL Editor выполнить от имени **второго** пользователя (или через два браузера):

```sql
-- 1) все таблицы под RLS (ожидание: 0 строк)
select tablename
from pg_tables
where schemaname = 'public'
  and tablename not in ('achievements', 'schema_migrations')
  and not rowsecurity;

-- 2) чужие строки не видны (выполнить в сессии юзера B: RLS применится автоматически)
select count(*) from public.mood_logs;   -- только свои
```

Сценарий «второй пользователь не видит строки первого» также покрывается
политиками `apply_own_rls`: `using (auth.uid() = user_id)` на select/update/delete
и `with check` на insert/update.

## Стратегия данных (Шаг 5)

- **Production стартует чистым.** Демо-данные из localStorage НЕ переносятся
  автоматически — ни при первом входе, ни при подключении ключей.
- Демо-режим (без env-ключей) остаётся для разработки и CI без секретов.
- Конфликты синхронизации — `updated_at`, last-write-wins (спека 2.1, §16);
  `updated_at` обновляется серверным триггером.

## Следующие подшаги (СТОП до подтверждения)

- **1.5b**: `tasks` + таймлайн + `focus_sessions` на Supabase (включая
  двустороннюю синхронизацию Google Calendar через `external_id`).
- **1.5c**: suggestions, routines, шаблоны, prompt-настройки, остальное;
  чтение профиля из `user_profiles`.
